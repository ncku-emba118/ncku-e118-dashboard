import { describe, expect, test } from 'vitest';
import {
  canAccessSignoff,
  type SignoffActor,
  type SignoffAccessContext,
} from './permission';

const SUPER: SignoffActor = { sub: 'super-1', role: 'super', home_dept_id: null };
const FINANCE: SignoffActor = { sub: 'fin-1', role: 'dept', home_dept_id: 'finance' };
const ACTIVITY: SignoffActor = { sub: 'act-1', role: 'dept', home_dept_id: 'activity' };
const MEDIA: SignoffActor = { sub: 'media-1', role: 'dept', home_dept_id: 'media' };

// 文件由財務發起、owner_dept=finance；指派 班代(super-1) 與 活動長(act-1) 簽
const ctx: SignoffAccessContext = {
  doc: { created_by: 'fin-1', owner_dept_id: 'finance' },
  pendingAssigneeIds: ['super-1', 'act-1'],
  allAssigneeIds: ['super-1', 'act-1'],
};

describe('canAccessSignoff — view', () => {
  test('super can view any document', () => {
    expect(canAccessSignoff(SUPER, 'view', ctx)).toBe(true);
  });
  test('creator dept can view', () => {
    expect(canAccessSignoff(FINANCE, 'view', ctx)).toBe(true);
  });
  test('assignee dept can view', () => {
    expect(canAccessSignoff(ACTIVITY, 'view', ctx)).toBe(true);
  });
  test('unrelated dept cannot view', () => {
    expect(canAccessSignoff(MEDIA, 'view', ctx)).toBe(false);
  });
  test('owner-dept member (not creator/assignee) can view', () => {
    const otherFinance: SignoffActor = { sub: 'fin-2', role: 'dept', home_dept_id: 'finance' };
    expect(canAccessSignoff(otherFinance, 'view', ctx)).toBe(true);
  });
});

describe('canAccessSignoff — sign / reject', () => {
  test('pending assignee can sign', () => {
    expect(canAccessSignoff(ACTIVITY, 'sign', ctx)).toBe(true);
  });
  test('non-assignee (even super) cannot sign', () => {
    const otherSuper: SignoffActor = { sub: 'super-2', role: 'super', home_dept_id: null };
    expect(canAccessSignoff(otherSuper, 'sign', ctx)).toBe(false);
  });
  test('assignee who already signed (not pending) cannot sign again', () => {
    const signedCtx: SignoffAccessContext = {
      ...ctx,
      pendingAssigneeIds: ['act-1'], // super-1 已簽
    };
    expect(canAccessSignoff(SUPER, 'sign', signedCtx)).toBe(false);
  });
  test('pending assignee can reject', () => {
    expect(canAccessSignoff(SUPER, 'reject', ctx)).toBe(true);
  });
});

describe('canAccessSignoff — nudge / void', () => {
  test('super can nudge', () => {
    expect(canAccessSignoff(SUPER, 'nudge', ctx)).toBe(true);
  });
  test('creator can nudge', () => {
    expect(canAccessSignoff(FINANCE, 'nudge', ctx)).toBe(true);
  });
  test('non-creator dept cannot nudge', () => {
    expect(canAccessSignoff(ACTIVITY, 'nudge', ctx)).toBe(false);
  });
  test('super can void', () => {
    expect(canAccessSignoff(SUPER, 'void', ctx)).toBe(true);
  });
  test('dept cannot void (even creator)', () => {
    expect(canAccessSignoff(FINANCE, 'void', ctx)).toBe(false);
  });
});

describe('canAccessSignoff — supplement（0019 補充資料）', () => {
  test('creator can supplement', () => {
    expect(canAccessSignoff(FINANCE, 'supplement', ctx)).toBe(true);
  });
  test('super can supplement（秘書長 / 班代 / 副班代）', () => {
    expect(canAccessSignoff(SUPER, 'supplement', ctx)).toBe(true);
  });
  test('assignee who is not creator cannot supplement', () => {
    // 活動長被指派簽核，但不是申請人 → 不得補充他人的單
    expect(canAccessSignoff(ACTIVITY, 'supplement', ctx)).toBe(false);
  });
  test('unrelated dept cannot supplement', () => {
    expect(canAccessSignoff(MEDIA, 'supplement', ctx)).toBe(false);
  });
  test('same owner_dept but not creator cannot supplement', () => {
    // 同部門可以「看」，但不能代為補充（避免同部門互相竄改對方單據）
    const sameDept: SignoffActor = { sub: 'fin-2', role: 'dept', home_dept_id: 'finance' };
    expect(canAccessSignoff(sameDept, 'view', ctx)).toBe(true);
    expect(canAccessSignoff(sameDept, 'supplement', ctx)).toBe(false);
  });
});
