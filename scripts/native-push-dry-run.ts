/**
 * 原生推播 dry-run（不連外、不讀任何真實金鑰）：
 * 臨時產生 RSA 金鑰，印出 FCM 服務帳號 JWT 結構與「對主題 e118_all 發送」的 payload，並斷言關鍵欄位。
 * Run: npx tsx scripts/native-push-dry-run.ts
 */
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { makeServiceAccountAssertion } from '../lib/push/native/fcm';
import { buildTopicMessage } from '../lib/push/native/payload';

const content = { post_id: '123e4567-e89b-12d3-a456-426614174000', short_title: '範例公告標題', short_excerpt: '範例摘要' };
const part = (s: string) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));

const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
const g = makeServiceAccountAssertion({ client_email: 'fake@fake.iam.gserviceaccount.com', private_key: rsa }, Math.floor(Date.now() / 1000)).split('.');
console.log('FCM assertion header:', part(g[0]));
console.log('FCM assertion claims:', part(g[1]));

const body = buildTopicMessage(content) as { message: Record<string, any> };
console.log('FCM topic message   :', JSON.stringify(body));

assert.equal(body.message.topic, 'e118_all');
assert.equal(body.message.token, undefined, '主題訊息不得帶 token');
assert.equal(body.message.data.url, `/board/post/${content.post_id}`);
assert.equal(body.message.android.notification.channel_id, 'e118_announcements');
console.log('OK：payload 斷言通過（topic=e118_all、無 token、站內導向、Android 頻道）');
