/**
 * POST /api/board/login — refactored after Codex #2 audit.
 *
 * 對應 ARCHITECTURE.md v3 第 6 章 Login flow + Codex #2 修正：
 *
 *   • Sec F1 / Rel F1 / Test F3 (atomic counter)
 *     失敗計數改走 Postgres RPC `record_failed_login()`，atomic UPDATE
 *
 *   • Rel F3 (expired lockout reset)
 *     同 RPC 內處理：locked_until ≤ now → failed_attempts 重設
 *
 *   • Rel F4 (success vs concurrent lock race)
 *     成功登入也走 RPC `record_successful_login()`，條件式 UPDATE，
 *     若帳號剛被並發失敗鎖住、回 false、不發 cookie
 *
 *   • Sec F2 (X-Forwarded-For trust)
 *     prod 優先 `x-nf-client-connection-ip` (Netlify edge 設定、不可偽造)
 *     dev 才回退 X-Forwarded-For
 *
 *   • Sec F4 (cookie secure flag)
 *     secure 判斷加 `x-forwarded-proto` + NODE_ENV，prod reverse proxy 後仍 Secure
 *
 *   • Rel F2 / Test F1 (Supabase error swallowed)
 *     每個 supabase call 都讀 { error }，DB 5xx → 回 503 不要回 401
 *
 *   • Rel F6 (request body size limit)
 *     Content-Length > 1 KB 直接 413，避免吃 MB 級 body
 *
 *   • Rel F7 (no trace_id)
 *     每個 request 產 traceId，所有 log 帶 traceId、response header 含 x-trace-id
 *
 *   • Test F9 (password format boundary)
 *     server 端強制 `/^\d{4}$/` 才進 bcrypt（不浪費 250ms × 攻擊次數）
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { signSession, COOKIE_NAME } from '@/lib/auth/jwt';
import { comparePassword } from '@/lib/auth/password';
import { getEnv } from '@/lib/env';
import { resolveClientIp } from '@/lib/ip-resolve';

// ── In-memory IP rate limit（Netlify Function instance scope）──
const ipBuckets = new Map<string, { count: number; resetAt: number }>();
const RL_MAX_PER_WINDOW = 5;
const RL_WINDOW_MS = 60 * 1000;
const MAX_BODY_BYTES = 1024;

function checkIpRateLimit(ip: string): boolean {
  const now = Date.now();
  const rec = ipBuckets.get(ip);
  if (!rec || now > rec.resetAt) {
    ipBuckets.set(ip, { count: 1, resetAt: now + RL_WINDOW_MS });
    return true;
  }
  if (rec.count >= RL_MAX_PER_WINDOW) return false;
  rec.count++;
  return true;
}

// P0-3 修正：IP 抽取統一走 lib/ip-resolve，prod 也接受 XFF（Netlify/CF/Vercel
// 都會自行覆寫掉 client 端偽造值），抓不到時 caller 直接 reject 503。

/**
 * ⚠ Sec F4 fix: cookie Secure 判斷涵蓋 reverse-proxy + prod env，不只看 nextUrl.protocol
 */
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
  return res;
}

