/**
 * POST /api/board/class-password — 更換班級共用密碼（外層閘門）。
 *
 * body: { password: string }
 *
 * 權限：super only（班代 / 副班代 / 秘書）。
 *   • 放在 /api/board/* → middleware 內層既有邏輯先擋未登入（不在任何白名單）
 *   • route 端再 readSession()（含 session_version 比對、magic_scope 一律當未登入）
 *   • CSRF 同源檢查（對齊 line-routing/set）
 *
 * ⚠ 換密碼不會踢掉已經登入的同學（90 天 cookie 仍有效，見 lib/auth/class-gate.ts）。
 */
import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/lib/auth/session';
import { isSameOrigin } from '@/lib/signoff/http';
import { setClassPassword, validateNewClassPassword } from '@/lib/auth/class-gate-server';

const MAX_BODY_BYTES = 1024;

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: '來源驗證失敗' }, { status: 403 });
  }

  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: '請先登入' }, { status: 401 });
  }
  if (session.role !== 'super') {
    return NextResponse.json({ error: '無權限' }, { status: 403 });
  }

  const contentLength = Number(req.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: '請求過大' }, { status: 413 });
  }

  const body = (await req.json().catch(() => null)) as { password?: unknown } | null;
  if (!body || typeof body.password !== 'string') {
    return NextResponse.json({ error: '請輸入新密碼' }, { status: 400 });
  }
  const invalid = validateNewClassPassword(body.password);
  if (invalid) {
    return NextResponse.json({ error: invalid }, { status: 400 });
  }

  const result = await setClassPassword(body.password, session.sub);
  if (!result.ok) {
    console.error('[class_gate.password_change_failed]', { accountId: session.sub, error: result.error });
    return NextResponse.json({ error: '儲存失敗，請稍後再試' }, { status: 503 });
  }

  console.info('[class_gate.password_changed]', { accountId: session.sub, username: session.username });
  return NextResponse.json({ ok: true });
}
