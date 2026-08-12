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
import { isAllowedUnderMagicScope } from './magic-scope';

export type AccessResult =
  | { ok: true; bundle: DocumentBundle }
  | { ok: false; status: 403 | 404 | 503; error: string };

export async function requireSignoffAccess(
  session: Session,
  action: SignoffAction,
  documentId: string,
): Promise<AccessResult> {
  // magic_scope 先收斂：不符合（其他文件／寫入動作）一律當「找不到」擋掉，
  // 完全不進下面一般權限矩陣 —— 這是「連結若允許重複使用」情境下唯一的防線。
  if (!isAllowedUnderMagicScope(session.magic_scope, action, documentId)) {
    return { ok: false, status: 404, error: '找不到該簽核文件' };
  }

  const { data, error } = await getDocumentBundle(documentId);
  if (error) return { ok: false, status: 503, error: '系統暫時無法讀取簽核文件' };
  if (!data) return { ok: false, status: 404, error: '找不到該簽核文件' };

  // magic_scope 通過上面收斂後即視為已授權（唯讀）：財務長本來就不一定是這張
  // 文件的建立者／owner_dept／指派人（見 dal.ts setDocumentFinanceMagicToken
  // 檔頭說明），不套用下面以「一般帳號在這張單上的角色」為基礎的權限矩陣。
  if (session.magic_scope) {
    return { ok: true, bundle: data };
  }

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
