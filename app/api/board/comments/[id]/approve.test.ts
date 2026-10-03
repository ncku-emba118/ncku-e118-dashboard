import { beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ session: vi.fn(), from: vi.fn(), lookup: vi.fn(), update: vi.fn(), eq: vi.fn(), is: vi.fn(), result: vi.fn() }));
vi.mock('@/lib/auth/session', async () => ({ readSession: mocks.session, canManageDept: (await import('@/lib/depts')).canManageDept }));
vi.mock('@/lib/supabase/server', () => ({ getServerClient: () => ({ from: mocks.from }) }));
import { PATCH } from './route';
const id = '11111111-1111-4111-8111-111111111111';
function approve(origin = 'https://example.test', action = 'approve') {
  return PATCH(new NextRequest(`https://example.test/api/board/comments/${id}?action=${action}`, {
    method: 'PATCH', headers: { host: 'example.test', origin },
  }), { params: Promise.resolve({ id }) });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ role: 'dept', home_dept_id: 'academic' });
  mocks.lookup.mockResolvedValue({ data: { id, posts: { department_id: 'academic' } }, error: null });
  mocks.result.mockResolvedValue({ data: { id }, error: null });
  const updateQuery = { eq: mocks.eq, is: mocks.is, select: () => ({ maybeSingle: mocks.result }) };
  mocks.eq.mockReturnValue(updateQuery);
  mocks.is.mockReturnValue(updateQuery);
  mocks.update.mockReturnValue(updateQuery);
  mocks.from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: mocks.lookup }) }), update: mocks.update });
});
test.each([{ role: 'dept', home_dept_id: 'academic' }, { role: 'super' }])('所屬幹部／super 可放行 %j', async (session) => {
  mocks.session.mockResolvedValue({ ...session, sub: id });
  expect((await approve()).status).toBe(200);
  expect(mocks.update).toHaveBeenCalledWith({ status: 'visible', review_reason: null, reviewed_by: id, reviewed_at: expect.any(String) });
  expect(mocks.eq).toHaveBeenCalledWith('id', id);
  expect(mocks.eq).toHaveBeenCalledWith('status', 'pending_review');
  expect(mocks.is).toHaveBeenCalledWith('deleted_at', null);
  expect(mocks.from.mock.calls.every(([table]) => table === 'comments')).toBe(true);
});
test.each([
  [null, 401], [{ role: 'member', home_dept_id: 'academic' }, 403],
  [{ role: 'dept', home_dept_id: 'finance' }, 403], [{ role: 'dept', home_dept_id: null }, 403],
])('未授權不能放行 %j', async (session, status) => {
  mocks.session.mockResolvedValue(session);
  expect((await approve()).status).toBe(status);
  expect(mocks.update).not.toHaveBeenCalled();
});
test('跨站／無效動作不寫入', async () => {
  expect((await approve('https://evil.test')).status).toBe(403);
  expect((await approve(undefined, 'invalid')).status).toBe(400);
  expect(mocks.update).not.toHaveBeenCalled();
});
test('查詢失敗／不存在／孤兒留言不放行', async () => {
  for (const [result, status] of [
    [{ data: null, error: { message: 'private' } }, 503],
    [{ data: null, error: null }, 404],
    [{ data: { id, posts: null }, error: null }, 403],
  ] as const) {
    mocks.lookup.mockResolvedValueOnce(result);
    expect((await approve()).status).toBe(status);
  }
  expect(mocks.update).not.toHaveBeenCalled();
});
test('已放行／已刪除或競態沒有匹配列，回衝突而非成功', async () => {
  mocks.result.mockResolvedValue({ data: null, error: null });
  expect((await approve()).status).toBe(409);
});
test('放行失敗可重試，回應不洩漏 DB 錯誤', async () => {
  mocks.result.mockResolvedValueOnce({ data: null, error: { message: 'private' } });
  const res = await approve();
  expect(res.status).toBe(503);
  expect(await res.text()).not.toContain('private');
  expect((await approve()).status).toBe(200);
});
