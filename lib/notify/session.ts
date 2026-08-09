/**
 * 手動通知（秘書發 LINE）專用的輕量 session。
 *
 * 為什麼不共用 lib/auth/jwt.ts 的幹部 session：
 *   • 幹部 session payload schema 綁 Supabase accounts（sub 必須是 UUID、role enum、session_version）
 *     — 秘書 PIN 沒有對應的 accounts 列，硬塞會破壞既有 schema 契約。
 *   • iss/aud 另立（e118-notify），即使兩邊都用 SESSION_SECRET 簽，
 *     notify token 也**不可能**被 middleware/幹部 API 當成幹部 session 接受，反之亦然。
 *
 * cookie 名稱：prod 用 `__Host-` 前綴（比照既有幹部 session 的 P0-9 做法）。
 *
 * ⚠ PIN 來源：環境變數 `NOTIFY_PIN`（4 位數字字串）。
 *   實際值待使用者確認後填進 Netlify 環境變數 + 本機 .env.local。
 *   目前刻意不寫進 lib/env.ts 的 zod schema（那是既有已提交檔案，本次不動），
 *   改在本檔直接讀 process.env.NOTIFY_PIN；未設定 → 一律拒絕登入（fail-closed）。
 */
import 'server-only';
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';

const ISSUER = 'e118-notify';
const AUDIENCE = 'e118-notify';
const ALG = 'HS256';

export const NOTIFY_COOKIE_NAME =
  process.env.NODE_ENV === 'production' ? '__Host-nsid' : 'nsid';

/** session 有效期：2 小時（發通知是短時操作，不需要 8 小時） */
export const NOTIFY_SESSION_TTL_SECONDS = 2 * 60 * 60;

const NotifyPayloadSchema = z.object({
  scope: z.literal('manual-notify'),
});

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('[notify] SESSION_SECRET 未設定或太短');
  }
  return new TextEncoder().encode(secret);
}

/**
 * 取設定的 PIN。未設定 / 格式不是 4 位數 → 回 null，呼叫端必須拒絕登入。
 * ⚠ 這是唯一讀 PIN 的地方；要換 PIN 只改環境變數 NOTIFY_PIN，不改程式碼。
 */
export function getConfiguredPin(): string | null {
  const pin = (process.env.NOTIFY_PIN ?? '').trim();
  if (!/^\d{4}$/.test(pin)) return null;
  return pin;
}

/** timing-safe 字串比對（避免以回應時間逐位猜 PIN） */
export function safeEqualPin(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signNotifySession(): Promise<string> {
  return await new SignJWT({ scope: 'manual-notify' })
    .setProtectedHeader({ alg: ALG })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setJti(crypto.randomUUID())
    .setExpirationTime(`${NOTIFY_SESSION_TTL_SECONDS}s`)
    .sign(getSecret());
}

/** 驗簽名 + alg/iss/aud/exp，再過 zod。任一不符回 false。 */
export async function verifyNotifyToken(token: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: [ALG],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    return NotifyPayloadSchema.safeParse({ scope: payload.scope }).success;
  } catch {
    return false;
  }
}

/** 從 cookie 讀並驗證。給 server component / API route 用。 */
export async function hasNotifySession(): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get(NOTIFY_COOKIE_NAME)?.value;
  if (!token) return false;
  return verifyNotifyToken(token);
}
