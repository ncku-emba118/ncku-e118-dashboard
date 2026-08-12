import { describe, expect, test, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * middleware.ts — magic_scope 第一層防線的整合測試。
 *
 * 真的執行 signSession/verifySession（需要 SESSION_SECRET 等 env，比照
 * app/api/board/signoff/magic/[token]/route.test.ts 的作法），確保測的是
 * 「真的簽過名的 cookie 打進 middleware() 之後的行為」，不是只 mock 掉
 * verifySession 自己講自己爽。
 *
 * 不連真實 Supabase：middleware 這一層本來就只驗 JWT 簽名/exp（不查 DB），
 * 這是既有設計（見 middleware.ts 檔頭），跟這次改動無關。
 */
beforeAll(() => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'a'.repeat(40);
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'b'.repeat(40);
  process.env.SESSION_SECRET = 'c'.repeat(32);
  process.env.IP_HASH_SECRET = 'd'.repeat(32);
});

const { middleware } = await import('./middleware');
const { signSession } = await import('./lib/auth/jwt');

const SUB = '11111111-1111-4111-8111-111111111111';
const DOC_A = '22222222-2222-4222-8222-222222222222';
const DOC_B = '33333333-3333-4333-8333-333333333333';

async function magicCookie(documentId: string): Promise<string> {
  const token = await signSession({
    sub: SUB,
    role: 'dept',
    home_dept_id: 'finance',
    session_version: 1,
    magic_scope: { kind: 'finance_readonly', document_id: documentId },
  });
  return `sid=${token}`;
}

async function fullCookie(): Promise<string> {
  const token = await signSession({
    sub: SUB,
    role: 'dept',
    home_dept_id: 'finance',
    session_version: 1,
  });
  return `sid=${token}`;
}

function makeReq(path: string, method: string, cookie?: string): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    method,
    headers: cookie ? { cookie } : undefined,
  });
}

/** NextResponse.next() 帶這個 header；其他任何回應（包含我們自己組的 404）都不會有。 */
function isPassthrough(res: Response): boolean {
  return res.headers.get('x-middleware-next') === '1';
}

describe('middleware — magic_scope allowlist（正面案例：兩個合法進入點）', () => {
  test('GET /finance/signoff/[id]，id 相符 → 放行', async () => {
    const cookie = await magicCookie(DOC_A);
    const res = await middleware(makeReq(`/finance/signoff/${DOC_A}`, 'GET', cookie));
    expect(isPassthrough(res)).toBe(true);
  });

  test('GET /api/board/signoff/[id]，id 相符 → 放行', async () => {
    const cookie = await magicCookie(DOC_A);
    const res = await middleware(makeReq(`/api/board/signoff/${DOC_A}`, 'GET', cookie));
    expect(isPassthrough(res)).toBe(true);
  });
});

describe('middleware — magic_scope allowlist（負面案例：id 不符 / 動作不符）', () => {
  test('GET /finance/signoff/[id]，id 不符（想用連結看別的文件）→ 404', async () => {
    const cookie = await magicCookie(DOC_A);
    const res = await middleware(makeReq(`/finance/signoff/${DOC_B}`, 'GET', cookie));
    expect(res.status).toBe(404);
    expect(isPassthrough(res)).toBe(false);
  });

  test('GET /api/board/signoff/[id]，id 不符 → 404 JSON，訊息與 access.ts 一致', async () => {
    const cookie = await magicCookie(DOC_A);
    const res = await middleware(makeReq(`/api/board/signoff/${DOC_B}`, 'GET', cookie));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: '找不到該簽核文件' });
  });

  test('POST /api/board/signoff/[id]/finance-link（id 相符但是寫入動作）→ 404', async () => {
    const cookie = await magicCookie(DOC_A);
    const res = await middleware(makeReq(`/api/board/signoff/${DOC_A}/finance-link`, 'POST', cookie));
    expect(res.status).toBe(404);
  });
});

describe('middleware — magic_scope allowlist（本輪修正列出的所有已知繞過點，逐一驗證已擋下）', () => {
  const BYPASSED: Array<{ method: string; path: string }> = [
    { method: 'GET', path: '/api/board/finance/income' },
    { method: 'POST', path: '/api/board/finance/income' },
    { method: 'GET', path: '/api/board/signoff' },
    { method: 'POST', path: '/api/board/signoff' },
    { method: 'POST', path: '/api/board/signoff/upload-url' },
    { method: 'GET', path: '/api/board/signoff/accounts' },
    { method: 'POST', path: `/api/board/signoff/${DOC_A}/delete` },
    { method: 'GET', path: '/staff' },
    { method: 'GET', path: '/budget/settlement/summer-camp' },
    { method: 'GET', path: '/board/admin' },
  ];

  test.each(BYPASSED)('$method $path → 404（帶合法 magic_scope cookie 也一樣）', async ({ method, path }) => {
    const cookie = await magicCookie(DOC_A);
    const res = await middleware(makeReq(path, method, cookie));
    expect(res.status).toBe(404);
    expect(isPassthrough(res)).toBe(false);
  });
});

describe('middleware — 相容性鐵律：無 magic_scope 的 session 行為完全不變', () => {
  test('完整登入 session 打 /board/admin → 放行（原本就需要登入、且真的登入了）', async () => {
    const cookie = await fullCookie();
    const res = await middleware(makeReq('/board/admin', 'GET', cookie));
    expect(isPassthrough(res)).toBe(true);
  });

  test('沒有 cookie 打 /board/admin → 401/redirect（原本行為，不因這次改動而變寬鬆）', async () => {
    const res = await middleware(makeReq('/board/admin', 'GET'));
    expect(isPassthrough(res)).toBe(false);
    expect([302, 307, 401]).toContain(res.status);
  });

  test('完整登入 session 打 /api/board/finance/income → 放行（未受影響）', async () => {
    const cookie = await fullCookie();
    const res = await middleware(makeReq('/api/board/finance/income', 'GET', cookie));
    expect(isPassthrough(res)).toBe(true);
  });

  test('沒有 cookie（訪客）打 /finance → 放行（頁面本身免登入可看，matcher 擴大不能新增登入門檻）', async () => {
    const res = await middleware(makeReq('/finance', 'GET'));
    expect(isPassthrough(res)).toBe(true);
  });

  test('沒有 cookie（訪客）打 /budget/settlement/summer-camp → 放行（同上，公開結算頁）', async () => {
    const res = await middleware(makeReq('/budget/settlement/summer-camp', 'GET'));
    expect(isPassthrough(res)).toBe(true);
  });

  test('沒有 cookie（訪客）打 /staff → 放行 middleware 層（頁面自己 redirect，不是 middleware 擋）', async () => {
    const res = await middleware(makeReq('/staff', 'GET'));
    expect(isPassthrough(res)).toBe(true);
  });

  test('沒有 cookie 打 /api/board/signoff/[id]（GET 公開摘要白名單）→ 放行', async () => {
    const res = await middleware(makeReq(`/api/board/signoff/${DOC_A}`, 'GET'));
    expect(isPassthrough(res)).toBe(true);
  });
});
