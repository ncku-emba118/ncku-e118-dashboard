/**
 * POST /api/board/signoff/[id]/delete — 刪除整張簽核單（限 super：班代/副班代/秘書）。
 * 受控 admin 刪除：寫 tombstone（signoff_deletion_log）→ 硬刪 DB → 清 storage 物件。
 * append-only 一般路徑仍禁刪；只有 signoff_delete RPC 放行。
 */
import { type NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { readSession } from '@/lib/auth/session';
import { resolveClientIp } from '@/lib/ip-resolve';
import { hashIp } from '@/lib/ip-hash';
import { jsonResp, isSameOrigin } from '@/lib/signoff/http';
import { rateLimit } from '@/lib/signoff/rate-limit';
import { deleteSignoffDocument, removeObjects } from '@/lib/signoff/dal';

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
  if (session.role !== 'super') {
    return jsonResp({ error: '只有班代 / 副班代 / 秘書可刪除簽核單' }, 403, traceId);
  }
  if (!rateLimit(`signoff:delete:${session.sub}`, 10, 60_000)) {
    return jsonResp({ error: '請求過於頻繁' }, 429, traceId);
  }
  const ip = resolveClientIp(req);
  if (!ip) return jsonResp({ error: '系統無法識別來源' }, 503, traceId);

  const ipHash = hashIp(ip);
  const { paths, error } = await deleteSignoffDocument({
    documentId: id,
    accountId: session.sub,
    ipHash: ipHash.hash,
    ipHashVersion: ipHash.version,
    userAgent: req.headers.get('user-agent'),
    traceId,
  });
  if (error) {
    console.warn('[signoff.delete.failed]', { traceId, e: error });
    return jsonResp(
      { error: /not found/i.test(error) ? '找不到該簽核單' : '刪除失敗，請稍後再試' },
      /not found/i.test(error) ? 404 : 503,
      traceId,
    );
  }

  if (paths && paths.length > 0) {
    const r = await removeObjects(paths);
    if (r.error) console.warn('[signoff.delete.storage_cleanup_failed]', { traceId, e: r.error });
  }

  console.info('[signoff.delete.success]', { traceId, document_id: id, by: session.username });
  return jsonResp({ ok: true }, 200, traceId);
}
