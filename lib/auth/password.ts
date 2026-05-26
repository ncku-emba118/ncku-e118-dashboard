/**
 * Password compare + lockout helpers.
 *
 * 對應 ARCHITECTURE.md v3 第 6 章「密碼策略 + 4 位數補強」：
 *   • bcrypt cost 12 (verify ~250ms, brute-force 受限)
 *   • 同帳號 24h 內錯 10 次 → 鎖 24h + LINE 通知（通知由 API route handle）
 *   • 成功登入：failed_attempts = 0, locked_until = null
 */
import bcrypt from 'bcryptjs';

export const MAX_FAILED_ATTEMPTS = 10;
export const LOCKOUT_DURATION_MS = 24 * 60 * 60 * 1000; // 24h

export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(plain, hash);
}

export function shouldLock(failedAttempts: number): boolean {
  return failedAttempts >= MAX_FAILED_ATTEMPTS;
}

export function lockoutUntil(): Date {
  return new Date(Date.now() + LOCKOUT_DURATION_MS);
}

export function isLockedNow(lockedUntil: string | null): boolean {
  if (!lockedUntil) return false;
  return new Date(lockedUntil).getTime() > Date.now();
}
