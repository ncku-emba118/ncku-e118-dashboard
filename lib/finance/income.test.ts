import { describe, it, expect } from 'vitest';
import { canManageIncome, parseIncomeInput, sumIncome } from './income';

describe('canManageIncome', () => {
  it('super（班代/副班代/秘書）可管理', () => {
    expect(canManageIncome({ role: 'super', home_dept_id: 'secretary' })).toBe(true);
    expect(canManageIncome({ role: 'super', home_dept_id: null })).toBe(true);
  });
  it('財務長（dept + finance）可管理', () => {
    expect(canManageIncome({ role: 'dept', home_dept_id: 'finance' })).toBe(true);
  });
  it('其他部門 dept 不可管理', () => {
    expect(canManageIncome({ role: 'dept', home_dept_id: 'activity' })).toBe(false);
    expect(canManageIncome({ role: 'dept', home_dept_id: null })).toBe(false);
  });
});

describe('parseIncomeInput', () => {
  it('正常輸入通過並正規化', () => {
    const r = parseIncomeInput({ occurred_on: '2026-03-01', category: '收班費', amount: 303000, note: ' 第一學期 ' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ occurred_on: '2026-03-01', category: '收班費', amount: 303000, note: '第一學期' });
  });
  it('字串金額也接受（client 傳字串）', () => {
    const r = parseIncomeInput({ occurred_on: '2026-03-01', category: '利息', amount: '12.50', note: '' });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.value.amount).toBe(12.5); expect(r.value.note).toBe(null); }
  });
  it('金額 <= 0 擋掉', () => {
    expect(parseIncomeInput({ occurred_on: '2026-03-01', category: '收班費', amount: 0 }).ok).toBe(false);
    expect(parseIncomeInput({ occurred_on: '2026-03-01', category: '收班費', amount: -5 }).ok).toBe(false);
  });
  it('超過兩位小數擋掉', () => {
    expect(parseIncomeInput({ occurred_on: '2026-03-01', category: '利息', amount: 1.005 }).ok).toBe(false);
  });
  it('金額過大擋掉', () => {
    expect(parseIncomeInput({ occurred_on: '2026-03-01', category: '收班費', amount: 100000000 }).ok).toBe(false);
  });
  it('日期格式錯擋掉', () => {
    expect(parseIncomeInput({ occurred_on: '2026/03/01', category: '收班費', amount: 100 }).ok).toBe(false);
    expect(parseIncomeInput({ occurred_on: '20260301', category: '收班費', amount: 100 }).ok).toBe(false);
  });
  it('格式對但無效日期擋掉', () => {
    expect(parseIncomeInput({ occurred_on: '2026-13-40', category: '收班費', amount: 100 }).ok).toBe(false);
    expect(parseIncomeInput({ occurred_on: '2026-02-30', category: '收班費', amount: 100 }).ok).toBe(false);
  });
  it('項目必填、長度上限', () => {
    expect(parseIncomeInput({ occurred_on: '2026-03-01', category: '', amount: 100 }).ok).toBe(false);
    expect(parseIncomeInput({ occurred_on: '2026-03-01', category: 'x'.repeat(21), amount: 100 }).ok).toBe(false);
  });
  it('備註長度上限', () => {
    expect(parseIncomeInput({ occurred_on: '2026-03-01', category: '收班費', amount: 100, note: 'x'.repeat(201) }).ok).toBe(false);
  });
  it('非物件擋掉', () => {
    expect(parseIncomeInput(null).ok).toBe(false);
    expect(parseIncomeInput('x').ok).toBe(false);
  });
});

describe('sumIncome', () => {
  it('加總字串/數字混合', () => {
    expect(sumIncome([{ amount: '100.00' }, { amount: 200 }, { amount: '50.50' }])).toBe(350.5);
  });
  it('空陣列為 0、null 當 0', () => {
    expect(sumIncome([])).toBe(0);
    expect(sumIncome([{ amount: null }, { amount: '10' }])).toBe(10);
  });
});
