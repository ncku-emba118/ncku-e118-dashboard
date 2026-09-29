import { describe, expect, test, vi, beforeEach, beforeAll, afterEach } from 'vitest';
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
  // compareClassPassword 用真的（bcrypt 真的跑，含 malformed hash 的例外處理）
  const actual = await vi.importActual<typeof import('@/lib/auth/class-gate-server')>(
    '@/lib/auth/class-gate-server',
  );
  return {
    getClassPasswordHash: mocks.getClassPasswordHash,
    beginClassLoginAttempt: mocks.beginClassLoginAttempt,
    markClassLoginSucceeded: mocks.markClassLoginSucceeded,
    pruneOldClassLoginAttempts: mocks.pruneOldClassLoginAttempts,
    compareClassPassword: actual.compareClassPassword,
    isWellFormedBcryptHash: actual.isWellFormedBcryptHash,
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

afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getClassPasswordHash.mockResolvedValue({ ok: true, hash: HASH });
  mocks.beginClassLoginAttempt.mockResolvedValue({ ok: true, attemptId: 1 });
  mocks.markClassLoginSucceeded.mockResolvedValue({ ok: true });
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

  test('正常大小但沒帶 content-length 的 body → 行為不變（200）', async () => {
    const req = makeReq({ password: 'correct-horse' });
    expect(req.headers.get('content-length')).toBeNull();
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});

/** 抓 console.error 的所有參數序列化後，確認沒有敏感值 */
function expectNoSecretsLogged(spy: ReturnType<typeof vi.spyOn>) {
  const logged = JSON.stringify(spy.mock.calls);
  expect(logged).not.toContain('correct-horse');
  expect(logged).not.toContain(HASH);
  expect(logged).not.toContain('203.0.113.9');
}

describe('外部依賴例外 → 受控 503（不 throw 成 500、不發 cookie）', () => {
  test('讀 hash 時 reject（DB / env 例外）→ 503 + x-trace-id、無 cookie', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.getClassPasswordHash.mockRejectedValueOnce(new Error('fetch failed'));
    const res = await POST(makeReq({ password: 'correct-horse' }));
    expect(res.status).toBe(503);
    expect(res.headers.get('x-trace-id')).toBeTruthy();
    expect(classCookieFrom(res)).toBeNull();
    expect(err).toHaveBeenCalled();
    expect(JSON.stringify(err.mock.calls)).toContain(res.headers.get('x-trace-id')!);
    expectNoSecretsLogged(err);
  });

  test('beginClassLoginAttempt reject → 503、無 cookie', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.beginClassLoginAttempt.mockRejectedValueOnce(new Error('boom'));
    const res = await POST(makeReq({ password: 'correct-horse' }));
    expect(res.status).toBe(503);
    expect(classCookieFrom(res)).toBeNull();
    expect(err).toHaveBeenCalled();
    expectNoSecretsLogged(err);
  });

  test('DB 裡的 bcrypt hash 格式壞掉（$2b$99$…）→ 503（設定錯誤，不是密碼錯）、無 cookie', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const badHash = '$2b$99$' + 'a'.repeat(53);
    mocks.getClassPasswordHash.mockResolvedValueOnce({ ok: true, hash: badHash });
    const res = await POST(makeReq({ password: 'correct-horse' }));
    expect(res.status).toBe(503);
    expect(classCookieFrom(res)).toBeNull();
    expect(err).toHaveBeenCalled();
    expect(JSON.stringify(err.mock.calls)).not.toContain(badHash);
    expectNoSecretsLogged(err);
    // 不能被當成一次「密碼錯誤」：不記嘗試（不污染限流計數）、不記 bad_password
    expect(mocks.beginClassLoginAttempt).not.toHaveBeenCalled();
    expect(JSON.stringify(info.mock.calls)).not.toContain('bad_password');
  });
});

