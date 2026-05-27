/**
 * 統一時間格式化 — 強制 Asia/Taipei
 *
 * 為什麼不直接用 new Date(iso).getMonth()：
 *   裝置時區會影響顯示。PC 設 UTC、手機設 Taipei → 同一篇公告兩邊看不同時間。
 *   全班用同一個顯示時區（Taipei）才不會有人誤解「3:45 是現在還是 11 小時前」。
 *
 * Intl.DateTimeFormat 在 Node SSR + 瀏覽器都 native 支援、不需要額外依賴。
 */
const taipeiFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/**
 * ISO → `YYYY-MM-DD HH:mm` (Asia/Taipei)
 * 例：'2026-05-27T08:24:45.077218+00:00' → '2026-05-27 16:24'
 */
export function formatDateTW(iso: string): string {
  try {
    const parts = taipeiFmt.formatToParts(new Date(iso));
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
  } catch {
    return iso;
  }
}
