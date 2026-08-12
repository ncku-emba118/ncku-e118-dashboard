import { describe, expect, test, vi, beforeEach, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * 敵對審查修正1 + 修正2 + 修正5 整合測試（magic 換發端點）。
 *
 * 不連真實 Supabase：dal 反查函式全 mock。真的執行 jwt sign/verify（需要
 * SESSION_SECRET 等 env），藉此驗證修正2「session 內容」而不是只信任 route
 * 回傳的 302 狀態碼——這是相容性斷言最有力的地方：解開換發出來的 cookie，
 * 確認 assignment 版完全沒有 magic_scope claim、TTL 也沒被動到。
 */
beforeAll(() => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'a'.repeat(40);
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'b'.repeat(40);
  process.env.SESSION_SECRET = 'c'.repeat(32);
  process.env.IP_HASH_SECRET = 'd'.repeat(32);
});

const mocks = vi.hoisted(() => ({
  getAssignmentByMagicTokenHash: vi.fn(),
  getDocumentByFinanceMagicTokenHash: vi.fn(),
}));

vi.mock('@/lib/signoff/dal', () => ({
  getAssignmentByMagicTokenHash: mocks.getAssignmentByMagicTokenHash,
  getDocumentByFinanceMagicTokenHash: mocks.getDocumentByFinanceMagicTokenHash,
}));

const { GET } = await import('./route');
const { verifySession } = await import('@/lib/auth/jwt');

const VALID_TOKEN = 'a'.repeat(64); // 64-hex 白名單格式
const DOC_ID = '33333333-3333-4333-8333-333333333333';
const ACCOUNT_ID = '44444444-4444-4444-8444-444444444444';

function makeReq(token: string) {
  return new NextRequest(`http://localhost:3000/api/board/signoff/magic/${token}`, {
    headers: { 'x-nf-client-connection-ip': '203.0.113.9' },
  });
}
function makeParams(token: string) {
  return { params: Promise.resolve({ token }) };
}

async function readSessionCookie(res: Response) {
  const setCookie = res.headers.get('set-cookie');
  expect(setCookie).toBeTruthy();
  const m = setCookie!.match(/(?:^|; )(?:sid|__Host-sid)=([^;]+)/);
  expect(m).not.toBeNull();
  const value = decodeURIComponent(m![1]);
  const payload = await verifySession(value);
  expect(payload).not.toBeNull();
  return { payload: payload!, raw: setCookie! };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/board/signoff/magic/[token] — 格式與限速', () => {
  test('非 64-hex 格式 → 302 導回登入，不觸 DB', async () => {
    const res = await GET(makeReq('not-a-valid-token'), makeParams('not-a-valid-token'));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('/board/login?from=magic');
    expect(mocks.getAssignmentByMagicTokenHash).not.toHaveBeenCalled();
  });
});

describe('GET /api/board/signoff/magic/[token] — assignment 版（敵對審查修正2 相容性）', () => {
  test('pending + routing → 換發完整權限 session：無 magic_scope，TTL 維持 14 天', async () => {
    mocks.getAssignmentByMagicTokenHash.mockResolvedValue({
      error: null,
      data: {
        documentId: DOC_ID,
        assignmentStatus: 'pending',
        docStatus: 'routing',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        account: { id: ACCOUNT_ID, role: 'dept', home_dept_id: 'activity', session_version: 1 },
      },
    });

    const res = await GET(makeReq(VALID_TOKEN), makeParams(VALID_TOKEN));
    expect(res.status).toBe(307); // NextResponse.redirect 預設 307（沒指定 status 的那個分支）
    expect(res.headers.get('location')).toContain(`/finance/signoff/${DOC_ID}`);
    expect(mocks.getDocumentByFinanceMagicTokenHash).not.toHaveBeenCalled(); // assignment 命中就不查 finance

    const { payload } = await readSessionCookie(res);
    expect(payload.sub).toBe(ACCOUNT_ID);
    expect(payload.magic_scope).toBeUndefined(); // 相容性核心斷言：assignment 版不帶 claim
    const cookieMaxAge = res.headers.get('set-cookie')!.match(/Max-Age=(\d+)/i);
    expect(cookieMaxAge).not.toBeNull();
    expect(Number(cookieMaxAge![1])).toBe(14 * 24 * 60 * 60); // 14 天，未被修正2動到
  });

  test('已簽（非 pending）→ 302 導回登入（舊連結失效，既有行為不變）', async () => {
    mocks.getAssignmentByMagicTokenHash.mockResolvedValue({
      error: null,
      data: {
        documentId: DOC_ID,
        assignmentStatus: 'signed',
        docStatus: 'routing',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        account: { id: ACCOUNT_ID, role: 'dept', home_dept_id: 'activity', session_version: 1 },
      },
    });
    const res = await GET(makeReq(VALID_TOKEN), makeParams(VALID_TOKEN));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('/board/login?from=magic');
  });
});

