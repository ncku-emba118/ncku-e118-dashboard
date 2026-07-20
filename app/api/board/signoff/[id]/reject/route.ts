/**
 * POST /api/board/signoff/[id]/reject — 退回（atomic，Codex 2-3）。限待簽被指派者本人。
 */
import { type NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { z } from 'zod';
import { readSession } from '@/lib/auth/session';
import { resolveClientIp } from '@/lib/ip-resolve';
import { hashIp } from '@/lib/ip-hash';
import { jsonResp, isSameOrigin } from '@/lib/signoff/http';
import { rateLimit } from '@/lib/signoff/rate-limit';
import { requireSignoffAccess } from '@/lib/signoff/access';
import { rejectAssignment } from '@/lib/signoff/dal';

const UUID_RE =
  /^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/;

// 理由至少 4 字：曾發生簽核人誤觸退回、理由欄只填「滑到」，
// 而退回會讓整份單停簽、已簽者需重簽。前端已有確認面板，此處為權威驗證。
const schema = z.object({ reason: z.string().trim().min(4).max(1000) });

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
  if (!rateLimit(`signoff:reject:${session.sub}`, 20, 60_000)) {
    return jsonResp({ error: '請求過於頻繁' }, 429, traceId);
  }
  const ip = resolveClientIp(req);
  if (!ip) return jsonResp({ error: '系統無法識別來源' }, 503, traceId);

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return jsonResp({ error: '請填寫退回原因' }, 400, traceId);

  const access = await requireSignoffAccess(session, 'reject', id);
  if (!access.ok) return jsonResp({ error: access.error }, access.status, traceId);
  const mine = access.bundle.assignments.find(
    (a) => a.signer_account_id === session.sub && a.status === 'pending',
  );
  if (!mine) return jsonResp({ error: '沒有待你簽核的項目' }, 409, traceId);

  const ipHash = hashIp(ip);
  const { error } = await rejectAssignment({
    assignmentId: mine.id,
    documentId: id,
    signerAccountId: session.sub,
    reason: parsed.data.reason,
    ipHash: ipHash.hash,
    ipHashVersion: ipHash.version,
    userAgent: req.headers.get('user-agent'),
    traceId,
  });
  if (error) {
    console.warn('[signoff.reject.rpc_rejected]', { traceId, e: error });
    return jsonResp({ error: '簽核狀態已變更，請重新載入' }, 409, traceId);
  }
  return jsonResp({ ok: true }, 200, traceId);
}
