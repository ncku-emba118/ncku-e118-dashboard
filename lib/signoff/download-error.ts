/**
 * 「下載最終 PDF」動作要不要擋下、擋下時該顯示什麼訊息 —— 純函式抽出來，
 * 讓 app/finance/signoff/[id]/page.tsx 的 doDownloadFinal 不用自己散落判斷
 * 邏輯，也讓這段邏輯能在 vitest（app/** 底下的元件目前沒有測試環境，見
 * vitest.config.ts 的 include：只收 lib/**、app/api/**）裡被單獨測到。
 *
 * 背景（2026-08-13 敵對審查）：已核准單在 session 過期時，
 * GET /api/board/signoff/[id] 不回 401，而是 fail-open 回 public:true 的
 * 公開摘要（無 urls）——這是既有設計，這裡不改。但前端原本只看「找不到
 * urls.final_download」就顯示「目前沒有可下載的最終 PDF（可能尚未完成合
 * 成）」，對一個「單子早就簽完、PDF 早就合成好，只是 session 過期」的使用
 * 者完全誤導。必須先判斷 public，才不會把「登入過期」講成「單據狀態有問題」。
 */

export const SESSION_EXPIRED_MSG =
  '登入已過期。請回到 LINE 訊息，重新點一次簽核卡片的連結後再操作。';

export type DownloadFinalResponse = {
  public?: boolean;
  error?: string;
  urls?: { final_download?: string | null } | null;
};

/**
 * 回傳要顯示的錯誤訊息；回傳 null 代表可以放行往下走（拿到合法的
 * final_download URL）。判斷順序：
 *   1. HTTP 401（session 過期、被 middleware 擋下）→ 登入過期文案
 *   2. 其他非 2xx → 後端 error，沒有就給預設字
 *   3. data.public === true（fail-open 公開摘要，通常也是 session 過期）
 *      → 一樣是登入過期文案，不可讓它掉進第 4 條產生誤導訊息
 *   4. 有回應但沒有 final_download URL → 「尚未完成合成」
 */
export function resolveDownloadFinalError(
  status: number,
  ok: boolean,
  data: DownloadFinalResponse,
): string | null {
  if (status === 401) return SESSION_EXPIRED_MSG;
  if (!ok) return data.error || '下載連結取得失敗，請重新整理頁面再試';
  if (data.public === true) return SESSION_EXPIRED_MSG;
  if (!data.urls?.final_download) return '目前沒有可下載的最終 PDF（可能尚未完成合成）';
  return null;
}
