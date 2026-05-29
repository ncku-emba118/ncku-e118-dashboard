/**
 * POST /api/board/signoff/[id]/challenge — 發一次性簽署 nonce（防重放，Codex 3-2）。
 * 限「待簽的被指派者本人」。nonce 寫進 assignment.active_challenge_*，sign 時驗。
 */
import { type NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { readSession } from '@/lib/auth/session';
import { resolveClientIp } from '@/lib/ip-resolve';
import { hashIp } from '@/lib/ip-hash';
import { jsonResp, isSameOrigin } from '@/lib/signoff/http';
import { rateLimit } from '@/lib/signoff/rate-limit';
import { CHALLENGE_TTL_MS } from '@/lib/signoff/constants';
import { requireSignoffAccess } from '@/lib/signoff/access';
import { setAssignmentChallenge, recordAudit } from '@/lib/signoff/dal';

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
  if (!rateLimit(`signoff:challenge:${session.sub}`, 20, 60_000)) {
    return jsonResp({ error: '請求過於頻繁' }, 429, traceId);
  }

  const access = await requireSignoffAccess(session, 'sign', id);
  if (!access.ok) return jsonResp({ error: access.error }, access.status, traceId);

  const mine = access.bundle.assignments.find(
    (a) => a.signer_account_id === session.sub && a.status === 'pending',
  );
  if (!mine) return jsonResp({ error: '沒有待你簽核的項目' }, 409, traceId);

  const nonce = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS).toISOString();
  const res = await setAssignmentChallenge({
    assignmentId: mine.id,
    documentId: id,
    signerAccountId: session.sub,
    nonce,
    expiresAt,
  });
  if (res.error || !res.ok) {
    return jsonResp({ error: '簽核狀態已變更，請重新載入' }, 409, traceId);
  }

  const ip = resolveClientIp(req);
  const ipHash = ip ? hashIp(ip) : null;
  void recordAudit({
    documentId: id,
    accountId: session.sub,
    eventType: 'challenge_issued',
    ipHash: ipHash?.hash ?? null,
    ipHashVersion: ipHash?.version ?? null,
    userAgent: req.headers.get('user-agent'),
    traceId,
  });

  return jsonResp({ assignment_id: mine.id, nonce, expires_at: expiresAt }, 200, traceId);
}
