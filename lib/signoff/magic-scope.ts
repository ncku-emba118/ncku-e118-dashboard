/**
 * magic_scope（財務長唯讀 magic session，見 lib/auth/jwt.ts）的權限收斂。
 *
 * 抽成獨立、無 IO 的純函式檔案（刻意不放進 access.ts——那支檔案有 'server-only'
 * guard，vitest 在 Node 環境下 import 會直接 throw，純函式就測不到了），
 * 方便單獨測試（magic-scope.test.ts）。
 *
 * 無 claim（undefined）→ 一律回 true，不影響 lib/signoff/access.ts 原有的
 * canAccessSignoff 判斷（相容性鐵律：密碼登入 / 既有 assignment magic session
 * 零 regression）。有 claim → 只放行 'view' 且 document_id 完全相符，其餘
 * （任何寫入動作 / 任何其他文件）一律 false，由呼叫端統一當「找不到」處理，
 * 不留 404 以外的訊號。
 *
 * ⚠ 敵對審查修正1定案（財務長下載連結不設 TTL、可重複使用）之後，這支函式
 * 是唯一的防線，必須滴水不漏：見 access.test.ts 的全矩陣測試。
 */
import type { SignoffAction } from './permission';
import type { MagicScope } from '../auth/jwt';

export function isAllowedUnderMagicScope(
  magicScope: MagicScope | undefined,
  action: SignoffAction,
  documentId: string,
): boolean {
  if (!magicScope) return true;
  return (
    magicScope.kind === 'finance_readonly' &&
    action === 'view' &&
    magicScope.document_id === documentId
  );
}
