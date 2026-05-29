/**
 * 結果型 retry helper（純函式 / 可注入 sleep 方便單元測試）。
 *
 * 用途：Supabase Storage 大檔上傳。簽核 PDF 因必須 subset:false 內嵌完整
 * Noto Sans TC（pdf-lib 對 CFF 字型的 subset:true 會把中文 glyph 變成 □ 豆腐字，
 * 見 pdf.ts），每份 sheet / final ≈ 4.8MB。Netlify Function → Supabase Storage
 * 的 egress 慢（實測 ~0.7MB/s ≈ 6s），偶發逼近 function timeout 而拋
 * 'This operation was aborted'（正式站實測 ~25-33% 失敗）。
 *
 * uploadObject 回傳 { error } 而非 throw，所以以「檢查結果」決定是否重試。
 */

export interface RetryOptions<T> {
  /** 最多嘗試幾次（含第一次）。 */
  maxAttempts: number;
  /** 看結果決定要不要再試。 */
  shouldRetry: (result: T) => boolean;
  /** 下一次嘗試前要等多久（毫秒）；參數是「接下來要跑的第幾次」=2,3,...。 */
  delayMs: (nextAttempt: number) => number;
  /** 等待實作；測試可注入假的。 */
  sleep?: (ms: number) => Promise<void>;
}

export async function retryResult<T>(
  run: (attempt: number) => Promise<T>,
  opts: RetryOptions<T>,
): Promise<T> {
  const sleep =
    opts.sleep ?? ((ms: number) => new Promise<void>((res) => setTimeout(res, ms)));
  let result = await run(1);
  for (let attempt = 2; attempt <= opts.maxAttempts; attempt++) {
    if (!opts.shouldRetry(result)) return result;
    const d = opts.delayMs(attempt);
    if (d > 0) await sleep(d);
    result = await run(attempt);
  }
  return result;
}

// 連線中斷 / 逾時 / 網路抖動 / 暫時性 5xx / 限流 → 值得重試。
// 永久性錯誤（重複物件、bucket 不存在、RLS 拒絕…）不重試，避免白白多打 2 次。
const TRANSIENT_STORAGE_RE =
  /abort|aborted|fetch failed|network|timeout|timed out|ECONN|EPIPE|socket|terminated|stream|\b(?:500|502|503|504|429)\b/i;

export function isTransientStorageError(message: string | null): boolean {
  return !!message && TRANSIENT_STORAGE_RE.test(message);
}
