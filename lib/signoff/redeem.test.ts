import { describe, expect, test } from 'vitest';
import { canRedeemAssignment } from './redeem';
import type { AssignmentStatus, SignoffStatus } from './dal';

/**
 * 安全迴歸：magic 連結只在「指派 pending 且單據 routing」時可換發 session。
 * 舊連結（已簽 / 已退 / 已核准 / 已作廢）即使 token 未過期也必須失效。
 */
const ASSIGN: AssignmentStatus[] = ['pending', 'signed', 'rejected'];
const DOC: SignoffStatus[] = ['routing', 'approved', 'rejected', 'voided'];

describe('canRedeemAssignment', () => {
  test('唯一放行：pending + routing', () => {
    expect(canRedeemAssignment('pending', 'routing')).toBe(true);
  });

  test('已簽的指派一律失效（即使單仍 routing）', () => {
    expect(canRedeemAssignment('signed', 'routing')).toBe(false);
  });

  test('已退回的指派一律失效', () => {
    expect(canRedeemAssignment('rejected', 'routing')).toBe(false);
  });

  test('單已核准 → pending 指派也不可再換發（防已 approved 舊連結）', () => {
    expect(canRedeemAssignment('pending', 'approved')).toBe(false);
  });

  test('單已退回 / 已作廢 → 一律失效', () => {
    expect(canRedeemAssignment('pending', 'rejected')).toBe(false);
    expect(canRedeemAssignment('pending', 'voided')).toBe(false);
  });

  test('全矩陣：僅 (pending, routing) 為 true，其餘皆 false', () => {
    for (const a of ASSIGN) {
      for (const d of DOC) {
        const expected = a === 'pending' && d === 'routing';
        expect(canRedeemAssignment(a, d)).toBe(expected);
      }
    }
  });
});
