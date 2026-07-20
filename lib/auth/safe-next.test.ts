import { describe, expect, test } from 'vitest';
import { safeNext, DEFAULT_NEXT } from './safe-next';

describe('safeNext — 放行站內需登入區段', () => {
  test('經費區各頁（原本被誤退回公告欄後台的情境）', () => {
    expect(safeNext('/finance')).toBe('/finance');
    expect(safeNext('/finance/signoff')).toBe('/finance/signoff');
    expect(safeNext('/finance/signoff/1bf6e630-b821-45da-b60e-550c29dc3a0a')).toBe(
      '/finance/signoff/1bf6e630-b821-45da-b60e-550c29dc3a0a',
    );
    expect(safeNext('/finance/income')).toBe('/finance/income');
  });
  test('公告欄後台與預算書簽核', () => {
    expect(safeNext('/board/admin')).toBe('/board/admin');
    expect(safeNext('/board/admin/new')).toBe('/board/admin/new');
    expect(safeNext('/budget/signoff')).toBe('/budget/signoff');
  });
  test('保留 query 與 hash', () => {
    expect(safeNext('/finance/signoff?tab=inbox')).toBe('/finance/signoff?tab=inbox');
    expect(safeNext('/board/admin#top')).toBe('/board/admin#top');
  });
});

describe('safeNext — 擋開放重導向', () => {
  test('外部絕對網址', () => {
    expect(safeNext('https://evil.example/fake-login')).toBe(DEFAULT_NEXT);
    expect(safeNext('http://evil.example')).toBe(DEFAULT_NEXT);
  });
  test('scheme-relative（瀏覽器會當外站）', () => {
    expect(safeNext('//evil.example')).toBe(DEFAULT_NEXT);
    expect(safeNext('//evil.example/finance')).toBe(DEFAULT_NEXT);
  });
  test('反斜線變體', () => {
    expect(safeNext('/\\evil.example')).toBe(DEFAULT_NEXT);
    expect(safeNext('\\\\evil.example')).toBe(DEFAULT_NEXT);
  });
  test('前綴仿冒：不可只用 startsWith', () => {
    expect(safeNext('/finance-evil')).toBe(DEFAULT_NEXT);
    expect(safeNext('/financeXXX/steal')).toBe(DEFAULT_NEXT);
    expect(safeNext('/board/administrator')).toBe(DEFAULT_NEXT);
  });
  test('非白名單站內路徑退回預設', () => {
    expect(safeNext('/budget')).toBe(DEFAULT_NEXT);
    expect(safeNext('/')).toBe(DEFAULT_NEXT);
  });
  test('空值', () => {
    expect(safeNext(null)).toBe(DEFAULT_NEXT);
    expect(safeNext('')).toBe(DEFAULT_NEXT);
  });
});
