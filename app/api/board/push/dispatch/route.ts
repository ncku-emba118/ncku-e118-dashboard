/**
 * POST /api/board/push/dispatch — manual trigger push worker
 *
 * 用途：
 *   • 內部 fire-and-forget call（POST 新公告後）
 *   • Netlify cron（每分鐘觸發、處理 stale jobs）
 *   • Admin 手動補送（debug 用）
 *
 * 認證：需登入（任何 super / dept 都可觸發、processQueuedJobs idempotent）
 *
 * MVP：對外暴露但需 session cookie。生產建議加 Netlify cron secret header 校驗，
 * 然後把 cron 設成從 X-CRON-SECRET 路徑進來。
 */
import { NextResponse } from 'next/server';
import { readSession } from '@/lib/auth/session';
import { processQueuedJobs } from '@/lib/push/dispatcher';

export async function POST() {
  const traceId = crypto.randomUUID();
  const session = await readSession();
  if (!session) {
    return NextResponse.json(
      { error: '未登入' },
      { status: 401, headers: { 'x-trace-id': traceId } },
    );
  }

  try {
    const result = await processQueuedJobs();
    return NextResponse.json(result, { headers: { 'x-trace-id': traceId } });
  } catch (err) {
    console.error('[push.dispatch.failed]', {
      traceId,
      error: (err as Error).message,
    });
    return NextResponse.json(
      { error: '推播 dispatch 失敗' },
      { status: 503, headers: { 'x-trace-id': traceId } },
    );
  }
}
