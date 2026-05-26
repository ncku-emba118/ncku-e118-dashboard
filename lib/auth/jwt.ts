/**
 * Session JWT — sign/verify with jose.
 *
 * 對應 ARCHITECTURE.md v3 第 6 章「Login + 每次請求驗證」：
 *   • HS256 only (strict algorithms allowlist — 防 alg downgrade attack)
 *   • iss / aud bound to emba.aqualux.dev
 *   • payload 含 session_version → 撤銷機制（密碼 reset / 職務輪替時 +1）
 *   • jti random (UUID) → 未來可加 blacklist
 *   • exp from SESSION_TTL_SECONDS (預設 8h, 不再用 30 天)
 */
import { SignJWT, jwtVerify } from 'jose';
import { getEnv } from '../env';

const ISSUER = 'emba.aqualux.dev';
const AUDIENCE = 'emba.aqualux.dev';
const ALG = 'HS256';

export const COOKIE_NAME = 'sid'; // 開發為 'sid'；上 production 前可換 '__Host-sid'（需 https）

export type SessionPayload = {
  sub: string;                    // accounts.id (UUID)
  role: 'super' | 'dept';
  home_dept_id: string | null;    // super 可 null
  session_version: number;        // ⚠ 必須跟 DB 比對才算有效
};

function getSecret(): Uint8Array {
  const env = getEnv();
  return new TextEncoder().encode(env.SESSION_SECRET);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  const env = getEnv();
  return await new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: ALG })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setJti(crypto.randomUUID())
    .setExpirationTime(`${env.SESSION_TTL_SECONDS}s`)
    .sign(getSecret());
}

/** 只驗 JWT 簽名/iss/aud/exp/alg — session_version 比對由呼叫端做 DB query */
export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: [ALG],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    return {
      sub: payload.sub as string,
      role: payload.role as 'super' | 'dept',
      home_dept_id: (payload.home_dept_id ?? null) as string | null,
      session_version: payload.session_version as number,
    };
  } catch {
    return null;
  }
}
