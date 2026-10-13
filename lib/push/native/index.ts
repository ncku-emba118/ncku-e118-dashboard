/**
 * 原生通道（FCM 主題）發送器 — 給 dispatcher 呼叫。
 *   • 憑證沒設定 → skipped:not_configured（不發送、不算失敗）
 *   • 永不 throw：憑證格式錯誤等也以 ok:false 回傳，不影響 Web Push
 *   • 不寫資料庫：結果只用 console log 記錄（不存、不輸出任何金鑰）
 */
import type { Env } from '../../env';
import { FcmClient, parseServiceAccount } from './fcm';
import { buildTopicMessage } from './payload';
import { TOPIC_ALL, type NativeContent, type NativeSendResult } from './types';

export function createFcmClient(env: Env): FcmClient | null {
  const saRaw = env.FCM_SERVICE_ACCOUNT_JSON ?? env.FCM_SERVICE_ACCOUNT_JSON_B64;
  if (!env.FCM_PROJECT_ID || !saRaw) return null;
  return new FcmClient({ projectId: env.FCM_PROJECT_ID, serviceAccount: parseServiceAccount(saRaw) });
}

export async function sendNativeTopic(opts: {
  env: Env;
  content: NativeContent;
  topic?: string;
  timeoutMs: number;
  client?: FcmClient | null;
}): Promise<NativeSendResult> {
  const start = Date.now();
  try {
    const client = opts.client === undefined ? createFcmClient(opts.env) : opts.client;
    if (!client) return { ok: false, skipped: 'not_configured', durationMs: Date.now() - start };
    return await client.sendToTopic(buildTopicMessage(opts.content, opts.topic ?? TOPIC_ALL), opts.timeoutMs);
  } catch {
    // 憑證格式錯誤等：只回固定代碼，不帶例外訊息（JSON.parse 的訊息可能含金鑰片段）
    return { ok: false, reason: 'client_init_failed', durationMs: Date.now() - start };
  }
}