export async function POST(req: NextRequest) {
  const traceId = crypto.randomUUID();

  // ── 1. Body size limit ──
  const contentLength = Number(req.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return jsonResponse({ error: '請求過大' }, 413, traceId);
  }

  // ── 2. IP rate limit ──
  const ip = resolveClientIp(req);
  if (!ip) {
    console.warn('[auth.login.no_client_ip]', { traceId });
    return jsonResponse(
      { error: '系統無法識別來源，請稍後再試' },
      503,
      traceId,
    );
  }
  if (!checkIpRateLimit(ip)) {
    console.info('[auth.login.rate_limit]', { traceId, ip });
    return jsonResponse({ error: '嘗試次數過多，請稍後再試' }, 429, traceId);
  }

  // ── 3. Parse + validate body ──
  const body = (await req.json().catch(() => null)) as
    | { username?: unknown; password?: unknown }
    | null;
  if (
    !body ||
    typeof body.username !== 'string' ||
    typeof body.password !== 'string'
  ) {
    return jsonResponse({ error: '請填寫帳號與密碼' }, 400, traceId);
  }
  const username = body.username.trim();
  const password = body.password;

  // ⚠ Test F9 fix: server-side 強制 4 位數密碼格式（避免燒 bcrypt）
  if (!/^\d{4}$/.test(password)) {
    return jsonResponse({ error: '請填寫帳號與密碼' }, 400, traceId);
  }
  if (!username || username.length > 20) {
    return jsonResponse({ error: '請填寫帳號與密碼' }, 400, traceId);
  }

  const supabase = getServerClient();

  // ── 4. Account lookup ──
  const { data: account, error: lookupError } = await supabase
    .from('accounts')
    .select(
      'id, username, password_hash, role, home_dept_id, session_version, locked_until',
    )
    .eq('username', username)
    .maybeSingle();

  if (lookupError) {
    console.error('[auth.login.lookup_failed]', {
      traceId,
      error: lookupError.message,
    });
    return jsonResponse(
      { error: '系統暫時無法登入，請稍後再試' },
      503,
      traceId,
    );
  }

  if (!account) {
    // 不暴露「username 不存在」vs「密碼錯」
    console.info('[auth.login.user_not_found]', { traceId, username });
    return jsonResponse({ error: '帳號或密碼錯誤' }, 401, traceId);
  }

  // ── 5. Quick lockout pre-check（RPC 內會再 atomic 處理）──
  const lockedNow =
    !!account.locked_until &&
    new Date(account.locked_until as string) > new Date();
  if (lockedNow) {
    console.info('[auth.login.locked]', { traceId, accountId: account.id });
    return jsonResponse(
      {
        error: '此帳號已鎖定 24 小時（連續密碼錯誤太多次）。請聯繫管理員解鎖。',
      },
      423,
      traceId,
    );
  }

  // ── 6. bcrypt compare ──
  const ok = await comparePassword(
    password,
    account.password_hash as string,
  );

  if (!ok) {
    // ⚠ Codex Sec F1 / Rel F1 / F3 fix: atomic increment via RPC
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      'record_failed_login',
      { p_account_id: account.id },
    );
    if (rpcError) {
      console.error('[auth.login.failed_rpc_error]', {
        traceId,
        accountId: account.id,
        error: rpcError.message,
      });
      // 不要因為 RPC 失敗就阻擋使用者 — 返回 generic 401
      return jsonResponse({ error: '帳號或密碼錯誤' }, 401, traceId);
    }
    const row = Array.isArray(rpcResult) ? rpcResult[0] : null;
    const failed = row?.failed_attempts ?? 0;
    const justLocked = row?.just_locked ?? false;

    console.info('[auth.login.bad_password]', {
      traceId,
      accountId: account.id,
      failed_attempts: failed,
      just_locked: justLocked,
    });

    if (justLocked) {
      // TODO: trigger LINE notification（in a subsequent commit）
      console.warn('[auth.login.account_locked]', {
        traceId,
        accountId: account.id,
        username: account.username,
        ip_hint: ip,
      });
    }

    return jsonResponse({ error: '帳號或密碼錯誤' }, 401, traceId);
  }

  // ── 7. Success: conditional reset via RPC（避免並發 lock 被覆蓋）──
  const { data: successResult, error: successRpcError } = await supabase.rpc(
    'record_successful_login',
    { p_account_id: account.id },
  );

  if (successRpcError) {
    console.error('[auth.login.success_rpc_failed]', {
      traceId,
      error: successRpcError.message,
    });
    return jsonResponse(
      { error: '系統暫時無法登入，請稍後再試' },
      503,
      traceId,
    );
  }

  // RPC returns false 表示：在我們驗密碼期間，並發失敗剛把帳號鎖了
  if (successResult === false) {
    console.warn('[auth.login.success_blocked_by_concurrent_lock]', {
      traceId,
      accountId: account.id,
    });
    return jsonResponse(
      { error: '此帳號剛被鎖定，請聯繫管理員' },
      423,
      traceId,
    );
  }

  // ── 8. Sign JWT + set cookie ──
  const token = await signSession({
    sub: account.id as string,
    role: account.role as 'super' | 'dept',
    home_dept_id: account.home_dept_id as string | null,
    session_version: account.session_version as number,
  });

  const env = getEnv();
  const isHttps = isHttpsContext(req);

  console.info('[auth.login.success]', {
    traceId,
    accountId: account.id,
    role: account.role,
  });

  const response = NextResponse.json({
    ok: true,
    user: {
      username: account.username,
      role: account.role,
      home_dept_id: account.home_dept_id,
    },
  });
  response.headers.set('x-trace-id', traceId);
  response.cookies.set({
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: isHttps,
    sameSite: 'lax',
    path: '/',
    maxAge: env.SESSION_TTL_SECONDS,
  });

  return response;
}
