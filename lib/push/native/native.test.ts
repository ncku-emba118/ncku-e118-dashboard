// 原生推播：不連外。用臨時產生的假金鑰 + 假 token 驗 JWT 結構、payload 組裝、錯誤分類、時間預算。
import crypto from 'node:crypto';
import { describe, expect, test, vi } from 'vitest';
import { ApnsClient, classifyApns, decodeP8, makeApnsJwt, JWT_REFRESH_SECONDS } from './apns';
import { FcmClient, classifyFcm, makeServiceAccountAssertion, parseServiceAccount } from './fcm';
import { buildApnsBody, buildFcmMessage, nativeTargetUrl } from './payload';
import { BUNDLE_TO_APP, nativeRegisterSchema } from './register-schema';
import { sendNativeBatch } from './index';
import type { NativeTarget } from './types';

const content = { post_id: '123e4567-e89b-12d3-a456-426614174000', short_title: '標題', short_excerpt: '摘要' };
const decode = (s: string) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));

describe('APNs JWT', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;

  test('header/claims 結構符合 Apple 規格，簽章可用公鑰驗證（ES256 / P1363 64 bytes）', () => {
    const jwt = makeApnsJwt({ keyId: 'ABC123DEFG', teamId: 'TEAM123456', p8Pem: pem, iat: 1_700_000_000 });
    const [h, c, s] = jwt.split('.');
    expect(decode(h)).toEqual({ alg: 'ES256', kid: 'ABC123DEFG' });
    expect(decode(c)).toEqual({ iss: 'TEAM123456', iat: 1_700_000_000 });
    const sig = Buffer.from(s, 'base64url');
    expect(sig.length).toBe(64);
    expect(
      crypto.verify('sha256', Buffer.from(`${h}.${c}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, sig),
    ).toBe(true);
  });

  test('decodeP8：base64 還原 PEM；非 PEM 丟錯', () => {
    expect(decodeP8(Buffer.from(pem).toString('base64'))).toContain('BEGIN PRIVATE KEY');
    expect(() => decodeP8(Buffer.from('nope').toString('base64'))).toThrow();
  });

  test('JWT 重簽間隔介於 20–60 分鐘', () => {
    expect(JWT_REFRESH_SECONDS).toBeGreaterThanOrEqual(20 * 60);
    expect(JWT_REFRESH_SECONDS).toBeLessThan(60 * 60);
  });

  test('格式錯誤的 device token 不發請求、直接視為失效', async () => {
    const c = new ApnsClient({ keyId: 'ABC123DEFG', teamId: 'TEAM123456', p8Pem: pem, defaultEnv: 'production' });
    const t: NativeTarget = { id: '1', app: 'e118emba', platform: 'ios', token: '../../evil', apns_env: null, failure_count: 0 };
    const r = await c.send(t, buildApnsBody(content), 100);
    expect(r).toMatchObject({ ok: false, gone: true });
    c.close();
  });

  test('classifyApns：200 / 410 / BadDeviceToken / 403 / 429 / 5xx', () => {
    expect(classifyApns({ status: 200 }, 'sandbox')).toMatchObject({ ok: true, apnsEnvUsed: 'sandbox' });
    expect(classifyApns({ status: 410, reason: 'Unregistered' }, 'production')).toMatchObject({ gone: true });
    expect(classifyApns({ status: 400, reason: 'BadDeviceToken' }, 'production')).toMatchObject({ gone: true });
    expect(classifyApns({ status: 403, reason: 'InvalidProviderToken' }, 'production')).toMatchObject({
      gone: false,
      retryable: false,
    });
    expect(classifyApns({ status: 429, reason: 'TooManyRequests' }, 'production')).toMatchObject({ retryable: true });
    expect(classifyApns({ status: 503 }, 'production')).toMatchObject({ retryable: true });
  });
});

describe('FCM v1', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const sa = {
    client_email: 'fcm-sender@example-project.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
  };
  const target: NativeTarget = { id: '2', app: 'e118emba', platform: 'android', token: 'fake_token:APA91b-xxxxxxxxxxxxxxxxxxx', apns_env: null, failure_count: 0 };

  test('服務帳號 assertion：RS256、claims 正確、簽章可驗', () => {
    const jwt = makeServiceAccountAssertion(sa, 1_700_000_000);
    const [h, c, s] = jwt.split('.');
    expect(decode(h)).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(decode(c)).toEqual({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: 1_700_000_000,
      exp: 1_700_003_600,
    });
    expect(crypto.verify('RSA-SHA256', Buffer.from(`${h}.${c}`), publicKey, Buffer.from(s, 'base64url'))).toBe(true);
  });

  test('parseServiceAccount：接受原文與 base64；缺欄位丟錯', () => {
    const raw = JSON.stringify(sa);
    expect(parseServiceAccount(raw).client_email).toBe(sa.client_email);
    expect(parseServiceAccount(Buffer.from(raw).toString('base64')).client_email).toBe(sa.client_email);
    expect(() => parseServiceAccount('{}')).toThrow();
  });

  function mockFetch(sendStatus: number, sendBody: unknown = {}) {
    return vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes('oauth2.googleapis.com')) {
        return new Response(JSON.stringify({ access_token: 'fake-access', expires_in: 3600 }), { status: 200 });
      }
      return new Response(JSON.stringify(sendBody), { status: sendStatus });
    }) as unknown as typeof fetch;
  }

  test('成功送出：URL / Authorization / body；權杖快取只換一次', async () => {
    const f = mockFetch(200, { name: 'projects/p/messages/1' });
    const c = new FcmClient({ projectId: 'example-project', serviceAccount: sa }, f);
    const msg = buildFcmMessage(target.token, content);
    expect((await c.send(target, msg, 1000)).ok).toBe(true);
    expect((await c.send(target, msg, 1000)).ok).toBe(true);
    const calls = (f as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.filter((x) => String(x[0]).includes('oauth2')).length).toBe(1);
    const sendCall = calls.find((x) => String(x[0]).includes('fcm.googleapis.com'))!;
    expect(String(sendCall[0])).toBe('https://fcm.googleapis.com/v1/projects/example-project/messages:send');
    expect((sendCall[1] as RequestInit).headers).toMatchObject({ authorization: 'Bearer fake-access' });
  });

  test('UNREGISTERED(404) → gone；429 → retryable；400 → 不禁用', async () => {
    const mk = (s: number, b: unknown) => new FcmClient({ projectId: 'p-id', serviceAccount: sa }, mockFetch(s, b));
    const msg = buildFcmMessage(target.token, content);
    expect(await mk(404, { error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }).send(target, msg, 1000)).toMatchObject({ gone: true });
    expect(await mk(429, { error: { status: 'RESOURCE_EXHAUSTED' } }).send(target, msg, 1000)).toMatchObject({ retryable: true, gone: false });
    expect(await mk(400, { error: { status: 'INVALID_ARGUMENT' } }).send(target, msg, 1000)).toMatchObject({ gone: false, retryable: false });
    expect(classifyFcm(503, {})).toMatchObject({ retryable: true });
  });
});

describe('payload', () => {
  test('APNs：aps.alert + 自訂 url/post_id', () => {
    const b = buildApnsBody(content) as { aps: { alert: { title: string; body: string } }; url: string; post_id: string };
    expect(b.aps.alert).toEqual({ title: '標題', body: '摘要' });
    expect(b.url).toBe('/board/post/123e4567-e89b-12d3-a456-426614174000');
    expect(b.post_id).toBe(content.post_id);
  });
  test('FCM：data 值全為 string；priority HIGH', () => {
    const m = buildFcmMessage('tok', content) as { message: { token: string; data: Record<string, unknown>; android: { priority: string } } };
    expect(m.message.token).toBe('tok');
    expect(Object.values(m.message.data).every((v) => typeof v === 'string')).toBe(true);
    expect(m.message.android.priority).toBe('HIGH');
  });
  test('post_id 非 UUID → 導向 /board（不拼接不明字串）', () => {
    expect(nativeTargetUrl({ post_id: '../../x' })).toBe('/board');
  });
});

describe('register schema', () => {
  const base = { app: 'com.aqualux.e118emba', management_token: 'a'.repeat(64) };
  test('iOS hex / Android FCM token 通過；互相錯置被擋', () => {
    expect(nativeRegisterSchema.safeParse({ ...base, platform: 'ios', token: 'ab'.repeat(32) }).success).toBe(true);
    expect(nativeRegisterSchema.safeParse({ ...base, platform: 'android', token: 'fAkE:APA91b_-' + 'x'.repeat(40) }).success).toBe(true);
    expect(nativeRegisterSchema.safeParse({ ...base, platform: 'ios', token: 'fAkE:APA91b_-' + 'x'.repeat(40) }).success).toBe(false);
  });
  test('未知 app / 過短 management_token 被擋；bundle→內部代碼', () => {
    expect(nativeRegisterSchema.safeParse({ ...base, app: 'evil.app', platform: 'ios', token: 'ab'.repeat(32) }).success).toBe(false);
    expect(nativeRegisterSchema.safeParse({ ...base, management_token: 'short', platform: 'ios', token: 'ab'.repeat(32) }).success).toBe(false);
    expect(BUNDLE_TO_APP['com.aqualux.e118emba']).toBe('e118emba');
  });
});

describe('sendNativeBatch 預算與未設定通道', () => {
  const ios: NativeTarget = { id: 'i', app: 'e118emba', platform: 'ios', token: 'ab'.repeat(32), apns_env: null, failure_count: 0 };
  const and: NativeTarget = { id: 'a', app: 'e118emba', platform: 'android', token: 'x'.repeat(30), apns_env: null, failure_count: 0 };
  test('通道未設定 → skipped:not_configured，且不動 token', async () => {
    const r = await sendNativeBatch({ channels: { apns: null, fcm: null }, targets: [ios, and], content, perCallTimeoutMs: 100, concurrency: 5, deadlineAt: Date.now() + 1000 });
    expect(r.map((x) => x.result.skipped)).toEqual(['not_configured', 'not_configured']);
  });
  test('超過 deadline → skipped:deadline，未發出任何請求', async () => {
    const send = vi.fn();
    const r = await sendNativeBatch({
      channels: { apns: { send, close() {} } as never, fcm: { send } as never },
      targets: [ios, and], content, perCallTimeoutMs: 100, concurrency: 5, deadlineAt: Date.now() - 1,
    });
    expect(r.every((x) => x.result.skipped === 'deadline')).toBe(true);
    expect(send).not.toHaveBeenCalled();
  });
});
