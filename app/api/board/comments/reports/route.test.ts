import { beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ getServerClient: () => ({ rpc }) }));
vi.mock('@/lib/ip-hash', () => ({ hashIp: () => ({ hash: 'a'.repeat(64), version: 1 }) }));
import { POST } from './route';
const valid = { comment_id: '11111111-1111-4111-8111-111111111111', reporter_id: '22222222-2222-4222-8222-222222222222', reason: 'spam', details: '' };
function request(body: unknown = valid, origin = 'https://example.test', ip = '192.0.2.1') {
  return new NextRequest('https://example.test/api/board/comments/reports', {
    method: 'POST', headers: { host: 'example.test', origin, 'content-type': 'application/json', 'x-nf-client-connection-ip': ip }, body: JSON.stringify(body),
  });
}
beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue({ data: 'ok', error: null }); });
test('跨站拒絕，不碰資料庫', async () => {
  expect((await POST(request(valid, 'https://evil.test'))).status).toBe(403);
  expect(rpc).not.toHaveBeenCalled();
});
test.each([{ ...valid, reason: 'invalid' }, { ...valid, details: 'x'.repeat(501) }, { ...valid, reporter_id: 'bad' }])('不合法輸入拒絕', async (body) => {
  expect((await POST(request(body))).status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});
test('無 IP 拒絕；不信任使用者傳入的來源雜湊', async () => {
  expect((await POST(request(valid, 'https://example.test', ''))).status).toBe(503);
  await POST(request({ ...valid, p_ip_hash: 'fake' }));
  expect(rpc).toHaveBeenCalledWith('report_comment', expect.objectContaining({ p_ip_hash: 'a'.repeat(64) }));
});
test('chunked 過大 body 拒絕', async () => {
  expect((await POST(request({ ...valid, details: 'x'.repeat(5000) }))).status).toBe(413);
  expect(rpc).not.toHaveBeenCalled();
});
test.each([['ok', 200], ['duplicate', 200], ['rate_limited', 429], ['not_found', 404], ['unexpected', 503]])('RPC %s 對應 HTTP %s', async (data, status) => {
  rpc.mockResolvedValue({ data, error: null });
  expect((await POST(request())).status).toBe(status);
});
test('資料庫失敗不假報成功', async () => {
  rpc.mockResolvedValue({ data: null, error: { message: 'private database error' } });
  const res = await POST(request());
  expect(res.status).toBe(503);
  expect(await res.text()).not.toContain('private database error');
});