describe('GET /api/board/signoff/magic/[token] — finance 版（敵對審查修正1 + 修正2）', () => {
  function financeData(overrides: Partial<{
    docStatus: string;
    expiresAt: string | null;
    issuedSessionVersion: number | null;
    homeDeptId: string | null;
    currentSessionVersion: number;
  }> = {}) {
    return {
      documentId: DOC_ID,
      docStatus: overrides.docStatus ?? 'approved',
      expiresAt: overrides.expiresAt === undefined ? null : overrides.expiresAt,
      issuedSessionVersion: overrides.issuedSessionVersion === undefined ? 2 : overrides.issuedSessionVersion,
      account: {
        id: ACCOUNT_ID,
        role: 'dept' as const,
        home_dept_id: overrides.homeDeptId === undefined ? 'finance' : overrides.homeDeptId,
        session_version: overrides.currentSessionVersion ?? 2,
      },
    };
  }

  test('不設 TTL（expiresAt=null）+ session_version 相符 → 換發唯讀 scope session，30 分鐘 TTL', async () => {
    mocks.getAssignmentByMagicTokenHash.mockResolvedValue({ error: null, data: null });
    mocks.getDocumentByFinanceMagicTokenHash.mockResolvedValue({ error: null, data: financeData() });

    const res = await GET(makeReq(VALID_TOKEN), makeParams(VALID_TOKEN));
    expect(res.headers.get('location')).toContain(`/finance/signoff/${DOC_ID}`);

    const { payload } = await readSessionCookie(res);
    expect(payload.magic_scope).toEqual({ kind: 'finance_readonly', document_id: DOC_ID });
    const cookieMaxAge = res.headers.get('set-cookie')!.match(/Max-Age=(\d+)/i);
    expect(Number(cookieMaxAge![1])).toBe(30 * 60); // 修正2：短 TTL，不是 assignment 版的 14 天
  });

  test('連結重複兌換：同一 token 再打一次仍成功（修正1定案：不設 TTL、不消費 token）', async () => {
    mocks.getAssignmentByMagicTokenHash.mockResolvedValue({ error: null, data: null });
    mocks.getDocumentByFinanceMagicTokenHash.mockResolvedValue({ error: null, data: financeData() });

    const res1 = await GET(makeReq(VALID_TOKEN), makeParams(VALID_TOKEN));
    const res2 = await GET(makeReq(VALID_TOKEN), makeParams(VALID_TOKEN));
    expect(res1.headers.get('location')).toContain(`/finance/signoff/${DOC_ID}`);
    expect(res2.headers.get('location')).toContain(`/finance/signoff/${DOC_ID}`);
    // 修正1的關鍵行為證據：dal 沒有任何「清除 token」呼叫可觀察，這裡改為
    // 斷言 dal 反查函式確實被呼叫兩次（第二次沒有因為「已消費」而找不到資料）
    expect(mocks.getDocumentByFinanceMagicTokenHash).toHaveBeenCalledTimes(2);
  });

  test('session_version 與核發當下不一致（職務輪替 / 密碼重設）→ 302 導回登入', async () => {
    mocks.getAssignmentByMagicTokenHash.mockResolvedValue({ error: null, data: null });
    mocks.getDocumentByFinanceMagicTokenHash.mockResolvedValue({
      error: null,
      data: financeData({ issuedSessionVersion: 1, currentSessionVersion: 2 }),
    });
    const res = await GET(makeReq(VALID_TOKEN), makeParams(VALID_TOKEN));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('/board/login?from=magic');
  });

  test('帳號已不是財務長（home_dept_id 改變）→ 302 導回登入', async () => {
    mocks.getAssignmentByMagicTokenHash.mockResolvedValue({ error: null, data: null });
    mocks.getDocumentByFinanceMagicTokenHash.mockResolvedValue({
      error: null,
      data: financeData({ homeDeptId: 'activity' }),
    });
    const res = await GET(makeReq(VALID_TOKEN), makeParams(VALID_TOKEN));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('/board/login?from=magic');
  });

  test('issuedSessionVersion 為 null（修正1上線前舊資料）→ 無法驗證，拒絕', async () => {
    mocks.getAssignmentByMagicTokenHash.mockResolvedValue({ error: null, data: null });
    mocks.getDocumentByFinanceMagicTokenHash.mockResolvedValue({
      error: null,
      data: financeData({ issuedSessionVersion: null }),
    });
    const res = await GET(makeReq(VALID_TOKEN), makeParams(VALID_TOKEN));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('/board/login?from=magic');
  });

  test('文件非 approved → 302 導回登入', async () => {
    mocks.getAssignmentByMagicTokenHash.mockResolvedValue({ error: null, data: null });
    mocks.getDocumentByFinanceMagicTokenHash.mockResolvedValue({
      error: null,
      data: financeData({ docStatus: 'voided' }),
    });
    const res = await GET(makeReq(VALID_TOKEN), makeParams(VALID_TOKEN));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('/board/login?from=magic');
  });

  test('兩表都查無 → 302 導回登入（不區分「格式錯／查無／過期」，防列舉）', async () => {
    mocks.getAssignmentByMagicTokenHash.mockResolvedValue({ error: null, data: null });
    mocks.getDocumentByFinanceMagicTokenHash.mockResolvedValue({ error: null, data: null });
    const res = await GET(makeReq(VALID_TOKEN), makeParams(VALID_TOKEN));
    expect(res.status).toBe(302);
  });
});
