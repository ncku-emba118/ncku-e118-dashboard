/**
 * POST /api/board/push/dispatch — manual trigger push worker
 *
 * 用途：
 *   • Netlify cron（每分鐘觸發、處理 stale jobs）— 走 Authorization: Bearer ${CRON_SECRET}
 *   • Admin 手動補送（debug 用）— 走 session cookie，限 super
 *
 * P0-2 修正：原本任何 dept 帳號登入都可無限狂打 → 改為：
 *   1. 若帶 Authorization: Bearer X 且 X timing-safe match CRON_SECRET → 過
 *   2. 否則需要登入 + role === 'super'（dept 角色拒）
 *   3. 兩個都不符 → 401/403
 *
 * fire-and-forget（POST 新公告後）走 lib/push/dispatcher.ts 直接 in-process call、
 * 不打 HTTP 自己；此 endpoint 只給外部 cron / admin 手動用。
 */
import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { readSession } from '@/lib/auth/session';
import { processQueuedJobs } from '@/lib/push/dispatcher';
import { getEnv } from '@/lib/env';
import { isSameOrigin } from '@/lib/signoff/http';

/**
 * ⚠ Codex Round-3 fix: 用 node:crypto timingSafeEqual 真 constant-time。
 *   原本 safeEqual length 不同會早退（length-side-channel），雖然不直接破解但
 *   違反 spec annotation。先 SHA-256 兩邊再 compare，避免 length leak。
 *   兩邊 hash 後永遠是 32 bytes，timingSafeEqual 比起來絕對 constant-time。
 */
import { createHash } from 'node:crypto';
function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export async function POST(req: NextRequest) {
  const traceId = crypto.randomUUID();
  const env = getEnv();

  // Path 1: cron secret（timing-safe compare）
  const auth = req.headers.get('authorization');
  if (env.CRON_SECRET && auth?.startsWith('Bearer ')) {
    const tok = auth.slice('Bearer '.length).trim();
    if (safeEqual(tok, env.CRON_SECRET)) {
      try {
        const result = await processQueuedJobs();
        return NextResponse.json(
          { ...result, via: 'cron' },
          { headers: { 'x-trace-id': traceId } },
        );
      } catch (err) {
        console.error('[push.dispatch.cron_failed]', {
          traceId,
          error: (err as Error).message,
        });
        return NextResponse.json(
          { error: '推播 dispatch 失敗' },
          { status: 503, headers: { 'x-trace-id': traceId } },
        );
      }
    }
    console.warn('[push.dispatch.bad_cron_secret]', { traceId });
  }

  // Path 2: super session（admin 手動補送）
  // CSRF 同源檢查（對齊 signoff 模組）— 只擋 session 分支；
  // cron Bearer 分支（Path 1）是機器對機器、無 Origin header，不可加同源檢查
  if (!isSameOrigin(req)) {
    return NextResponse.json(
      { error: '來源驗證失敗' },
      { status: 403, headers: { 'x-trace-id': traceId } },
    );
  }

  const session = await readSession();
  if (!session) {
    return NextResponse.json(
      { error: '未登入' },
      { status: 401, headers: { 'x-trace-id': traceId } },
    );
  }
  if (session.role !== 'super') {
    console.warn('[push.dispatch.role_denied]', {
      traceId,
      role: session.role,
    });
    return NextResponse.json(
      { error: '此操作僅 super 角色可用' },
      { status: 403, headers: { 'x-trace-id': traceId } },
    );
  }

  try {
    const result = await processQueuedJobs();
    return NextResponse.json(
      { ...result, via: 'super_session' },
      { headers: { 'x-trace-id': traceId } },
    );
  } catch (err) {
    console.error('[push.dispatch.super_failed]', {
      traceId,
      error: (err as Error).message,
    });
    return NextResponse.json(
      { error: '推播 dispatch 失敗' },
      { status: 503, headers: { 'x-trace-id': traceId } },
    );
  }
}
