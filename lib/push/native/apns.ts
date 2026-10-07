/**
 * APNs 直送（HTTP/2 + token-based JWT ES256）。零額外依賴：node:crypto + node:http2。
 *
 * 官方規格（2026-10-07 查證 developer.apple.com）：
 *   • JWT header { alg:'ES256', kid:<10 碼 Key ID> }；claims { iss:<10 碼 Team ID>, iat:<epoch 秒> }
 *   • token 至少每 60 分鐘要換新；同一把 key 更新不可比每 20 分鐘更頻繁（TooManyProviderTokenUpdates）
 *   • POST /3/device/<token>；headers: authorization: bearer <jwt>、apns-topic=<bundle id>、
 *     apns-push-type: alert、apns-priority、apns-expiration
 *   • 正式 api.push.apple.com；沙盒 api.sandbox.push.apple.com
 *   • 410（Unregistered/ExpiredToken）→ 不要再送；400 BadDeviceToken → 多半是環境不符，換另一環境重試一次
 * 金鑰：.p8 內容由呼叫端以 env（base64）傳入；本檔不讀檔、不 log 任何 token/JWT/金鑰。
 */
import crypto from 'node:crypto';
import http2 from 'node:http2';
import {
  APP_BUNDLE_IDS,
  type ApnsEnv,
  type NativeSendResult,
  type NativeTarget,
} from './types';

const HOSTS: Record<ApnsEnv, string> = {
  production: 'https://api.push.apple.com',
  sandbox: 'https://api.sandbox.push.apple.com',
};
/** JWT 重簽間隔：介於 Apple 規定的「≥20 分鐘」與「≤60 分鐘」之間 */
export const JWT_REFRESH_SECONDS = 40 * 60;
const DEVICE_TOKEN_RE = /^[0-9a-fA-F]{32,200}$/;

export function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

export function decodeP8(p8B64: string): string {
  const pem = Buffer.from(p8B64, 'base64').toString('utf8');
  if (!pem.includes('BEGIN PRIVATE KEY')) throw new Error('APNS_P8_B64 不是有效的 .p8（PEM）內容');
  return pem;
}

/** 簽 APNs provider token。ES256 = ECDSA P-256 + SHA-256，簽章用 IEEE P1363（r||s，64 bytes）格式 */
export function makeApnsJwt(opts: {
  keyId: string;
  teamId: string;
  p8Pem: string;
  iat: number;
}): string {
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: opts.keyId }));
  const claims = b64url(JSON.stringify({ iss: opts.teamId, iat: opts.iat }));
  const signingInput = `${header}.${claims}`;
  const sig = crypto.sign('sha256', Buffer.from(signingInput), {
    key: opts.p8Pem,
    dsaEncoding: 'ieee-p1363',
  });
  return `${signingInput}.${b64url(sig)}`;
}

export type ApnsConfig = {
  keyId: string;
  teamId: string;
  p8Pem: string;
  /** 預設環境（新 token 尚未知環境時先試這個，BadDeviceToken 再換另一個） */
  defaultEnv: ApnsEnv;
};

type RawResponse = { status: number; reason?: string };

export class ApnsClient {
  private sessions = new Map<ApnsEnv, http2.ClientHttp2Session>();
  private jwt: { value: string; iat: number } | null = null;

  constructor(
    private cfg: ApnsConfig,
    private now: () => number = () => Date.now(),
  ) {}

  private getJwt(force = false): string {
    const nowSec = Math.floor(this.now() / 1000);
    if (force || !this.jwt || nowSec - this.jwt.iat >= JWT_REFRESH_SECONDS) {
      this.jwt = {
        value: makeApnsJwt({
          keyId: this.cfg.keyId,
          teamId: this.cfg.teamId,
          p8Pem: this.cfg.p8Pem,
          iat: nowSec,
        }),
        iat: nowSec,
      };
    }
    return this.jwt.value;
  }

  private session(env: ApnsEnv): http2.ClientHttp2Session {
    const existing = this.sessions.get(env);
    if (existing && !existing.closed && !existing.destroyed) return existing;
    const s = http2.connect(HOSTS[env]);
    s.on('error', () => {
      /* 錯誤由各 request 的 promise 處理；這裡避免 unhandled */
    });
    this.sessions.set(env, s);
    return s;
  }

