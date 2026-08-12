import { describe, expect, test } from 'vitest';
import { isAllowedUnderMagicScope } from './magic-scope';
import type { SignoffAction } from './permission';

/**
 * 敵對審查修正2：財務長 magic 連結換發出的唯讀 session（magic_scope claim）
 * 只能對「核發時綁定的那一份文件」做 'view'，其餘一律拒絕。
 *
 * 敵對審查修正1定案後（連結不設 TTL、可重複使用），這支純函式是唯一防線，
 * 必須滴水不漏——全動作 × 全文件矩陣都要覆蓋，不能只挑幾個代表案例。
 */
const DOC_A = 'doc-aaaa-1111';
const DOC_B = 'doc-bbbb-2222';
const SCOPE_A = { kind: 'finance_readonly' as const, document_id: DOC_A };

const ALL_ACTIONS: SignoffAction[] = [
  'view',
  'sign',
  'reject',
  'nudge',
  'void',
  'supplement',
  'undo_reject',
];

describe('isAllowedUnderMagicScope — 無 claim（相容性鐵律）', () => {
  test('undefined claim 對任何動作 / 任何文件一律回 true（密碼登入 / 既有 assignment magic session 零 regression）', () => {
    for (const action of ALL_ACTIONS) {
      expect(isAllowedUnderMagicScope(undefined, action, DOC_A)).toBe(true);
      expect(isAllowedUnderMagicScope(undefined, action, DOC_B)).toBe(true);
    }
  });
});

describe('isAllowedUnderMagicScope — 有 finance_readonly claim', () => {
  test('唯一放行：view + 文件相符', () => {
    expect(isAllowedUnderMagicScope(SCOPE_A, 'view', DOC_A)).toBe(true);
  });

  test('view 但文件不符 → 拒絕（不可越權讀取其他文件）', () => {
    expect(isAllowedUnderMagicScope(SCOPE_A, 'view', DOC_B)).toBe(false);
  });

  test('文件相符但任何寫入動作 → 一律拒絕（sign/reject/nudge/void/supplement/undo_reject）', () => {
    const writeActions: SignoffAction[] = ['sign', 'reject', 'nudge', 'void', 'supplement', 'undo_reject'];
    for (const action of writeActions) {
      expect(isAllowedUnderMagicScope(SCOPE_A, action, DOC_A)).toBe(false);
    }
  });

  test('文件不符 + 寫入動作 → 雙重理由拒絕，仍是 false', () => {
    const writeActions: SignoffAction[] = ['sign', 'reject', 'nudge', 'void', 'supplement', 'undo_reject'];
    for (const action of writeActions) {
      expect(isAllowedUnderMagicScope(SCOPE_A, action, DOC_B)).toBe(false);
    }
  });

  test('全矩陣：僅 (view, DOC_A) 為 true，其餘 12 種組合皆 false', () => {
    for (const action of ALL_ACTIONS) {
      for (const doc of [DOC_A, DOC_B]) {
        const expected = action === 'view' && doc === DOC_A;
        expect(isAllowedUnderMagicScope(SCOPE_A, action, doc)).toBe(expected);
      }
    }
  });
});
