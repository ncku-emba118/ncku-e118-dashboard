/**
 * 班級密碼登入後的 ?next= 過濾（防開放重導向）。獨立成檔：client 端表單要用，
 * 不讓 client bundle 碰到 lib/auth/class-gate.ts（那支會讀 CLASS_GATE_SECRET）。
 */

/** 班級密碼輸入頁路徑（lib/auth/class-gate.ts 再 re-export 給 middleware 用） */
export const CLASS_LOGIN_PATH = '/class-login';

export const CLASS_DEFAULT_NEXT = '/';

export function safeClassNext(raw: string | null): string {
  if (!raw) return CLASS_DEFAULT_NEXT;
  if (raw.length > 2000) return CLASS_DEFAULT_NEXT;
  if (!raw.startsWith('/') || raw.startsWith('//')) return CLASS_DEFAULT_NEXT;
  if (raw.includes('\\')) return CLASS_DEFAULT_NEXT;
  if (/[\u0000-\u001f\u007f]/.test(raw)) return CLASS_DEFAULT_NEXT;
  try {
    const base = 'http://class-gate.invalid';
    const u = new URL(raw, base);
    if (u.origin !== base) return CLASS_DEFAULT_NEXT;
    if (u.pathname === CLASS_LOGIN_PATH) return CLASS_DEFAULT_NEXT; // 避免導回自己
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return CLASS_DEFAULT_NEXT;
  }
}
