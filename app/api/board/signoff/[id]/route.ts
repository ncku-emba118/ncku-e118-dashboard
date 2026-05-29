/**
 * GET /api/board/signoff/[id] — 簽核文件詳情（依 §7 scope）。
 * 回 doc meta + 指派狀態 + 短效 signed read URL（sheet / source / final）。
 */
import { type NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { readSession } from '@/lib/auth/session';
import { resolveClientIp } from '@/lib/ip-resolve';
import { hashIp } from '@/lib/ip-hash';
import { jsonResp } from '@/lib/signoff/http';
import { requireSignoffAccess } from '@/lib/signoff/access';
import { createSignedReadUrl, recordAudit } from '@/lib/signoff/dal';

const UUID_RE =
  /^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const traceId = crypto.randomUUID();
  const { id } = await params;
  if (!UUID_RE.test(id)) return jsonResp({ error: '無效的 ID' }, 400, traceId);

  const session = await readSession();
  if (!session) return jsonResp({ error: '未登入或 session 過期' }, 401, traceId);

  const access = await requireSignoffAccess(session, 'view', id);
  if (!access.ok) return jsonResp({ error: access.error }, access.status, traceId);
  const { doc, assignments } = access.bundle;

  const [sheetUrl, finalUrl] = await Promise.all([
    createSignedReadUrl(doc.signoff_sheet_object_path),
    doc.final_pdf_object_path
      ? createSignedReadUrl(doc.final_pdf_object_path)
      : Promise.resolve({ url: null, error: null }),
  ]);
  const attachmentUrls = await Promise.all(
    doc.attachments.map(async (a) => ({
      name: a.name,
      url: (await createSignedReadUrl(a.object_path)).url,
    })),
  );

  const myPending = assignments.find(
    (a) => a.signer_account_id === session.sub && a.status === 'pending',
  );

  // best-effort audit（不阻擋回應）
  const ip = resolveClientIp(req);
  const ipHash = ip ? hashIp(ip) : null;
  void recordAudit({
    documentId: id,
    accountId: session.sub,
    eventType: 'viewed',
    ipHash: ipHash?.hash ?? null,
    ipHashVersion: ipHash?.version ?? null,
    userAgent: req.headers.get('user-agent'),
    traceId,
  });

  return jsonResp(
    {
      doc: {
        id: doc.id,
        title: doc.title,
        amount: doc.amount,
        currency: doc.currency,
        purpose: doc.purpose,
        applicant: doc.applicant,
        owner_dept_id: doc.owner_dept_id,
        status: doc.status,
        created_at: doc.created_at,
        due_at: doc.due_at,
        final_pdf_sha256: doc.final_pdf_sha256,
      },
      assignments: assignments.map((a) => ({
        id: a.id,
        signer_account_id: a.signer_account_id,
        signer_username: a.signer_username,
        role_label: a.role_label,
        status: a.status,
        reject_reason: a.reject_reason,
        acted_at: a.acted_at,
        slot_page: a.slot_page,
        slot_x: a.slot_x,
        slot_y: a.slot_y,
        slot_w: a.slot_w,
        slot_h: a.slot_h,
      })),
      urls: {
        sheet: sheetUrl.url,
        final: finalUrl.url,
      },
      attachments: attachmentUrls,
      my_pending_assignment_id: myPending?.id ?? null,
      can_delete: session.role === 'super', // 班代/副班代/秘書可刪除
    },
    200,
    traceId,
  );
}
