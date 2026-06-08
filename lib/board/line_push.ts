/**
 * L2 班網 → Bot → LINE 班群推播
 *
 * 對應 NEXT-SESSION-HANDOFF.md L2「公告↔LINE 雙向」第一條：board發文→推LINE
 *
 * 設計：
 *   - 班網 dispatcher 處理 post_published push_job 時，**fan-out 給 web push 訂閱者** + **fire-and-forget call GAS**
 *   - GAS 收到後驗 BOT_SYNC_SECRET → 用既有 LINE_CHANNEL_ACCESS_TOKEN 推到 LINE_GROUP_ID
 *   - 共用 L1 班費對帳那把 BOT_SYNC_SECRET（48 字、3 處同值）— 不另發
 *
 * Fail-soft：
 *   - LINE_BOT_WEBHOOK_URL 未設 → skip（dev / 還沒接好的時期）
 *   - BOT_SYNC_SECRET 未設 → skip + warn log
 *   - GAS 回 non-2xx 或 timeout → log 但不阻塞 dispatcher（web push 已成功就算 sent）
 *
 * 為什麼掛在 dispatcher 不掛 API route：
 *   - dispatcher 處理 push_jobs → 所有發布路徑（API / 直插 / 重發）都會跑這條
 *   - 不會因為 service_role 繞過 API 就漏推 LINE
 */
import 'server-only';
import { getEnv } from '../env';

export type LinePushInput = {
  postId: string;
  title: string;
  deptName: string; // 顯示用部門中文名（已透過 deptInfo 處理過）
};

export type LinePushResult =
  | { ok: true; status: number }
  | { ok: false; reason: 'no_url' | 'no_secret' | 'http_error' | 'network_error'; detail?: string };

const PUBLIC_DASHBOARD_BASE = 'https://emba.aqualux.dev';

/** 把 post 推到 LINE 班群（透過 Bot GAS web app） */
export async function pushPostToLineGroup(input: LinePushInput): Promise<LinePushResult> {
  const env = getEnv();
  const url = env.LINE_BOT_WEBHOOK_URL;
  const secret = env.BOT_SYNC_SECRET;

  if (!url) return { ok: false, reason: 'no_url' };
  if (!secret) return { ok: false, reason: 'no_secret' };

  const postUrl = `${PUBLIC_DASHBOARD_BASE}/board/post/${input.postId}`;
  const body = {
    type: 'post_published',
    secret,
    post: {
      id: input.postId,
      title: input.title,
      dept: input.deptName,
      url: postUrl,
    },
  };

  try {
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 10_000); // GAS 可能慢、給 10s

    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    clearTimeout(timeoutId);

    if (!r.ok) {
      const text = await r.text().catch(() => '');
      return { ok: false, reason: 'http_error', detail: `HTTP ${r.status} ${text.slice(0, 200)}` };
    }
    return { ok: true, status: r.status };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: 'network_error', detail };
  }
}
