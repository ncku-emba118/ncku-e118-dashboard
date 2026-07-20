/**
 * POST /api/board/signoff/[id]/undo-reject — 撤銷退回（0021 誤觸復原）。
 *
 * 退回是誤觸時，正確的補救不是重建文件：其他簽核人的 assignment 在退回時
 * 完全沒被動過，簽名對應的內容也沒變。因此只需把狀態轉回去
 * （文件 rejected→routing、退回者 rejected→pending），其他簽名一概不動。
 *
 * 權限：super 或「當初按下退回的那個人」。後者需要讀 assignment 狀態才判斷得出來，
 * 屬資料層的權威判斷，故 API 層只做粗篩（super 或被指派者），精確比對在 RPC 內。
 */
import { type NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { readSession } from '@/lib/auth/session';
import { resolveClientIp } from '@/lib/ip-resolve';
import { hashIp } from '@/lib/ip-hash';
import { jsonResp, isSameOrigin } from '@/lib/signoff/http';
import { rateLimit } from '@/lib/signoff/rate-limit';
import { requireSignoffAccess } from '@/lib/signoff/access';
import { undoReject } from '@/lib/signoff/dal';

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
  if (!rateLimit(`signoff:undo-reject:${session.sub}`, 10, 60 * 60_000)) {
    return jsonResp({ error: '操作過於頻繁，請稍後再試' }, 429, traceId);
  }

  const access = await requireSignoffAccess(session, 'undo_reject', id);
  if (!access.ok) return jsonResp({ error: access.error }, access.status, traceId);

  if (access.bundle.doc.status !== 'rejected') {
    return jsonResp({ error: '這張單目前不是已退回狀態' }, 409, traceId);
  }

  const ip = resolveClientIp(req);
  const ipHash = ip ? hashIp(ip) : null;

  const { ok, error } = await undoReject({
    documentId: id,
    accountId: session.sub,
    audit: {
      ip_hash: ipHash?.hash ?? null,
      ip_hash_version: ipHash?.version ?? null,
      user_agent: req.headers.get('user-agent'),
      trace_id: traceId,
    },
  });

  if (!ok) {
    const denied = /requires the rejecter or super/.test(error ?? '');
    const conflict = /is not rejected/.test(error ?? '');
    if (denied) {
      return jsonResp({ error: '只有當初按下退回的人或班代可以撤銷' }, 403, traceId);
    }
    if (conflict) {
      return jsonResp({ error: '文件狀態已變更，無法撤銷退回' }, 409, traceId);
    }
    console.error('[signoff.undo_reject.failed]', { traceId, document_id: id, error });
    return jsonResp({ error: '撤銷失敗，請稍後再試' }, 503, traceId);
  }

  return jsonResp({ ok: true }, 200, traceId);
}
