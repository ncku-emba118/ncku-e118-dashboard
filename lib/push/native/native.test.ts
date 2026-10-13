// 原生推播（FCM 主題）：不連外。用臨時產生的假金鑰驗 JWT 結構、topic payload、錯誤處理、缺憑證行為。
import crypto from 'node:crypto';
import { describe, expect, test, vi } from 'vitest';
import { FcmClient, fcmErrorCode, makeServiceAccountAssertion, parseServiceAccount } from './fcm';
import { buildTopicMessage, nativeTargetUrl } from './payload';
import { sendNativeTopic } from './index';
import { ANDROID_CHANNEL_ID, TOPIC_ALL } from './types';
import type { Env } from '../../env';

const content = { post_id: '123e4567-e89b-12d3-a456-426614174000', short_title: '標題', short_excerpt: '摘要' };
const decode = (s: string) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
const sa = { client_email: 'fake@fake.iam.gserviceaccount.com', private_key: pem };

describe('FCM 服務帳號 JWT', () => {
  test('header/claims 結構正確，RS256 簽章可用公鑰驗證', () => {
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
  test('parseServiceAccount：原文／base64 皆可；缺欄位丟錯且訊息不含金鑰', () => {
    const json = JSON.stringify({ ...sa, extra: 'x' });
    expect(parseServiceAccount(json).client_email).toBe(sa.client_email);
    expect(parseServiceAccount(Buffer.from(json).toString('base64')).private_key).toContain('BEGIN PRIVATE KEY');
    expect(() => parseServiceAccount('{"client_email":"a"}')).toThrow(/缺 client_email/);
  });
});

describe('topic payload', () => {
  test('message.topic = e118_all（無 /topics/ 前綴）、標題內文、站內導向、Android 頻道', () => {
    const m = (buildTopicMessage(content) as { message: Record<string, any> }).message;
    expect(m.topic).toBe(TOPIC_ALL);
    expect(m.topic).toBe('e118_all');
    expect(m.token).toBeUndefined();
    expect(m.notification).toEqual({ title: '標題', body: '摘要' });
    expect(m.data).toEqual({ url: `/board/post/${content.post_id}`, post_id: content.post_id });
    expect(Object.values(m.data).every((v) => typeof v === 'string')).toBe(true);
    expect(m.android.notification.channel_id).toBe(ANDROID_CHANNEL_ID);
    expect(m.apns.headers['apns-priority']).toBe('10');
  });
  test('post_id 非 UUID → 導向 /board；非法 topic 名稱丟錯', () => {
    expect(nativeTargetUrl({ post_id: 'x' })).toBe('/board');
    expect(() => buildTopicMessage(content, '/topics/e118_all')).toThrow(/invalid FCM topic/);
    expect((buildTopicMessage(content, 'e118_dept_a1') as any).message.topic).toBe('e118_dept_a1'); // 可擴充
  });
});

describe('FcmClient.sendToTopic', () => {
  const tokenRes = () => new Response(JSON.stringify({ access_token: 'fake-at', expires_in: 3600 }), { status: 200 });
  const mk = (sendRes: () => Response | Promise<Response>) => {
    const f = vi.fn(async (url: string | URL | Request) =>
      String(url).includes('oauth2') ? tokenRes() : await sendRes(),
    ) as unknown as typeof fetch;
    return { client: new FcmClient({ projectId: 'fake-proj', serviceAccount: sa }, f), f: f as unknown as ReturnType<typeof vi.fn> };
  };

  test('成功：POST 到 /v1/projects/{id}/messages:send，帶 Bearer', async () => {
    const { client, f } = mk(() => new Response('{}', { status: 200 }));
    const r = await client.sendToTopic(buildTopicMessage(content), 1000);
    expect(r).toMatchObject({ ok: true, statusCode: 200 });
    const call = f.mock.calls.find((c) => String(c[0]).includes('fcm.googleapis.com'))!;
    expect(String(call[0])).toBe('https://fcm.googleapis.com/v1/projects/fake-proj/messages:send');
    expect(call[1].headers.authorization).toBe('Bearer fake-at');
    expect(JSON.parse(call[1].body).message.topic).toBe('e118_all');
  });
  test('4xx 回 ok:false 並帶錯誤碼；不 throw', async () => {
    const { client } = mk(() => new Response(JSON.stringify({ error: { status: 'INVALID_ARGUMENT' } }), { status: 400 }));
    expect(await client.sendToTopic(buildTopicMessage(content), 1000)).toMatchObject({ ok: false, statusCode: 400, reason: 'INVALID_ARGUMENT' });
  });
  test('401 時強制換新權杖重試一次', async () => {
    let n = 0;
    const { client, f } = mk(() => (n++ === 0 ? new Response('{}', { status: 401 }) : new Response('{}', { status: 200 })));
    expect((await client.sendToTopic(buildTopicMessage(content), 1000)).ok).toBe(true);
    expect(f.mock.calls.filter((c) => String(c[0]).includes('oauth2')).length).toBe(2);
  });
  test('網路錯誤 → ok:false reason network_error', async () => {
    const f = vi.fn(async () => { throw new Error('boom'); }) as unknown as typeof fetch;
    const client = new FcmClient({ projectId: 'fake-proj', serviceAccount: sa }, f);
    expect(await client.sendToTopic(buildTopicMessage(content), 1000)).toMatchObject({ ok: false, reason: 'network_error' });
  });
  test('fcmErrorCode：優先取 details.errorCode', () => {
    expect(fcmErrorCode({ error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } })).toBe('UNREGISTERED');
  });
});

describe('sendNativeTopic（缺憑證／壞憑證都不影響呼叫端）', () => {
  test('未設定憑證 → skipped:not_configured，不發請求', async () => {
    const r = await sendNativeTopic({ env: {} as Env, content, timeoutMs: 100 });
    expect(r).toMatchObject({ ok: false, skipped: 'not_configured' });
  });
  test('憑證格式錯誤 → ok:false（不 throw），訊息不含憑證內容', async () => {
    const env = { FCM_PROJECT_ID: 'fake-proj', FCM_SERVICE_ACCOUNT_JSON: '{"not":"a service account ............................"}' } as unknown as Env;
    const r = await sendNativeTopic({ env, content, timeoutMs: 100 });
    expect(r.ok).toBe(false);
    expect(r.skipped).toBeUndefined();
    expect(r.reason).not.toMatch(/PRIVATE KEY/);
  });
  test('注入假 client：回傳其結果', async () => {
    const fake = { sendToTopic: vi.fn(async () => ({ ok: true, statusCode: 200, durationMs: 1 })) } as unknown as FcmClient;
    expect((await sendNativeTopic({ env: {} as Env, content, timeoutMs: 100, client: fake })).ok).toBe(true);
  });
});

describe('審查回補（2026-10-13 Codex 敵對審查）', () => {
  const tok = () => new Response(JSON.stringify({ access_token: 'fake-at', expires_in: 3600 }));

  test('token_uri 被竄改也一律打固定的 Google 端點，aud 同樣固定', async () => {
    const urls: string[] = [];
    const f = vi.fn(async (url: string | URL | Request) => {
      urls.push(String(url));
      return String(url).includes('oauth2') ? tok() : new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    const evil = { ...sa, token_uri: 'https://evil.example.test/collect' };
    const client = new FcmClient({ projectId: 'fake-proj', serviceAccount: evil }, f);
    await client.sendToTopic(buildTopicMessage(content), 1000);
    expect(urls[0]).toBe('https://oauth2.googleapis.com/token');
    expect(urls.some((u) => u.includes('evil.example.test'))).toBe(false);
    const claims = decode(makeServiceAccountAssertion(evil, 1_700_000_000).split('.')[1]);
    expect(claims.aud).toBe('https://oauth2.googleapis.com/token');
  });

  test('timeoutMs 是整次發送（含換權杖與 401 重試）的總預算，不是每個請求各一份', async () => {
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
    let n = 0;
    const f = vi.fn(async (url: string | URL | Request) => {
      await delay(40);
      if (String(url).includes('oauth2')) return tok();
      return n++ === 0 ? new Response('{}', { status: 401 }) : new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    const client = new FcmClient({ projectId: 'fake-proj', serviceAccount: sa }, f);
    const started = Date.now();
    const r = await client.sendToTopic(buildTopicMessage(content), 100);
    expect(Date.now() - started).toBeLessThan(160);
    expect(r).toMatchObject({ ok: false, reason: 'timeout' });
  });

  test('壞憑證的失敗原因是固定代碼，不帶 JSON.parse 例外內的內容片段', async () => {
    const env = { FCM_PROJECT_ID: 'fake-proj', FCM_SERVICE_ACCOUNT_JSON: '{"private_key": SECRET_PRIVATE_KEY_MARKER}' } as unknown as Env;
    const r = await sendNativeTopic({ env, content, timeoutMs: 100 });
    expect(r).toMatchObject({ ok: false, reason: 'client_init_failed' });
    expect(JSON.stringify(r)).not.toContain('SECRET_PRI');
  });
});
