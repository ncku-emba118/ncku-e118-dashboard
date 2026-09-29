import { describe, expect, test, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';

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

const { middleware, isLegacyAuthPath, classifyAuthPath, config } = await import('./middleware');
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

/** host 預設 localhost:3000（本機開發 = 套閘門）；傳 null 代表請求沒有 Host header（改看 URL host） */
function makeReq(path: string, method = 'GET', cookie?: string, host: string | null = 'localhost:3000'): NextRequest {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  if (host !== null) headers.host = host;
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

describe('結尾斜線：不可無限重導（Deploy Preview 實測 P0）', () => {
  test.each(['/clubs/', '/calendar/', '/', '/clubs', '/board/', '/calendar/?month=10'])(
    'GET %s → Location pathname 恰好是 /class-login（無結尾斜線），query 只帶 next',
    async (p) => {
      const res = await middleware(makeReq(p));
      const loc = redirectTarget(res)!;
      expect(loc.pathname).toBe('/class-login');
      expect([...loc.searchParams.keys()]).toEqual(['next']);
      expect(loc.searchParams.get('next')).toBe(p);
    },
  );

  test.each([
    ['GET', '/class-login/'],
    ['GET', '/board/login/'],
    ['POST', '/api/class-gate/login/'],
    ['GET', '/api/class-gate/login/'],
  ])('%s %s（單一結尾斜線）→ 豁免放行', async (method, p) => {
    const res = await middleware(makeReq(p, method));
    expect(isPassthrough(res)).toBe(true);
  });

  test.each(['/class-login//', '/class-login/x', '/class-login%2F', '//', '/api/class-gate/login//'])(
    '%s → 仍被擋（不放寬）',
    async (p) => {
      const res = await middleware(makeReq(p));
      expect(isPassthrough(res)).toBe(false);
    },
  );

  test.each([...GATED_PAGES, '/clubs/', '/calendar/', '/board/', '/calendar/?month=10', '/class-login//'])(
    '循環防護：GET %s 的 redirect 目標再丟進 middleware → 不再 redirect',
    async (p) => {
      const first = await middleware(makeReq(p));
      const loc = redirectTarget(first)!;
      expect(loc).toBeTruthy();
      const second = await middleware(makeReq(`${loc.pathname}${loc.search}`));
      expect(second.headers.get('location')).toBeNull();
      expect(isPassthrough(second)).toBe(true);
    },
  );
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

});

/**
 * 2026-09-29 拍板：主站 emba.aqualux.dev 維持完全公開（與改動前正式站相同），
 * 班級密碼只套在 App 專用網址 ncku-emba-e118.aqualux.dev（+ deploy preview / 本機）。
 */
const HOST_TEST_PATHS = [
  '/',
  '/clubs/',
  '/calendar',
  '/assets/class.jpeg',
  '/_next/image?url=%2Fassets%2Fclass.jpeg&w=640&q=75',
  '/api/class-gate/nonexistent',
];

describe('非 App host → 外層不套閘門（公開，等同目前正式站）', () => {
  // 包含相似但不該匹配的 host：非 App host 本來就公開，所以預期行為是 next()，不是擋
  test.each([
    'emba.aqualux.dev',
    'EMBA.aqualux.dev:443',
    'emba-resources.aqualux.dev',
    'ncku-e118.netlify.app',
    'ncku-emba-e118.aqualux.dev.evil.com',
    'xncku-emba-e118.aqualux.dev',
    'deploy-preview-6--ncku-e118.netlify.app.evil.com',
    'deploy-preview-x--ncku-e118.netlify.app',
    'unknown.example',
  ])('host=%s：所有路徑 next()（不 redirect、不 401）', async (host) => {
    for (const p of HOST_TEST_PATHS) {
      for (const method of ['GET', 'POST']) {
        const res = await middleware(makeReq(p, method, undefined, host));
        expect(isPassthrough(res), `${method} ${p}`).toBe(true);
        expect(res.headers.get('location')).toBeNull();
      }
    }
  });
});

describe('沒有 Host header → 以 URL host 判斷（不 fail-open）', () => {
  function noHostReq(origin: string, p: string, cookie?: string) {
    const headers: Record<string, string> = {};
    if (cookie) headers.cookie = cookie;
    return new NextRequest(`${origin}${p}`, { headers });
  }

  test.each([
    'https://ncku-emba-e118.aqualux.dev',
    'https://deploy-preview-6--ncku-e118.netlify.app',
    'http://localhost:3000',
  ])('URL=%s → 被擋（頁面導 /class-login、API 401），有效 cookie 放行', async (origin) => {
    for (const p of HOST_TEST_PATHS) {
      const req = noHostReq(origin, p);
      expect(req.headers.get('host')).toBeNull();
      const res = await middleware(req);
      expect(isPassthrough(res), p).toBe(false);
      if (p.startsWith('/api/')) expect(res.status).toBe(401);
      else expect(redirectTarget(res)!.pathname).toBe('/class-login');
      const ok = await middleware(noHostReq(origin, p, await classCookie()));
      expect(isPassthrough(ok), `cookie ${p}`).toBe(true);
    }
  });

  test('URL=https://emba.aqualux.dev → 放行（主站公開）', async () => {
    for (const p of HOST_TEST_PATHS) {
      const res = await middleware(noHostReq('https://emba.aqualux.dev', p));
      expect(isPassthrough(res), p).toBe(true);
    }
  });
});

describe('App host → 套閘門', () => {
  test.each(['ncku-emba-e118.aqualux.dev', 'NCKU-EMBA-E118.aqualux.dev:443', 'deploy-preview-6--ncku-e118.netlify.app', '127.0.0.1:3000'])(
    'host=%s：沒 cookie → 頁面 307 /class-login、API 401；有效 cookie → 放行',
    async (host) => {
      for (const p of HOST_TEST_PATHS) {
        const res = await middleware(makeReq(p, 'GET', undefined, host));
        expect(isPassthrough(res), p).toBe(false);
        if (p.startsWith('/api/')) {
          expect(res.status).toBe(401);
        } else {
          expect(res.status).toBe(307);
          expect(redirectTarget(res)!.pathname).toBe('/class-login');
        }
        const ok = await middleware(makeReq(p, 'GET', await classCookie(), host));
        expect(isPassthrough(ok), `cookie ${p}`).toBe(true);
      }
    },
  );

  test('App host 的豁免路徑仍放行', async () => {
    const res = await middleware(makeReq('/class-login', 'GET', undefined, 'ncku-emba-e118.aqualux.dev'));
    expect(isPassthrough(res)).toBe(true);
  });
});

describe('主站 emba.aqualux.dev：內層（legacy）行為不變', () => {
  const MAIN = 'emba.aqualux.dev';

  test('/board/admin 無 session → /board/login', async () => {
    const res = await middleware(makeReq('/board/admin', 'GET', undefined, MAIN));
    expect(redirectTarget(res)?.pathname).toBe('/board/login');
  });

  test('/finance → next()', async () => {
    const res = await middleware(makeReq('/finance', 'GET', undefined, MAIN));
    expect(isPassthrough(res)).toBe(true);
  });

  test('/board/%61dmin → 404（編碼變體封鎖對所有 host 生效）', async () => {
    const res = await middleware(makeReq('/board/%61dmin', 'GET', undefined, MAIN));
    expect(res.status).toBe(404);
  });

  test('受保護 /api/board/* 無 session → 401', async () => {
    const res = await middleware(makeReq('/api/board/signoff', 'GET', undefined, MAIN));
    expect(res.status).toBe(401);
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

describe('編碼路徑繞過：原始 path 沒命中內層、decode 後才命中 → 一律 404', () => {
  // legacyAuthMiddleware() 內部用「未解碼」字串比對 REQUIRES_LOGIN_PREFIXES，
  // 若把編碼變體交給它會直接 NextResponse.next() 放行 → 兩層都沒擋。
  test.each([
    ['GET', '/board/%61dmin'],
    ['GET', '/board/%41dmin'],
    ['GET', '/board/%61dmin/new'],
    ['GET', '/api/board%2Fposts'],
    ['GET', '/api/%62oard/posts'],
    ['POST', '/api/%62oard/class-password'],
    ['GET', '/%66inance'],
    ['GET', '/fin%61nce'],
    ['GET', '/%62udget/settlement'],
    ['GET', '/st%61ff'],
  ])('%s %s → 404 no-store，不放行、不 redirect', async (method, p) => {
    for (const cookie of [undefined, await classCookie(), await officerCookie()]) {
      const res = await middleware(makeReq(p, method, cookie));
      expect(isPassthrough(res)).toBe(false);
      expect(res.status).toBe(404);
      expect(res.headers.get('location')).toBeNull();
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(res.headers.get('set-cookie')).toBeNull();
    }
  });

  test('/board/admin（未編碼、無 session）→ 仍導 /board/login', async () => {
    const res = await middleware(makeReq('/board/admin'));
    expect(redirectTarget(res)?.pathname).toBe('/board/login');
  });

  test.each(['/finance/%E4%B8%AD', '/finance/%E4%B8%AD%E6%96%87', '/budget/settlement/%E6%B8%AC'])(
    '合法中文 slug %s → 仍走內層（放行，行為不變）',
    async (p) => {
      const res = await middleware(makeReq(p));
      expect(isPassthrough(res)).toBe(true);
    },
  );

  test('decode 失敗的 malformed 編碼 → 走外層（deny-by-default）', async () => {
    const res = await middleware(makeReq('/board/%E0%A4%A'));
    expect(redirectTarget(res)?.pathname).toBe('/class-login');
  });
});

describe('classifyAuthPath / isLegacyAuthPath（分流判斷）', () => {
  test.each([
    '/board/admin',
    '/board/admin/new',
    '/api/board',
    '/api/board/login',
    '/finance',
    '/finance/signoff/x',
    '/finance/%E4%B8%AD',
    '/budget',
    '/staff',
  ])('%s → 內層', (p) => {
    expect(classifyAuthPath(p)).toBe('legacy');
    expect(isLegacyAuthPath(p)).toBe(true);
  });

  test.each(['/board/%61dmin', '/api/board%2Fposts', '/api/%62oard/x', '/fin%61nce', '/board/admin%2Fx'])(
    '%s → 編碼變體（不交給內層）',
    (p) => {
      expect(classifyAuthPath(p)).toBe('encoded_legacy');
      expect(isLegacyAuthPath(p)).toBe(false);
    },
  );

  test.each([
    '/',
    '/board',
    '/board/login',
    '/board/adminx',
    '/finance-evil',
    '/staffroom',
    '/api/boardx',
    '/board/%E0%A4%A', // malformed
  ])('%s → 外層', (p) => {
    expect(classifyAuthPath(p)).toBe('class_gate');
    expect(isLegacyAuthPath(p)).toBe(false);
  });
});

describe('config.matcher（unstable_doesMiddlewareMatch）', () => {
  const matches = (p: string) =>
    unstable_doesMiddlewareMatch({ config, url: `http://localhost:3000${p}` });

  test.each([
    '/',
    '/clubs',
    '/calendar',
    '/assets/x.jpeg',
    '/_next/image',
    '/_next/image?url=%2Fassets%2Fclass.jpeg&w=640&q=75',
    '/class-login',
    '/api/class-gate/login',
    '/finance',
    '/board/admin',
    '/board/%61dmin',
  ])('%s → middleware 會執行', (p) => {
    expect(matches(p)).toBe(true);
  });

  test.each(['/_next/static/chunks/x.js', '/_next/webpack-hmr'])('%s → 不執行（Next 建置產物 / HMR）', (p) => {
    expect(matches(p)).toBe(false);
  });
});
