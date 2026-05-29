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

// 物件路徑（path 一律 server 端組，client 不可自帶 — Codex 4-1）
//
// source 在文件建立「之前」上傳（還沒 docId）→ 用 server 分配的 incoming 前綴、綁 accountId；
// create 時驗證 source_object_path 必須屬於該 session 的 incoming 前綴。
// sheet / signature / final 在文件建立「之後」產生 → 用 docId 前綴。
export const objectPaths = {
  incomingSourcePrefix: (accountId: string) => `incoming/${accountId}/`,
  incomingSource: (accountId: string, rand: string, ext: string) =>
    `incoming/${accountId}/${rand}.${ext}`,
  sheet: (docId: string) => `documents/${docId}/sheet.pdf`,
  signature: (docId: string, accountId: string) =>
    `documents/${docId}/signatures/${accountId}.png`,
  final: (docId: string) => `documents/${docId}/final.pdf`,
} as const;