  private request(
    env: ApnsEnv,
    target: NativeTarget,
    body: string,
    jwt: string,
    timeoutMs: number,
  ): Promise<RawResponse> {
    return new Promise((resolve, reject) => {
      const nowSec = Math.floor(this.now() / 1000);
      let req: http2.ClientHttp2Stream;
      try {
        req = this.session(env).request({
          ':method': 'POST',
          ':path': `/3/device/${target.token}`,
          authorization: `bearer ${jwt}`,
          'apns-topic': APP_BUNDLE_IDS[target.app],
          'apns-push-type': 'alert',
          'apns-priority': '10',
          'apns-expiration': String(nowSec + 24 * 3600),
          'content-type': 'application/json',
        });
      } catch (e) {
        reject(e);
        return;
      }
      let status = 0;
      const chunks: Buffer[] = [];
      const timer = setTimeout(() => {
        req.close(http2.constants.NGHTTP2_CANCEL);
        reject(new Error('timeout'));
      }, timeoutMs);
      req.on('response', (h) => {
        status = Number(h[':status'] ?? 0);
      });
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
      req.on('end', () => {
        clearTimeout(timer);
        let reason: string | undefined;
        if (chunks.length) {
          try {
            reason = (JSON.parse(Buffer.concat(chunks).toString('utf8')) as { reason?: string }).reason;
          } catch {
            /* 非 JSON 忽略 */
          }
        }
        resolve({ status, reason });
      });
      req.end(body);
    });
  }

  async send(target: NativeTarget, body: Record<string, unknown>, timeoutMs: number): Promise<NativeSendResult> {
    const start = Date.now();
    const done = (r: Omit<NativeSendResult, 'durationMs'>): NativeSendResult => ({
      ...r,
      durationMs: Date.now() - start,
    });
    if (!DEVICE_TOKEN_RE.test(target.token)) {
      return done({ ok: false, gone: true, retryable: false, reason: 'MalformedToken' });
    }
    const json = JSON.stringify(body);
    const first = target.apns_env ?? this.cfg.defaultEnv;
    const other: ApnsEnv = first === 'production' ? 'sandbox' : 'production';

    try {
      let env = first;
      let res = await this.request(env, target, json, this.getJwt(), timeoutMs);
      if (res.status === 403 && res.reason === 'ExpiredProviderToken') {
        res = await this.request(env, target, json, this.getJwt(true), timeoutMs);
      }
      if (res.status === 400 && res.reason === 'BadDeviceToken') {
        env = other; // 環境不符：換另一環境重試一次（Team Scoped key 兩環境皆可）
        res = await this.request(env, target, json, this.getJwt(), timeoutMs);
      }
      return done(classifyApns(res, env));
    } catch (e) {
      const msg = (e as Error).message;
      return done({
        ok: false,
        gone: false,
        retryable: true,
        reason: msg === 'timeout' ? 'timeout' : 'network_error',
      });
    }
  }

  close(): void {
    for (const s of this.sessions.values()) {
      if (!s.closed) s.close();
    }
    this.sessions.clear();
  }
}

export function classifyApns(res: RawResponse, envUsed: ApnsEnv): Omit<NativeSendResult, 'durationMs'> {
  const { status, reason } = res;
  if (status === 200) return { ok: true, gone: false, retryable: false, statusCode: status, apnsEnvUsed: envUsed };
  // Apple：Unregistered / ExpiredToken / BadDeviceToken / DeviceTokenNotForTopic 皆「不要再重送」
  const goneReasons = new Set(['Unregistered', 'ExpiredToken', 'BadDeviceToken', 'DeviceTokenNotForTopic']);
  if (status === 410 || (reason && goneReasons.has(reason))) {
    return { ok: false, gone: true, retryable: false, statusCode: status, reason };
  }
  if (status === 429 || status >= 500) {
    return { ok: false, gone: false, retryable: true, statusCode: status, reason };
  }
  // 403（金鑰/Team/Topic 設定錯）、413、其他 400：設定或內容問題，不是 token 的錯 → 不禁用 token
  return { ok: false, gone: false, retryable: false, statusCode: status, reason };
}
