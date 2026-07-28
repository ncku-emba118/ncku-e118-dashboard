/**
 * Session JWT — sign/verify with jose + zod payload schema validation.
 *
 * 對應 ARCHITECTURE.md v3 第 6 章 + Codex #2 修正：
 *   • HS256 only (strict algorithms allowlist)
 *   • iss / aud bound to emba.aqualux.dev
 *   • payload 含 session_version → 撤銷機制
 *   • jti random (UUID)
 *   • exp from SESSION_TTL_SECONDS (預設 8h)
 *   • ⚠ Sec F7 / Test F4 fix: 簽名驗證**之後**還要 zod schema validate
 *     防 SESSION_SECRET 外洩後 attacker 簽 role: "owner" 等畸形 payload 過 middleware
 */
import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';
import { getEnv } from '../env';

const ISSUER = 'emba.aqualux.dev';
const AUDIENCE = 'emba.aqualux.dev';
const ALG = 'HS256';

/**
 * P0-9 修正：prod 用 `__Host-sid` 前綴
 *   • 瀏覽器強制：Secure flag 必開 + Path=/ + 無 Domain 屬性
 *   • 防止子網域 / proxy 設假 cookie 偽造 session
 *   • Dev 無法用（localhost 不是 https），用 `sid` 代替
 */
export const COOKIE_NAME =
  process.env.NODE_ENV === 'production' ? '__Host-sid' : 'sid';

const SessionPayloadSchema = z.object({
  sub: z.string().uuid(),
  role: z.enum(['super', 'dept']),
  home_dept_id: z.string().nullable(),
  session_version: z.number().int().positive(),
});

export type SessionPayload = z.infer<typeof SessionPayloadSchema>;

function getSecret(): Uint8Array {
  const env = getEnv();
  return new TextEncoder().encode(env.SESSION_SECRET);
}

/**
 * @param ttlSeconds 選填。session 有效期（秒）。省略時用 env.SESSION_TTL_SECONDS（預設 8h）。
 *   ⚠ 密碼登入 (app/api/board/login) 不帶此參數 → 行為不變、維持 8h；
 *   只有 magic 連結換發 session (app/api/board/signoff/magic) 會傳入 14 天秒數，
 *   讓 session 有效期對齊連結 TTL（避免連結還沒過期、session 卻先過期要求重新登入）。
 */
export async function signSession(
  payload: SessionPayload,
  ttlSeconds?: number,
): Promise<string> {
  const env = getEnv();
  const ttl = ttlSeconds ?? env.SESSION_TTL_SECONDS;
  // 簽前先過自己 schema 一次（避免我們自己 bug 寫出畸形 JWT）
  const validated = SessionPayloadSchema.parse(payload);
  return await new SignJWT(validated as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: ALG })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setJti(crypto.randomUUID())
    .setExpirationTime(`${ttl}s`)
    .sign(getSecret());
}

/**
 * 驗 JWT 簽名/alg/iss/aud/exp，然後 zod schema validate payload shape。
 * 缺一不可。session_version 跟 DB 比對由呼叫端做。
 */
export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: [ALG],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    // ⚠ Codex Sec F7 / Test F4: structural validation after signature check
    const parsed = SessionPayloadSchema.safeParse({
      sub: payload.sub,
      role: payload.role,
      home_dept_id: payload.home_dept_id ?? null,
      session_version: payload.session_version,
    });
    if (!parsed.success) return null;
    return parsed.data;
  } catch {
    return null;
  }
}
