/**
 * 登入後導向目標的白名單過濾。
 *
 * ⚠ 不可直接信任 `?next=`：攻擊者可用
 * /board/login?next=https://evil.example/fake-login 誘導使用者登入後被導出站外
 * （開放重導向 → 釣魚）。
 *
 * 只放行站內、且確實需要登入的區段。白名單原本只有 /board/admin，
 * 但 /finance 底下的簽核與收入管理後來也需要登入 —— 從那些頁被踢來登入的人
 * 會被丟回公告欄後台，動線整條斷掉。此處補上遺漏區段。
 */
export const DEFAULT_NEXT = '/finance';
export const ALLOWED_NEXT_PREFIXES = ['/board/admin', '/finance', '/budget/signoff'] as const;

export function safeNext(raw: string | null): string {
  if (!raw) return DEFAULT_NEXT;
  if (!raw.startsWith('/')) return DEFAULT_NEXT;   // 擋絕對網址與 scheme-relative
  if (raw.startsWith('//')) return DEFAULT_NEXT;   // //evil.example 會被瀏覽器當外站
  if (raw.includes('://')) return DEFAULT_NEXT;
  if (raw.includes('\\')) return DEFAULT_NEXT;     // 部分瀏覽器把反斜線正規化成斜線
  // 前綴必須在路徑邊界結束，否則 /finance-evil 也會通過 startsWith
  const ok = ALLOWED_NEXT_PREFIXES.some(
    (p) => raw === p || raw.startsWith(`${p}/`) || raw.startsWith(`${p}?`) || raw.startsWith(`${p}#`),
  );
  return ok ? raw : DEFAULT_NEXT;
}
