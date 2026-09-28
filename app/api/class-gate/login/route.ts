/**
 * POST /api/class-gate/login — 班級共用密碼驗證（外層閘門），通過後發 90 天班級 cookie。
 *
 * ⚠ 路徑刻意不放 /api/board/*：那是幹部個人帳密（內層）的地盤，middleware
 *   對它走既有白名單邏輯；本 API 由 lib/auth/class-gate.ts 的豁免清單放行。
 *
 * 安全設計比照 app/api/board/login/route.ts：
 *   • Content-Length 上限 1 KB
 *   • IP 抓不到 → 503（不歸到共用 bucket）
 *   • 防暴力：DB 計數（同 IP / 全站），見 lib/auth/class-gate-server.ts
 *   • 任何 DB 錯誤 → 503（fail-closed，不放行）
 *   • 密碼尚未設定 / CLASS_GATE_SECRET 未設定 → 503（fail-closed）
 *   • cookie httpOnly + Secure(prod) + SameSite=Lax + Path=/
 *   • 回應不含任何身分資訊；log 不記密碼、不記原始 IP
 */
import { NextResponse, type NextRequest } from 'next/server';
import {
  CLASS_COOKIE_NAME,
  CLASS_SESSION_TTL_SECONDS,
  isClassGateConfigured,
  signClassToken,
} from '@/lib/auth/class-gate';
import {
  beginClassLoginAttempt,
  compareClassPassword,
  getClassPasswordHash,
  markClassLoginSucceeded,
  pruneOldClassLoginAttempts,
} from '@/lib/auth/class-gate-server';
import { hashIp } from '@/lib/ip-hash';
import { resolveClientIp } from '@/lib/ip-resolve';

const MAX_BODY_BYTES = 1024;
const MAX_PASSWORD_INPUT = 128;

function isHttpsContext(req: NextRequest): boolean {
  return (
    req.nextUrl.protocol === 'https:' ||
    req.headers.get('x-forwarded-proto') === 'https' ||
    process.env.NODE_ENV === 'production'
  );
}

function jsonResponse(body: object, status: number, traceId: string) {
  const res = NextResponse.json(body, { status });
  res.headers.set('x-trace-id', traceId);
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

const UNAVAILABLE = '系統暫時無法驗證，請稍後再試';

export async function POST(req: NextRequest) {
  const traceId = crypto.randomUUID();

  // ── 1. Body size limit ──
  const contentLength = Number(req.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return jsonResponse({ error: '請求過大' }, 413, traceId);
  }

  // ── 2. 設定檢查（fail-closed）──
  if (!isClassGateConfigured()) {
    console.error('[class_gate.login.secret_missing]', { traceId });
    return jsonResponse({ error: UNAVAILABLE }, 503, traceId);
  }

  const ip = resolveClientIp(req);
  if (!ip) {
    console.warn('[class_gate.login.no_client_ip]', { traceId });
    return jsonResponse({ error: '系統無法識別來源，請稍後再試' }, 503, traceId);
  }

  // ── 3. Parse body ──
  const body = (await req.json().catch(() => null)) as { password?: unknown } | null;
  if (!body || typeof body.password !== 'string') {
    return jsonResponse({ error: '請輸入班級密碼' }, 400, traceId);
  }
  const password = body.password;
  if (password.length === 0 || password.length > MAX_PASSWORD_INPUT) {
    return jsonResponse({ error: '請輸入班級密碼' }, 400, traceId);
  }

  // ── 4. 讀密碼 hash ──
  const stored = await getClassPasswordHash();
  if (!stored.ok) {
    console.error('[class_gate.login.hash_lookup_failed]', { traceId, error: stored.error });
    return jsonResponse({ error: UNAVAILABLE }, 503, traceId);
  }
  if (!stored.hash) {
    console.error('[class_gate.login.password_not_set]', { traceId });
    return jsonResponse({ error: '班級密碼尚未設定，請聯繫幹部' }, 503, traceId);
  }

  // ── 5. 防暴力：先記嘗試再數次數 ──
  const { hash: ipHash } = hashIp(ip);
  const gate = await beginClassLoginAttempt(ipHash);
  if (!gate.ok) {
    if (gate.reason === 'db_error') {
      console.error('[class_gate.login.attempt_db_error]', { traceId, error: gate.error });
      return jsonResponse({ error: UNAVAILABLE }, 503, traceId);
    }
    console.warn('[class_gate.login.rate_limited]', { traceId, reason: gate.reason });
    return jsonResponse({ error: '嘗試次數過多，請 15 分鐘後再試' }, 429, traceId);
  }

  // ── 6. bcrypt compare ──
  const ok = await compareClassPassword(password, stored.hash);
  if (!ok) {
    console.info('[class_gate.login.bad_password]', { traceId });
    return jsonResponse({ error: '班級密碼錯誤' }, 401, traceId);
  }

  // ── 7. 成功：發 cookie ──
  await markClassLoginSucceeded(gate.attemptId);
  await pruneOldClassLoginAttempts();

  const token = await signClassToken();
  console.info('[class_gate.login.success]', { traceId });

  const res = jsonResponse({ ok: true }, 200, traceId);
  res.cookies.set({
    name: CLASS_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: isHttpsContext(req),
    sameSite: 'lax',
    path: '/',
    maxAge: CLASS_SESSION_TTL_SECONDS,
  });
  return res;
}
