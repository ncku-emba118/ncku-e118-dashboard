/**
 * Dashboard 首頁兩個「即時看板」資料來源（server 端撈，ISR 快取）。
 *   getLatestPosts  — 公告欄最新公告（同源 Supabase posts）
 *   getUpcomingEvents — 班級行事曆近期活動（公開 Google ICS）
 * 任一來源失敗都回 []（看板顯示空、頁面照常渲染），不讓 dashboard 因外部資料掛掉。
 */
import 'server-only';
import { getServerClient } from '@/lib/supabase/server';
import { deptInfo } from '@/lib/depts';

export type FeedPost = { dept: string; title: string; excerpt: string; date: string; att: number };
export type FeedEvent = { date: string; weekday: string; title: string };

function excerpt(md: string | null): string {
  if (!md) return '';
  for (const ln of md.split('\n')) {
    const s = ln.replace(/^[#\s\d.、]+/, '').trim();
    if (s.length > 4) return s.slice(0, 38);
  }
  return '';
}

export async function getLatestPosts(n = 3): Promise<FeedPost[]> {
  try {
    const supabase = getServerClient();
    const { data } = await supabase
      .from('posts')
      .select('department_id, title, content, attachments, pinned, created_at')
      .eq('published', true)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(n);
    return (data ?? []).map((p) => ({
      dept: deptInfo(p.department_id as string).name,
      title: (p.title as string) ?? '',
      excerpt: excerpt(p.content as string | null),
      date: ((p.created_at as string) ?? '').slice(0, 10),
      att: Array.isArray(p.attachments) ? (p.attachments as unknown[]).length : 0,
    }));
  } catch {
    return [];
  }
}

const ICS_URL =
  'https://calendar.google.com/calendar/ical/ncku.emba.e118%40gmail.com/public/basic.ics';
const WD = '日一二三四五六';

export async function getUpcomingEvents(n = 3): Promise<FeedEvent[]> {
  try {
    const res = await fetch(ICS_URL, {
      next: { revalidate: 600 },
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) return [];
    let ics = await res.text();
    ics = ics.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, ''); // unfold folded lines
    const out: { d: Date; t: string }[] = [];
    const re = /BEGIN:VEVENT([\s\S]*?)END:VEVENT/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(ics))) {
      const blk = m[1];
      const su = blk.match(/\nSUMMARY:(.*)/);
      const dt = blk.match(/DTSTART[^:]*:([0-9T]+)/);
      if (!su || !dt) continue;
      const raw = dt[1];
      const y = +raw.slice(0, 4), mo = +raw.slice(4, 6), da = +raw.slice(6, 8);
      if (!y) continue;
      out.push({ d: new Date(Date.UTC(y, mo - 1, da)), t: su[1].trim().replace(/\\,/g, ',').replace(/\\/g, '') });
    }
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    return out
      .filter((e) => e.d >= today)
      .sort((a, b) => +a.d - +b.d)
      .slice(0, n)
      .map((e) => ({
        date: `${String(e.d.getUTCMonth() + 1).padStart(2, '0')}/${String(e.d.getUTCDate()).padStart(2, '0')}`,
        weekday: WD[e.d.getUTCDay()],
        title: e.t.slice(0, 30),
      }));
  } catch {
    return [];
  }
}
