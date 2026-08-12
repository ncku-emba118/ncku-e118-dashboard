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
