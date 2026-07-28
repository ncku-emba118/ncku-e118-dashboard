/**
 * 簽核模組常數（SIGNOFF-ARCHITECTURE.md v1.1）。
 */
export const SIGNOFF_BUCKET = 'signoff-documents'; // private bucket（§9）

// 上傳限制（原始憑證）
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024; // 25 MiB（對齊 board-attachments）
// 只收 compose 能夾帶的格式（pdf-lib 可嵌 PDF/PNG/JPG，無 webp）
export const SOURCE_ALLOWED_MIMES = new Set<string>([
  'application/pdf',
  'image/jpeg',
  'image/png',
]);
export const SOURCE_MIME_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

// 簽名圖
export const MAX_SIGNATURE_BYTES = 3 * 1024 * 1024; // 3 MiB（與 png.ts 一致）

// challenge nonce（防重放，Codex 3-2）
export const CHALLENGE_TTL_MS = 10 * 60 * 1000; // 10 分鐘
export const SIGNED_READ_URL_TTL_S = 300; // 短效 read URL 5 分鐘（§9）

// 指派人數
export const MAX_ASSIGNEES = 9; // 9 位幹部上限
export const MIN_ASSIGNEES = 1;

// 附件（發票/明細...）
export const MAX_ATTACHMENTS = 10;
export const MIN_ATTACHMENTS = 1;

// 附件類型標籤（下拉，供統計與辨識；caption 補充細節）
export const ATTACHMENT_LABELS = ['報價單', '請款單', '發票', '收據', '結算單', '其他'] as const;
export type AttachmentLabel = (typeof ATTACHMENT_LABELS)[number];
export const MAX_ATTACHMENT_CAPTION = 200;

// 補充資料（0019）：只追加不修改，故不設下限為 1 —— 允許只補說明不附檔
export const MAX_SUPPLEMENT_ATTACHMENTS = 10;
export const MAX_SUPPLEMENT_NOTE = 2000;
/** 單一文件回傳的補充批次上限（防詳情頁產生過量 signed URL） */
export const MAX_SUPPLEMENTS_PER_DOC = 50;

// 物件路徑（path 一律 server 端組，client 不可自帶 — Codex 4-1）
//
// source 在文件建立「之前」上傳（還沒 docId）→ 用 server 分配的 incoming 前綴、綁 accountId；
// create 時驗證 source_object_path 必須屬於該 session 的 incoming 前綴。
// sheet / signature / final 在文件建立「之後」產生 → 用 docId 前綴。
/**
 * 驗證 client 回報的 incoming path 確實是 server 發出的那一個。
 *
 * ⚠ 不可只用 startsWith：`incoming/A/../B/x.pdf` 會通過前綴檢查，
 * 但組成 URL 後被正規化成 `incoming/B/x.pdf`，等於讀到他人的檔案
 * （`%2e%2e` 編碼版同樣成立）。因此改為完全比對 server 產生的格式：
 * 固定 32 位 hex 檔名 + 白名單副檔名，任何 `..`、反斜線、編碼字元都不符合。
 */
export function isValidIncomingSourcePath(path: string, accountId: string): boolean {
  const exts = Object.values(SOURCE_MIME_EXT).join('|');
  return new RegExp(`^incoming/${accountId}/[0-9a-f]{32}\\.(?:${exts})$`).test(path);
}

// 簽名 PNG 一律「內容定址」：路徑帶 sha256 前 8 碼 → 不同內容必得不同物件路徑，
// 永不互相覆寫（Codex #2/#4：避免同帳號重簽 / 一鍵蓋章覆寫掉 finalize 正要讀的 bytes）。
// finalize 從 signoff_signatures.signature_png_path 讀路徑，故只要寫入 DB 的就是這個
// 唯一路徑即可，finalize 完全無需改動。
const sha8 = (sha256: string) => sha256.slice(0, 8);

/** 單張簽核文件內、某帳號本次簽名 PNG 的唯一物件路徑（內容定址）。 */
export function signatureObjectPath(docId: string, accountId: string, sha256: string): string {
  return `documents/${docId}/signatures/${accountId}-${sha8(sha256)}.png`;
}

/**
 * 帳號層級「預存簽名」（一鍵蓋章印鑑）的唯一物件路徑（內容定址）。
 * 不綁 docId（跨單重複使用）；換內容即換路徑、不覆寫舊檔——指向哪一張由
 * account_stored_signatures.png_path 這個 DB 指標決定（sign-stamp 讀它）。
 */
export function storedSignatureObjectPath(accountId: string, sha256: string): string {
  return `stored-signatures/${accountId}-${sha8(sha256)}.png`;
}

export const objectPaths = {
  incomingSourcePrefix: (accountId: string) => `incoming/${accountId}/`,
  incomingSource: (accountId: string, rand: string, ext: string) =>
    `incoming/${accountId}/${rand}.${ext}`,
  sheet: (docId: string) => `documents/${docId}/sheet.pdf`,
  signature: signatureObjectPath,
  final: (docId: string) => `documents/${docId}/final.pdf`,
  storedSignature: storedSignatureObjectPath,
} as const;

// magic token 格式：crypto.randomBytes(32) → 64 hex（規格 §1-2 白名單）
export const MAGIC_TOKEN_RE = /^[a-f0-9]{64}$/;
// magic token 有效期上限：14 天（規格 §4，實際取 min(now+14d, 單據期限)）
export const MAGIC_TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000;
