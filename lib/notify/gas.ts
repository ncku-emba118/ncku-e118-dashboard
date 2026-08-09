/**
 * 手動通知：班網 → GAS（LINE Bot）呼叫層。
 *
 * 信任模式完全比照既有 lib/board/line_groups.ts：
 *   • URL   = env.LINE_BOT_WEBHOOK_URL（GAS Web App）
 *   • 金鑰  = env.BOT_SYNC_SECRET，放在 POST body 的 secret 欄（GAS 端 doPost 自己驗）
 *   • redirect: 'follow'（GAS Web App 會 302 到 googleusercontent.com）
 *   • 逾時 AbortController
 * 不另發新密鑰、不新增新的信任通道。
 *
 * 🔒 隱私：GAS 端刻意不回傳任何 LINE userId，本層也只轉傳姓名。
 *    整個 Netlify 側（含 client）永遠拿不到、也不儲存 userId。
 */
import 'server-only';
import { getEnv } from '../env';

export type NotifyQuota =
  | { available: true; unlimited: boolean; limit: number | null; used: number | null; remaining: number | null }
  | { available: false; reason: string };

export type CandidatesResult =
  | { ok: true; names: string[]; ambiguous: string[]; quota: NotifyQuota }
  | { ok: false; error: string };

export type SendResult =
  | {
      ok: true;
      total: number;
      sent: number;
      failed: Array<{ name: string; reason: string }>;
      quota: NotifyQuota;
      auditPersisted: boolean;
      /** true = GAS 端命中重送快取，這是先前已處理過的結果，不是剛剛才發送 */
      dedup?: boolean;
    }
  | { ok: false; error: string };

export type HistoryRow = {
  ts: string;
  recipients: string;
  message: string;
  sent: string;
  failed: string;
  failedList: string;
};

export type HistoryResult =
  | { ok: true; rows: HistoryRow[] }
  | { ok: false; error: string };

const GAS_TIMEOUT_MS = 60_000; // 逐一 push 可能要跑一陣子（最多 100 人）

async function callGAS<T>(payload: Record<string, unknown>): Promise<T | { ok: false; error: string }> {
  const env = getEnv();
  const url = env.LINE_BOT_WEBHOOK_URL;
  const secret = env.BOT_SYNC_SECRET;
  if (!url) return { ok: false as const, error: 'no_url' };
  if (!secret) return { ok: false as const, error: 'no_secret' };

  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), GAS_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, secret }),
      signal: ctrl.signal,
      redirect: 'follow',
    });
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      return { ok: false as const, error: `http_${r.status}: ${text.slice(0, 200)}` };
    }
    return (await r.json()) as T;
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchNotifyCandidates(): Promise<CandidatesResult> {
  return (await callGAS<CandidatesResult>({ type: 'get_notify_candidates' })) as CandidatesResult;
}

/**
 * requestId：前端每次「送出」產生一次性識別碼（crypto.randomUUID()），逾時/網路錯誤重試
 * 同一次送出時沿用同一個 requestId 不重新產生 —— GAS 端用它做 10 分鐘內冪等去重，
 * 避免同一批人被重複 push。
 */
export async function sendManualNotify(
  names: string[],
  message: string,
  requestId: string,
): Promise<SendResult> {
  return (await callGAS<SendResult>({ type: 'manual_notify', names, message, requestId })) as SendResult;
}

export async function fetchNotifyHistory(limit = 10): Promise<HistoryResult> {
  return (await callGAS<HistoryResult>({ type: 'manual_notify_history', limit })) as HistoryResult;
}
