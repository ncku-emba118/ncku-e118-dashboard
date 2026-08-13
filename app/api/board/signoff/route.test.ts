import { describe, expect, test, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

/**
 * POST /api/board/signoff — 0027 兩項新規則：
 *   1. 財務長強制為必選簽核人，且一律排在最後一關（前端就算沒帶/亂帶都要被
 *      後端矯正）；查無 / 多筆財務長一律明確 400 擋下建單。
 *   2. 收款帳號欄位 sanitize 失敗要擋下建單；成功時要一路帶進
 *      generateSignoffSheet 與 createSignoffDocument。
 *
 * 全部依賴（session / dal / pdf / notify / permission）都 mock，
 * 不連真實 Supabase、不打真實 LINE webhook、不吃真實 PDF 引擎。
 */

// zod uuid() 要求版本 nibble [1-8] + 變體 nibble [89ab]（第三/第四段開頭），
// 純數字/字母湊出的假 uuid 不一定合法，這裡固定用 4xxx-8xxx 湊出合法格式。
const FINANCE_ID = 'f0000000-0000-4000-8000-000000000001';
const DEPT_HEAD_ID = 'a0000000-0000-4000-8000-000000000002';
const SESSION_SUB = 'b0000000-0000-4000-8000-00000000000b';

const mocks = vi.hoisted(() => ({
  readSession: vi.fn(),
  findSoleFinanceOfficer: vi.fn(),
  notifyApprovalRequested: vi.fn(),
  createSignoffDocument: vi.fn(),
  downloadObject: vi.fn(),
  getAccountsByIds: vi.fn(),
  uploadObject: vi.fn(),
  listInbox: vi.fn(),
  listCreatedBy: vi.fn(),
  listSignedByMe: vi.fn(),
  generateSignoffSheet: vi.fn(),
  canInitiateSettlementSignoff: vi.fn(),
  resolveClientIp: vi.fn(),
  hashIp: vi.fn(),
}));

// 完整取代（不 importOriginal）：真正的 session.ts 開頭 `import 'server-only'`，
// 在 vitest node 環境下會直接炸掉（見 finalize/route.test.ts 同樣的處理方式）。
// ALL_DEPTS 只需要「非空、每筆有 id」即可滿足 route.ts 頂層 DEPT_IDS 建構；
// 測試案例都不觸碰 owner_dept_id 驗證分支，內容值本身不影響任何斷言。
vi.mock('@/lib/auth/session', () => ({
  readSession: mocks.readSession,
  ALL_DEPTS: [
    { id: 'secretary', name: '秘書' },
    { id: 'finance', name: '財務' },
  ],
}));
vi.mock('@/lib/board/signoff_notify', () => ({
  notifyApprovalRequested: mocks.notifyApprovalRequested,
  findSoleFinanceOfficer: mocks.findSoleFinanceOfficer,
}));
vi.mock('@/lib/signoff/dal', () => ({
  createSignoffDocument: mocks.createSignoffDocument,
  downloadObject: mocks.downloadObject,
  getAccountsByIds: mocks.getAccountsByIds,
  uploadObject: mocks.uploadObject,
  listInbox: mocks.listInbox,
  listCreatedBy: mocks.listCreatedBy,
  listSignedByMe: mocks.listSignedByMe,
}));
vi.mock('@/lib/signoff/pdf', () => ({ generateSignoffSheet: mocks.generateSignoffSheet }));
vi.mock('@/lib/signoff/permission', () => ({ canInitiateSettlementSignoff: mocks.canInitiateSettlementSignoff }));
vi.mock('@/lib/ip-resolve', () => ({ resolveClientIp: mocks.resolveClientIp }));
vi.mock('@/lib/ip-hash', () => ({ hashIp: mocks.hashIp }));
vi.mock('@/lib/signoff/rate-limit', () => ({ rateLimit: () => true }));
vi.mock('@/lib/signoff/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/signoff/http')>();
  return { ...actual, isSameOrigin: () => true };
});

const { POST } = await import('./route');

const SESSION = {
  sub: SESSION_SUB,
  username: '班代',
  role: 'super' as const,
  home_dept_id: null,
};

function makeReq(body: unknown): NextRequest {
  return {
    headers: new Headers({ 'user-agent': 'vitest' }),
    json: async () => body,
  } as unknown as NextRequest;
}

