/**
 * 下載檔名安全處理（fix/signoff-pdf-download）。
 *
 * 用途：把文件標題（使用者可自由輸入）轉成可以安全放進
 * `Content-Disposition: attachment; filename*=UTF-8''...` 的檔名。中文字元本身
 * 沒問題（Supabase storage-js 對 download 選項做的是 RFC 5987 encodeURIComponent
 * 編碼，不是 Latin-1 headers.set），真正需要擋的是：
 *   - 路徑分隔符/檔案系統保留字元（反斜線、斜線、冒號、星號、問號、雙引號、
 *     角括號、直線號）—— 避免瀏覽器/OS 存檔時誤判路徑或觸發保留字元錯誤。
 *   - 控制字元（含換行）—— 避免掉進任何後續把檔名塞進 header 字串的路徑。
 *   - 過長標題 —— 部分檔案系統對檔名長度有限制，且 UI 上也不需要那麼長。
 *   - 空字串/全部字元都被擋掉 → fallback 成通用檔名，不讓下載變成空檔名。
 */

// 路徑分隔符/檔案系統保留字元： \ / : * ? " < > |
const FORBIDDEN_CHARS_RE = /[\\/:*?"<>|]/g;
// 控制字元（含 \n \r \t 等），避免掉進任何後續把檔名塞進 header 字串的路徑
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = /[\x00-\x1f\x7f]/g;
const MAX_TITLE_LEN = 80;

/** 把文件標題轉成「簽核單_<標題>.pdf」這種人看得懂、檔案系統安全的下載檔名。 */
export function signoffDownloadFilename(title: string | null | undefined): string {
  const cleaned = (title ?? '')
    .replace(CONTROL_CHARS_RE, '')
    .replace(FORBIDDEN_CHARS_RE, '')
    .trim()
    .slice(0, MAX_TITLE_LEN)
    .trim();
  const safeTitle = cleaned.length > 0 ? cleaned : '簽核單';
  return `簽核單_${safeTitle}.pdf`;
}
