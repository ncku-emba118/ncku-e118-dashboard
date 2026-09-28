import { describe, expect, test, vi, beforeEach, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';

/**
 * POST /api/class-gate/login — 班級共用密碼驗證。
 * DB 層（lib/auth/class-gate-server 的讀寫）mock 掉；bcrypt 與 token 簽章真的跑。
 */
beforeAll(() => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'a'.repeat(40);
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'b'.repeat(40);
  process.env.SESSION_SECRET = 'c'.repeat(32);
  process.env.IP_HASH_SECRET = 'd'.repeat(32);
  process.env.CLASS_GATE_SECRET = 'e'.repeat(40);
});

vi.mock('server-only', () => ({}));

const HASH = await bcrypt.hash('correct-horse', 4);

const mocks = vi.hoisted(() => ({
  getClassPasswordHash: vi.fn(),
  beginClassLoginAttempt: vi.fn(),
  markClassLoginSucceeded: vi.fn(),
  pruneOldClassLoginAttempts: vi.fn(),
}));

vi.mock('@/lib/auth/class-gate-server', async () => {
  const bcryptjs = (await import('bcryptjs')).default;
  return {
    getClassPasswordHash: mocks.getClassPasswordHash,
    beginClassLoginAttempt: mocks.beginClassLoginAttempt,
    markClassLoginSucceeded: mocks.markClassLoginSucceeded,
    pruneOldClassLoginAttempts: mocks.pruneOldClassLoginAttempts,
    compareClassPassword: (p: string, h: string) => bcryptjs.compare(p, h),
  };
});

const { POST } = await import('./route');
const { verifyClassToken } = await import('@/lib/auth/class-gate');

function makeReq(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3000/api/class-gate/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-nf-client-connection-ip': '203.0.113.9',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function classCookieFrom(res: Response): string | null {
  const sc = res.headers.get('set-cookie');
  const m = sc?.match(/(?:^|; )(?:class-sid|__Host-class-sid)=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getClassPasswordHash.mockResolvedValue({ ok: true, hash: HASH });
  mocks.beginClassLoginAttempt.mockResolvedValue({ ok: true, attemptId: 1 });
  mocks.markClassLoginSucceeded.mockResolvedValue(undefined);
  mocks.pruneOldClassLoginAttempts.mockResolvedValue(undefined);
});

describe('POST /api/class-gate/login', () => {
  test('正確密碼 → 200 + 有效 90 天班級 cookie（HttpOnly、SameSite=Lax）', async () => {
    const res = await POST(makeReq({ password: 'correct-horse' }));
    expect(res.status).toBe(200);
    const token = classCookieFrom(res);
    expect(token).toBeTruthy();
    expect(await verifyClassToken(token!)).toBe(true);
    const sc = res.headers.get('set-cookie')!;
    expect(sc).toMatch(/HttpOnly/i);
    expect(sc).toMatch(/SameSite=lax/i);
    expect(sc).toMatch(/Max-Age=7776000/);
    expect(mocks.markClassLoginSucceeded).toHaveBeenCalledWith(1);
  });

  test('錯誤密碼 → 401、不發 cookie、嘗試已記錄', async () => {
    const res = await POST(makeReq({ password: 'wrong' }));
    expect(res.status).toBe(401);
    expect(classCookieFrom(res)).toBeNull();
    expect(mocks.beginClassLoginAttempt).toHaveBeenCalledTimes(1);
    expect(mocks.markClassLoginSucceeded).not.toHaveBeenCalled();
  });

  test('嘗試太多次（IP / 全站）→ 429、不驗密碼、不發 cookie', async () => {
    for (const reason of ['ip_limited', 'global_limited'] as const) {
      mocks.beginClassLoginAttempt.mockResolvedValueOnce({ ok: false, reason });
      const res = await POST(makeReq({ password: 'correct-horse' }));
      expect(res.status).toBe(429);
      expect(classCookieFrom(res)).toBeNull();
    }
  });

  test('計數 DB 故障 → 503（fail-closed，連對的密碼也不放）', async () => {
    mocks.beginClassLoginAttempt.mockResolvedValueOnce({ ok: false, reason: 'db_error', error: 'x' });
    const res = await POST(makeReq({ password: 'correct-horse' }));
    expect(res.status).toBe(503);
    expect(classCookieFrom(res)).toBeNull();
  });

  test('密碼尚未設定 → 503', async () => {
    mocks.getClassPasswordHash.mockResolvedValueOnce({ ok: true, hash: null });
    const res = await POST(makeReq({ password: 'anything' }));
    expect(res.status).toBe(503);
    expect(classCookieFrom(res)).toBeNull();
  });

  test('讀 hash 失敗 → 503', async () => {
    mocks.getClassPasswordHash.mockResolvedValueOnce({ ok: false, error: 'timeout' });
    const res = await POST(makeReq({ password: 'correct-horse' }));
    expect(res.status).toBe(503);
  });

  test('CLASS_GATE_SECRET 未設定 → 503、不查 DB', async () => {
    const saved = process.env.CLASS_GATE_SECRET;
    delete process.env.CLASS_GATE_SECRET;
    try {
      const res = await POST(makeReq({ password: 'correct-horse' }));
      expect(res.status).toBe(503);
      expect(mocks.getClassPasswordHash).not.toHaveBeenCalled();
    } finally {
      process.env.CLASS_GATE_SECRET = saved;
    }
  });

  test('抓不到 IP → 503', async () => {
    const req = new NextRequest('http://localhost:3000/api/class-gate/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'correct-horse' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(503);
  });

  test('格式錯誤 / 空密碼 / 超長 → 400、不記嘗試', async () => {
    for (const body of ['not json', {}, { password: 123 }, { password: '' }, { password: 'x'.repeat(129) }]) {
      const res = await POST(makeReq(body));
      expect(res.status).toBe(400);
    }
    expect(mocks.beginClassLoginAttempt).not.toHaveBeenCalled();
  });

  test('body 過大 → 413', async () => {
    const res = await POST(makeReq({ password: 'x' }, { 'content-length': '5000' }));
    expect(res.status).toBe(413);
  });
});
