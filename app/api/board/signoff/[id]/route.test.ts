import { describe, expect, test, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

/**
 * GET /api/board/signoff/[id] — 0027 收款帳號欄位資安鐵律：
 *   • 未登入 / 無內部 view 權限（走「② 公開摘要」分支）→ 回應絕對不可出現
 *     payment_account（也不可用任何鍵名把銀行/帳號資訊夾帶出去）。
 *   • 登入且有 view 權限（走「① 完整原件」分支）→ doc.payment_account 要能
 *     正確回傳（有值/無值都要如實反映，不可被吞掉）。
 *
 * 全部依賴（session / access / dal）都 mock，不連真實 Supabase。
 */

const DOC_ID = '11111111-1111-4111-8111-111111111111';

const mocks = vi.hoisted(() => ({
  readSession: vi.fn(),
  requireSignoffAccess: vi.fn(),
  createSignedReadUrl: vi.fn(),
  getPublicApprovedSummary: vi.fn(),
  hasStoredSignature: vi.fn(),
  listSupplements: vi.fn(),
  recordAudit: vi.fn(),
  resolveClientIp: vi.fn(),
  hashIp: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({ readSession: mocks.readSession }));
vi.mock('@/lib/signoff/access', () => ({ requireSignoffAccess: mocks.requireSignoffAccess }));
vi.mock('@/lib/signoff/dal', () => ({
  createSignedReadUrl: mocks.createSignedReadUrl,
  getPublicApprovedSummary: mocks.getPublicApprovedSummary,
  hasStoredSignature: mocks.hasStoredSignature,
  listSupplements: mocks.listSupplements,
  recordAudit: mocks.recordAudit,
}));
vi.mock('@/lib/ip-resolve', () => ({ resolveClientIp: mocks.resolveClientIp }));
vi.mock('@/lib/ip-hash', () => ({ hashIp: mocks.hashIp }));

const { GET } = await import('./route');

function makeReq(): NextRequest {
  return { headers: new Headers({ 'user-agent': 'vitest' }) } as unknown as NextRequest;
}
function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

const PAYMENT_ACCOUNT = {
  bank: '台灣銀行',
  branch: '成功分行',
  account_name: '黃政傑',
  account_number: '123-456-7890',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveClientIp.mockReturnValue('1.2.3.4');
  mocks.hashIp.mockReturnValue({ hash: 'h', version: 1 });
  mocks.createSignedReadUrl.mockResolvedValue({ url: 'https://signed.example/x', error: null });
  mocks.hasStoredSignature.mockResolvedValue(false);
  mocks.listSupplements.mockResolvedValue({ rows: [], error: null });
  mocks.recordAudit.mockResolvedValue({ error: null });
});

describe('GET /api/board/signoff/[id] — 收款帳號資安邊界', () => {
  test('未登入 + 已核准文件（公開摘要分支）→ 回應完全不含 payment_account', async () => {
    mocks.readSession.mockResolvedValue(null);
    mocks.getPublicApprovedSummary.mockResolvedValue({
      data: {
        doc: {
          id: DOC_ID,
          title: '測試',
          purpose: null,
          amount: '100.00',
          currency: 'TWD',
          owner_dept_id: 'secretary',
          status: 'approved',
          created_at: '2026-08-01T00:00:00Z',
          updated_at: '2026-08-02T00:00:00Z',
        },
        assignments: [],
      },
      error: null,
    });

    const res = await GET(makeReq(), makeParams(DOC_ID));
    const raw = await res.text();
    expect(res.status).toBe(200);
    expect(raw).not.toContain('payment_account');
    expect(raw).not.toContain('台灣銀行');
    expect(raw).not.toContain('123-456-7890');
    const body = JSON.parse(raw);
    expect(body.public).toBe(true);
  });

  test('登入但無內部權限、文件未核准（access 404 → 公開分支查無）→ 回 404，不洩漏', async () => {
    mocks.readSession.mockResolvedValue({ sub: 'u1', username: 'x', role: 'dept', home_dept_id: 'secretary' });
    mocks.requireSignoffAccess.mockResolvedValue({ ok: false, status: 404, error: '找不到此單據或尚未完成簽核' });
    mocks.getPublicApprovedSummary.mockResolvedValue({ data: null, error: null });

    const res = await GET(makeReq(), makeParams(DOC_ID));
    const raw = await res.text();
    expect(res.status).toBe(404);
    expect(raw).not.toContain('payment_account');
  });

  test('登入且有 view 權限 → doc.payment_account 如實回傳（有值）', async () => {
    mocks.readSession.mockResolvedValue({ sub: 'u1', username: '班代', role: 'super', home_dept_id: null });
    mocks.requireSignoffAccess.mockResolvedValue({
      ok: true,
      bundle: {
        doc: {
          id: DOC_ID,
          title: '測試',
          amount: '100.00',
          currency: 'TWD',
          purpose: null,
          applicant: null,
          owner_dept_id: 'secretary',
          status: 'routing',
          created_at: '2026-08-01T00:00:00Z',
          due_at: null,
          final_pdf_sha256: null,
          final_pdf_object_path: null,
          attachments: [],
          created_by: 'u1',
          payment_account: PAYMENT_ACCOUNT,
        },
        assignments: [],
      },
    });

    const res = await GET(makeReq(), makeParams(DOC_ID));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.doc.payment_account).toEqual(PAYMENT_ACCOUNT);
  });

  test('登入且有 view 權限、但文件沒填收款帳號 → doc.payment_account 為 null', async () => {
    mocks.readSession.mockResolvedValue({ sub: 'u1', username: '班代', role: 'super', home_dept_id: null });
    mocks.requireSignoffAccess.mockResolvedValue({
      ok: true,
      bundle: {
        doc: {
          id: DOC_ID,
          title: '測試',
          amount: '100.00',
          currency: 'TWD',
          purpose: null,
          applicant: null,
          owner_dept_id: 'secretary',
          status: 'routing',
          created_at: '2026-08-01T00:00:00Z',
          due_at: null,
          final_pdf_sha256: null,
          final_pdf_object_path: null,
          attachments: [],
          created_by: 'u1',
          payment_account: null,
        },
        assignments: [],
      },
    });

    const res = await GET(makeReq(), makeParams(DOC_ID));
    const body = await res.json();
    expect(body.doc.payment_account).toBeNull();
  });
});
