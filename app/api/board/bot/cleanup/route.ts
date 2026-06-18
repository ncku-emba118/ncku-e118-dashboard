/**
 * POST /api/board/bot/cleanup — Bot 對話歷史清理（daily cron）
 *
 * 對應 Codex F04：soft delete + 365 天保留承諾必須真的兌現。
 *
 * 鑑權：Authorization: Bearer ${CRON_SECRET}（timing-safe，同 push/dispatch 模式）。
 *
 * 行為：
 *   1. 真刪 deleted_at < now()-7d 的列（「忘掉我」緩衝過了）
 *   2. 真刪 created_at < now()-365d 的列（年度保留上限）
 *
 * 觸發者：Netlify Scheduled Function `bot-cleanup-cron.mts`（每日 03:00 UTC ≈ 11:00 台灣）
 */
import { NextResponse, type NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { getEnv } from '@/lib/env';
import {
  hardDeleteSoftDeletedOlderThan,
  hardDeleteCreatedBefore,
} from '@/lib/bot/chat-dal';

const SOFT_DELETE_BUFFER_DAYS = 7;
const HARD_RETENTION_DAYS = 365;

function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export async function POST(req: NextRequest) {
  const traceId = crypto.randomUUID();
  const env = getEnv();

  const auth = req.headers.get('authorization');
  if (
    !env.CRON_SECRET ||
    !auth?.startsWith('Bearer ') ||
    !safeEqual(auth.slice('Bearer '.length).trim(), env.CRON_SECRET)
  ) {
    return NextResponse.json(
      { error: 'unauthorized' },
      { status: 401, headers: { 'x-trace-id': traceId } },
    );
  }

  const softResult = await hardDeleteSoftDeletedOlderThan(SOFT_DELETE_BUFFER_DAYS);
  const hardResult = await hardDeleteCreatedBefore(HARD_RETENTION_DAYS);

  if (softResult.error || hardResult.error) {
    console.error('[bot.cleanup.partial_failure]', {
      traceId,
      soft: softResult,
      hard: hardResult,
    });
    return NextResponse.json(
      { ok: false, soft: softResult, hard: hardResult },
      { status: 500, headers: { 'x-trace-id': traceId } },
    );
  }

  console.log('[bot.cleanup.success]', {
    traceId,
    soft_deleted_purged: softResult.count,
    expired_purged: hardResult.count,
  });

  return NextResponse.json(
    {
      ok: true,
      soft_deleted_purged: softResult.count,
      expired_purged: hardResult.count,
    },
    { headers: { 'x-trace-id': traceId } },
  );
}
