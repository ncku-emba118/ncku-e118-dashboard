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
  isClassGatedHost,
  APP_HOST,
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
    expect(isClassGateExempt(p)).toBe(true);
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
    expect(isClassGateExempt(p)).toBe(false);
  });

});

describe('isClassGatedHost（只有 App 專用網址 / deploy preview / 本機套閘門）', () => {
  test('APP_HOST 常數', () => {
    expect(APP_HOST).toBe('ncku-emba-e118.aqualux.dev');
  });

  test.each([
    'ncku-emba-e118.aqualux.dev',
    'NCKU-EMBA-E118.aqualux.dev:443',
    'deploy-preview-6--ncku-e118.netlify.app',
    'deploy-preview-123--ncku-e118.netlify.app:443',
    'localhost',
    'localhost:3000',
    '127.0.0.1:3000',
    'ncku-emba-e118.aqualux.dev.',
    'NCKU-EMBA-E118.aqualux.dev.:443',
    'deploy-preview-6--ncku-e118.netlify.app.',
    '[::1]',
    '[::1]:3000',
  ])('%s → 套閘門', (h) => {
    expect(isClassGatedHost(h)).toBe(true);
  });

  test.each([
    null,
    '',
    'emba.aqualux.dev',
    'emba-resources.aqualux.dev',
    'ncku-e118.netlify.app',
    'ncku-emba-e118.aqualux.dev.evil.com',
    'xncku-emba-e118.aqualux.dev',
    'deploy-preview-6--ncku-e118.netlify.app.evil.com',
    'deploy-preview---ncku-e118.netlify.app',
    'deploy-preview-6--ncku-e118xnetlify.app',
    'localhost.evil.com',
    '127.0.0.2',
    'ncku-emba-e118.aqualux.dev..',
    'evil.com.',
    'emba.aqualux.dev.',
    '[::2]',
    '[::1',
    '::1]',
    '.',
  ])('%s → 不套（公開）', (h) => {
    expect(isClassGatedHost(h)).toBe(false);
  });
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
    '/class-login/',
    '/class-login/?next=%2Fclubs%2F',
    '/foo\nbar',
  ])('%s → /', (raw) => {
    expect(safeClassNext(raw as string | null)).toBe('/');
  });
});
