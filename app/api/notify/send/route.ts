/**
 * POST /api/notify/send — 秘書送出手動 LINE 通知。
 * body: { names: string[], message: string }
 *
 * 需 notify session。實際 push 動作**全部在 GAS 那側**執行
 * （bot token、userId 反查、逐一 push、寫「手動通知紀錄」分頁都在 GAS）。
 * 本層只負責：驗 session → 基本輸入驗證 → 轉呼叫 GAS → 回結果明細。
 */
import { NextResponse, type NextRequest } from 'next/server';
import { hasNotifySession } from '@/lib/notify/session';
import { sendManualNotify } from '@/lib/notify/gas';

export const maxDuration = 60;

const MAX_RECIPIENTS = 100;    // 與 GAS 端 MANUAL_NOTIFY_MAX_RECIPIENTS_ 一致
const MAX_MESSAGE_LEN = 4500;  // 與 GAS 端 MANUAL_NOTIFY_MAX_MESSAGE_LEN_ 一致
const MAX_BODY_BYTES = 64 * 1024;

export async function POST(req: NextRequest) {
  if (!(await hasNotifySession())) {
    return NextResponse.json({ error: '未登入或已過期' }, { status: 401 });
  }
  if (Number(req.headers.get('content-length') || 0) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: '請求過大' }, { status: 413 });
  }

  const body = (await req.json().catch(() => null)) as
    | { names?: unknown; message?: unknown; requestId?: unknown }
    | null;

  if (!body || !Array.isArray(body.names) || typeof body.message !== 'string') {
    return NextResponse.json({ error: '請選擇收件人並填寫訊息' }, { status: 400 });
  }

  const names = body.names
    .filter((n): n is string => typeof n === 'string')
    .map((n) => n.trim())
    .filter(Boolean);
  const message = body.message.trim();

  // requestId：前端一次送出操作的一次性識別碼，用來讓 GAS 端做重送去重。
  // 格式不符（非字串 / 不像 UUID）就當作沒有給，不擋這次請求 —— 去重是防呆不是硬性關卡。
  const requestId =
    typeof body.requestId === 'string' && /^[a-zA-Z0-9-]{8,64}$/.test(body.requestId)
      ? body.requestId
      : crypto.randomUUID();

  if (!names.length) {
    return NextResponse.json({ error: '請至少勾選一位同學' }, { status: 400 });
  }
  if (names.length > MAX_RECIPIENTS) {
    return NextResponse.json({ error: `一次最多 ${MAX_RECIPIENTS} 人` }, { status: 400 });
  }
  if (!message) {
    return NextResponse.json({ error: '訊息內容不可空白' }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE_LEN) {
    return NextResponse.json({ error: `訊息最多 ${MAX_MESSAGE_LEN} 字` }, { status: 400 });
  }

  const r = await sendManualNotify(names, message, requestId);
  if (!r.ok) {
    console.error('[notify.send.failed]', { error: r.error, count: names.length });
    return NextResponse.json({ error: `發送失敗：${r.error}` }, { status: 502 });
  }

  console.info('[notify.send.done]', {
    total: r.total,
    sent: r.sent,
    failed: r.failed?.length ?? 0,
    dedup: r.dedup ?? false,
    auditPersisted: r.auditPersisted,
  });
  return NextResponse.json({
    ok: true,
    total: r.total,
    sent: r.sent,
    failed: r.failed ?? [],
    quota: r.quota,
    auditPersisted: r.auditPersisted,
    dedup: r.dedup ?? false,
  });
}
