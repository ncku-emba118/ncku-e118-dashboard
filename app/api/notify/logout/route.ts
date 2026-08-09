/** POST /api/notify/logout — 清掉手動通知 session cookie。 */
import { NextResponse, type NextRequest } from 'next/server';
import { NOTIFY_COOKIE_NAME } from '@/lib/notify/session';

export async function POST(req: NextRequest) {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: NOTIFY_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure:
      req.nextUrl.protocol === 'https:' ||
      req.headers.get('x-forwarded-proto') === 'https' ||
      process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return res;
}
