/**
 * POST /api/board/signoff/[id]/finance-link — 重新產生財務長下載連結（敵對審查修正1）。
 *
 * 背景：財務長下載連結（0025 + 修正1 定案）不設 TTL、可重複使用，使用者唯一的
 * 作廢手段就是按這顆鍵——先作廢舊連結、再核發新的（見 lib/board/signoff_notify.ts
 * regenerateFinanceMagicLink）。權限沿用 finalize / nudge 同一 scope（super 或發起人）：
 * 這是管理動作，不是簽核動作。
 */
import { type NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { readSession } from '@/lib/auth/session';
import { jsonResp, isSameOrigin } from '@/lib/signoff/http';
import { rateLimit } from '@/lib/signoff/rate-limit';
import { requireSignoffAccess } from '@/lib/signoff/access';
import { regenerateFinanceMagicLink } from '@/lib/board/signoff_notify';

const UUID_RE =
  /^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const traceId = crypto.randomUUID();
  const { id } = await params;
  if (!UUID_RE.test(id)) return jsonResp({ error: '無效的 ID' }, 400, traceId);

  const session = await readSession();
  if (!session) return jsonResp({ error: '未登入或 session 過期' }, 401, traceId);
  if (!isSameOrigin(req)) return jsonResp({ error: '來源驗證失敗' }, 403, traceId);
  if (!rateLimit(`signoff:finance-link:${id}`, 5, 60_000)) {
    return jsonResp({ error: '請求過於頻繁' }, 429, traceId);
  }

  // 沿用 finalize route 同一 scope（super 或發起人）——這是管理動作，不是簽核動作。
  // magic_scope（財務長唯讀 session）帶的是 'view'，不會通過這裡的 'nudge' 判斷，
  // 財務長本人若想重發連結，需改用密碼登入（符合「唯讀」語意，見 access.ts）。
  const access = await requireSignoffAccess(session, 'nudge', id);
  if (!access.ok) return jsonResp({ error: access.error }, access.status, traceId);
  const { doc } = access.bundle;

  if (doc.status !== 'approved') {
    return jsonResp({ error: '只有已核准的文件可產生財務長下載連結' }, 409, traceId);
  }

  const result = await regenerateFinanceMagicLink(id);
  if (!result.ok) {
    console.error('[signoff.finance_link.regenerate_failed]', { traceId, reason: result.reason, detail: result.detail });
    const msg =
      result.reason === 'no_recipient' || result.reason === 'ambiguous_recipient'
        ? '找不到唯一的財務長帳號，請確認財務職務設定'
        : '產生連結失敗，請稍後再試';
    return jsonResp({ error: msg }, 503, traceId);
  }
  console.info('[signoff.finance_link.regenerated]', { traceId, document_id: id, by: session.username });
  return jsonResp({ ok: true, url: result.url }, 200, traceId);
}
