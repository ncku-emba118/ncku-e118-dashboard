/**
 * POST /api/board/admin/comment-subscribe — 幹部訂閱「留言通知」（部門層級 opt-in）
 *
 * 跟 /api/board/subscribe（全班公告推播、匿名自助）不同：
 *   • 這條需要登入（readSession），身份是權限依據，不是 client 帶的 management_token
 *   • dept_filter 這裡才真的被寫入有意義的值——只推 comment_created 事件用
 *     （post_published 全班廣播那條路徑完全不讀這欄位，維持原行為）
 *   • dept_ids 由 client 送「這次要訂閱的部門清單」整包覆蓋（不是累加），
 *     所以要取消某部門通知，重送一次少那個 id 的清單即可
 *
 * 對應 migration 0024_comment_push.sql + lib/push/dispatcher.ts processCommentJob
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { getServerClient } from '@/lib/supabase/server';
import { readSession, manageableDepts } from '@/lib/auth/session';
import { isAllowedPushEndpoint } from '@/lib/push/endpoint-allowlist';

const MAX_BODY_BYTES = 8192;

const bodySchema = z.object({
  endpoint: z.string().url().max(1000),
  p256dh: z.string().min(20).max(200),
  auth: z.string().min(10).max(200),
  user_agent: z.string().max(300).optional(),
  dept_ids: z.array(z.string().min(1).max(40)).max(7),
});

function tr(traceId: string): HeadersInit {
  return { 'x-trace-id': traceId };
}

export async function POST(req: NextRequest) {
  const traceId = crypto.randomUUID();

  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: '請先登入' }, { status: 401, headers: tr(traceId) });
  }

  const contentLength = Number(req.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: '請求過大' }, { status: 413, headers: tr(traceId) });
  }

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: '欄位格式錯誤', detail: parsed.error.flatten().fieldErrors },
      { status: 400, headers: tr(traceId) },
    );
  }
  const input = parsed.data;

  // 只能訂閱自己管得到的部門（dept 帳號=home_dept_id、super=全部）——防止 client 送別部門 id
  const allowedIds = new Set(manageableDepts(session).map((d) => d.id));
  const deptIds = [...new Set(input.dept_ids)].filter((id) => allowedIds.has(id));
  if (deptIds.length !== input.dept_ids.length) {
    return NextResponse.json(
      { error: '包含你權限外的部門', allowed: [...allowedIds] },
      { status: 403, headers: tr(traceId) },
    );
  }

  if (!isAllowedPushEndpoint(input.endpoint)) {
    console.warn('[push.comment_subscribe.endpoint_rejected]', { traceId, username: session.username });
    return NextResponse.json({ error: 'endpoint host 不在允許清單' }, { status: 400, headers: tr(traceId) });
  }

  const supabase = getServerClient();

  const { data: existing, error: lookupErr } = await supabase
    .from('push_subscriptions')
    .select('id, dept_filter')
    .eq('endpoint', input.endpoint)
    .maybeSingle();

  if (lookupErr) {
    console.error('[push.comment_subscribe.lookup_failed]', { traceId, error: lookupErr.message });
    return NextResponse.json({ error: '系統暫時無法訂閱' }, { status: 503, headers: tr(traceId) });
  }

  if (existing) {
    // 身份已由 session 驗證，這裡不需要（也沒有）client management_token 可核對。
    // ⚠ 共用裝置防呆：只覆蓋自己權限範圍內的部門，其他人在同一裝置訂閱的部門不動——
    // 不然辦公室共用電腦先後兩個幹部登入訂閱，後面那個會把前面的設定整包洗掉。
    const existingFilter = (existing.dept_filter as string[] | null) ?? [];
    const outsideMyScope = existingFilter.filter((id) => !allowedIds.has(id));
    const nextFilter = [...new Set([...outsideMyScope, ...deptIds])];

    const { error: updateErr } = await supabase
      .from('push_subscriptions')
      .update({
        p256dh: input.p256dh,
        auth: input.auth,
        dept_filter: nextFilter,
        user_agent: input.user_agent ?? null,
        last_seen_at: new Date().toISOString(),
        failure_count: 0,
      })
      .eq('id', existing.id);
    if (updateErr) {
      console.error('[push.comment_subscribe.update_failed]', { traceId, error: updateErr.message });
      return NextResponse.json({ error: '更新訂閱失敗' }, { status: 503, headers: tr(traceId) });
    }
    console.info('[push.comment_subscribe.updated]', {
      traceId,
      username: session.username,
      subscription_id: existing.id,
      dept_ids: deptIds,
    });
    return NextResponse.json({ ok: true, dept_ids: deptIds, mode: 'update' }, { headers: tr(traceId) });
  }

  // 新裝置——management_token_hash 欄位 NOT NULL 但這條路徑不靠 token 授權，
  // 塞一個 server 端隨機值滿足 schema，不回給 client、也不會被用到。
  const syntheticToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = await bcrypt.hash(syntheticToken, 10);

  const { data: inserted, error: insertErr } = await supabase
    .from('push_subscriptions')
    .insert({
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      dept_filter: deptIds,
      management_token_hash: tokenHash,
      user_agent: input.user_agent ?? null,
    })
    .select('id')
    .single();

  if (insertErr || !inserted) {
    console.error('[push.comment_subscribe.insert_failed]', { traceId, error: insertErr?.message });
    return NextResponse.json({ error: '訂閱失敗' }, { status: 503, headers: tr(traceId) });
  }

  console.info('[push.comment_subscribe.created]', {
    traceId,
    username: session.username,
    subscription_id: inserted.id,
    dept_ids: deptIds,
  });

  return NextResponse.json(
    { ok: true, dept_ids: deptIds, mode: 'create' },
    { status: 201, headers: tr(traceId) },
  );
}
