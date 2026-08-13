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
// 短效 read URL（§9）。原為 5 分鐘（300s），2026-08 財務長回報「下載一直卡住」
// 事故的根因之一：URL 是頁面載入時一次產生，使用者看單看一下、5 分鐘後才點下載
// 就已過期。拉長到 30 分鐘（1800s），涵蓋「開著單據看附件/PDF 預覽再回頭下載」
// 這種正常閱讀節奏；預覽 iframe 與下載連結目前共用同一顆 signed URL 產生函式，
// 沒有另外拆兩個 TTL 常數的必要——真正解掉「頁面停留很久才點下載」的是
// GET /api/board/signoff/[id] 的「點下載時重新取一次最新 URL」機制（page.tsx），
// 這裡拉長 TTL 只是降低一般情況下走到那個重新取號路徑的頻率。
export const SIGNED_READ_URL_TTL_S = 1800;

// 指派人數
export const MAX_ASSIGNEES = 9; // 9 位幹部上限
export const MIN_ASSIGNEES = 1;

// 附件（發票/明細...）
// 10 份原始憑證 + 1 份收款帳號證明（0027，選填，label='收款帳號證明'，同一個
// sources 陣列送出）——維持一個上限常數，不為收款帳號另開獨立配額。
export const MAX_ATTACHMENTS = 11;
export const MIN_ATTACHMENTS = 1;

// 附件類型標籤（下拉，供統計與辨識；caption 補充細節）
// '收款帳號證明'（0027）：收款帳號區塊上傳的存摺封面／轉帳截圖沿用同一套
// attachments 陣列 + upload-url，只用這個 label 區分用途，不另開欄位/路徑。
export const ATTACHMENT_LABELS = ['報價單', '請款單', '發票', '收據', '結算單', '收款帳號證明', '其他'] as const;
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

/**
 * 財務長完成通知（0025）文件層級 magic token 的連結有效期。
 *
 * 獨立於上面 assignment 版的 MAGIC_TOKEN_TTL_MS 命名，即使目前數值同為 14 天——
 * 「連結可否重複使用」這個設計目前仍在拍板中（敵對審查修正1 暫緩），拆成具名
 * 常數方便日後單獨調整（例如改成一次性後可能連帶縮短此值），不必牽動 assignment
 * 那條完全獨立的通知流程。
 */
export const FINANCE_MAGIC_TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * 財務長 magic 連結換發出的 session TTL（敵對審查修正2）。
 *
 * 與上面「連結本身可用多久」（FINANCE_MAGIC_TOKEN_TTL_MS）是兩件事：這裡是
 * 「換發出的帳號 session 能活多久」。財務長這條磁力連結換發的是唯讀 session
 * （見 lib/auth/jwt.ts 的 magic_scope claim + lib/signoff/access.ts 的收斂判斷），
 * 即使連結外流，session 也在 30 分鐘後失效——刻意遠短於 assignment 版磁力連結
 * 換發的完整權限 session（14 天，未變動）。
 */
export const FINANCE_MAGIC_SESSION_TTL_SECONDS = 30 * 60;
