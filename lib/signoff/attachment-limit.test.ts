import { describe, expect, test } from 'vitest';
import { attachmentCountError, MAX_ATTACHMENTS } from './attachment-limit';

describe('attachmentCountError', () => {
  test('在上限內（含收款帳號證明）→ 放行（null）', () => {
    expect(attachmentCountError(MAX_ATTACHMENTS - 1, true)).toBeNull();
    expect(attachmentCountError(MAX_ATTACHMENTS, false)).toBeNull();
  });

  // ── 核心案例：11 份一般附件 + 1 份收款帳號證明 = 12 份，超過上限 ────────
  test('11 份一般附件 + 1 份收款帳號證明（共 12 份）→ 超過上限，擋下', () => {
    const err = attachmentCountError(11, true);
    expect(err).not.toBeNull();
    expect(err).toContain(String(MAX_ATTACHMENTS));
    expect(err).toContain('12');
  });

  test('沒有收款帳號證明，一般附件本身就超量 → 一樣擋下', () => {
    expect(attachmentCountError(MAX_ATTACHMENTS + 1, false)).not.toBeNull();
  });

  test('剛好等於上限（不含帳號證明）→ 放行；再加 1 份帳號證明才超量', () => {
    expect(attachmentCountError(MAX_ATTACHMENTS, false)).toBeNull();
    expect(attachmentCountError(MAX_ATTACHMENTS, true)).not.toBeNull();
  });

  test('沒有任何附件 → 放行（此函式只管上限，不管下限）', () => {
    expect(attachmentCountError(0, false)).toBeNull();
  });
});
