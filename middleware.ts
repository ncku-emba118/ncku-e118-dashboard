/**
 * Next.js middleware — guard /board/admin/* + /api/board/* 未登入 reject。
 *
 * 對應 ARCHITECTURE.md v3 第 6 章 + Codex #2 修正：
 *   • Sec F6 fix: matcher 加 /api/board/:path* 防未來 API 裸奔
 *   • 只驗 JWT 簽名 + exp + iss + aud + payload schema（無 DB query, edge-compatible）
 *   • session_version 比對由下游 admin server page / API route 做（需 DB）
 *   • PUBLIC_PATHS 白名單 /api/board/login 等不需登入即可訪問的 endpoint
 *   • API request → JSON 401；Page request → redirect /board/login?next=
 */
import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_NAME, verifySession } from './lib/auth/jwt';

/**
 * 白名單：這些 path 不需登入即可訪問（所有 method）。
 *
 * ⚠ Codex Round-3 fix: `/api/board/push/dispatch` 加白名單。
 *   原本 middleware 一律 401，但 dispatch route 自己已實作雙路徑驗證
 *   (Bearer CRON_SECRET || super session)。middleware 攔截會讓 Netlify cron
 *   永遠進不到 route → cron 失效。route 端為 source of truth。
 */
const PUBLIC_API_PATHS = new Set<string>([
  '/api/board/login',
  '/api/board/push/dispatch',
  // L1: LINE Bot 對帳收款連動。route 自己用 timing-safe Bearer BOT_SYNC_SECRET 把關
  // （同 push/dispatch 模式：機器對機器，無 session cookie，middleware 放行、route 為 source of truth）
  '/api/board/finance/income/sync',
  // 群組對話記錄：LINE Bot 上報群組發言（route 用 timing-safe Bearer BOT_SYNC_SECRET 把關，機器對機器）
  '/api/board/group-log',
  // L4: Bot 私訊聊天端點（route 用 timing-safe Bearer BOT_SYNC_SECRET 把關，機器對機器）
  '/api/board/bot/chat',
  // L4: Bot 對話清理 cron（route 用 timing-safe Bearer CRON_SECRET 把關，daily 跑）
  '/api/board/bot/cleanup',
]);

/**
 * POST-only 公開 path：anon user 可以 POST，但 PATCH/DELETE 仍需登入。
 */
const POST_PUBLIC_PATHS = new Set<string>([
  '/api/board/comments',   // 留言（半實名、IP HMAC 防 spam）
  '/api/board/subscribe',  // PWA push 訂閱（management_token 自驗 + endpoint allowlist）
]);

/**
 * GET-only 公開 pattern：這些 path 對 GET 公開（依 RLS 過濾資料），
 * 但 POST/PATCH/DELETE 仍需登入。Route handler 自己再驗 session。
 */
const GET_PUBLIC_PATTERNS: RegExp[] = [
  /^\/api\/board\/posts$/,                                              // GET 列表
  /^\/api\/board\/posts\/[a-fA-F0-9-]{36}$/,                            // GET 單篇（UUID）
  // 已核准單據公開摘要：只放行「單一文件詳情」GET（route 端只在 status==='approved' 回摘要）。
  // $ 錨定 + 只 36 字元 UUID，故 /sign /challenge /reject /void /delete /nudge /finalize
  // 等子路徑一律不匹配；且僅 GET 走此白名單，POST 到同 path 仍需登入。
  /^\/api\/board\/signoff\/[a-fA-F0-9-]{36}$/,                          // GET 單一簽核詳情（UUID）
];

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  if (PUBLIC_API_PATHS.has(path)) {
    return NextResponse.next();
  }

  if (request.method === 'POST' && POST_PUBLIC_PATHS.has(path)) {
    return NextResponse.next();
  }

  if (
    request.method === 'GET' &&
    GET_PUBLIC_PATTERNS.some((p) => p.test(path))
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return reject(request, path);
  }

  const session = await verifySession(token);
  if (!session) {
    return reject(request, path);
  }

  return NextResponse.next();
}

function reject(request: NextRequest, originalPath: string) {
  // API request：回 JSON 401，不 redirect（client fetch 端要處理）
  if (originalPath.startsWith('/api/')) {
    return NextResponse.json({ error: '未登入或 session 過期' }, { status: 401 });
  }
  // Page request：redirect 到 login 並帶 next 參數
  const url = request.nextUrl.clone();
  url.pathname = '/board/login';
  url.searchParams.set('next', originalPath);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/board/admin/:path*', '/api/board/:path*'],
};
