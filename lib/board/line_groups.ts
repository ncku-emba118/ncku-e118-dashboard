/**
 * L2 路由設定：dashboard 後台 → GAS 撈/設班級公告目標群
 *
 * 對應 GAS 端兩個新 endpoint：
 *   type=list_groups          → 撈 Bot 已加入的群（驗 BOT_SYNC_SECRET）
 *   type=set_broadcast_group  → 設目標群（單選；空 groupId = idle）
 *
 * 所有 fail-soft：URL/secret 沒設回空、GAS 出錯/timeout 回空，dashboard 不崩。
 */
import 'server-only';
import { getEnv } from '../env';

export type LineGroup = {
  groupId: string;
  name: string;
  joinedAt: string | null;
  isBroadcast: boolean;
};

export type ListGroupsResult =
  | { ok: true; groups: LineGroup[] }
  | { ok: false; reason: 'no_url' | 'no_secret' | 'http_error' | 'network_error'; detail?: string };

export type SetGroupResult =
  | { ok: true; groupId: string; set: number; cleared: number }
  | { ok: false; reason: 'no_url' | 'no_secret' | 'http_error' | 'network_error' | 'gas_error'; detail?: string };

async function callGAS<T>(payload: Record<string, unknown>): Promise<T | { ok: false; reason: 'no_url' | 'no_secret' | 'http_error' | 'network_error'; detail?: string }> {
  const env = getEnv();
  const url = env.LINE_BOT_WEBHOOK_URL;
  const secret = env.BOT_SYNC_SECRET;
  if (!url) return { ok: false, reason: 'no_url' as const };
  if (!secret) return { ok: false, reason: 'no_secret' as const };

  try {
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 10_000);
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, secret }),
      signal: ctrl.signal,
      // GAS web app 會 302 跳到 googleusercontent.com — 必須 follow
      redirect: 'follow',
    });
    clearTimeout(timeoutId);
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      return { ok: false, reason: 'http_error' as const, detail: `HTTP ${r.status} ${text.slice(0, 200)}` };
    }
    const json = (await r.json()) as T;
    return json;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: 'network_error' as const, detail };
  }
}

export async function listLineGroups(): Promise<ListGroupsResult> {
  const r = await callGAS<{ ok: true; groups: LineGroup[] }>({ type: 'list_groups' });
  // 成功 shape：{ ok: true, groups: [...] }
  // 失敗 shape（GAS auth fail）：{ ok: true, groups: [] }（GAS 統一靜默回空）
  // 失敗 shape（network/http）：{ ok: false, reason, detail }
  if ('groups' in r && Array.isArray((r as { groups: LineGroup[] }).groups)) {
    return { ok: true, groups: (r as { groups: LineGroup[] }).groups };
  }
  return r as ListGroupsResult;
}

export async function setBroadcastGroup(groupId: string): Promise<SetGroupResult> {
  const r = await callGAS<{ ok: boolean; groupId?: string; set?: number; cleared?: number; error?: string }>({
    type: 'set_broadcast_group',
    groupId,
  });
  if ('ok' in r) {
    if (r.ok) {
      return {
        ok: true,
        groupId: (r as { groupId?: string }).groupId ?? '',
        set: (r as { set?: number }).set ?? 0,
        cleared: (r as { cleared?: number }).cleared ?? 0,
      };
    }
    // GAS 端回 { ok: false, error: ... }
    return { ok: false, reason: 'gas_error', detail: (r as { error?: string }).error };
  }
  return r as SetGroupResult;
}