function baseBody(overrides: Record<string, unknown> = {}) {
  return {
    client_request_id: '11111111-1111-4111-8111-111111111111',
    title: '測試支出',
    amount: '100.00',
    currency: 'TWD',
    purpose: '測試',
    applicant: '測試人',
    sources: [{ object_path: `incoming/${SESSION_SUB}/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.pdf`, mime: 'application/pdf', name: 'x.pdf' }],
    assignees: [{ account_id: DEPT_HEAD_ID, role_label: '審核' }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readSession.mockResolvedValue(SESSION);
  mocks.resolveClientIp.mockReturnValue('1.2.3.4');
  mocks.hashIp.mockReturnValue({ hash: 'h', version: 1 });
  mocks.downloadObject.mockResolvedValue({ bytes: Buffer.from('x'), error: null });
  mocks.uploadObject.mockResolvedValue({ error: null });
  mocks.generateSignoffSheet.mockResolvedValue(new Uint8Array([1, 2, 3]));
  mocks.createSignoffDocument.mockImplementation(async (args: { doc: { id: string } }) => ({
    documentId: args.doc.id,
    error: null,
  }));
  mocks.findSoleFinanceOfficer.mockResolvedValue({
    ok: true,
    account: { id: FINANCE_ID, username: '財務長', role: 'dept', home_dept_id: 'finance', session_version: 1 },
  });
  mocks.getAccountsByIds.mockImplementation(async (ids: string[]) => ({
    data: ids.map((id) => ({
      id,
      username: id === FINANCE_ID ? '財務長' : id === DEPT_HEAD_ID ? '部門長A' : '部門長B',
      role: 'dept',
      home_dept_id: id === FINANCE_ID ? 'finance' : null,
      session_version: 1,
    })),
    error: null,
  }));
  mocks.notifyApprovalRequested.mockResolvedValue({ ok: true, status: 200, targets: 1 });
});

describe('POST /api/board/signoff — 財務長強制必選 + 排最後一關', () => {
  test('未帶財務長 → 後端自動補上，且排在最後一個 slot/assignment', async () => {
    const res = await POST(makeReq(baseBody()));
    const body = await res.json();
    expect(res.status).toBe(201);

    const createArgs = mocks.createSignoffDocument.mock.calls[0][0];
    expect(createArgs.assignments).toHaveLength(2);
    expect(createArgs.assignments[0].signer_account_id).toBe(DEPT_HEAD_ID);
    expect(createArgs.assignments[1].signer_account_id).toBe(FINANCE_ID);
    expect(createArgs.assignments[1].role_label).toBe('財務長核准');

    const sheetArgs = mocks.generateSignoffSheet.mock.calls[0][0];
    expect(sheetArgs.slots).toHaveLength(2);
    expect(sheetArgs.slots[sheetArgs.slots.length - 1].role_label).toBe('財務長核准');
    void body;
  });

  test('前端帶財務長但放在第一位 → 後端重排到最後，角色名稱保留', async () => {
    await POST(
      makeReq(
        baseBody({
          assignees: [
            { account_id: FINANCE_ID, role_label: '財務核准（自訂）' },
            { account_id: DEPT_HEAD_ID, role_label: '審核' },
          ],
        }),
      ),
    );
    const createArgs = mocks.createSignoffDocument.mock.calls[0][0];
    expect(createArgs.assignments.map((a: { signer_account_id: string }) => a.signer_account_id)).toEqual([
      DEPT_HEAD_ID,
      FINANCE_ID,
    ]);
    expect(createArgs.assignments[1].role_label).toBe('財務核准（自訂）');
  });

  test('前端只送財務長一人（沒有其他簽核人）→ 仍成功，財務長是唯一一格', async () => {
    const res = await POST(makeReq(baseBody({ assignees: [{ account_id: FINANCE_ID, role_label: '財務核准' }] })));
    expect(res.status).toBe(201);
    const createArgs = mocks.createSignoffDocument.mock.calls[0][0];
    expect(createArgs.assignments).toHaveLength(1);
    expect(createArgs.assignments[0].signer_account_id).toBe(FINANCE_ID);
  });

  test('查無財務長帳號 → 400 明確擋下，不建單', async () => {
    mocks.findSoleFinanceOfficer.mockResolvedValue({ ok: false, reason: 'no_recipient' });
    const res = await POST(makeReq(baseBody()));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('財務長');
    expect(mocks.createSignoffDocument).not.toHaveBeenCalled();
  });

  test('查到多位財務長帳號 → 400 明確擋下，不猜、不建單', async () => {
    mocks.findSoleFinanceOfficer.mockResolvedValue({ ok: false, reason: 'ambiguous_recipient', detail: 'count=2' });
    const res = await POST(makeReq(baseBody()));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('多位財務長');
    expect(mocks.createSignoffDocument).not.toHaveBeenCalled();
  });

  test('財務長查詢系統錯誤（DB failure）→ 503，不視為使用者輸入錯誤', async () => {
    mocks.findSoleFinanceOfficer.mockResolvedValue({ ok: false, reason: 'recipient_lookup_failed', detail: 'db down' });
    const res = await POST(makeReq(baseBody()));
    expect(res.status).toBe(503);
    expect(mocks.createSignoffDocument).not.toHaveBeenCalled();
  });

  test('加上財務長後超過人數上限 → 400，不建單', async () => {
    // 9 位其他簽核人（不含財務長）；財務長強制補上第 10 位 → 超過 MAX_ASSIGNEES=9。
    const ids = Array.from({ length: 9 }, (_, i) => `c0000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
    mocks.getAccountsByIds.mockImplementation(async (idList: string[]) => ({
      data: idList.map((id) => ({ id, username: id, role: 'dept', home_dept_id: id === FINANCE_ID ? 'finance' : null, session_version: 1 })),
      error: null,
    }));
    const res = await POST(
      makeReq(baseBody({ assignees: ids.map((id) => ({ account_id: id, role_label: '審核' })) })),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('上限');
    expect(mocks.createSignoffDocument).not.toHaveBeenCalled();
  });
});

describe('POST /api/board/signoff — 收款帳號 sanitize', () => {
  test('未帶 payment_account → 建單成功、傳給 PDF 的 paymentAccount 為 null', async () => {
    const res = await POST(makeReq(baseBody()));
    expect(res.status).toBe(201);
    const sheetArgs = mocks.generateSignoffSheet.mock.calls[0][0];
    expect(sheetArgs.paymentAccount).toBeNull();
    const createArgs = mocks.createSignoffDocument.mock.calls[0][0];
    // ⚠ 未填時必須「整個 key 不出現」，不可送 null：p_doc->'payment_account'
    // 對缺 key 回 SQL NULL（通過 0027 的 CHECK），對 JSON null 回 jsonb 'null'
    // → CHECK 失敗、整張建單 503。這條斷言就是在鎖住這件事，不要改回 toBeNull()。
    expect('payment_account' in createArgs.doc).toBe(false);
  });

  test('四欄全空字串 → 視為未填，建單成功、payment_account 為 null', async () => {
    const res = await POST(
      makeReq(baseBody({ payment_account: { bank: '', branch: '  ', account_name: '', account_number: '' } })),
    );
    expect(res.status).toBe(201);
    const createArgs = mocks.createSignoffDocument.mock.calls[0][0];
    // ⚠ 未填時必須「整個 key 不出現」，不可送 null：p_doc->'payment_account'
    // 對缺 key 回 SQL NULL（通過 0027 的 CHECK），對 JSON null 回 jsonb 'null'
    // → CHECK 失敗、整張建單 503。這條斷言就是在鎖住這件事，不要改回 toBeNull()。
    expect('payment_account' in createArgs.doc).toBe(false);
  });

  test('合法收款帳號 → sanitize 後帶入 PDF 與建單 payload', async () => {
    const res = await POST(
      makeReq(
        baseBody({
          payment_account: { bank: '台灣銀行', branch: '成功分行', account_name: '黃政傑', account_number: '123-456-7890' },
        }),
      ),
    );
    expect(res.status).toBe(201);
    const expected = { bank: '台灣銀行', branch: '成功分行', account_name: '黃政傑', account_number: '123-456-7890' };
    expect(mocks.generateSignoffSheet.mock.calls[0][0].paymentAccount).toEqual(expected);
    expect(mocks.createSignoffDocument.mock.calls[0][0].doc.payment_account).toEqual(expected);
  });

  test('帳號格式不合法（含英文字母）→ 400，不建單', async () => {
    const res = await POST(makeReq(baseBody({ payment_account: { account_number: 'ABCDEFG' } })));
    expect(res.status).toBe(400);
    expect(mocks.createSignoffDocument).not.toHaveBeenCalled();
  });
});
