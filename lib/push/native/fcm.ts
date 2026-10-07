/**
 * FCM HTTP v1 對「主題」發送（OAuth2 服務帳號）。零額外依賴：node:crypto + fetch。
 *
 * 規格（沿用先前 2026-10-07 查證 firebase.google.com 的結論）：
 *   • POST https://fcm.googleapis.com/v1/projects/{projectId}/messages:send，body.message.topic = 主題名稱
 *   • Authorization: Bearer <OAuth2 access token>，scope https://www.googleapis.com/auth/firebase.messaging
 *   • 存取權杖：以服務帳號私鑰簽 RS256 JWT → POST token_uri（grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer）
 * 服務帳號 JSON 由呼叫端以 env 傳入；本檔不讀檔、不 log 任何金鑰。
 */
import crypto from 'node:crypto';
import type { NativeSendResult } from './types';

export const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';

export type ServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

export const b64url = (input: string | Buffer): string => Buffer.from(input).toString('base64url');

export function parseServiceAccount(raw: string): ServiceAccount {
  const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  const sa = JSON.parse(text) as Partial<ServiceAccount>;
  if (!sa.client_email || !sa.private_key) throw new Error('FCM 服務帳號 JSON 缺 client_email / private_key');
  return { client_email: sa.client_email, private_key: sa.private_key, token_uri: sa.token_uri };
}

export function makeServiceAccountAssertion(sa: ServiceAccount, nowSec: number): string {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: FCM_SCOPE,
      aud: sa.token_uri || DEFAULT_TOKEN_URI,
      iat: nowSec,
      exp: nowSec + 3600,
    }),
  );
  const input = `${header}.${claims}`;
  const sig = crypto.sign('RSA-SHA256', Buffer.from(input), sa.private_key);
  return `${input}.${b64url(sig)}`;
}

type FetchLike = typeof fetch;

export class FcmClient {
  private access: { token: string; expiresAt: number } | null = null;

  constructor(
    private cfg: { projectId: string; serviceAccount: ServiceAccount },
    private fetchImpl: FetchLike = fetch,
    private now: () => number = () => Date.now(),
  ) {}

  async getAccessToken(force = false, timeoutMs = 3000): Promise<string> {
    if (!force && this.access && this.now() < this.access.expiresAt - 60_000) return this.access.token;
    const sa = this.cfg.serviceAccount;
    const assertion = makeServiceAccountAssertion(sa, Math.floor(this.now() / 1000));
    const res = await this.fetchImpl(sa.token_uri || DEFAULT_TOKEN_URI, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }).toString(),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`fcm_oauth_failed_${res.status}`);
    const j = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!j.access_token) throw new Error('fcm_oauth_no_token');
    this.access = { token: j.access_token, expiresAt: this.now() + (j.expires_in ?? 3600) * 1000 };
    return j.access_token;
  }

  /** 對主題發送一則訊息（message 為 buildTopicMessage 的結果）。永不 throw：失敗以 ok:false 回傳。 */
  async sendToTopic(message: Record<string, unknown>, timeoutMs: number): Promise<NativeSendResult> {
    const start = Date.now();
    const done = (r: Omit<NativeSendResult, 'durationMs'>): NativeSendResult => ({
      ...r,
      durationMs: Date.now() - start,
    });
    try {
      const post = async (force: boolean) => {
        const token = await this.getAccessToken(force, timeoutMs);
        return this.fetchImpl(`https://fcm.googleapis.com/v1/projects/${this.cfg.projectId}/messages:send`, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify(message),
          signal: AbortSignal.timeout(timeoutMs),
        });
      };
      let res = await post(false);
      if (res.status === 401) res = await post(true); // 權杖被撤銷/過期：強制換新一次
      if (res.ok) return done({ ok: true, statusCode: res.status });
      const body = (await res.json().catch(() => ({}))) as {
        error?: { status?: string; details?: Array<{ errorCode?: string }> };
      };
      return done({ ok: false, statusCode: res.status, reason: fcmErrorCode(body) });
    } catch (e) {
      const name = (e as Error).name;
      return done({ ok: false, reason: name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network_error' });
    }
  }
}

/** 取 FCM 錯誤碼（例如 INVALID_ARGUMENT、QUOTA_EXCEEDED、UNAVAILABLE、SENDER_ID_MISMATCH），只回錯誤碼不回內文 */
export function fcmErrorCode(body: {
  error?: { status?: string; details?: Array<{ errorCode?: string }> };
}): string | undefined {
  return body.error?.details?.find((d) => d.errorCode)?.errorCode ?? body.error?.status;
}
