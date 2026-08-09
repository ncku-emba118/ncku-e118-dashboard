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
    ambiguous: r.ambiguous ?? [],
    quota: r.quota,
  });
}
