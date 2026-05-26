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
 * 白名單：這些 path 不需登入即可訪問。
 * 未來新增 public API（例如 /api/board/comments POST、/api/board/posts GET）時也要加進來。
 */
const PUBLIC_API_PATHS = new Set<string>([
  '/api/board/login',
]);

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  if (PUBLIC_API_PATHS.has(path)) {
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
