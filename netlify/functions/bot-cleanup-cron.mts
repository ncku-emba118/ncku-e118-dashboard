/**
 * Netlify Scheduled Function — 每天 03:00 UTC（≈ 台灣時間 11:00）跑 bot 對話清理
 *
 * 對應 Codex F04：兌現 7 天 soft-delete 緩衝 + 365 天保留承諾。
 *
 * 模式同 push-cron.mts：function 帶 CRON_SECRET 內呼 /api/board/bot/cleanup。
 */
import type { Config } from '@netlify/functions';

export default async () => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[bot-cleanup-cron] CRON_SECRET not configured');
    return new Response('CRON_SECRET missing', { status: 500 });
  }

  const siteUrl =
    process.env.URL || process.env.DEPLOY_PRIME_URL || 'https://emba.aqualux.dev';
  const url = `${siteUrl}/api/board/bot/cleanup`;
  const startedAt = Date.now();

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}` },
    });
    const text = await resp.text();
    console.log('[bot-cleanup-cron] done', {
      status: resp.status,
      ms: Date.now() - startedAt,
      body: text.slice(0, 500),
    });
    return new Response(text, { status: resp.status });
  } catch (err) {
    console.error('[bot-cleanup-cron] failed', { err: String(err) });
    return new Response('cleanup failed', { status: 500 });
  }
};

// 每天 03:00 UTC ≈ 台灣時間 11:00（同學白天 LINE 活躍時段已過、上午閒置時清最不擾人）
export const config: Config = {
  schedule: '0 3 * * *',
};
