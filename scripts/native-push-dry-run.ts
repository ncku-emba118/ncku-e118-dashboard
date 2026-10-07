/**
 * 原生推播 dry-run（不連外、不讀任何真實金鑰）：
 * 臨時產生 EC/RSA 金鑰與假 token，印出 APNs JWT 結構、APNs/FCM payload。
 * Run: npx tsx scripts/native-push-dry-run.ts
 */
import crypto from 'node:crypto';
import { makeApnsJwt } from '../lib/push/native/apns';
import { makeServiceAccountAssertion } from '../lib/push/native/fcm';
import { buildApnsBody, buildFcmMessage } from '../lib/push/native/payload';

const content = { post_id: '123e4567-e89b-12d3-a456-426614174000', short_title: '範例公告標題', short_excerpt: '範例摘要' };
const part = (s: string) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));

const ec = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
const apns = makeApnsJwt({ keyId: 'FAKEKEYID1', teamId: 'FAKETEAM01', p8Pem: ec, iat: Math.floor(Date.now() / 1000) }).split('.');
console.log('APNs JWT header :', part(apns[0]));
console.log('APNs JWT claims :', part(apns[1]), '| signature bytes:', Buffer.from(apns[2], 'base64url').length);
console.log('APNs body       :', JSON.stringify(buildApnsBody(content)));

const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
const g = makeServiceAccountAssertion({ client_email: 'fake@fake.iam.gserviceaccount.com', private_key: rsa }, Math.floor(Date.now() / 1000)).split('.');
console.log('FCM assertion   :', part(g[0]), part(g[1]));
console.log('FCM message     :', JSON.stringify(buildFcmMessage('fake-registration-token', content)));
