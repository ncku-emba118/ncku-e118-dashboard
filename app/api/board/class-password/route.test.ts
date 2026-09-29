import { describe, expect, test, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * POST /api/board/class-password — 只測 body 大小限制（含沒帶 Content-Length 的情況）。
 * session / DB 寫入 mock 掉；validateNewClassPassword 用真的。
 */
vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  readSession: vi.fn(),
  setClassPassword: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({ readSession: mocks.readSession }));

vi.mock('@/lib/auth/class-gate-server', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/class-gate-server')>(
    '@/lib/auth/class-gate-server',
  );
  return {
    validateNewClassPassword: actual.validateNewClassPassword,
    setClassPassword: mocks.setClassPassword,
  };
});

const { POST } = await import('./route');

function makeReq(body: BodyInit, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3000/api/board/class-password', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      host: 'localhost:3000',
      origin: 'http://localhost:3000',
      ...headers,
    },
    body,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readSession.mockResolvedValue({
    sub: '11111111-1111-4111-8111-111111111111',
    username: 'monitor',
    role: 'super',
  });
  mocks.setClassPassword.mockResolvedValue({ ok: true });
});

describe('POST /api/board/class-password — body 大小限制', () => {
  test('正常 body → 200，寫入新密碼', async () => {
    const req = makeReq(JSON.stringify({ password: 'new-pass-123' }));
    expect(req.headers.get('content-length')).toBeNull();
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mocks.setClassPassword).toHaveBeenCalledWith('new-pass-123', expect.any(String));
  });

  test('content-length 超過 1KB → 413（快速拒絕保留）', async () => {
    const res = await POST(makeReq(JSON.stringify({ password: 'new-pass-123' }), { 'content-length': '5000' }));
    expect(res.status).toBe(413);
    expect(mocks.setClassPassword).not.toHaveBeenCalled();
  });

  test('不帶 content-length、body 2MB → 413、不寫入', async () => {
    const req = makeReq(JSON.stringify({ password: 'x'.repeat(2 * 1024 * 1024) }));
    expect(req.headers.get('content-length')).toBeNull();
    const res = await POST(req);
    expect(res.status).toBe(413);
    expect(mocks.setClassPassword).not.toHaveBeenCalled();
  });

  test('JSON 格式錯誤 → 400（行為不變）', async () => {
    const res = await POST(makeReq('not json'));
    expect(res.status).toBe(400);
    expect(mocks.setClassPassword).not.toHaveBeenCalled();
  });
});
