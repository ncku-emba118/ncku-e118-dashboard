/**
 * In-memory rate limiter（對齊既有 board route：per-instance Map）。
 * ⚠ serverless 多實例下非全域精確，但對班級規模 + bcrypt/RPC 成本已足夠；
 *    與母系統 upload/posts 同一套機制（Codex 7-1 要求各 mutation 限速）。
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const rec = buckets.get(key);
  if (!rec || now > rec.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (rec.count >= max) return false;
  rec.count++;
  return true;
}
