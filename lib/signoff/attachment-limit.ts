/**
 * 建單表單（app/finance/signoff/new/page.tsx）附件總數上限的前端預檢 —— 純
 * 函式抽出來，讓判斷邏輯能在 vitest 被單獨測到（vitest.config.ts 的
 * include 只收 lib/**、app/api/**，元件層目前沒有測試環境）。
 *
 * 背景（2026-08-13 敵對審查）：使用者可選 11 份一般附件 + 1 份收款帳號證明
 * ＝12 份，12 份全部 PUT 成功後，建單 POST 才因後端 zod
 * `.max(MAX_ATTACHMENTS)` 被拒——留下一批已經佔用 storage 的孤兒檔。這裡的
 * 檢查必須在「開始上傳前」就擋下，不是取代後端驗證（後端仍是唯一權威）。
 */
import { MAX_ATTACHMENTS } from './constants';

export { MAX_ATTACHMENTS };

/**
 * 回傳超量時要顯示的錯誤訊息；回傳 null 代表數量在上限內，可以放行上傳。
 */
export function attachmentCountError(fileCount: number, hasPaymentProof: boolean): string | null {
  const total = fileCount + (hasPaymentProof ? 1 : 0);
  if (total > MAX_ATTACHMENTS) {
    return `附件總數（含收款帳號證明）最多 ${MAX_ATTACHMENTS} 個，目前選了 ${total} 個，請先移除多餘的檔案再送出`;
  }
  return null;
}
