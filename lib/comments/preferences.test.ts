import { describe, expect, test } from 'vitest';
import { emptyPreferences, isCommentVisible, readPreferences, reporterId, updatePreferences, PREFERENCES_KEY } from './preferences';

function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}

describe('comment local safety preferences', () => {
  test('儲存容量不足時連續封鎖仍保留本頁全部設定', () => {
    const store = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    const first = updatePreferences(store, emptyPreferences(), (current) => ({ ...current, blocked: [{ key: 'a', name: 'A' }] }));
    const second = updatePreferences(store, first.value, (current) => ({ ...current, blocked: [...current.blocked, { key: 'b', name: 'B' }] }), first.saved);
    expect(second.saved).toBe(false);
    expect(second.value.blocked.map((entry) => entry.key)).toEqual(['a', 'b']);
  });
  test('檢舉回覆較晚到時保留另一分頁剛新增的封鎖', () => {
    const store = storage();
    const stale = emptyPreferences();
    store.setItem(PREFERENCES_KEY, JSON.stringify({ hidden: [], blocked: [{ key: 'a', name: '同學' }] }));
    const result = updatePreferences(store, stale, (current) => ({ ...current, hidden: [...current.hidden, 'reported'] }));
    expect(result.saved).toBe(true);
    expect(result.value).toEqual({ hidden: ['reported'], blocked: [{ key: 'a', name: '同學' }] });
  });
  test('封鎖依識別，不依顯示名稱，解除後恢復；檢舉隱藏獨立保留', () => {
    const prefs = { hidden: ['reported'], blocked: [{ key: 'a', name: '匿名同學' }] };
    expect(isCommentVisible({ id: '1', author_key: 'a' }, prefs)).toBe(false);
    expect(isCommentVisible({ id: '2', author_key: 'b' }, prefs)).toBe(true);
    prefs.blocked = [];
    expect(isCommentVisible({ id: '1', author_key: 'a' }, prefs)).toBe(true);
    expect(isCommentVisible({ id: 'reported', author_key: 'a' }, prefs)).toBe(false);
    expect(isCommentVisible({ id: '3', author_key: 'b', status: 'pending_review' }, prefs)).toBe(false);
  });
  test('跨頁讀回封鎖與隱藏；損毀不被默認為成功', () => {
    const store = storage();
    expect(readPreferences(store)).toEqual(emptyPreferences());
    const prefs = { hidden: ['1'], blocked: [{ key: 'a', name: '同學' }] };
    store.setItem(PREFERENCES_KEY, JSON.stringify(prefs));
    expect(readPreferences(store)).toEqual(prefs);
    store.setItem(PREFERENCES_KEY, '{');
    expect(() => readPreferences(store)).toThrow();
    store.setItem(PREFERENCES_KEY, JSON.stringify({ hidden: [], blocked: [null] }));
    expect(() => readPreferences(store)).toThrow();
  });
  test('重試沿用裝置識別；儲存失敗保留記憶體 ID 而不拋錯', () => {
    const store = storage();
    expect(reporterId(store)).toBe(reporterId(store));
    const broken = { getItem: () => null, setItem: () => { throw new Error('unavailable'); } };
    const id = reporterId(broken);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(reporterId(broken)).toBe(id);
    expect(reporterId({ getItem: () => { throw new Error('denied'); }, setItem: () => {} })).toBe(id);
  });
});
