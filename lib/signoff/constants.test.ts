import { describe, expect, test } from 'vitest';
import { ATTACHMENT_LABELS, SUPPLEMENT_ATTACHMENT_LABELS } from './constants';

describe('SUPPLEMENT_ATTACHMENT_LABELS', () => {
  test('排除「收款帳號證明」（補件表單不提供這個選項，2026-08-13 敵對審查）', () => {
    expect(SUPPLEMENT_ATTACHMENT_LABELS).not.toContain('收款帳號證明');
  });

  test('其餘標籤與 ATTACHMENT_LABELS 完全一致（只少這一個，不多不少）', () => {
    const expected = ATTACHMENT_LABELS.filter((l) => l !== '收款帳號證明');
    expect(SUPPLEMENT_ATTACHMENT_LABELS).toEqual(expected);
    expect(SUPPLEMENT_ATTACHMENT_LABELS.length).toBe(ATTACHMENT_LABELS.length - 1);
  });

  test('建單表單用的 ATTACHMENT_LABELS 本身不受影響，仍含「收款帳號證明」', () => {
    expect(ATTACHMENT_LABELS).toContain('收款帳號證明');
  });
});
