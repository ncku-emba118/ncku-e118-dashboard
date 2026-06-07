/**
 * POST /api/board/finance/income/sync — LINE Bot 對帳收款連動（L1）
 *
 * 用途：LINE Bot（Apps Script）對帳完，把「每個班務活動的已入帳總額」推過來，
 *       UPSERT 進 finance_income（source_ref = "bot:<活動ID>"），公開經費頁自動加總顯示。
 *
 * 鑑權：Authorization: Bearer ${BOT_SYNC_SECRET}（timing-safe，不走 session cookie）。
 *       與 /api/board/push/dispatch 的 CRON_SECRET 同模式。
 *
 * Body: { activityId, activityName, totalAmount, lastPaidOn?, paidCount? }
 *   • totalAmount > 0  → UPSERT 一列（每活動彙總、不含姓名/個別金額）
 *   • totalAmount <= 0 → 刪除該活動的 bot 收入列（全退/歸零不殘留）
 */
import { type NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { getEnv } from '@/lib/env';
import { jsonResp } from '@/lib/signoff/http';
import { upsertBotIncome, deleteBotIncomeByRef } from '@/lib/signoff/dal';

// 真 constant-time 比對（先 SHA-256 兩邊，避免 length side-channel）— 同 push/dispatch
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const MAX_AMOUNT = 99_999_999;

// 真實日期檢查（擋 2026-99-99 這種格式對但無效的日期，避免進 DB date cast 才失敗）
function isRealDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function todayTW(): string {
  // 以 Asia/Taipei 算今天（lambda 預設 UTC，避免跨日偏移）
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return f.format(new Date()); // en-CA → YYYY-MM-DD
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

  const activityId = typeof body.activityId === 'string' ? body.activityId.trim() : '';
  if (!ID_RE.test(activityId)) return jsonResp({ error: '活動 ID 不合法' }, 400, traceId);
  const source_ref = 'bot:' + activityId;

  const amtNum = typeof body.totalAmount === 'number' ? body.totalAmount : Number(body.totalAmount);
  if (!Number.isFinite(amtNum) || amtNum < 0 || amtNum > MAX_AMOUNT) {
    return jsonResp({ error: '金額不合法' }, 400, traceId);
  }
  const amount = Math.round(amtNum * 100) / 100;

  // 歸零 / 全退 / 四捨五入後 <= 0 → 刪除該活動 bot 收入列（避免殘留，也不觸發 DB CHECK amount>0）
  if (amount <= 0) {
    const { error } = await deleteBotIncomeByRef(source_ref);
    if (error) {
      console.error('[finance.income.sync.del.failed]', { traceId, source_ref, e: error });
      return jsonResp({ error: '同步失敗，請稍後再試' }, 503, traceId);
    }
    return jsonResp({ ok: true, removed: true }, 200, traceId);
  }

  let occurred_on = typeof body.lastPaidOn === 'string' ? body.lastPaidOn.trim() : '';
  if (!isRealDate(occurred_on)) occurred_on = todayTW();

  const activityName =
    typeof body.activityName === 'string' && body.activityName.trim()
      ? body.activityName.trim().slice(0, 40)
      : activityId;
  const paidCountRaw = Number(body.paidCount);
  const paidCount = Number.isFinite(paidCountRaw) ? Math.max(0, Math.floor(paidCountRaw)) : 0;
  const note = `${activityName}（自動對帳 ${paidCount} 筆）`.slice(0, 200);

  const { error } = await upsertBotIncome({
    source_ref,
    occurred_on,
    category: '收班費',
    amount,
    note,
  });
  if (error) {
    console.error('[finance.income.sync.failed]', { traceId, source_ref, e: error });
    return jsonResp({ error: '同步失敗，請稍後再試' }, 503, traceId);
  }
  console.info('[finance.income.sync.ok]', { traceId, source_ref, amount, paidCount });
  return jsonResp({ ok: true }, 200, traceId);
}
