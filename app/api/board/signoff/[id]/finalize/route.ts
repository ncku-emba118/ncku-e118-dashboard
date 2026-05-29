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
    return jsonResp({ error: '最終 PDF 合成失敗，請稍後再試' }, 503, traceId);
  }
  return jsonResp({ ok: true, regenerated: true }, 200, traceId);
}
