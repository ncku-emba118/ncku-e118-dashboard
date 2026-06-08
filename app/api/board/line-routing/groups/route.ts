/**
 * GET /api/board/line-routing/groups — 撈 Bot 已加入的群清單（給後台 radio UI）
 *
 * 權限：super only（秘書長獨佔）。其他幹部即使知道 URL 也 403、不洩漏群清單。
 */
import { NextResponse } from 'next/server';
import { readSession } from '@/lib/auth/session';
import { listLineGroups } from '@/lib/board/line_groups';

export async function GET() {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: '請先登入' }, { status: 401 });
  }
  if (session.role !== 'super') {
    return NextResponse.json({ error: '無權限' }, { status: 403 });
  }
  const result = await listLineGroups();
  if (!result.ok) {
    return NextResponse.json(
      {
        error: '無法取得群清單',
        reason: result.reason,
        detail: result.detail,
      },
      { status: result.reason === 'no_url' || result.reason === 'no_secret' ? 503 : 502 },
    );
  }
  return NextResponse.json({ groups: result.groups });
}
