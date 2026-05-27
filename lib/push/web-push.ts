/**
 * web-push library wrapper — server-side push sender
 *
 * 對應 ARCHITECTURE.md v3 第 7 章「Fan-out 規格」+ Codex Rel F3/F5：
 *   • per-subscription timeout（預設 3s，env PUSH_PER_CALL_TIMEOUT_MS 可調）
 *   • 失敗分類：410_gone / 429_rate_limit / 5xx / timeout / unknown
 *   • VAPID claim exp 短壽（VAPID_JWT_EXP_SECONDS, 預設 6h）
 *   • PUSH_ENABLED=false → 不送，degraded mode
 */
import 'server-only';
import webpush from 'web-push';
import { getEnv } from '../env';
import type { PushPayload } from './payload';

let configured = false;

function ensureConfigured(): boolean {
  if (configured) return true;
  const env = getEnv();
  if (
    !env.VAPID_PUBLIC_KEY ||
    !env.VAPID_PRIVATE_KEY ||
    !env.VAPID_SUBJECT
  ) {
    return false;
  }
  webpush.setVapidDetails(
    env.VAPID_SUBJECT,
    env.VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY,
  );
  configured = true;
  return true;
}

export type SubscriptionShape = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type DeliveryResult = {
  ok: boolean;
  statusCode?: number;
  errorClass?:
    | '410_gone'
    | '429_rate_limit'
    | '404_not_found'
    | '5xx'
    | 'timeout'
    | 'unknown';
  durationMs: number;
};

function classifyError(err: unknown, msg: string): DeliveryResult['errorClass'] {
  const code = (err as { statusCode?: number })?.statusCode ?? 0;
  if (msg === 'timeout') return 'timeout';
  if (code === 410) return '410_gone';
  if (code === 429) return '429_rate_limit';
  if (code === 404) return '404_not_found';
  if (code >= 500 && code < 600) return '5xx';
  return 'unknown';
}

export async function sendOne(
  sub: SubscriptionShape,
  payload: PushPayload,
  timeoutMs: number,
): Promise<DeliveryResult> {
  const start = Date.now();

  if (!ensureConfigured()) {
    return {
      ok: false,
      errorClass: 'unknown',
      durationMs: Date.now() - start,
    };
  }

  // VAPID JWT exp from env（Codex F5: short-lived claim）
  const env = getEnv();

  try {
    const result = await Promise.race([
      webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify(payload),
        {
          TTL: 60 * 60 * 24,
          urgency: 'normal',
          vapidDetails: env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT
            ? {
                subject: env.VAPID_SUBJECT,
                publicKey: env.VAPID_PUBLIC_KEY,
                privateKey: env.VAPID_PRIVATE_KEY,
              }
            : undefined,
        },
      ),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error('timeout')), timeoutMs),
      ),
    ]);
    return {
      ok: true,
      statusCode: (result as { statusCode?: number })?.statusCode,
      durationMs: Date.now() - start,
    };
  } catch (err: unknown) {
    const msg = (err as { message?: string })?.message || '';
    const code = (err as { statusCode?: number })?.statusCode;
    return {
      ok: false,
      statusCode: code,
      errorClass: classifyError(err, msg),
      durationMs: Date.now() - start,
    };
  }
}
