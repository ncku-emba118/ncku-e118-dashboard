/**
 * POST /api/notify/login — 秘書手動通知頁的 4 位數 PIN 驗證。
 *
 * ⚠ 路徑刻意放在 /api/notify/*（不是 /api/board/*）：
 *   middleware.ts 的 matcher 只涵蓋 /board/admin/* 與 /api/board/*，
 *   放這裡就不會被幹部 JWT middleware 攔下，也**不需要動既有 middleware.ts 白名單**。
 *   代價是每支 route 都要自己驗 session — 本檔以下每支都有做。
 *
 * 安全設計比照既有 app/api/board/login/route.ts：
 *   • Content-Length 上限
 *   • 每 IP 每分鐘 5 次（in-memory bucket，Netlify Function instance scope）
 *   • server 端強制 /^\d{4}$/
 *   • timing-safe 比對
 *   • cookie httpOnly + Secure(prod) + SameSite=Lax + Path=/
 *
 * PIN 值來源：環境變數 NOTIFY_PIN（見 lib/notify/session.ts）。未設定 → 一律 503，不放行。
 */
import { NextResponse, type NextRequest } from 'next/server';
import { resolveClientIp } from '@/lib/ip-resolve';
import {
  NOTIFY_COOKIE_NAME,
  NOTIFY_SESSION_TTL_SECONDS,
  getConfiguredPin,
  safeEqualPin,
  signNotifySession,
} from '@/lib/notify/session';

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

function isHttpsContext(req: NextRequest): boolean {
  return (
    req.nextUrl.protocol === 'https:' ||
    req.headers.get('x-forwarded-proto') === 'https' ||
    process.env.NODE_ENV === 'production'
  );
}

export async function POST(req: NextRequest) {
  const traceId = crypto.randomUUID();

  if (Number(req.headers.get('content-length') || 0) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: '請求過大' }, { status: 413 });
  }

  const ip = resolveClientIp(req);
  if (!ip) {
    console.warn('[notify.login.no_client_ip]', { traceId });
    return NextResponse.json({ error: '系統無法識別來源，請稍後再試' }, { status: 503 });
  }
  if (!checkIpRateLimit(ip)) {
    console.info('[notify.login.rate_limit]', { traceId });
    return NextResponse.json({ error: '嘗試次數過多，請一分鐘後再試' }, { status: 429 });
  }

  const configured = getConfiguredPin();
  if (!configured) {
    console.error('[notify.login.pin_not_configured]', {
      traceId,
      detail: '環境變數 NOTIFY_PIN 未設定或不是 4 位數字，fail-closed 拒絕登入',
    });
    return NextResponse.json({ error: '系統尚未設定通知密碼，請聯繫管理員' }, { status: 503 });
  }

  const body = (await req.json().catch(() => null)) as { pin?: unknown } | null;
  if (!body || typeof body.pin !== 'string' || !/^\d{4}$/.test(body.pin)) {
    return NextResponse.json({ error: '請輸入 4 位數密碼' }, { status: 400 });
  }

  if (!safeEqualPin(body.pin, configured)) {
    console.info('[notify.login.bad_pin]', { traceId });
    return NextResponse.json({ error: '密碼錯誤' }, { status: 401 });
  }

  const token = await signNotifySession();
  const res = NextResponse.json({ ok: true });
  res.headers.set('x-trace-id', traceId);
  res.cookies.set({
    name: NOTIFY_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: isHttpsContext(req),
    sameSite: 'lax',
    path: '/',
    maxAge: NOTIFY_SESSION_TTL_SECONDS,
  });
  console.info('[notify.login.success]', { traceId });
  return res;
}
