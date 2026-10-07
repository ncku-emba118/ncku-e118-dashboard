/**
 * 原生通道（APNs / FCM）批次發送器 — 給 dispatcher 呼叫。
 *   • 通道依 platform 分流；憑證沒設定的通道 → 該平台 token 全部 skipped:not_configured（不動 token 狀態）
 *   • 時間預算：deadlineAt（epoch ms）一過就停止送出剩餘 token（skipped:deadline），
 *     與 Web Push 並行執行（Promise.all），總時間 = max 而非相加，不惡化 Netlify 10 秒上限風險
 *   • 分批：每批 concurrency 個；APNs 共用單一 HTTP/2 連線（多工）
 */
import type { Env } from '../../env';
import { ApnsClient, decodeP8 } from './apns';
import { FcmClient, parseServiceAccount } from './fcm';
import { buildApnsBody, buildFcmMessage } from './payload';
import type { NativeContent, NativeSendResult, NativeTarget } from './types';

export type NativeChannels = { apns: ApnsClient | null; fcm: FcmClient | null };

export function createNativeChannels(env: Env): NativeChannels {
  let apns: ApnsClient | null = null;
  let fcm: FcmClient | null = null;
  if (env.APNS_KEY_ID && env.APNS_TEAM_ID && env.APNS_P8_B64) {
    apns = new ApnsClient({
      keyId: env.APNS_KEY_ID,
      teamId: env.APNS_TEAM_ID,
      p8Pem: decodeP8(env.APNS_P8_B64),
      defaultEnv: env.APNS_ENV,
    });
  }
  const saRaw = env.FCM_SERVICE_ACCOUNT_JSON ?? env.FCM_SERVICE_ACCOUNT_JSON_B64;
  if (env.FCM_PROJECT_ID && saRaw) {
    fcm = new FcmClient({ projectId: env.FCM_PROJECT_ID, serviceAccount: parseServiceAccount(saRaw) });
  }
  return { apns, fcm };
}

export async function sendNativeBatch(opts: {
  channels: NativeChannels;
  targets: NativeTarget[];
  content: NativeContent;
  perCallTimeoutMs: number;
  concurrency: number;
  deadlineAt: number;
}): Promise<Array<{ target: NativeTarget; result: NativeSendResult }>> {
  const { channels, targets, content, perCallTimeoutMs, concurrency, deadlineAt } = opts;
  const apnsBody = buildApnsBody(content);
  const out: Array<{ target: NativeTarget; result: NativeSendResult }> = [];
  const skipped = (reason: 'not_configured' | 'deadline'): NativeSendResult => ({
    ok: false,
    gone: false,
    retryable: false,
    skipped: reason,
    durationMs: 0,
  });

  try {
    for (let i = 0; i < targets.length; i += concurrency) {
      const chunk = targets.slice(i, i + concurrency);
      const results = await Promise.all(
        chunk.map(async (target) => {
          const channel = target.platform === 'ios' ? channels.apns : channels.fcm;
          if (!channel) return { target, result: skipped('not_configured') };
          const remaining = deadlineAt - Date.now();
          if (remaining <= 0) return { target, result: skipped('deadline') };
          const timeout = Math.min(perCallTimeoutMs, remaining);
          const result =
            target.platform === 'ios'
              ? await (channel as ApnsClient).send(target, apnsBody, timeout)
              : await (channel as FcmClient).send(target, buildFcmMessage(target.token, content), timeout);
          return { target, result };
        }),
      );
      out.push(...results);
    }
  } finally {
    channels.apns?.close();
  }
  return out;
}
