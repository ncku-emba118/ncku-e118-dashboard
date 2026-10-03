import { beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ from: vi.fn(), query: {} as Record<string, ReturnType<typeof vi.fn>>, error: null as unknown }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ getServerClient: () => ({ from: mocks.from }) }));
vi.mock('@/lib/ip-hash', () => ({ hashIp: (input: string) => ({ hash: `opaque:${input.length}`, version: 1 }) }));
vi.mock('@/lib/push/dispatcher', () => ({ processQueuedJobs: vi.fn() }));
import { GET } from './route';
const id = '11111111-1111-4111-8111-111111111111';
beforeEach(() => {
  mocks.error = null;
  mocks.from.mockClear();
  mocks.from.mockReturnValue(mocks.query);
  for (const method of ['select', 'eq', 'is', 'order']) mocks.query[method] = vi.fn(() => mocks.query);
  mocks.query.limit = vi.fn(async () => ({ data: [{ id, post_id: id, author_name: null, content: 'hello', status: 'visible', created_at: '2026-10-03', ip_hash: 'private-hash', ip_hash_version: 1, posts: { published: true } }], error: mocks.error }));
});
test('公開 feed 限制 published/visible/not deleted；最新 200，無 IP 欄位', async () => {
  const res = await GET(new NextRequest(`https://example.test/api/board/comments?post_id=${id}`));
  expect(res.status).toBe(200);
  expect(res.headers.get('cache-control')).toBe('no-store');
  expect(mocks.query.eq).toHaveBeenCalledWith('posts.published', true);
  expect(mocks.query.eq).toHaveBeenCalledWith('status', 'visible');
  expect(mocks.query.is).toHaveBeenCalledWith('deleted_at', null);
  expect(mocks.query.order).toHaveBeenCalledWith('created_at', { ascending: false });
  expect(mocks.query.limit).toHaveBeenCalledWith(200);
  const body = await res.json();
  expect(body.comments[0].author_key).toMatch(/^opaque:/);
  expect(body.comments[0]).not.toHaveProperty('ip_hash');
  expect(body.comments[0]).not.toHaveProperty('ip_hash_version');
  expect(body.comments[0]).not.toHaveProperty('posts');
});
test('無效 post id 不查 DB', async () => {
  expect((await GET(new NextRequest('https://example.test/api/board/comments?post_id=bad'))).status).toBe(400);
  expect(mocks.from).not.toHaveBeenCalled();
});
test('DB 故障回報錯誤，不冒充空清單', async () => {
  mocks.error = { message: 'private error' };
  const res = await GET(new NextRequest(`https://example.test/api/board/comments?post_id=${id}`));
  expect(res.status).toBe(503);
  expect(await res.text()).not.toContain('private error');
});
