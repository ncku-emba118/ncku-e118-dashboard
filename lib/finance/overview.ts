/**
 * 收支總覽的共用計算——原本只寫在 /finance/page.tsx 裡，現在
 * /finance/report/[id]/page.tsx（整理版報表頁）也要用同一份邏輯，
 * 抽出來避免兩邊各自算、數字對不起來。
 */
import type { FinanceExpense, FinanceIncome } from '@/lib/signoff/dal';
import { sumIncome } from '@/lib/finance/income';

const n = (v: string | null) => (v ? parseFloat(v) || 0 : 0);

export function computeFinanceOverview(incomeRows: FinanceIncome[], expenses: FinanceExpense[]) {
  const income = Math.round(sumIncome(incomeRows));
  const approved = expenses.filter((e) => e.status === 'approved');
  const spent = Math.round(approved.reduce((s, e) => s + n(e.amount), 0));
  const balance = income - spent;

  const catMap = new Map<string, number>();
  for (const e of approved) {
    const k = e.category || '其他';
    catMap.set(k, (catMap.get(k) ?? 0) + n(e.amount));
  }
  const categories = [...catMap.entries()]
    .map(([category, total]) => ({ category, total: Math.round(total) }))
    .sort((a, b) => b.total - a.total);

  return { income, spent, balance, categories, approvedExpenses: approved };
}
