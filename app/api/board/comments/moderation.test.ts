import { beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ from: vi.fn(), insert: vi.fn(), push: vi.fn(), dispatch: vi.fn(), count: 0, insertError: false }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ getServerClient: () => ({ from: mocks.from }) }));
vi.mock('@/lib/ip-hash', () => ({ hashIp: () => ({ hash: 'private-hash', version: 1 }) }));
vi.mock('@/lib/push/dispatcher', () => ({ processQueuedJobs: mocks.dispatch }));
import { POST } from './route';
const id = '11111111-1111-4111-8111-111111111111';
let ip = 0;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.count = 0;
  mocks.insertError = false;
  mocks.dispatch.mockResolvedValue(undefined);
  mocks.from.mockImplementation((table: string) => {
    if (table === 'posts') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id, published: true, department_id: 'academic' }, error: null }) }) }) };
    if (table === 'push_jobs') return { insert: mocks.push.mockResolvedValue({ error: null }) };
    const query: Record<string, any> = {};
    for (const method of ['select', 'eq', 'gte']) query[method] = () => query;
    query.ilike = async () => ({ count: mocks.count });
    query.insert = (row: unknown) => {
      mocks.insert(row);
      return { select: () => ({ single: async () => mocks.insertError ? { data: null, error: { message: 'private db error' } } : { data: { id, created_at: '2026-10-03', ...row as object }, error: null } }) };
    };
    return query;
  });
});
function post(content: string, author_name = '同學') {
  return POST(new NextRequest('https://example.test/api/board/comments', {
    method: 'POST', headers: { 'x-real-ip': `192.0.2.${++ip}` },
    body: JSON.stringify({ post_id: id, content, author_name }),
  }));
}
test.each(['你是白痴', 'Ｆ.Ｕ.Ｃ.Ｋ', 'send nudes', '杀了你', '死基佬'])('命中待審核且回應不洩漏詞彙／原因、不推播：%s', async (content) => {
  const res = await post(content);
  expect(res.status).toBe(201);
  expect(await res.json()).toEqual({ comment: null, pending: true, message: '留言已送出，待幹部審核後顯示' });
  expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ content, status: 'pending_review', review_reason: 'inappropriate_content' }));
  expect(mocks.push).not.toHaveBeenCalled();
  expect(mocks.dispatch).not.toHaveBeenCalled();
});
test('正常留言、幹部稱謂維持公開及既有推播', async () => {
  const res = await post('感謝幹部、幹事與秘書長');
  expect(res.status).toBe(201);
  const body = await res.json();
  expect(body.pending).toBe(false);
  expect(body.comment.content).toBe('感謝幹部、幹事與秘書長');
  expect(body.comment).not.toHaveProperty('review_reason');
  expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ status: 'visible', review_reason: null }));
  expect(mocks.push).toHaveBeenCalledOnce();
});
test('辱罵署名也須待審核', async () => {
  expect((await (await post('大家早安', '幹你娘')).json()).pending).toBe(true);
  expect(mocks.push).not.toHaveBeenCalled();
});
test.each([2, 3])('既有 URL 次數判斷保留：%s', async (count) => {
  mocks.count = count;
  const body = await (await post('參考 https://example.test')).json();
  expect(body.pending).toBe(count >= 3);
  expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ review_reason: count >= 3 ? 'url_spam' : null }));
  if (count >= 3) expect(body.message).toBe('留言已送出，待幹部審核後顯示');
});
test('URL 首次出現也不能讓不當內容公開', async () => {
  expect((await (await post('幹你娘 https://example.test')).json()).pending).toBe(true);
});
test('寫入失敗不可回報送出成功或推播', async () => {
  mocks.insertError = true;
  const res = await post('你是白痴');
  expect(res.status).toBe(503);
  expect(await res.json()).toEqual({ error: '留言失敗' });
  expect(mocks.push).not.toHaveBeenCalled();
});
