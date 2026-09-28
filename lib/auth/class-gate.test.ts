import { describe, expect, test, beforeAll, afterEach } from 'vitest';

/**
 * lib/auth/class-gate.ts — 班級 token 簽/驗 + 豁免路徑規則。
 * lib/auth/class-safe-next.ts — ?next= 防開放重導向。
 */
const SECRET = 'k'.repeat(40);

beforeAll(() => {
  process.env.CLASS_GATE_SECRET = SECRET;
});

afterEach(() => {
  process.env.CLASS_GATE_SECRET = SECRET;
});

const {
  signClassToken,
  verifyClassToken,
  isClassGateExempt,
  isClassGateConfigured,
  CLASS_SESSION_TTL_SECONDS,
} = await import('./class-gate');
const { safeClassNext } = await import('./class-safe-next');

describe('班級 token 簽章', () => {
  test('剛簽的 token 驗得過', async () => {
    const t = await signClassToken();
    expect(await verifyClassToken(t)).toBe(true);
  });

  test('過期 → false', async () => {
    const past = Date.now() - (CLASS_SESSION_TTL_SECONDS + 10) * 1000;
    const t = await signClassToken(past);
    expect(await verifyClassToken(t)).toBe(false);
  });

  test('89 天後仍有效、91 天後失效', async () => {
    const t = await signClassToken();
    const day = 24 * 60 * 60 * 1000;
    expect(await verifyClassToken(t, Date.now() + 89 * day)).toBe(true);
    expect(await verifyClassToken(t, Date.now() + 91 * day)).toBe(false);
  });

  test('竄改 exp（延長期限）→ 簽章不符', async () => {
    const t = await signClassToken();
    const [v, exp, sig] = t.split('.');
    const forged = `${v}.${Number(exp) + 60}.${sig}`;
    expect(await verifyClassToken(forged)).toBe(false);
  });

  test('竄改簽章 → false', async () => {
    const t = await signClassToken();
    const last = t.slice(-1) === 'A' ? 'B' : 'A';
    expect(await verifyClassToken(t.slice(0, -1) + last)).toBe(false);
  });

  test('簽章最後一字元的 padding bit 變體 → false（只接受標準編碼）', async () => {
    const t = await signClassToken();
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const last = t.slice(-1);
    const idx = alphabet.indexOf(last);
    // 同一組高 4 bit、只有低 2 bit（padding）不同的另外 3 個字元
    for (let low = 0; low < 4; low++) {
      const variant = alphabet[(idx & ~3) | low];
      if (variant === last) continue;
      expect(await verifyClassToken(t.slice(0, -1) + variant)).toBe(false);
    }
  });

  test('換 secret 後舊 token 全部失效（緊急撤銷手段）', async () => {
    const t = await signClassToken();
    process.env.CLASS_GATE_SECRET = 'z'.repeat(40);
    expect(await verifyClassToken(t)).toBe(false);
  });

  test('secret 未設定 / 太短 → 驗證一律 false、簽章 throw', async () => {
    const t = await signClassToken();
    delete process.env.CLASS_GATE_SECRET;
    expect(isClassGateConfigured()).toBe(false);
    expect(await verifyClassToken(t)).toBe(false);
    await expect(signClassToken()).rejects.toThrow();
    process.env.CLASS_GATE_SECRET = 'short';
    expect(await verifyClassToken(t)).toBe(false);
  });

  test('垃圾輸入 → false（不 throw）', async () => {
    for (const bad of [
      undefined,
      null,
      '',
      'v1',
      'v1..',
      'v2.9999999999.abc',
      'v1.abc.def',
      'v1.9999999999.!!!',
      'x'.repeat(500),
      // 幹部 JWT 長相的東西也不會被接受
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.sig',
    ]) {
      expect(await verifyClassToken(bad as string)).toBe(false);
    }
  });

  test('exp 超過 TTL 上限（secret 外洩亂簽的特徵）→ false', async () => {
    // 用 now 往後推 200 天簽，再用現在時間驗
    const t = await signClassToken(Date.now() + 200 * 24 * 60 * 60 * 1000);
    expect(await verifyClassToken(t)).toBe(false);
  });
});

