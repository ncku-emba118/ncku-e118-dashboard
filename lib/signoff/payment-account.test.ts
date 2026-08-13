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

// ── 金額解析（共用 production parser，不自己重寫一份）──
import { normalizeAmountInput, MAX_AMOUNT } from './amount';

describe('建單金額解析', () => {
  test('純數字與嚴格千分位可接受', () => {
    expect(normalizeAmountInput('14400')).toBe('14400');
    expect(normalizeAmountInput('14,400')).toBe('14400');
    expect(normalizeAmountInput('1,234,567.89')).toBe('1234567.89');
    expect(normalizeAmountInput(' 14,400 ')).toBe('14400');
  });
  test('全形數字與全形逗號/小數點可接受', () => {
    expect(normalizeAmountInput('１４，４００')).toBe('14400');
    expect(normalizeAmountInput('１４４００．５０')).toBe('14400.50');
  });
  test('歧義輸入一律拒絕，不可靜默變成別的金額', () => {
    for (const v of ['1,2', '12,34,56', '1 2', '1,23', '1,2345', ',123', '123,']) {
      expect(normalizeAmountInput(v)).toBeNull();
    }
  });
  test('非數字與多重小數點拒絕', () => {
    for (const v of ['abc', '14.400.00', '1,4a0', '', '.5', '1.234']) {
      expect(normalizeAmountInput(v)).toBeNull();
    }
  });
  test('超出 NUMERIC(12,2) 範圍的值可被上限判斷攔下', () => {
    const v = normalizeAmountInput('999999999999999999999999999999');
    expect(v).not.toBeNull();
    expect(parseFloat(v!) > MAX_AMOUNT).toBe(true);
  });
});
