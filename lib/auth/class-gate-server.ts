/**
 * 班級共用密碼 — server-only 部分（DB 讀寫密碼 hash、暴力破解防護）。
 * cookie 簽章 / 路徑規則在 lib/auth/class-gate.ts（edge-safe，middleware 用）。
 *
 * 密碼存放：app_settings.key = 'class_gate_password_hash'（bcrypt cost 12，
 * 比照 scripts/apply-db.ts 幹部密碼）。放 DB 不放環境變數 → 換密碼不用重新部署。
 *
 * 防暴力猜密碼（共用密碼沒有「帳號」可鎖，改鎖來源）：
 *   • 同 IP（HMAC 後）15 分鐘內失敗 ≥ 10 次 → 該 IP 暫停 15 分鐘
 *   • 全站 15 分鐘內失敗 ≥ 200 次 → 全站暫停新登入（防換 IP 分散猜）
 *     已登入（持有 90 天 cookie）的人不受影響，只擋新登入。
 *   • 先寫一筆「失敗」嘗試再數次數、成功才改回 succeeded=true
 *     → 並發請求一定看得到彼此，不會一起溜過門檻（不需 RPC）。
 *   • bcrypt compare ~250ms 本身也是節流。
 */
import 'server-only';
import bcrypt from 'bcryptjs';
import { getServerClient } from '../supabase/server';

export const CLASS_PASSWORD_SETTING_KEY = 'class_gate_password_hash';
export const CLASS_PASSWORD_BCRYPT_COST = 12;

export const IP_MAX_FAILURES = 10;
export const GLOBAL_MAX_FAILURES = 200;
export const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const ATTEMPT_RETENTION_MS = 24 * 60 * 60 * 1000;

/** 新密碼規則：6–64 字、UTF-8 ≤ 72 bytes（bcrypt 只看前 72 bytes，超過會被默默截斷） */
export const CLASS_PASSWORD_MIN_LENGTH = 6;
export const CLASS_PASSWORD_MAX_LENGTH = 64;

export function validateNewClassPassword(pw: string): string | null {
  if (pw.length < CLASS_PASSWORD_MIN_LENGTH) {
    return `密碼至少 ${CLASS_PASSWORD_MIN_LENGTH} 個字`;
  }
  if (pw.length > CLASS_PASSWORD_MAX_LENGTH) {
    return `密碼最多 ${CLASS_PASSWORD_MAX_LENGTH} 個字`;
  }
  if (new TextEncoder().encode(pw).length > 72) return '密碼太長';
  if (pw.trim() !== pw) return '密碼頭尾不能有空白';
  return null;
}

export type StoredHashResult =
  | { ok: true; hash: string | null }
  | { ok: false; error: string };

/** 讀目前的班級密碼 hash。hash=null 代表尚未設定（呼叫端必須 fail-closed）。 */
export async function getClassPasswordHash(): Promise<StoredHashResult> {
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', CLASS_PASSWORD_SETTING_KEY)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  const value = (data?.value as string | undefined) ?? null;
  // bcrypt hash 一定是 $2a$/$2b$/$2y$ 開頭；其他值一律當作「未設定」
  if (!value || !/^\$2[aby]\$\d{2}\$/.test(value)) return { ok: true, hash: null };
  return { ok: true, hash: value };
}

export async function compareClassPassword(plain: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(plain, hash);
}

/** 設定新班級密碼（呼叫端負責權限檢查 + validateNewClassPassword）。 */
export async function setClassPassword(
  plain: string,
  accountId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const hash = await bcrypt.hash(plain, CLASS_PASSWORD_BCRYPT_COST);
  const supabase = getServerClient();
  const { error } = await supabase.from('app_settings').upsert(
    {
      key: CLASS_PASSWORD_SETTING_KEY,
      value: hash,
      updated_at: new Date().toISOString(),
      updated_by: accountId,
    },
    { onConflict: 'key' },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export type AttemptGate =
  | { ok: true; attemptId: number }
  | { ok: false; reason: 'ip_limited' | 'global_limited' }
  | { ok: false; reason: 'db_error'; error: string };

/**
 * 先記一筆（預設失敗）嘗試，再數同 IP / 全站視窗內的失敗次數。
 * 超過門檻 → 不准驗密碼（呼叫端回 429，不燒 bcrypt）。
 */
export async function beginClassLoginAttempt(ipHash: string): Promise<AttemptGate> {
  const supabase = getServerClient();
  const since = new Date(Date.now() - ATTEMPT_WINDOW_MS).toISOString();

  const { data: inserted, error: insertError } = await supabase
    .from('class_gate_attempts')
    .insert({ ip_hash: ipHash, succeeded: false })
    .select('id')
    .single();
  if (insertError || !inserted) {
    return { ok: false, reason: 'db_error', error: insertError?.message ?? 'insert returned no row' };
  }
  const attemptId = Number(inserted.id);

  const [ipCount, globalCount] = await Promise.all([
    supabase
      .from('class_gate_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('ip_hash', ipHash)
      .eq('succeeded', false)
      .gte('created_at', since),
    supabase
      .from('class_gate_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('succeeded', false)
      .gte('created_at', since),
  ]);
  if (ipCount.error || globalCount.error) {
    return {
      ok: false,
      reason: 'db_error',
      error: (ipCount.error ?? globalCount.error)!.message,
    };
  }
  // 計數含本次這筆 → 用 > 門檻：第 1..N 次都能驗，第 N+1 次起擋
  if ((ipCount.count ?? 0) > IP_MAX_FAILURES) return { ok: false, reason: 'ip_limited' };
  if ((globalCount.count ?? 0) > GLOBAL_MAX_FAILURES) return { ok: false, reason: 'global_limited' };
  return { ok: true, attemptId };
}

/** 驗證成功 → 把本次嘗試改成 succeeded（不計入失敗次數）。失敗不影響登入結果。 */
export async function markClassLoginSucceeded(attemptId: number): Promise<void> {
  const supabase = getServerClient();
  const { error } = await supabase
    .from('class_gate_attempts')
    .update({ succeeded: true })
    .eq('id', attemptId);
  if (error) {
    console.warn('[class_gate.mark_success_failed]', { attemptId, error: error.message });
  }
}

/** 順手清掉 24 小時前的紀錄（不影響登入結果，失敗只記 log） */
export async function pruneOldClassLoginAttempts(): Promise<void> {
  const supabase = getServerClient();
  const cutoff = new Date(Date.now() - ATTEMPT_RETENTION_MS).toISOString();
  const { error } = await supabase.from('class_gate_attempts').delete().lt('created_at', cutoff);
  if (error) console.warn('[class_gate.prune_failed]', { error: error.message });
}
