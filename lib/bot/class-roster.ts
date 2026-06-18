/**
 * E118 班級名冊 — 動態 fetch members.json（B 方案 RAG）。
 *
 * 來源：https://members.e118.aqualux.dev/members.json（101 人公開層 7 欄）
 * 欄位：id, name, alias, company, title, industry, industry_raw, city, keywords[]
 *
 * 隱私：來源本身就是公開層、無手機/email/生日/地址。Gemini 只看到這層。
 *
 * 快取：5 分鐘 in-memory cache，避免每次聊天都打網路。
 */

const ROSTER_URL = 'https://members.e118.aqualux.dev/members.json';
const CACHE_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 3000;

export type RosterEntry = {
  id: number;
  name: string;
  alias?: string;
  company?: string;
  title?: string;
  industry?: string;
  industry_raw?: string;
  city?: string;
  keywords?: string[];
};

let cached: { at: number; rows: RosterEntry[] } | null = null;

/** 取得班級名冊；失敗回空陣列（讓 system prompt fallback 到只有幹部資訊）。 */
export async function getRoster(): Promise<RosterEntry[]> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.rows;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const resp = await fetch(ROSTER_URL, { signal: controller.signal });
    if (!resp.ok) {
      console.warn('[roster.fetch.non_200]', { status: resp.status });
      return cached?.rows ?? [];
    }
    const data = (await resp.json()) as unknown;
    if (!Array.isArray(data)) {
      console.warn('[roster.fetch.bad_shape]');
      return cached?.rows ?? [];
    }
    const rows = data as RosterEntry[];
    cached = { at: Date.now(), rows };
    return rows;
  } catch (e) {
    console.warn('[roster.fetch.error]', { e: String(e) });
    return cached?.rows ?? [];
  } finally {
    clearTimeout(timer);
  }
}

/** 把班級名冊壓縮成 LLM 易讀的緊湊格式（控制 token 量）。 */
export function rosterAsCompactText(rows: RosterEntry[]): string {
  if (!rows.length) return '';
  // 每行格式：「姓名 (alias) — 公司 / 職稱 / 產業 / 城市」
  const lines = rows.map((r) => {
    const alias = r.alias ? `（${r.alias}）` : '';
    const parts = [r.company, r.title, r.industry, r.city].filter(Boolean);
    return `- ${r.name}${alias} — ${parts.join(' / ')}`;
  });
  return `【E118 全班名冊（${rows.length} 人，公開層）】\n${lines.join('\n')}`;
}
