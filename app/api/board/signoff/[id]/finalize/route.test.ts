import { describe, expect, test, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

/**
 * 敵對審查修正3：finalize route（重生最終 PDF）成功補上 final PDF 後，
 * 財務長要能收到通知——原本全檔沒有 import/呼叫 notifyApprovalCompleted，
 * 導致「自動合成失敗 → 事後點重試按鈕成功」這條路徑財務長永遠收不到通知。
 *
 * 重點斷言：
 *   • idempotent 早退（final_pdf_object_path 已存在）→ 不重複通知（防重複）。
 *   • 合成失敗 → 不通知（請款單根本沒生出來）。
 *   • 首度補上 final PDF 成功 → 通知恰好呼叫一次。
 *   • 通知失敗（best-effort）→ 不影響本次 API 回應（仍是 200 ok:true）。
 *
 * 全部依賴（session / access / compose / notify）都 mock，不連真實 Supabase、
 * 不打真實 LINE webhook。
 */

const mocks = vi.hoisted(() => ({
  readSession: vi.fn(),
  requireSignoffAccess: vi.fn(),
  composeAndStoreFinal: vi.fn(),
  recordFinalizeFailure: vi.fn(),
  notifyApprovalCompleted: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({ readSession: mocks.readSession }));
vi.mock('@/lib/signoff/access', () => ({ requireSignoffAccess: mocks.requireSignoffAccess }));
vi.mock('@/lib/signoff/finalize', () => ({ composeAndStoreFinal: mocks.composeAndStoreFinal }));
vi.mock('@/lib/signoff/dal', () => ({ recordFinalizeFailure: mocks.recordFinalizeFailure }));
vi.mock('@/lib/board/signoff_notify', () => ({ notifyApprovalCompleted: mocks.notifyApprovalCompleted }));
vi.mock('@/lib/signoff/rate-limit', () => ({ rateLimit: () => true }));
vi.mock('@/lib/signoff/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/signoff/http')>();
  return { ...actual, isSameOrigin: () => true };
});

const { POST } = await import('./route');

const DOC_ID = '11111111-1111-1111-1111-111111111111';
const SESSION = { sub: 'u-1', username: '班代', role: 'super' as const, home_dept_id: null };

function makeReq(): NextRequest {
  return { headers: new Headers() } as unknown as NextRequest;
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function baseDoc(overrides: Partial<{ status: string; final_pdf_object_path: string | null }> = {}) {
  return {
    id: DOC_ID,
    status: 'approved',
    final_pdf_object_path: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readSession.mockResolvedValue(SESSION);
  mocks.recordFinalizeFailure.mockResolvedValue({ error: null });
  mocks.notifyApprovalCompleted.mockResolvedValue({ ok: true, status: 200 });
});

describe('POST /api/board/signoff/[id]/finalize — 修正3 通知邏輯', () => {
  test('idempotent 早退（final_pdf 已存在）→ 不呼叫通知', async () => {
    mocks.requireSignoffAccess.mockResolvedValue({
      ok: true,
      bundle: { doc: baseDoc({ final_pdf_object_path: 'documents/x/final.pdf' }), assignments: [] },
    });

    const res = await POST(makeReq(), makeParams(DOC_ID));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, regenerated: false });
    expect(mocks.composeAndStoreFinal).not.toHaveBeenCalled();
    expect(mocks.notifyApprovalCompleted).not.toHaveBeenCalled();
  });

  test('合成失敗 → 記錄失敗痕跡、不通知、回 503', async () => {
    mocks.requireSignoffAccess.mockResolvedValue({
      ok: true,
      bundle: { doc: baseDoc(), assignments: [] },
    });
    mocks.composeAndStoreFinal.mockResolvedValue({ ok: false, error: '合成炸了' });

    const res = await POST(makeReq(), makeParams(DOC_ID));
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.error).toBeTruthy();
    expect(mocks.recordFinalizeFailure).toHaveBeenCalledWith(DOC_ID, '合成炸了');
    expect(mocks.notifyApprovalCompleted).not.toHaveBeenCalled();
  });

  test('首度補上 final PDF 成功 → 通知恰好呼叫一次，帶正確 document id', async () => {
    mocks.requireSignoffAccess.mockResolvedValue({
      ok: true,
      bundle: { doc: baseDoc(), assignments: [] },
    });
    mocks.composeAndStoreFinal.mockResolvedValue({ ok: true, error: null });

    const res = await POST(makeReq(), makeParams(DOC_ID));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, regenerated: true });
    expect(mocks.notifyApprovalCompleted).toHaveBeenCalledTimes(1);
    expect(mocks.notifyApprovalCompleted).toHaveBeenCalledWith(DOC_ID);
  });

  test('通知失敗（best-effort）不影響本次 API 回應', async () => {
    mocks.requireSignoffAccess.mockResolvedValue({
      ok: true,
      bundle: { doc: baseDoc(), assignments: [] },
    });
    mocks.composeAndStoreFinal.mockResolvedValue({ ok: true, error: null });
    mocks.notifyApprovalCompleted.mockResolvedValue({ ok: false, reason: 'no_recipient' });

    const res = await POST(makeReq(), makeParams(DOC_ID));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, regenerated: true });
  });

  test('通知函式 throw 也不影響本次 API 回應（try/catch 兜底）', async () => {
    mocks.requireSignoffAccess.mockResolvedValue({
      ok: true,
      bundle: { doc: baseDoc(), assignments: [] },
    });
    mocks.composeAndStoreFinal.mockResolvedValue({ ok: true, error: null });
    mocks.notifyApprovalCompleted.mockRejectedValue(new Error('network boom'));

    const res = await POST(makeReq(), makeParams(DOC_ID));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, regenerated: true });
  });

  test('文件非 approved → 409，不通知', async () => {
    mocks.requireSignoffAccess.mockResolvedValue({
      ok: true,
      bundle: { doc: baseDoc({ status: 'routing' }), assignments: [] },
    });

    const res = await POST(makeReq(), makeParams(DOC_ID));
    expect(res.status).toBe(409);
    expect(mocks.notifyApprovalCompleted).not.toHaveBeenCalled();
  });
});
