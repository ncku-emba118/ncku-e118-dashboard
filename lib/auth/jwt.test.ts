import { describe, expect, test, beforeAll } from 'vitest';

/**
 * 敵對審查修正2 相容性迴歸：magic_scope claim 是新加的 optional zod 欄位。
 *
 * 這裡驗證 JWT sign/verify 這一層的往返：
 *   • 沒帶 magic_scope 的 payload（密碼登入 / 既有 assignment magic session）
 *     簽發、驗證後行為與加欄位前完全一致（magic_scope 為 undefined，其餘欄位不受影響）。
 *   • 帶 magic_scope 的 payload（財務長唯讀連結）簽發、驗證後 claim 原樣保留。
 *   • 畸形 magic_scope（kind 不對 / document_id 非 uuid）在簽名驗證通過後，
 *     仍會被 zod schema 擋下（比照 Codex Sec F7 既有的「簽名驗證之後還要
 *     structural validate」防線，見 jwt.ts 檔頭）。
 *
 * 上層「有 claim 時只能唯讀存取該文件」的收斂邏輯見 magic-scope.test.ts；
 * 這裡只測 claim 本身能不能正確地被簽發／保留／擋下。
 */
beforeAll(() => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'a'.repeat(40);
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'b'.repeat(40);
  process.env.SESSION_SECRET = 'c'.repeat(32);
  process.env.IP_HASH_SECRET = 'd'.repeat(32);
});

const SUB = '11111111-1111-4111-8111-111111111111';
const DOC = '22222222-2222-4222-8222-222222222222';

describe('signSession / verifySession — magic_scope 相容性', () => {
  test('無 magic_scope（密碼登入 / assignment magic session）：往返後行為不變', async () => {
    const { signSession, verifySession } = await import('./jwt');
    const token = await signSession({
      sub: SUB,
      role: 'dept',
      home_dept_id: 'finance',
      session_version: 1,
    });
    const payload = await verifySession(token);
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe(SUB);
    expect(payload!.role).toBe('dept');
    expect(payload!.home_dept_id).toBe('finance');
    expect(payload!.session_version).toBe(1);
    // 相容性鐵律核心斷言：沒帶 claim → 驗證回來也是 undefined，不會被塞進假值
    expect(payload!.magic_scope).toBeUndefined();
  });

  test('帶 magic_scope（財務長唯讀連結）：往返後 claim 原樣保留', async () => {
    const { signSession, verifySession } = await import('./jwt');
    const token = await signSession({
      sub: SUB,
      role: 'dept',
      home_dept_id: 'finance',
      session_version: 2,
      magic_scope: { kind: 'finance_readonly', document_id: DOC },
    });
    const payload = await verifySession(token);
    expect(payload).not.toBeNull();
    expect(payload!.magic_scope).toEqual({ kind: 'finance_readonly', document_id: DOC });
  });

  test('sign 前 zod 就擋掉畸形 magic_scope（kind 不對）', async () => {
    const { signSession } = await import('./jwt');
    await expect(
      signSession({
        sub: SUB,
        role: 'dept',
        home_dept_id: 'finance',
        session_version: 1,
        // @ts-expect-error 刻意塞錯 kind，驗證 schema 真的有擋
        magic_scope: { kind: 'not_a_real_scope', document_id: DOC },
      }),
    ).rejects.toThrow();
  });

  test('sign 前 zod 就擋掉畸形 magic_scope（document_id 非 uuid）', async () => {
    const { signSession } = await import('./jwt');
    await expect(
      signSession({
        sub: SUB,
        role: 'dept',
        home_dept_id: 'finance',
        session_version: 1,
        magic_scope: { kind: 'finance_readonly', document_id: 'not-a-uuid' },
      }),
    ).rejects.toThrow();
  });

  test('MagicScope 不存在的 session（一般密碼登入）不受這次改動影響：role=super / home_dept_id=null 仍正常往返', async () => {
    const { signSession, verifySession } = await import('./jwt');
    const token = await signSession({
      sub: SUB,
      role: 'super',
      home_dept_id: null,
      session_version: 5,
    });
    const payload = await verifySession(token);
    expect(payload).toEqual({
      sub: SUB,
      role: 'super',
      home_dept_id: null,
      session_version: 5,
    });
  });
});
