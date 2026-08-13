import { describe, expect, test } from 'vitest';
import { sanitizePaymentAccount, hasPaymentAccountContent } from './payment-account';

describe('sanitizePaymentAccount', () => {
  test('null/undefined 輸入 → ok, value=null', () => {
    expect(sanitizePaymentAccount(null)).toEqual({ ok: true, value: null });
    expect(sanitizePaymentAccount(undefined)).toEqual({ ok: true, value: null });
  });

  test('四欄全空（或只有空白）→ 視為沒填，value=null', () => {
    expect(sanitizePaymentAccount({ bank: '', branch: '  ', account_name: null, account_number: undefined }))
      .toEqual({ ok: true, value: null });
  });

  test('正常四欄 → trim 後回傳', () => {
    const r = sanitizePaymentAccount({
      bank: '  台灣銀行 ',
      branch: ' 成功分行 ',
      account_name: ' 黃政傑 ',
      account_number: ' 123-456-7890123 ',
    });
    expect(r).toEqual({
      ok: true,
      value: {
        bank: '台灣銀行',
        branch: '成功分行',
        account_name: '黃政傑',
        account_number: '123-456-7890123',
      },
    });
  });

  test('只填部分欄位 → 其餘回傳 null（不強制全填）', () => {
    const r = sanitizePaymentAccount({ bank: '台灣銀行' });
    expect(r).toEqual({
      ok: true,
      value: { bank: '台灣銀行', branch: null, account_name: null, account_number: null },
    });
  });

  test('帳號含非法字元（英文字母）→ 拒絕', () => {
    const r = sanitizePaymentAccount({ account_number: '1234ABCD' });
    expect(r.ok).toBe(false);
  });

  test('帳號位數過短 → 拒絕', () => {
    const r = sanitizePaymentAccount({ account_number: '12' });
    expect(r.ok).toBe(false);
  });

  test('帳號位數過長 → 拒絕', () => {
    const r = sanitizePaymentAccount({ account_number: '1'.repeat(25) });
    expect(r.ok).toBe(false);
  });

  test('帳號帶連字號與空白但純數字位數在範圍內 → 接受', () => {
    const r = sanitizePaymentAccount({ account_number: '123 456 7890' });
    expect(r.ok).toBe(true);
  });

  test('銀行名稱過長 → 拒絕', () => {
    const r = sanitizePaymentAccount({ bank: 'A'.repeat(61) });
    expect(r.ok).toBe(false);
  });

  test('戶名過長 → 拒絕', () => {
    const r = sanitizePaymentAccount({ account_name: 'A'.repeat(61) });
    expect(r.ok).toBe(false);
  });
});

describe('hasPaymentAccountContent', () => {
  test('null/undefined → false', () => {
    expect(hasPaymentAccountContent(null)).toBe(false);
    expect(hasPaymentAccountContent(undefined)).toBe(false);
  });
  test('全欄位 null → false', () => {
    expect(hasPaymentAccountContent({ bank: null, branch: null, account_name: null, account_number: null })).toBe(false);
  });
  test('任一欄位有值 → true', () => {
    expect(hasPaymentAccountContent({ bank: '台灣銀行', branch: null, account_name: null, account_number: null })).toBe(true);
  });
});

// ── 金額正規化（2026-08-13：使用者打「14,400」被擋，逗號應被接受）──
describe('建單金額正規化', () => {
  const normalize = (v: string) =>
    v
      .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
      .replace(/[．]/g, '.')
      .replace(/[,，\s]/g, '');
  const valid = (v: string) => /^\d+(\.\d{1,2})?$/.test(normalize(v));

  test('千分位逗號（半形/全形）可接受', () => {
    expect(normalize('14,400')).toBe('14400');
    expect(normalize('14，400')).toBe('14400');
    expect(valid('14,400')).toBe(true);
  });
  test('全形數字與全形小數點可接受', () => {
    expect(normalize('１４４００．５０')).toBe('14400.50');
    expect(valid('１４４００．５０')).toBe(true);
  });
  test('夾雜空白可接受', () => {
    expect(valid(' 14 400 ')).toBe(true);
  });
  test('仍然擋掉真正無效的輸入', () => {
    for (const v of ['abc', '14.400.00', '1,4a0', '']) expect(valid(v)).toBe(false);
  });
});
