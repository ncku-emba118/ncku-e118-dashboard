/**
 * POST /api/board/login
 *
 * 對應 ARCHITECTURE.md v3 第 6 章 Login flow:
 *   1. IP rate limit (5/min/IP) — 防 brute force
 *   2. username lookup (Supabase, service_role key)
 *   3. Lockout check (locked_until > now → 423)
 *   4. bcrypt.compare
 *      • 失敗：failed_attempts++, 達 10 鎖 24h
 *      • 成功：failed_attempts=0, locked_until=null, last_login_at=now
 *   5. Sign JWT with session_version
 *   6. Set HttpOnly cookie 'sid', Max-Age=SESSION_TTL_SECONDS
 *
 * Request body: { username: string, password: string (4 digits) }
 * Response 200: { ok: true, user: { username, role, home_dept_id } }
 * Response 4xx: { error: string } — 不暴露 username 是否存在
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { signSession, COOKIE_NAME } from '@/lib/auth/jwt';
import {
  comparePassword,
  shouldLock,
  lockoutUntil,
  isLockedNow,
} from '@/lib/auth/password';
import { getEnv } from '@/lib/env';

// ── In-memory IP rate limit（dev/Netlify-Function-instance scope）──
// 對 Netlify Functions cold-start 環境並不完美（不同 lambda 不共享），
// 但對小規模班級夠用。Production 升級可用 Upstash Redis。
const ipBuckets = new Map<string, { count: number; resetAt: number }>();
const RL_MAX_PER_WINDOW = 5;
const RL_WINDOW_MS = 60 * 1000;

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

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);

  // ── 1. IP rate limit ──
  if (!checkIpRateLimit(ip)) {
    return NextResponse.json(
      { error: '嘗試次數過多，請稍後再試' },
      { status: 429 },
    );
  }

  // ── 2. Parse body ──
  const body = (await req.json().catch(() => null)) as
    | { username?: unknown; password?: unknown }
    | null;
  if (!body || typeof body.username !== 'string' || typeof body.password !== 'string') {
    return NextResponse.json({ error: '請填寫帳號與密碼' }, { status: 400 });
  }
  const username = body.username.trim();
  const password = body.password;

  if (!username || !password) {
    return NextResponse.json({ error: '請填寫帳號與密碼' }, { status: 400 });
  }

  // ── 3. Account lookup ──
  const supabase = getServerClient();
  const { data: account } = await supabase
    .from('accounts')
    .select(
      'id, username, password_hash, role, home_dept_id, session_version, failed_attempts, locked_until',
    )
    .eq('username', username)
    .maybeSingle();

  // 不暴露「username 存在但密碼錯」vs「username 不存在」差異
  if (!account) {
    return NextResponse.json({ error: '帳號或密碼錯誤' }, { status: 401 });
  }

  // ── 4. Lockout check ──
  if (isLockedNow(account.locked_until as string | null)) {
    return NextResponse.json(
      {
        error: '此帳號已鎖定 24 小時（連續密碼錯誤太多次）。請聯繫管理員解鎖。',
      },
      { status: 423 },
    );
  }

  // ── 5. bcrypt compare ──
  const ok = await comparePassword(password, account.password_hash as string);
  if (!ok) {
    const next = (account.failed_attempts as number) + 1;
    const updates: { failed_attempts: number; locked_until?: string } = {
      failed_attempts: next,
    };
    if (shouldLock(next)) {
      updates.locked_until = lockoutUntil().toISOString();
      // TODO: LINE notify 負責人（會在另一個 commit 加）
    }
    await supabase.from('accounts').update(updates).eq('id', account.id);
    return NextResponse.json({ error: '帳號或密碼錯誤' }, { status: 401 });
  }

  // ── 6. Success: reset counters + update last_login ──
  await supabase
    .from('accounts')
    .update({
      failed_attempts: 0,
      locked_until: null,
      last_login_at: new Date().toISOString(),
    })
    .eq('id', account.id);

  // ── 7. Sign JWT + set cookie ──
  const token = await signSession({
    sub: account.id as string,
    role: account.role as 'super' | 'dept',
    home_dept_id: account.home_dept_id as string | null,
    session_version: account.session_version as number,
  });

  const env = getEnv();
  const isHttps = req.nextUrl.protocol === 'https:';

  const response = NextResponse.json({
    ok: true,
    user: {
      username: account.username,
      role: account.role,
      home_dept_id: account.home_dept_id,
    },
  });
  response.cookies.set({
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: isHttps, // local dev http → false; production https → true
    sameSite: 'lax',
    path: '/',
    maxAge: env.SESSION_TTL_SECONDS,
  });

  return response;
}
