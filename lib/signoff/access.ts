/**
 * requireSignoffAccess — server 端權限閘口（SIGNOFF-ARCHITECTURE.md §7）。
 *
 * 抓 document bundle → 組 context → 套用已單元測試過的純函式 canAccessSignoff。
 * 所有 signoff mutation/read route 在動 DAL 前都應先過這裡。
 */
import 'server-only';
import type { Session } from '../auth/session';
import { getDocumentBundle, type DocumentBundle } from './dal';
import {
  canAccessSignoff,
  type SignoffAction,
} from './permission';

export type AccessResult =
  | { ok: true; bundle: DocumentBundle }
  | { ok: false; status: 403 | 404 | 503; error: string };

export async function requireSignoffAccess(
  session: Session,
  action: SignoffAction,
  documentId: string,
): Promise<AccessResult> {
  const { data, error } = await getDocumentBundle(documentId);
  if (error) return { ok: false, status: 503, error: '系統暫時無法讀取簽核文件' };
  if (!data) return { ok: false, status: 404, error: '找不到該簽核文件' };

  const pendingAssigneeIds = data.assignments
    .filter((a) => a.status === 'pending')
    .map((a) => a.signer_account_id);
  const allAssigneeIds = data.assignments.map((a) => a.signer_account_id);

  const allowed = canAccessSignoff(
    { sub: session.sub, role: session.role, home_dept_id: session.home_dept_id },
    action,
    {
      doc: {
        created_by: data.doc.created_by,
        owner_dept_id: data.doc.owner_dept_id,
      },
      pendingAssigneeIds,
      allAssigneeIds,
    },
  );

  // Codex P2：權限不足一律回 404（與「不存在」無法區分），避免已登入者枚舉 UUID 探測存在性。
  if (!allowed) return { ok: false, status: 404, error: '找不到該簽核文件' };
  return { ok: true, bundle: data };
}
