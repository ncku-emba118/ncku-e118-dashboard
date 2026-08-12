/**
 * magic 連結可否換發 session 的純判斷（Codex #1）。
 *
 * 舊連結一律失效：只有「該指派仍待簽（assignment=pending）且單據仍在簽核中
 * （document=routing）」才可放行換發 session。任何已簽 / 已退回的指派、或已核准 /
 * 已退回 / 已作廢的單，其先前發出的 magic 連結都必須失效——即使 token 尚未過期。
 *
 * 抽成無 IO 純函式，供 magic 端點呼叫並單獨測試（見 redeem.test.ts）。
 */
import type { AssignmentStatus, SignoffStatus } from './dal';

export function canRedeemAssignment(
  assignmentStatus: AssignmentStatus,
  docStatus: SignoffStatus,
): boolean {
  return assignmentStatus === 'pending' && docStatus === 'routing';
}

/**
 * 財務長完成通知的文件層級 magic token（0025）可否換發 session。
 *
 * 跟 canRedeemAssignment 不同：這裡不是「還沒處理的待辦」，而是「已完成事實的
 * 唯讀存取」，所以沒有 assignment 狀態可比對，只看文件本身還是不是 approved——
 * 之後若被作廢（voided），先前發出的 doc_url 連結應隨之失效，不留舊連結繼續
 * 洩漏已作廢文件內容。
 */
export function canRedeemFinanceDocument(docStatus: SignoffStatus): boolean {
  return docStatus === 'approved';
}

/**
 * 財務長下載連結是否已過期（敵對審查修正1定案：連結不設 TTL，只靠手動作廢）。
 *
 * finance_magic_token_expires_at 現在一律寫 NULL（見 dal.ts setDocumentFinanceMagicToken）
 * ——null 視為「永不過期」，不是「缺到期時間視同無效」（那是 assignment 版 token 的語意，
 * 兩者刻意不同，見各自呼叫端註解）。只有真的寫了非 null 值（例如未來改回有期限）
 * 才判斷是否已過那個時間點。
 */
export function isFinanceMagicTokenExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now();
}

/**
 * 財務長下載連結永久有效時的唯一防線：核發對象帳號是否仍然「現在」還是財務長，
 * 且 session_version 與核發當下的快照一致。
 *
 * 職務輪替 / 密碼重設會 bump accounts.session_version（比照系統既有的 session
 * 撤銷機制，見 lib/auth/jwt.ts 檔頭），一旦不一致就代表「核發當下的那個人」
 * 已經不是現在的財務長了，舊連結必須失效——不能變成永久後門。
 * issuedSessionVersion 為 null（修正1上線前核發、無快照的舊資料）一律視為
 * 無法驗證，直接擋掉，不放行。
 */
export function isFinanceMagicAccountStillValid(args: {
  homeDeptId: string | null;
  issuedSessionVersion: number | null;
  currentSessionVersion: number;
}): boolean {
  return (
    args.homeDeptId === 'finance' &&
    args.issuedSessionVersion !== null &&
    args.issuedSessionVersion === args.currentSessionVersion
  );
}