describe('豁免路徑（未帶班級 cookie 也放行）', () => {
  const MAIN = 'emba.aqualux.dev';

  test.each([
    '/class-login',
    '/api/class-gate/login',
    '/board/login',
    '/admin/notify',
    '/api/notify/login',
    '/api/notify/send',
    '/api/public/dashboard-feed',
    '/manifest.json',
    '/sw.js',
    '/og-thumb-v2.png',
    '/assets/pwa-icon-192-v6.png',
    '/assets/pwa-icon-maskable-512-v6.png',
    '/assets/ncku-emba-logo.png',
  ])('%s → 豁免', (p) => {
    expect(isClassGateExempt(p, MAIN)).toBe(true);
  });

  test.each([
    '/',
    '/calendar',
    '/clubs',
    '/clubs/index.html',
    '/annual',
    '/leads',
    '/officers',
    '/resources',
    '/board',
    '/board/post/11111111-1111-4111-8111-111111111111',
    '/board/subscribe',
    '/assets/class.jpeg',
    '/assets/officers/south.jpeg',
    '/assets/E118-guide.pdf',
    '/_next/image',
    '/board/login/extra',
    '/class-login/x',
    '/api/class-gate/other',
    '/api/public/other',
    '/admin/notify-evil',
    // 編碼繞過：原始或 decode 後任一不在豁免清單就擋
    '/board/logi%6e/../../calendar',
    '/%63lass-login',
    '/assets/pwa-icon-%2e%2e.png',
    '/bad%zz',
  ])('%s → 需要班級密碼', (p) => {
    expect(isClassGateExempt(p, MAIN)).toBe(false);
  });

  test('host 不帶 / 帶 port 都一樣判斷', () => {
    expect(isClassGateExempt('/', null)).toBe(false);
    expect(isClassGateExempt('/', 'localhost:3000')).toBe(false);
  });
});

describe('資源書院網域（emba-resources.aqualux.dev）', () => {
  const RH = 'emba-resources.aqualux.dev';

  test.each(['/', '/resources', '/board', '/calendar', '/class-login', '/anything'])(
    '%s → 放行（next.config beforeFiles 會改寫成公開的 /resources）',
    (p) => {
      expect(isClassGateExempt(p, RH)).toBe(true);
    },
  );

  test('帶 port / 大寫 host 也認得', () => {
    expect(isClassGateExempt('/', 'EMBA-RESOURCES.aqualux.dev:443')).toBe(true);
  });

  test('資源書院自己的圖 → 放行', () => {
    expect(isClassGateExempt('/assets/resources/campus-hero.jpg', RH)).toBe(true);
    expect(isClassGateExempt('/assets/ncku-emba-logo.png', RH)).toBe(true);
  });

  test.each(['/assets/class.jpeg', '/assets/officers/south.jpeg', '/assets/E118-guide.pdf', '/_next/image', '/%61ssets/class.jpeg'])(
    '%s → 仍需班級密碼（/assets 不會被改寫，不能從這個網域外流）',
    (p) => {
      expect(isClassGateExempt(p, RH)).toBe(false);
    },
  );
});

describe('safeClassNext（防開放重導向）', () => {
  test.each([
    ['/calendar', '/calendar'],
    ['/board/post/abc?x=1#y', '/board/post/abc?x=1#y'],
    ['/', '/'],
  ])('%s → %s', (raw, want) => {
    expect(safeClassNext(raw)).toBe(want);
  });

  test.each([
    null,
    '',
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    '/class-login',
    '/class-login?next=/x',
    '/foo\nbar',
  ])('%s → /', (raw) => {
    expect(safeClassNext(raw as string | null)).toBe('/');
  });
});
