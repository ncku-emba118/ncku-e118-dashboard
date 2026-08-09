/**
 * GET /api/notify/candidates — 取可發送同學姓名清單 + 本月 LINE 推播剩餘額度。
 *
 * 需 notify session（PIN 已驗過）。/api/notify/* 不在 middleware matcher 內，
 * 所以這裡自己 fail-closed 驗，一定要有。
 *
 * 🔒 回傳只有姓名（GAS 端本來就不回 userId），班網不接觸也不儲存任何 LINE userId。
 */
import { NextResponse } from 'next/server';
import { hasNotifySession } from '@/lib/notify/session';
import { fetchNotifyCandidates } from '@/lib/notify/gas';

// 呼叫 GAS 讀「同學名冊」+ LINE 額度查詢，冷啟動/名冊列數多時可能超過
// Netlify function 預設逾時，跟 send/route.ts 一致明確拉到 60 秒（gas.ts 的 GAS_TIMEOUT_MS 上限）。
export const maxDuration = 60;

export async function GET() {
  if (!(await hasNotifySession())) {
    return NextResponse.json({ error: '未登入或已過期' }, { status: 401 });
  }
  const r = await fetchNotifyCandidates();
  if (!r.ok) {
    console.error('[notify.candidates.failed]', { error: r.error });
    return NextResponse.json({ error: '無法取得名單，請稍後再試' }, { status: 502 });
  }
  return NextResponse.json({
    ok: true,
    names: r.names ?? [],
    // 沒加入機器人的同學：前端要列出來但灰階不可勾（GAS v18.7 起提供）
    unavailable: r.unavailable ?? [],
    ambiguous: r.ambiguous ?? [],
    quota: r.quota,
  });
}
