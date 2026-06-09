/**
 * POST /api/board/group-log — LINE Bot 群組對話記錄上報
 *
 * 用途：Bot webhook 收到「記錄對話=是」群組的成員發言 → fire-and-forget POST 過來，
 *       存進 group_messages（以 LINE userId 為主、可依 user_id 刪除）。未來做年度回顧 / 風格模仿。
 *
 * 鑑權：Authorization: Bearer ${BOT_SYNC_SECRET}（timing-safe，同 finance/income/sync、push/dispatch）。
 *
 * Body: { groupId, userId, type?, content?, lineMsgId?, sentAt? }
 *   • sentAt 可為毫秒數字（LINE timestamp）或 ISO 字串
 *   • line_msg_id 去重：同一則訊息重送只記一次
 */
import { type NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { getEnv } from '@/lib/env';
import { jsonResp } from '@/lib/signoff/http';
import { insertGroupMessage } from '@/lib/signoff/dal';

// 真 constant-time 比對（先 SHA-256 兩邊，避免 length side-channel）— 同 finance/income/sync
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export async function POST(req: NextRequest) {
  const traceId = crypto.randomUUID();
  const env = getEnv();

  // 鑑權：Bearer BOT_SYNC_SECRET（timing-safe）
  const auth = req.headers.get('authorization');
  if (
    !env.BOT_SYNC_SECRET ||
    !auth?.startsWith('Bearer ') ||
    !safeEqual(auth.slice('Bearer '.length).trim(), env.BOT_SYNC_SECRET)
  ) {
    return jsonResp({ error: 'unauthorized' }, 401, traceId);
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonResp({ error: '欄位格式錯誤' }, 400, traceId);

  const groupId = typeof body.groupId === 'string' ? body.groupId.trim() : '';
  const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
  if (!groupId || !userId) return jsonResp({ error: '缺 groupId / userId' }, 400, traceId);

  const type =
    typeof body.type === 'string' && body.type.trim() ? body.type.trim().slice(0, 20) : 'text';
  const content = typeof body.content === 'string' ? body.content.slice(0, 4000) : null;
  const lineMsgId =
    typeof body.lineMsgId === 'string' && body.lineMsgId.trim()
      ? body.lineMsgId.trim().slice(0, 60)
      : null;

  let sentAt: string | null = null;
  if (typeof body.sentAt === 'number' && Number.isFinite(body.sentAt)) {
    sentAt = new Date(body.sentAt).toISOString();
  } else if (typeof body.sentAt === 'string' && body.sentAt.trim()) {
    const d = new Date(body.sentAt.trim());
    if (!isNaN(d.getTime())) sentAt = d.toISOString();
  }

  const { error } = await insertGroupMessage({ groupId, userId, type, content, lineMsgId, sentAt });
  if (error) {
    console.error('[group-log.failed]', { traceId, e: error });
    return jsonResp({ error: '記錄失敗，請稍後再試' }, 503, traceId);
  }
  return jsonResp({ ok: true }, 200, traceId);
}
