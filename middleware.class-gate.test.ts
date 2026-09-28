import { describe, expect, test, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * middleware.ts — 班級共用密碼（外層）整合測試。
 *
 * 重點是「兩層互不干擾」：
 *   • 外層：公開頁沒班級 cookie → 導 /class-login；有 → 放行
 *   • 內層：五組舊 matcher 路徑完全不看班級 cookie（LINE Bot 白名單照常免登入；
 *     班級 cookie 也不能拿來開 /board/admin、/api/board/*）
 * 真的簽 token / JWT，不 mock 驗證函式。
 */
beforeAll(() => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'a'.repeat(40);
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'b'.repeat(40);
  process.env.SESSION_SECRET = 'c'.repeat(32);
  process.env.IP_HASH_SECRET = 'd'.repeat(32);
  process.env.CLASS_GATE_SECRET = 'e'.repeat(40);
});

const { middleware, isLegacyAuthPath } = await import('./middleware');
const { signSession } = await import('./lib/auth/jwt');
const { signClassToken } = await import('./lib/auth/class-gate');

const SUB = '11111111-1111-4111-8111-111111111111';
const UUID = '22222222-2222-4222-8222-222222222222';

async function classCookie(): Promise<string> {
  return `class-sid=${await signClassToken()}`;
}

async function officerCookie(): Promise<string> {
  const token = await signSession({ sub: SUB, role: 'super', home_dept_id: null, session_version: 1 });
  return `sid=${token}`;
}

function makeReq(path: string, method = 'GET', cookie?: string, host?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  if (host) headers.host = host;
  return new NextRequest(`http://localhost:3000${path}`, { method, headers });
}

function isPassthrough(res: Response): boolean {
  return res.headers.get('x-middleware-next') === '1';
}

function redirectTarget(res: Response): URL | null {
  const loc = res.headers.get('location');
  return loc ? new URL(loc) : null;
}

const GATED_PAGES = [
  '/',
  '/calendar',
  '/clubs',
  '/annual',
  '/leads',
  '/officers',
  '/resources',
  '/board',
  `/board/post/${UUID}`,
  '/board/subscribe',
  '/assets/class.jpeg',
];

describe('外層：沒有班級 cookie → 導去 /class-login?next=', () => {
  test.each(GATED_PAGES)('GET %s', async (p) => {
    const res = await middleware(makeReq(p));
    expect(isPassthrough(res)).toBe(false);
    expect([307, 308]).toContain(res.status);
    const loc = redirectTarget(res)!;
    expect(loc.pathname).toBe('/class-login');
    expect(loc.searchParams.get('next')).toBe(p);
  });

  test('保留 query string 到 next', async () => {
    const res = await middleware(makeReq('/calendar?month=10'));
    expect(redirectTarget(res)!.searchParams.get('next')).toBe('/calendar?month=10');
  });

  test('非 /api/board 的 API → JSON 401（不 redirect）', async () => {
    const res = await middleware(makeReq('/api/something'));
    expect(res.status).toBe(401);
  });

  test('POST 到受保護頁面 → 401', async () => {
    const res = await middleware(makeReq('/', 'POST'));
    expect(res.status).toBe(401);
  });

  test('假 / 過期 / 竄改的班級 cookie → 照樣導走', async () => {
    for (const c of ['class-sid=garbage', 'class-sid=v1.9999999999.AAAA']) {
      const res = await middleware(makeReq('/', 'GET', c));
      expect(redirectTarget(res)?.pathname).toBe('/class-login');
    }
  });

  test('只有幹部 session（沒班級 cookie）→ 外層仍要班級密碼（兩層獨立）', async () => {
    const res = await middleware(makeReq('/', 'GET', await officerCookie()));
    expect(redirectTarget(res)?.pathname).toBe('/class-login');
  });
});

describe('外層：有效班級 cookie → 放行', () => {
  test.each(GATED_PAGES)('GET %s', async (p) => {
    const res = await middleware(makeReq(p, 'GET', await classCookie()));
    expect(isPassthrough(res)).toBe(true);
  });
});

