/**
 * POST /api/board/subscribe — register / update PWA push subscription
 *
 * 對應 ARCHITECTURE.md v3 第 7 章 + Codex Sec F4/F5：
 *   • endpoint host allowlist (Sec F4)
 *   • management_token bcrypt hash 存（Sec F5）
 *   • 同 IP 10 次/小時 rate limit
 *   • upsert by endpoint：若 existing + token 不符 → 403 not 覆寫
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { getServerClient } from '@/lib/supabase/server';
import { isAllowedPushEndpoint } from '@/lib/push/endpoint-allowlist';
import { resolveClientIp } from '@/lib/ip-resolve';

const MAX_BODY_BYTES = 8192;

/**
 * 2026-05-27 設計簡化：全班統一一條推播 channel，不再分部門。
 *   • client 不再送 dept_filter，server 永遠插 [] 給 DB（欄位保留以利日後復原）
 *   • 任何部門發新公告 → fan-out 給所有 push_subscriptions
 */
const subscribeSchema = z.object({
  endpoint: z.string().url().max(1000),
  p256dh: z.string().min(20).max(200),
  auth: z.string().min(10).max(200),
  management_token: z.string().min(32).max(128),
  user_agent: z.string().max(300).optional(),
});

const ipBuckets = new Map<string, { count: number; resetAt: number }>();
const RL_MAX = 10;
const RL_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function checkIpLimit(ip: string): boolean {
  const now = Date.now();
  const rec = ipBuckets.get(ip);
  if (!rec || now > rec.resetAt) {
    ipBuckets.set(ip, { count: 1, resetAt: now + RL_WINDOW_MS });
    return true;
  }
  if (rec.count >= RL_MAX) return false;
  rec.count++;
  return true;
}

// P0-3: IP 抽取統一走 lib/ip-resolve，抓不到時 reject 503

function tr(traceId: string): HeadersInit {
  return { 'x-trace-id': traceId };
}

export async function POST(req: NextRequest) {
  const traceId = crypto.randomUUID();

  const contentLength = Number(req.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: '請求過大' },
      { status: 413, headers: tr(traceId) },
    );
  }

  const ip = resolveClientIp(req);
  if (!ip) {
    console.warn('[push.subscribe.no_client_ip]', { traceId });
    return NextResponse.json(
      { error: '系統無法識別來源，請稍後再試' },
      { status: 503, headers: tr(traceId) },
    );
  }
  if (!checkIpLimit(ip)) {
    return NextResponse.json(
      { error: '訂閱嘗試過多，請稍後再試' },
      { status: 429, headers: tr(traceId) },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: '欄位格式錯誤', detail: parsed.error.flatten().fieldErrors },
      { status: 400, headers: tr(traceId) },
    );
  }
  const input = parsed.data;

  // ⚠ Codex Sec F4: endpoint host allowlist
  if (!isAllowedPushEndpoint(input.endpoint)) {
    console.warn('[push.subscribe.endpoint_rejected]', {
      traceId,
      ip,
    });
    return NextResponse.json(
      { error: 'endpoint host 不在允許清單' },
      { status: 400, headers: tr(traceId) },
    );
  }

  const supabase = getServerClient();
  const tokenHash = await bcrypt.hash(input.management_token, 10);

  // Check existing
  const { data: existing, error: lookupErr } = await supabase
    .from('push_subscriptions')
    .select('id, management_token_hash')
    .eq('endpoint', input.endpoint)
    .maybeSingle();

  if (lookupErr) {
    console.error('[push.subscribe.lookup_failed]', {
      traceId,
      error: lookupErr.message,
    });
    return NextResponse.json(
      { error: '系統暫時無法訂閱' },
      { status: 503, headers: tr(traceId) },
    );
  }

  // 已存在 — 驗 management_token 後才能 update dept_filter (Codex Sec F5)
  if (existing) {
    const ok = await bcrypt.compare(
      input.management_token,
      existing.management_token_hash as string,
    );
    if (!ok) {
      console.warn('[push.subscribe.token_mismatch]', {
        traceId,
        subscription_id: existing.id,
      });
      return NextResponse.json(
        { error: '訂閱已存在但 management token 不符' },
        { status: 403, headers: tr(traceId) },
      );
    }
    const { error: updateErr } = await supabase
      .from('push_subscriptions')
      .update({
        // dept_filter 永遠保持 [] — 簡化設計後不再用
        p256dh: input.p256dh,
        auth: input.auth,
        user_agent: input.user_agent ?? null,
        last_seen_at: new Date().toISOString(),
        failure_count: 0, // reset on update
      })
      .eq('id', existing.id);
    if (updateErr) {
      console.error('[push.subscribe.update_failed]', {
        traceId,
        error: updateErr.message,
      });
      return NextResponse.json(
        { error: '更新訂閱失敗' },
        { status: 503, headers: tr(traceId) },
      );
    }
    console.info('[push.subscribe.updated]', {
      traceId,
      subscription_id: existing.id,
    });
    return NextResponse.json(
      { ok: true, subscription_id: existing.id, mode: 'update' },
      { headers: tr(traceId) },
    );
  }

  // Insert — dept_filter 永遠 [] (簡化設計後不再分部門)
  const { data: inserted, error: insertErr } = await supabase
    .from('push_subscriptions')
    .insert({
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      dept_filter: [],
      management_token_hash: tokenHash,
      user_agent: input.user_agent ?? null,
    })
    .select('id')
    .single();

  if (insertErr || !inserted) {
    console.error('[push.subscribe.insert_failed]', {
      traceId,
      error: insertErr?.message,
    });
    return NextResponse.json(
      { error: '訂閱失敗' },
      { status: 503, headers: tr(traceId) },
    );
  }

  console.info('[push.subscribe.created]', {
    traceId,
    subscription_id: inserted.id,
  });

  return NextResponse.json(
    { ok: true, subscription_id: inserted.id, mode: 'create' },
    { headers: tr(traceId), status: 201 },
  );
}
