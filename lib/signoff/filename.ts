/**
 * 下載檔名安全處理（fix/signoff-pdf-download）。
 *
 * 用途：把文件標題（使用者可自由輸入）轉成可以安全放進
 * `Content-Disposition: attachment; filename*=UTF-8''...` 的檔名。中文字元本身
 * 沒問題（Supabase storage-js 對 download 選項做的是 RFC 5987 encodeURIComponent
 * 編碼，不是 Latin-1 headers.set），真正需要擋的是：
 *   - 路徑分隔符/檔案系統保留字元（反斜線、斜線、冒號、星號、問號、雙引號、
 *     角括號、直線號）—— 避免瀏覽器/OS 存檔時誤判路徑或觸發保留字元錯誤。
 *   - Unicode 控制字元（Cc）與格式字元（Cf，含換行、零寬字元、RTL override
 *     等）—— 原本只擋 ASCII 控制字元擋不住 U+202E 這類雙向覆寫字元，可以把
 *     `請款單‮fdp.exe` 顯示成看起來像 .pdf 實際是 .exe 的檔名，在檔案總管
 *     裡造成視覺欺騙（2026-08-13 敵對審查）。
 *   - 過長標題 —— 部分檔案系統對檔名長度有限制，且 UI 上也不需要那麼長；
 *     截斷改依 code point（grapheme 層級的 Array.from）而非 UTF-16 code
 *     unit，避免把 emoji 等 surrogate pair 從中間切斷產生殘缺字元。
 *   - 空字串/全部字元都被擋掉 → fallback 成通用檔名，不讓下載變成空檔名。
 */

// 路徑分隔符/檔案系統保留字元： \ / : * ? " < > |
const FORBIDDEN_CHARS_RE = /[\\/:*?"<>|]/g;
// Unicode 控制字元（Cc，如 \n \t \x00-\x1f）與格式字元（Cf，如 U+200E LRM、
// U+202E RTL override）。涵蓋全 Unicode 範圍，不是只擋 ASCII 那一段。
// eslint-disable-next-line no-control-regex
const UNSAFE_UNICODE_RE = /[\p{Cc}\p{Cf}]/gu;
const MAX_TITLE_LEN = 80;
/**
 * 檔案系統單一名稱普遍上限 255 bytes（ext4/APFS/NTFS 皆是這個量級）。80 個
 * code point 看起來安全，但 80 個 emoji ＝ 320+ bytes，下載會被瀏覽器或檔案
 * 系統截斷、改名甚至失敗（2026-08-14 敵對審查）。故除了字數上限，另外用
 * UTF-8 byte 預算再收一次，且要扣掉副檔名本身佔的 bytes。
 */
const MAX_FILENAME_BYTES = 255;

/** 依 UTF-8 byte 預算截斷，不切斷任何 code point。 */
function truncateToBytes(s: string, budget: number): string {
  const enc = new TextEncoder();
  if (enc.encode(s).length <= budget) return s;
  let out = '';
  let used = 0;
  for (const ch of s) {
    const n = enc.encode(ch).length;
    if (used + n > budget) break;
    out += ch;
    used += n;
  }
  return out;
}

/**
 * 下載檔名＝單據標題本身（使用者 2026-08-13 指定：「下載名稱要跟上傳完標題一樣」），
 * 不加任何前綴。只做檔案系統安全處理與長度限制。
 */
export function signoffDownloadFilename(title: string | null | undefined): string {
  const cleaned = (title ?? '')
    .normalize('NFC') // 正規化組合字元（e.g. 分解的注音/重音符），避免同一顯示字有多種 byte 序列
    .replace(UNSAFE_UNICODE_RE, '')
    .replace(FORBIDDEN_CHARS_RE, '')
    .trim();
  // 依 code point 截斷（Array.from 依 code point 迭代，不切斷 surrogate
  // pair），而不是直接 slice（UTF-16 code unit，會把 emoji 從中間切開）。
  const byCodePoint = Array.from(cleaned).slice(0, MAX_TITLE_LEN).join('').trim();
  // 再套一層 UTF-8 byte 預算（扣掉 '.pdf' 佔的 4 bytes），避免 80 個 emoji
  // 這種「字數合格但 bytes 爆表」的檔名被檔案系統截斷/改名/拒絕。
  const truncated = truncateToBytes(byCodePoint, MAX_FILENAME_BYTES - '.pdf'.length).trim();
  const safeTitle = truncated.length > 0 ? truncated : '簽核單';
  return `${safeTitle}.pdf`;
}