describe('外層：豁免路徑沒 cookie 也放行', () => {
  test.each([
    '/class-login',
    '/board/login',
    '/admin/notify',
    '/api/notify/login',
    '/api/public/dashboard-feed',
    '/manifest.json',
    '/sw.js',
    '/assets/pwa-icon-192-v6.png',
  ])('GET %s', async (p) => {
    const res = await middleware(makeReq(p));
    expect(isPassthrough(res)).toBe(true);
  });

  test('POST /api/class-gate/login', async () => {
    const res = await middleware(makeReq('/api/class-gate/login', 'POST'));
    expect(isPassthrough(res)).toBe(true);
  });

  test('資源書院網域的根目錄 → 放行（會被改寫成公開 /resources）', async () => {
    const res = await middleware(makeReq('/', 'GET', undefined, 'emba-resources.aqualux.dev'));
    expect(isPassthrough(res)).toBe(true);
  });

  test('資源書院網域的班級照片 → 仍要班級密碼', async () => {
    const res = await middleware(makeReq('/assets/class.jpeg', 'GET', undefined, 'emba-resources.aqualux.dev'));
    expect(isPassthrough(res)).toBe(false);
  });
});

describe('內層不受影響：LINE Bot / cron 機器對機器白名單（沒有任何 cookie）', () => {
  test.each([
    ['POST', '/api/board/login'],
    ['POST', '/api/board/push/dispatch'],
    ['GET', '/api/board/push/dispatch'],
    ['POST', '/api/board/finance/income/sync'],
    ['POST', '/api/board/group-log'],
    ['POST', '/api/board/bot/chat'],
    ['POST', '/api/board/bot/cleanup'],
    ['GET', '/api/board/bot/cleanup'],
    ['POST', '/api/board/comments'],
    ['POST', '/api/board/subscribe'],
    ['GET', '/api/board/posts'],
    ['GET', `/api/board/posts/${UUID}`],
    ['GET', `/api/board/signoff/${UUID}`],
    ['GET', `/api/board/signoff/magic/${'a'.repeat(64)}`],
  ])('%s %s → 放行（不需要班級 cookie）', async (method, p) => {
    const res = await middleware(makeReq(p, method));
    expect(isPassthrough(res)).toBe(true);
  });
});

describe('內層不受影響：個人帳密保護照舊', () => {
  test('/board/admin 沒登入 → 仍導去 /board/login（不是 /class-login）', async () => {
    const res = await middleware(makeReq('/board/admin'));
    const loc = redirectTarget(res)!;
    expect(loc.pathname).toBe('/board/login');
    expect(loc.searchParams.get('next')).toBe('/board/admin');
  });

  test('班級 cookie 不能開 /board/admin（不能繞過個人帳密）', async () => {
    const res = await middleware(makeReq('/board/admin', 'GET', await classCookie()));
    expect(redirectTarget(res)?.pathname).toBe('/board/login');
  });

  test('班級 cookie 不能打受保護的 /api/board/*', async () => {
    const res = await middleware(makeReq('/api/board/class-password', 'POST', await classCookie()));
    expect(res.status).toBe(401);
    const res2 = await middleware(makeReq('/api/board/signoff', 'GET', await classCookie()));
    expect(res2.status).toBe(401);
  });

  test('幹部 session → /board/admin 放行（不需要班級 cookie）', async () => {
    const res = await middleware(makeReq('/board/admin', 'GET', await officerCookie()));
    expect(isPassthrough(res)).toBe(true);
  });

  test.each(['/finance', '/finance/signoff', '/budget', '/budget/signoff', '/staff'])(
    '%s 沒任何 cookie → 行為同改動前（middleware 放行，交給頁面自己判斷）',
    async (p) => {
      const res = await middleware(makeReq(p));
      expect(isPassthrough(res)).toBe(true);
    },
  );
});

describe('isLegacyAuthPath（分流判斷）', () => {
  test.each([
    '/board/admin',
    '/board/admin/new',
    '/api/board',
    '/api/board/login',
    '/finance',
    '/finance/signoff/x',
    '/budget',
    '/staff',
    '/board/%61dmin', // 編碼變體也歸內層（交給既有邏輯）
  ])('%s → 內層', (p) => {
    expect(isLegacyAuthPath(p)).toBe(true);
  });

  test.each(['/', '/board', '/board/login', '/board/adminx', '/finance-evil', '/staffroom', '/api/boardx'])(
    '%s → 外層',
    (p) => {
      expect(isLegacyAuthPath(p)).toBe(false);
    },
  );
});
