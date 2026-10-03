import { beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({
  session: vi.fn(), lookup: vi.fn(), update: vi.fn(), settle: vi.fn(),
  lookupEq: vi.fn(), reportEq: vi.fn(), reportIs: vi.fn(), updateResult: vi.fn(),
}));
vi.mock('@/lib/auth/session', async () => {
  const { canManageDept } = await import('@/lib/depts');
  return { readSession: mocks.session, canManageDept };
});
vi.mock('@/lib/supabase/server', () => ({ getServerClient: () => ({ from: (table: string) => ({
  select: () => ({ eq: (...args: unknown[]) => { mocks.lookupEq(...args); return { maybeSingle: mocks.lookup }; } }),
  update: (value: unknown) => {
    if (table === 'comment_reports') {
      mocks.settle(value);
      return { eq: (...args: unknown[]) => { mocks.reportEq(...args); return { is: mocks.reportIs }; } };
    }
    mocks.update(value);
    return { eq: mocks.updateResult };
  },
}) }) }));
import { DELETE, PATCH } from './route';
const id = '11111111-1111-4111-8111-111111111111';
function request(method: 'DELETE' | 'PATCH', origin = 'https://example.test', target = id) {
  return (method === 'DELETE' ? DELETE : PATCH)(new NextRequest(`https://example.test/api/board/comments/${target}`, {
    method, headers: { host: 'example.test', origin },
  }), { params: Promise.resolve({ id: target }) });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ role: 'dept', home_dept_id: 'academic', sub: id, username: 'test-officer' });
  mocks.lookup.mockResolvedValue({ data: { id, deleted_at: null, posts: { department_id: 'academic' } }, error: null });
  mocks.updateResult.mockResolvedValue({ error: null });
  mocks.reportIs.mockResolvedValue({ error: null });
});
for (const method of ['DELETE', 'PATCH'] as const) {
  test(`${method} 未登入不可處理`, async () => {
    mocks.session.mockResolvedValue(null);
    expect((await request(method)).status).toBe(401);
    expect(mocks.lookup).not.toHaveBeenCalled();
    expect(mocks.settle).not.toHaveBeenCalled();
  });
  test.each([
    { role: 'dept', home_dept_id: 'finance' },
    { role: 'member', home_dept_id: 'academic' },
    { role: 'dept', home_dept_id: null },
  ])(`${method} 非幹部或他部門不可處理 %j`, async (session) => {
    mocks.session.mockResolvedValue(session);
    expect((await request(method)).status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.settle).not.toHaveBeenCalled();
  });
  test.each([{ role: 'dept', home_dept_id: 'academic' }, { role: 'super', home_dept_id: null }])(`${method} 所屬幹部或 super 可結清同留言所有未處理檢舉 %j`, async (session) => {
    mocks.session.mockResolvedValue({ ...session, sub: id, username: 'test-officer' });
    expect((await request(method)).status).toBe(200);
    expect(mocks.lookupEq).toHaveBeenCalledWith('id', id);
    if (method === 'DELETE') expect(mocks.updateResult).toHaveBeenCalledWith('id', id);
    expect(mocks.settle).toHaveBeenCalledWith({ resolved_at: expect.any(String), resolution: method === 'DELETE' ? 'deleted' : 'dismissed', reviewed_by: id, reviewed_at: expect.any(String) });
    expect(mocks.reportEq).toHaveBeenCalledWith('comment_id', id);
    expect(mocks.reportIs).toHaveBeenCalledWith('resolved_at', null);
    if (method === 'DELETE') expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'deleted', deleted_by: id, reviewed_by: id, reviewed_at: expect.any(String) }));
    else expect(mocks.update).not.toHaveBeenCalled(); // Dismissal preserves public status.
  });
  test(`${method} 跨站不可處理`, async () => {
    expect((await request(method, 'https://evil.test')).status).toBe(403);
    expect(mocks.lookup).not.toHaveBeenCalled();
    expect(mocks.settle).not.toHaveBeenCalled();
  });
  test(`${method} 無效 ID 不查 DB`, async () => {
    expect((await request(method, undefined, 'invalid')).status).toBe(400);
    expect(mocks.lookup).not.toHaveBeenCalled();
  });
  test(`${method} 查詢失敗或不存在不結案`, async () => {
    mocks.lookup.mockResolvedValueOnce({ error: { message: 'test failure' } });
    expect((await request(method)).status).toBe(503);
    mocks.lookup.mockResolvedValueOnce({ data: null, error: null });
    expect((await request(method)).status).toBe(404);
    expect(mocks.settle).not.toHaveBeenCalled();
  });
  test(`${method} 結案失敗回報可重試`, async () => {
    mocks.reportIs.mockResolvedValueOnce({ error: { message: 'private' } });
    const res = await request(method);
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain('private');
    expect((await request(method)).status).toBe(200);
  });
  test(`${method} 已刪留言仍須部門授權`, async () => {
    mocks.lookup.mockResolvedValue({ data: { id, deleted_at: '2026-10-03', posts: { department_id: 'finance' } }, error: null });
    expect((await request(method)).status).toBe(403);
    expect(mocks.settle).not.toHaveBeenCalled();
  });
}
test('刪除失敗不可先結案', async () => {
  mocks.updateResult.mockResolvedValue({ error: { message: 'test failure' } });
  expect((await request('DELETE')).status).toBe(503);
  expect(mocks.settle).not.toHaveBeenCalled();
});
test('刪除成功、結案失敗後重試已刪留言可以完成結案', async () => {
  mocks.reportIs.mockResolvedValueOnce({ error: { message: 'test failure' } });
  expect((await request('DELETE')).status).toBe(503);
  mocks.lookup.mockResolvedValue({ data: { id, deleted_at: '2026-10-03', posts: { department_id: 'academic' } }, error: null });
  mocks.update.mockClear();
  expect((await request('DELETE')).status).toBe(200);
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.settle).toHaveBeenLastCalledWith({ resolution: 'deleted', resolved_at: expect.any(String), reviewed_by: id, reviewed_at: expect.any(String) });
});
