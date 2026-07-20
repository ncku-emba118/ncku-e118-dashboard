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
import { createSignedReadUrl, getPublicApprovedSummary, listSupplements, recordAudit } from '@/lib/signoff/dal';

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

  // ① 登入且有內部 view 權限 → 回完整原件（doc meta + 指派 + 短效 signed URL）。
  if (session) {
    const access = await requireSignoffAccess(session, 'view', id);
    if (access.ok) {
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
          mime: a.mime,
          label: a.label ?? null,
          caption: a.caption ?? null,
          url: (await createSignedReadUrl(a.object_path)).url,
        })),
      );

      // 補充資料（0019）：與原始附件分開回傳，畫面才能標示時序。
      // 查詢失敗必須回 503 —— 若吞掉錯誤回 200，畫面會顯示成「沒有補充資料」，
      // 使用者無從得知資料其實存在（例如 migration 未套用時）。
      const { rows: supplementRows, error: supErr } = await listSupplements(id);
      if (supErr) {
        console.error('[signoff.supplements.list_failed]', { traceId, document_id: id, error: supErr });
        return jsonResp({ error: '系統暫時無法讀取補充資料' }, 503, traceId);
      }
      const accountNames = new Map(
        assignments.map((a) => [a.signer_account_id, a.signer_username ?? null]),
      );
      const supplements = await Promise.all(
        supplementRows.map(async (sup) => ({
          id: sup.id,
          note: sup.note,
          added_by_name: accountNames.get(sup.added_by) ?? null,
          is_mine: sup.added_by === session.sub,
          doc_status_at_add: sup.doc_status_at_add,
          signed_count_at_add: sup.signed_count_at_add,
          created_at: sup.created_at,
          attachments: await Promise.all(
            sup.attachments.map(async (a) => ({
              name: a.name,
              mime: a.mime,
              label: a.label ?? null,
              caption: a.caption ?? null,
              url: (await createSignedReadUrl(a.object_path)).url,
            })),
          ),
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
          supplements,
          my_pending_assignment_id: myPending?.id ?? null,
          can_delete: session.role === 'super', // 班代/副班代/秘書可刪除
          // 補充權限：申請人本人或 super；且限 routing / approved
          can_supplement:
            (session.role === 'super' || doc.created_by === session.sub) &&
            (doc.status === 'routing' || doc.status === 'approved'),
        },
        200,
        traceId,
      );
    }
    // DB 讀取失敗 → 503（不可 fall through 成 404，否則暫時性錯誤會謊報「不存在」）
    if (access.status === 503) {
      return jsonResp({ error: access.error }, 503, traceId);
    }
    // access 被拒（404）→ 不 return，落到 ② 公開摘要檢查：
    //   登入幹部就算不是此單發起人/部門/簽核人，已核准單仍應看得到（與訪客同級公開）。
  }

  // ② 未登入，或登入但無內部權限：只有 status==='approved' 回「公開摘要」，其餘一律 404。
  //    單次查詢在 DB 端鎖 status='approved'（atomic，無兩段式競態、無 timing oracle）。
  //    欄位白名單制：絕不帶 signed URL / object_path / sha / account id / slot 座標。
  const pub = await getPublicApprovedSummary(id);
  if (pub.error) return jsonResp({ error: '系統暫時無法讀取簽核文件' }, 503, traceId);
  if (!pub.data) {
    // 不存在 or 未核准 → 統一 404，不洩漏文件存在性
    return jsonResp({ error: '找不到此單據或尚未完成簽核' }, 404, traceId);
  }
  const { doc, assignments } = pub.data;
  // 核准完成時間 = 最後一筆簽核動作時間；無 acted_at 時退回 doc.updated_at（ISO 字串可字典序排序）
  const actedTimes = assignments
    .map((a) => a.acted_at)
    .filter((t): t is string => !!t)
    .sort();
  const completedAt = actedTimes.length ? actedTimes[actedTimes.length - 1] : doc.updated_at;
  return jsonResp(
    {
      public: true,
      doc: {
        id: doc.id,
        title: doc.title,
        purpose: doc.purpose,
        amount: doc.amount,
        currency: doc.currency,
        owner_dept_id: doc.owner_dept_id,
        status: doc.status, // 恆為 'approved'
        created_at: doc.created_at,
        completed_at: completedAt,
      },
      // 簽核進度：每格只回姓名/職稱/狀態/簽核時間，不含 account id / slot 座標
      assignments: assignments.map((a) => ({
        signer_username: a.signer_username,
        role_label: a.role_label,
        status: a.status,
        acted_at: a.acted_at,
      })),
    },
    200,
    traceId,
  );
}
