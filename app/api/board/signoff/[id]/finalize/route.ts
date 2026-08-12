/**
 * POST /api/board/signoff/[id]/finalize — 重生最終 PDF（Codex P1）。
 *
 * sign 完成時的合成是 best-effort；若當下失敗會出現「approved 但 final_pdf 為 null」。
 * 此 route 讓 super / 發起人重試合成，補上 final.pdf（idempotent）。
 */
import { type NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { readSession } from '@/lib/auth/session';
import { jsonResp, isSameOrigin } from '@/lib/signoff/http';
import { rateLimit } from '@/lib/signoff/rate-limit';
import { requireSignoffAccess } from '@/lib/signoff/access';
import { composeAndStoreFinal } from '@/lib/signoff/finalize';
import { recordFinalizeFailure } from '@/lib/signoff/dal';
import { notifyApprovalCompleted } from '@/lib/board/signoff_notify';

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
  if (!rateLimit(`signoff:finalize:${id}`, 5, 60_000)) {
    return jsonResp({ error: '請求過於頻繁' }, 429, traceId);
  }

  // 重生屬管理動作 → 沿用 nudge scope（super 或發起人）
  const access = await requireSignoffAccess(session, 'nudge', id);
  if (!access.ok) return jsonResp({ error: access.error }, access.status, traceId);
  const { doc } = access.bundle;

  if (doc.status !== 'approved') {
    return jsonResp({ error: '只有已核准的文件可重生最終 PDF' }, 409, traceId);
  }
  if (doc.final_pdf_object_path) {
    return jsonResp({ ok: true, regenerated: false }, 200, traceId); // 已有，idempotent
  }

  const fin = await composeAndStoreFinal(doc);
  if (!fin.ok) {
    console.error('[signoff.finalize.retry_failed]', { traceId, e: fin.error });
    const trace = await recordFinalizeFailure(id, fin.error ?? '未知錯誤');
    if (trace.error) {
      console.error('[signoff.finalize.record_finalize_failure_failed]', { traceId, e: trace.error });
    }
    return jsonResp({ error: '最終 PDF 合成失敗，請稍後再試' }, 503, traceId);
  }

  // 敵對審查修正3：這支端點在上面第 39-44 行已經用「動作前 final_pdf_object_path
  // 是否為 null」擋掉了重複補救（已有 final PDF 時 idempotent 直接回 regenerated:false，
  // 不會走到這裡）——走到這裡即代表「這次是首度補上 final PDF」，語意與 sign route
  // 成功分支一致，故同樣要通知財務長（best-effort，失敗只 log，不影響本次 API 回應）。
  try {
    const notify = await notifyApprovalCompleted(id);
    if (!notify.ok) {
      console.warn('[signoff.finalize.notify_completed_failed]', { traceId, reason: notify.reason, detail: notify.detail });
    }
  } catch (e) {
    console.error('[signoff.finalize.notify_completed_threw]', { traceId, e: (e as Error).message });
  }

  return jsonResp({ ok: true, regenerated: true }, 200, traceId);
}
