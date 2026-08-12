import { describe, expect, test } from 'vitest';
import { isMagicScopeAllowed, MAGIC_SCOPE_ALLOWLIST } from './magic-allowlist';

const DOC_A = '11111111-1111-4111-8111-111111111111';
const DOC_B = '22222222-2222-4222-8222-222222222222';

describe('MAGIC_SCOPE_ALLOWLIST — 明確清單，不是猜出來的', () => {
  test('恰好兩條，都是 GET，都各只有一個 capture group', () => {
    expect(MAGIC_SCOPE_ALLOWLIST).toHaveLength(2);
    for (const entry of MAGIC_SCOPE_ALLOWLIST) {
      expect(entry.method).toBe('GET');
      const src = entry.pattern.source;
      // 粗略檢查恰有一個 `(` 開頭的 capture group（不含 non-capturing `(?:`）
      const captureGroups = (src.match(/\((?!\?:)/g) ?? []).length;
      expect(captureGroups).toBe(1);
    }
  });
});

describe('isMagicScopeAllowed — 兩個合法進入點', () => {
  test('GET /finance/signoff/[id]：id 相符才放行', () => {
    expect(isMagicScopeAllowed('GET', `/finance/signoff/${DOC_A}`, DOC_A)).toBe(true);
    expect(isMagicScopeAllowed('GET', `/finance/signoff/${DOC_A}`, DOC_B)).toBe(false);
  });

  test('GET /api/board/signoff/[id]：id 相符才放行', () => {
    expect(isMagicScopeAllowed('GET', `/api/board/signoff/${DOC_A}`, DOC_A)).toBe(true);
    expect(isMagicScopeAllowed('GET', `/api/board/signoff/${DOC_A}`, DOC_B)).toBe(false);
  });

  test('document id 比對不分大小寫（hex 字元大小寫混用仍算相符）', () => {
    const upper = DOC_A.toUpperCase();
    expect(isMagicScopeAllowed('GET', `/api/board/signoff/${upper}`, DOC_A)).toBe(true);
    expect(isMagicScopeAllowed('GET', `/finance/signoff/${DOC_A}`, upper)).toBe(true);
  });

  test('方法不符（同一 path 但非 GET）一律拒絕', () => {
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE', 'HEAD']) {
      expect(isMagicScopeAllowed(method, `/api/board/signoff/${DOC_A}`, DOC_A)).toBe(false);
      expect(isMagicScopeAllowed(method, `/finance/signoff/${DOC_A}`, DOC_A)).toBe(false);
    }
  });

  test('非 UUID 格式的 id 一律拒絕（不會誤配到其他 path）', () => {
    expect(isMagicScopeAllowed('GET', '/api/board/signoff/not-a-uuid', DOC_A)).toBe(false);
  });
});

describe('isMagicScopeAllowed — 已知曾被繞過的 route，必須一律拒絕', () => {
  const KNOWN_BYPASSED_PATHS: Array<{ method: string; path: string }> = [
    { method: 'GET', path: '/api/board/finance/income' },
    { method: 'POST', path: '/api/board/finance/income' },
    { method: 'GET', path: '/api/board/signoff' },
    { method: 'POST', path: '/api/board/signoff' },
    { method: 'POST', path: '/api/board/signoff/upload-url' },
    { method: 'GET', path: '/api/board/signoff/accounts' },
    { method: 'POST', path: `/api/board/signoff/${DOC_A}/delete` },
    { method: 'POST', path: `/api/board/signoff/${DOC_A}/finalize` },
    { method: 'POST', path: `/api/board/signoff/${DOC_A}/finance-link` },
    { method: 'POST', path: `/api/board/signoff/${DOC_A}/sign` },
    { method: 'POST', path: `/api/board/signoff/${DOC_A}/sign-stamp` },
    { method: 'POST', path: `/api/board/signoff/${DOC_A}/reject` },
    { method: 'POST', path: `/api/board/signoff/${DOC_A}/undo-reject` },
    { method: 'POST', path: `/api/board/signoff/${DOC_A}/nudge` },
    { method: 'POST', path: `/api/board/signoff/${DOC_A}/void` },
    { method: 'POST', path: `/api/board/signoff/${DOC_A}/supplement` },
    { method: 'GET', path: '/staff' },
    { method: 'GET', path: '/budget/settlement/some-slug' },
  ];

  test.each(KNOWN_BYPASSED_PATHS)('$method $path → false（即使 id 相符）', ({ method, path }) => {
    expect(isMagicScopeAllowed(method, path, DOC_A)).toBe(false);
  });
});
