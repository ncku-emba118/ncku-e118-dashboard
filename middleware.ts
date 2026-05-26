/**
 * Next.js middleware — guard /board/admin/* 未登入轉 /board/login
 *
 * 對應 ARCHITECTURE.md v3 第 6 章 middleware：
 *   • 只驗 JWT 簽名 + exp + iss + aud（無 DB query, edge-compatible）
 *   • session_version 比對由下游 admin page / API route 做（需 DB）
 *   • Token 缺失 / invalid → redirect /board/login?next=<original-path>
 */
import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_NAME, verifySession } from './lib/auth/jwt';

export async function middleware(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (!token) {
    return redirectToLogin(request);
  }

  const session = await verifySession(token);
  if (!session) {
    return redirectToLogin(request);
  }

  return NextResponse.next();
}

function redirectToLogin(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = '/board/login';
  url.searchParams.set('next', request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/board/admin/:path*'],
};
