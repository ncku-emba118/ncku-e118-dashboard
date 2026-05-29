/**
 * POST /api/board/signoff/[id]/void — 作廢（僅 super）。保留證據，可重開新版。
 */
import { type NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { readSession } from '@/lib/auth/session';
import { resolveClientIp } from '@/lib/ip-resolve';
import { hashIp } from '@/lib/ip-hash';
import { jsonResp, isSameOrigin } from '@/lib/signoff/http';
import { rateLimit } from '@/lib/signoff/rate-limit';
import { requireSignoffAccess } from '@/lib/signoff/access';
import { voidDocument } from '@/lib/signoff/dal';

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
  if (!rateLimit(`signoff:void:${session.sub}`, 10, 60_000)) {
    return jsonResp({ error: '請求過於頻繁' }, 429, traceId);
  }
  const ip = resolveClientIp(req);
  if (!ip) return jsonResp({ error: '系統無法識別來源' }, 503, traceId);

  const access = await requireSignoffAccess(session, 'void', id);
  if (!access.ok) return jsonResp({ error: access.error }, access.status, traceId);

  const ipHash = hashIp(ip);
  const { error } = await voidDocument({
    documentId: id,
    accountId: session.sub,
    ipHash: ipHash.hash,
    ipHashVersion: ipHash.version,
    userAgent: req.headers.get('user-agent'),
    traceId,
  });
  if (error) {
    console.warn('[signoff.void.rpc_rejected]', { traceId, e: error });
    return jsonResp({ error: '此文件目前無法作廢（可能已核准）' }, 409, traceId);
  }
  return jsonResp({ ok: true }, 200, traceId);
}