describe('compareClassPassword（真的 bcrypt）', () => {
  test('對 / 錯密碼 → ok:true + match；壞掉的 hash → ok:false（不 throw、不含 hash）', async () => {
    const { compareClassPassword } = await vi.importActual<
      typeof import('@/lib/auth/class-gate-server')
    >('@/lib/auth/class-gate-server');
    expect(await compareClassPassword('correct-horse', HASH)).toEqual({ ok: true, match: true });
    expect(await compareClassPassword('wrong', HASH)).toEqual({ ok: true, match: false });
    for (const bad of ['$2b$99$' + 'a'.repeat(53), '$2b$03$' + 'a'.repeat(53), '$2b$12$short', 'plain']) {
      const r = await compareClassPassword('correct-horse', bad);
      expect(r.ok).toBe(false);
      expect(JSON.stringify(r)).not.toContain(bad);
    }
  });
});

describe('沒有 Content-Length 的超大 body', () => {
  test('不帶 content-length、body 2MB → 413、不查 DB', async () => {
    const big = JSON.stringify({ password: 'x'.repeat(2 * 1024 * 1024) });
    const req = makeReq(big);
    expect(req.headers.get('content-length')).toBeNull();
    const res = await POST(req);
    expect(res.status).toBe(413);
    expect(mocks.getClassPasswordHash).not.toHaveBeenCalled();
    expect(mocks.beginClassLoginAttempt).not.toHaveBeenCalled();
  });

  test('chunked stream（無 content-length）超過 1KB → 413', async () => {
    const chunk = new TextEncoder().encode('x'.repeat(600));
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(ctrl) {
        if (sent++ < 4000) ctrl.enqueue(chunk);
        else ctrl.close();
      },
    });
    const req = new NextRequest('http://localhost:3000/api/class-gate/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-nf-client-connection-ip': '203.0.113.9' },
      body: stream,
      duplex: 'half', // undici 需要 duplex 才能送 stream body
    });
    const res = await POST(req);
    expect(res.status).toBe(413);
    expect(sent).toBeLessThan(4000); // 沒有把整包讀完
  });

  test('UTF-8 實際 byte 數超過上限（字元數沒超過）→ 413', async () => {
    // 400 個中文字 ≈ 1200 bytes > 1KB，但字元數 < 1024
    const res = await POST(makeReq(JSON.stringify({ password: '中'.repeat(400) })));
    expect(res.status).toBe(413);
  });
});

describe('成功登入後記帳失敗', () => {
  test('markClassLoginSucceeded 回 { ok: false } → 仍 200 + cookie，並 console.error', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.markClassLoginSucceeded.mockResolvedValueOnce({ ok: false, error: 'update failed' });
    const res = await POST(makeReq({ password: 'correct-horse' }));
    expect(res.status).toBe(200);
    const token = classCookieFrom(res);
    expect(token).toBeTruthy();
    expect(await verifyClassToken(token!)).toBe(true);
    expect(err).toHaveBeenCalled();
    expect(JSON.stringify(err.mock.calls)).toContain(res.headers.get('x-trace-id')!);
    expectNoSecretsLogged(err);
    expect(JSON.stringify(err.mock.calls)).not.toContain(token!);
  });
});

describe('production cookie（NODE_ENV=production）', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  test('Set-Cookie = __Host-class-sid; Path=/; Secure; HttpOnly; SameSite=Lax; 無 Domain；token 可驗', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.resetModules();
    const prodRoute = await import('./route');
    const prodGate = await import('@/lib/auth/class-gate');
    expect(prodGate.CLASS_COOKIE_NAME).toBe('__Host-class-sid');

    const res = await prodRoute.POST(makeReq({ password: 'correct-horse' }));
    expect(res.status).toBe(200);
    const sc = res.headers.get('set-cookie')!;
    expect(sc).toMatch(/^__Host-class-sid=/);
    expect(sc).toMatch(/;\s*Path=\/(;|$)/);
    expect(sc).toMatch(/;\s*Secure(;|$)/i);
    expect(sc).toMatch(/;\s*HttpOnly(;|$)/i);
    expect(sc).toMatch(/;\s*SameSite=Lax(;|$)/i);
    expect(sc).toMatch(/Max-Age=7776000/);
    expect(sc).not.toMatch(/Domain=/i);
    const token = decodeURIComponent(sc.match(/^__Host-class-sid=([^;]+)/)![1]);
    expect(await prodGate.verifyClassToken(token)).toBe(true);
  });
});
