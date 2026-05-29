/**
 * POST /api/board/signoff/[id]/nudge — 催簽（super 或發起人，Codex 1-2）。
 * MVP：記 audit + 回未簽名單（UI 顯示「還沒簽：X、Y」）。PWA 推播催簽為後續
 * （現有推播訂閱未綁帳號，無法定向到特定幹部 — 列 v2）。
 */
import { type NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { readSession } from '@/lib/auth/session';
import { resolveClientIp } from '@/lib/ip-resolve';
import { hashIp } from '@/lib/ip-hash';
import { jsonResp, isSameOrigin } from '@/lib/signoff/http';
import { rateLimit } from '@/lib/signoff/rate-limit';
import { requireSignoffAccess } from '@/lib/signoff/access';
import { recordAudit } from '@/lib/signoff/dal';

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
  if (!rateLimit(`signoff:nudge:doc:${id}`, 6, 60 * 60_000)) {
    return jsonResp({ error: '催簽過於頻繁，請稍後再試' }, 429, traceId);
  }

  const access = await requireSignoffAccess(session, 'nudge', id);
  if (!access.ok) return jsonResp({ error: access.error }, access.status, traceId);

  const pending = access.bundle.assignments
    .filter((a) => a.status === 'pending')
    .map((a) => a.signer_username ?? '（未知）');

  const ip = resolveClientIp(req);
  const ipHash = ip ? hashIp(ip) : null;
  void recordAudit({
    documentId: id,
    accountId: session.sub,
    eventType: 'nudged',
    ipHash: ipHash?.hash ?? null,
    ipHashVersion: ipHash?.version ?? null,
    userAgent: req.headers.get('user-agent'),
    traceId,
    detail: { pending_count: pending.length },
  });

  return jsonResp({ ok: true, pending }, 200, traceId);
}
