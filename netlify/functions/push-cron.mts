/**
 * Netlify Scheduled Function — 每分鐘 ping push dispatcher
 *
 * 對應 ARCHITECTURE.md v3 第 7 章「Outbox Pattern」+ P0-2 CRON_SECRET 設計：
 *
 *   1. Netlify 每分鐘呼叫此 function (cron syntax `* * * * *`)
 *   2. function 用 Authorization: Bearer ${CRON_SECRET} 內呼 /api/board/push/dispatch
 *   3. dispatch route timing-safe compare CRON_SECRET → processQueuedJobs()
 *   4. claim_push_jobs RPC 領 queued / stale-sending job、fan-out
 *
 * 跟「POST 公告後 fire-and-forget」互補：
 *   • fire-and-forget 在 lambda freeze 前可能沒跑完 → 此 cron 1 分鐘內自動補送
 *   • dispatcher 內部 idempotent (FOR UPDATE SKIP LOCKED)，不怕兩邊同時跑
 */
import type { Config } from '@netlify/functions';

export default async () => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[push-cron] CRON_SECRET not configured');
    return new Response('CRON_SECRET missing', { status: 500 });
  }

  // Netlify 在 production 設 URL=https://<site>.netlify.app，custom domain 設 DEPLOY_URL/SITE_URL
  // 優先 custom domain (= emba.aqualux.dev)、再 fallback 預設
  const siteUrl =
    process.env.URL || process.env.DEPLOY_PRIME_URL || 'https://emba.aqualux.dev';

  const url = `${siteUrl}/api/board/push/dispatch`;
  const startedAt = Date.now();

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}` },
    });
    const body = await res.text();
    const durationMs = Date.now() - startedAt;
    console.info('[push-cron]', {
      status: res.status,
      duration_ms: durationMs,
      body: body.slice(0, 200),
    });
    return new Response(body, { status: res.status });
  } catch (err) {
    console.error('[push-cron] fetch_failed', {
      error: (err as Error).message,
      duration_ms: Date.now() - startedAt,
    });
    return new Response('cron fetch failed', { status: 503 });
  }
};

export const config: Config = {
  schedule: '* * * * *', // every minute
};
