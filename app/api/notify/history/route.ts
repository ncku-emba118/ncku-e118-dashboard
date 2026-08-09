/**
 * GET /api/notify/history?limit=10 — 最近 N 筆手動通知紀錄（來源＝GAS「手動通知紀錄」分頁）。
 * 需 notify session。紀錄只含姓名，不含 userId。
 */
import { NextResponse, type NextRequest } from 'next/server';
import { hasNotifySession } from '@/lib/notify/session';
import { fetchNotifyHistory } from '@/lib/notify/gas';

// 理由同 candidates/route.ts：明確拉長逾時，避免 Netlify 預設值比 GAS 回應時間短。
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!(await hasNotifySession())) {
    return NextResponse.json({ error: '未登入或已過期' }, { status: 401 });
  }
  const raw = Number(req.nextUrl.searchParams.get('limit') ?? '10');
  const limit = Number.isFinite(raw) ? Math.min(Math.max(Math.floor(raw), 1), 50) : 10;

  const r = await fetchNotifyHistory(limit);
  if (!r.ok) {
    console.error('[notify.history.failed]', { error: r.error });
    return NextResponse.json({ error: '無法取得發送紀錄' }, { status: 502 });
  }
  return NextResponse.json({ ok: true, rows: r.rows ?? [] });
}
