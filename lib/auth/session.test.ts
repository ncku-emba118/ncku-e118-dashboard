import { describe, expect, test, vi, beforeEach } from 'vitest';

/**
 * readSession() 第二層防線（見 magic-allowlist.ts 檔頭 + session.ts
 * ReadSessionOptions 檔頭）：
 *
 *   • 預設（不傳 options，或 allowMagicScope !== true）：payload 帶
 *     magic_scope 時一律回 null，完全不查 DB。這是「敵對審查判定不可上線」
 *     之後補上的防線——原本任何呼叫 readSession() 而沒有另外呼叫
 *     requireSignoffAccess 的 route/page，都會把磁力 session 當成完整正常
 *     session。
 *   • `{ allowMagicScope: true }`：payload 帶 magic_scope 時正常查 DB、回傳
 *     完整 session（含 magic_scope claim），行為與加這層之前一致。
 *   • 無 magic_scope 的 payload：不管 options 是什麼，行為完全不受影響
 *     （相容性鐵律——密碼登入 / assignment magic session 零 regression）。
 *
 * 全部依賴（cookies() / verifySession / supabase）都 mock，不連真實
 * Supabase。
 */

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  cookieGet: vi.fn(),
  verifySession: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: mocks.cookieGet }),
}));

vi.mock('./jwt', () => ({
  COOKIE_NAME: 'sid',
  verifySession: mocks.verifySession,
}));

vi.mock('../supabase/server', () => ({
  getServerClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: mocks.maybeSingle,
        }),
      }),
    }),
  }),
}));

const { readSession } = await import('./session');

const SUB = '11111111-1111-4111-8111-111111111111';
const DOC = '22222222-2222-4222-8222-222222222222';

const ACCOUNT_ROW = {
  username: '財務長',
  session_version: 1,
  role: 'dept' as const,
  home_dept_id: 'finance',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cookieGet.mockReturnValue({ value: 'fake-token' });
  mocks.maybeSingle.mockResolvedValue({ data: ACCOUNT_ROW, error: null });
});

describe('readSession — 無 magic_scope（相容性鐵律）', () => {
  test('不傳 options：行為與加這層之前一致，查 DB 回完整 session', async () => {
    mocks.verifySession.mockResolvedValue({
      sub: SUB,
      role: 'dept',
      home_dept_id: 'finance',
      session_version: 1,
    });
    const session = await readSession();
    expect(session).not.toBeNull();
    expect(session!.sub).toBe(SUB);
    expect(session!.username).toBe('財務長');
    expect(session!.magic_scope).toBeUndefined();
    expect(mocks.maybeSingle).toHaveBeenCalledTimes(1);
  });

  test('傳 { allowMagicScope: true } 但 payload 沒有 magic_scope：不受影響', async () => {
    mocks.verifySession.mockResolvedValue({
      sub: SUB,
      role: 'dept',
      home_dept_id: 'finance',
      session_version: 1,
    });
    const session = await readSession({ allowMagicScope: true });
    expect(session).not.toBeNull();
    expect(session!.sub).toBe(SUB);
  });
});

describe('readSession — 帶 magic_scope', () => {
  const PAYLOAD_WITH_SCOPE = {
    sub: SUB,
    role: 'dept' as const,
    home_dept_id: 'finance',
    session_version: 1,
    magic_scope: { kind: 'finance_readonly' as const, document_id: DOC },
  };

  test('預設（不傳 options）→ null，且完全不查 DB（第二層核心斷言）', async () => {
    mocks.verifySession.mockResolvedValue(PAYLOAD_WITH_SCOPE);
    const session = await readSession();
    expect(session).toBeNull();
    expect(mocks.maybeSingle).not.toHaveBeenCalled();
  });

  test('allowMagicScope: false（顯式）→ 仍是 null', async () => {
    mocks.verifySession.mockResolvedValue(PAYLOAD_WITH_SCOPE);
    const session = await readSession({ allowMagicScope: false });
    expect(session).toBeNull();
  });

  test('allowMagicScope: true → 正常查 DB，回傳完整 session 且保留 magic_scope claim', async () => {
    mocks.verifySession.mockResolvedValue(PAYLOAD_WITH_SCOPE);
    const session = await readSession({ allowMagicScope: true });
    expect(session).not.toBeNull();
    expect(session!.sub).toBe(SUB);
    expect(session!.magic_scope).toEqual({ kind: 'finance_readonly', document_id: DOC });
    expect(mocks.maybeSingle).toHaveBeenCalledTimes(1);
  });
});

describe('readSession — 既有行為不變的邊界情況', () => {
  test('沒有 cookie → null', async () => {
    mocks.cookieGet.mockReturnValue(undefined);
    const session = await readSession({ allowMagicScope: true });
    expect(session).toBeNull();
    expect(mocks.verifySession).not.toHaveBeenCalled();
  });

  test('JWT 驗證失敗 → null', async () => {
    mocks.verifySession.mockResolvedValue(null);
    const session = await readSession({ allowMagicScope: true });
    expect(session).toBeNull();
  });

  test('session_version 與 DB 不符 → null（即使 allowMagicScope: true）', async () => {
    mocks.verifySession.mockResolvedValue({
      sub: SUB,
      role: 'dept',
      home_dept_id: 'finance',
      session_version: 1,
      magic_scope: { kind: 'finance_readonly', document_id: DOC },
    });
    mocks.maybeSingle.mockResolvedValue({
      data: { ...ACCOUNT_ROW, session_version: 2 },
      error: null,
    });
    const session = await readSession({ allowMagicScope: true });
    expect(session).toBeNull();
  });
});
