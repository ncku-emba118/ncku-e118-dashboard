/**
 * POST /api/board/line-routing/set — 設定班級公告推播目標群（單選）
 *
 * body: { groupId: string }   // 空字串 = idle，不推任何群
 *
 * 權限：super only（秘書長獨佔）。
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { readSession } from '@/lib/auth/session';
import { setBroadcastGroup } from '@/lib/board/line_groups';

const bodySchema = z.object({
  groupId: z.string().max(80), // LINE group ID 通常 C + 32 hex，給 80 上限即可
});

export async function POST(req: NextRequest) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: '請先登入' }, { status: 401 });
  }
  if (session.role !== 'super') {
    return NextResponse.json({ error: '無權限' }, { status: 403 });
  }

  let parsed;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const result = await setBroadcastGroup(parsed.groupId);
  if (!result.ok) {
    return NextResponse.json(
      {
        error: '設定失敗',
        reason: result.reason,
        detail: result.detail,
      },
      { status: result.reason === 'no_url' || result.reason === 'no_secret' ? 503 : 502 },
    );
  }
  return NextResponse.json({
    ok: true,
    groupId: result.groupId,
    set: result.set,
    cleared: result.cleared,
  });
}
