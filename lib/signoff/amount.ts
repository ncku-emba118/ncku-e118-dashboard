/**
 * 建單金額解析（單一權威版本，前後端共用；測試不可自行重寫一份）。
 *
 * 背景：使用者習慣打千分位逗號「14,400」，原本的 `^\d+(\.\d{1,2})?$` 直接擋下
 * 只回「欄位格式錯誤」，人不知道錯在哪（2026-08-13 實際踩到）。
 *
 * ⚠ 但「無條件刪掉所有逗號與空白」是危險的過度寬鬆（2026-08-13 敵對審查抓到）：
 *   '1,2' → 12、'12,34,56' → 123456、'1 2' → 12
 * 這會把打錯的輸入靜默變成另一個金額，比擋下來更糟。因此這裡只接受：
 *   ① 純數字（可帶最多兩位小數）
 *   ② 嚴格千分位格式：1-3 位起頭，之後每組都必須剛好 3 位
 * 全形數字/全形小數點先轉半形；空白只 trim 頭尾，不吃字串中間的空白。
 *
 * 另外限制在 DB 欄位 NUMERIC(12,2) 的範圍內，否則會通過驗證卻在寫入時才炸，
 * 那時簽核表 PDF 已經上傳，會留下孤兒檔案。
 */

/** signoff_documents.amount 是 NUMERIC(12,2)：整數部分最多 10 位。 */
export const MAX_AMOUNT = 9_999_999_999.99;

const PLAIN_RE = /^\d+(\.\d{1,2})?$/;
const GROUPED_RE = /^\d{1,3}(,\d{3})+(\.\d{1,2})?$/;

/**
 * 回傳正規化後的純數字字串；無法安全解讀時回 null（呼叫端應視為格式錯誤）。
 * 注意：不做範圍檢查，範圍由呼叫端用 MAX_AMOUNT 判斷，以便給不同的錯誤訊息。
 */
export function normalizeAmountInput(raw: string): string | null {
  const half = raw
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[．]/g, '.')
    .replace(/[，]/g, ',')
    .trim();
  if (PLAIN_RE.test(half)) return half;
  if (GROUPED_RE.test(half)) return half.replace(/,/g, '');
  return null;
}
