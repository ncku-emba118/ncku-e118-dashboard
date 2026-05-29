/**
 * /board/finance — 班級經費中心（A 款，公開透明頁，server-rendered）。
 * 「支出 = 跑過簽核的經費」。只顯示安全欄位（項目/金額/分類/狀態/日期），
 * 憑證與簽名留在 /board/signoff（幹部限定）。免登入即可看。
 */
import {
  getFinanceSettings,
  listFinanceExpenses,
  listFinanceReports,
  createSignedReadUrl,
} from '@/lib/signoff/dal';

export const dynamic = 'force-dynamic';

const WINE = '#8B1F2F', WINE_DEEP = '#6B1622', GOLD = '#C9A961', GOLD_SOFT = '#E0C896';
const CREAM = '#FAF7F2', INK = '#1A1612', MUTE = '#8A7F73', LINE = '#E8DFD0', OK = '#2D5F4E';
const CAT_COLORS = [WINE, '#C9742E', GOLD, '#6E8E5A', '#A9A29A', '#7A5A2B', '#3F5C6E'];
const fmt = (n: number) => n.toLocaleString('en-US');
const n = (v: string | null) => (v ? parseFloat(v) || 0 : 0);

const STATUS = {
  approved: { t: '✓ 已核准', c: OK },
  routing: { t: '● 簽核中', c: '#B26B1F' },
  rejected: { t: '已退回', c: MUTE },
  voided: { t: '已作廢', c: MUTE },
} as const;

export default async function FinancePage() {
  const [settings, expenses, reportRows] = await Promise.all([
    getFinanceSettings(),
    listFinanceExpenses(),
    listFinanceReports(),
  ]);
  const income = Math.round(n(settings.income_total));
  const approved = expenses.filter((e) => e.status === 'approved');
  const spent = Math.round(approved.reduce((s, e) => s + n(e.amount), 0));
  const balance = income - spent;
  const pending = expenses.filter((e) => e.status === 'routing').length;

  const catMap = new Map<string, number>();
  for (const e of approved) {
    const k = e.category || '其他';
    catMap.set(k, (catMap.get(k) ?? 0) + n(e.amount));
  }
  const categories = [...catMap.entries()]
    .map(([category, total]) => ({ category, total: Math.round(total) }))
    .sort((a, b) => b.total - a.total);

  // 只簽 reports/ 前綴的月報（防誤植 path 簽出 bucket 內其他私有檔，Codex P1）
  const reports = await Promise.all(
    reportRows
      .filter((r) => r.object_path.startsWith('reports/'))
      .map(async (r) => ({ period_label: r.period_label, url: (await createSignedReadUrl(r.object_path)).url })),
  );

  return (
    <main style={wrap}>
      <div style={phone}>
        <header style={hd}>
          <div style={eyebrow}>NCKU EMBA · E118</div>
          <h1 style={{ fontFamily: 'serif', fontSize: 24, marginTop: 8, fontWeight: 700 }}>班級經費中心</h1>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,.8)', marginTop: 6 }}>{settings.term_label} · 收支透明</div>
          <div style={transp}><span style={dot} />全班可查 · 簽核限幹部</div>
        </header>

        <section style={sec}>
          <div style={secH}><h2 style={h2}>收支總覽</h2><span style={tag}>系統自動統計</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <Stat label="班費收入" value={income} />
            <Stat label="已支出" value={spent} />
            <Stat label="結餘" value={balance} bal />
          </div>
          {categories.length > 0 && (
            <>
              <div style={{ display: 'flex', height: 14, borderRadius: 99, overflow: 'hidden', margin: '16px 0 10px' }}>
                {categories.map((c, i) => (<i key={c.category} style={{ width: `${(c.total / spent) * 100}%`, background: CAT_COLORS[i % CAT_COLORS.length] }} />))}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', fontSize: 12 }}>
                {categories.map((c, i) => (
                  <span key={c.category} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <i style={{ width: 10, height: 10, borderRadius: 3, background: CAT_COLORS[i % CAT_COLORS.length] }} />{c.category} {fmt(c.total)}
                  </span>
                ))}
              </div>
            </>
          )}
        </section>
        <div style={divider} />

        <section style={sec}>
          <div style={secH}><h2 style={h2}>月報下載</h2><span style={tag}>財務長上傳</span></div>
          {reports.length === 0 && <p style={{ color: MUTE, fontSize: 13 }}>尚無月報。</p>}
          {reports.map((r, i) => (
            <div key={i} style={repRow}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{r.period_label}</div>
              {r.url ? <a href={r.url} target="_blank" rel="noreferrer" style={dl}>↓ 下載</a> : <span style={{ color: MUTE, fontSize: 12 }}>—</span>}
            </div>
          ))}
        </section>
        <div style={divider} />

        <section style={sec}>
          <div style={secH}><h2 style={h2}>支出明細</h2><span style={tag}>= 跑過簽核的經費</span></div>
          {expenses.length === 0 && <p style={{ color: MUTE, fontSize: 13 }}>目前沒有支出紀錄。</p>}
          {expenses.map((e) => {
            const s = STATUS[e.status];
            return (
              <div key={e.id} style={expCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{e.title}</span>
                  <span style={{ fontFamily: 'serif', fontWeight: 700, fontSize: 15 }}>{fmt(Math.round(n(e.amount)))}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: 11.5, color: MUTE }}>
                  <span>{e.created_at.slice(0, 10)}{e.category ? ` · ${e.category}` : ''}</span>
                  <span style={{ fontWeight: 600, color: s.c }}>{s.t}</span>
                </div>
              </div>
            );
          })}
        </section>
        <div style={divider} />

        <section style={sec}>
          <a href="/finance/signoff" style={officer}>
            <div><div style={{ fontSize: 11, color: GOLD_SOFT, letterSpacing: '.1em' }}>🔒 幹部專區</div>
              <div style={{ fontFamily: 'serif', fontSize: 16, fontWeight: 700, marginTop: 3 }}>經費簽核</div></div>
            <span style={badge}>待簽核 {pending} 件 →</span>
          </a>
        </section>

        <footer style={ft}>本頁收支資料全班可查 · 簽核僅限幹部<br />成大 EMBA E118 · emba.aqualux.dev</footer>
      </div>
    </main>
  );
}

function Stat({ label, value, bal }: { label: string; value: number; bal?: boolean }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 8, padding: '13px 10px', textAlign: 'center' }}>
      <div style={{ fontSize: 11, color: MUTE }}>{label}</div>
      <div style={{ fontFamily: 'serif', fontSize: 18, fontWeight: 700, marginTop: 5, color: bal ? WINE : INK }}>{fmt(value)}</div>
    </div>
  );
}

const wrap: React.CSSProperties = { minHeight: '100vh', background: '#EDE6D8', padding: '20px 0', fontFamily: '"Noto Sans TC",sans-serif' };
const phone: React.CSSProperties = { maxWidth: 460, margin: '0 auto', background: CREAM, minHeight: '90vh', boxShadow: '0 8px 40px rgba(0,0,0,.12)', overflow: 'hidden', color: INK };
const hd: React.CSSProperties = { background: WINE, color: '#fff', padding: '26px 22px 22px', borderBottom: `3px solid ${GOLD}` };
const eyebrow: React.CSSProperties = { fontSize: 11, letterSpacing: '.28em', color: GOLD_SOFT };
const transp: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 14, fontSize: 12, background: 'rgba(255,255,255,.12)', padding: '5px 11px', borderRadius: 99 };
const dot: React.CSSProperties = { width: 6, height: 6, borderRadius: 99, background: GOLD };
const sec: React.CSSProperties = { padding: 22 };
const secH: React.CSSProperties = { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 };
const h2: React.CSSProperties = { fontFamily: 'serif', fontSize: 16, fontWeight: 700 };
const tag: React.CSSProperties = { fontSize: 10.5, color: MUTE, border: `1px solid ${LINE}`, padding: '3px 8px', borderRadius: 99 };
const divider: React.CSSProperties = { height: 1, background: LINE, margin: '0 22px' };
const repRow: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', border: `1px solid ${LINE}`, borderRadius: 8, padding: '13px 14px', marginBottom: 9 };
const dl: React.CSSProperties = { color: WINE, fontSize: 13, fontWeight: 600, textDecoration: 'none' };
const expCard: React.CSSProperties = { display: 'block', background: '#fff', border: `1px solid ${LINE}`, borderLeft: `4px solid ${WINE}`, borderRadius: 8, padding: '13px 14px', marginBottom: 9, textDecoration: 'none', color: INK };
const officer: React.CSSProperties = { background: WINE_DEEP, color: '#fff', borderRadius: 10, padding: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between', textDecoration: 'none' };
const badge: React.CSSProperties = { background: GOLD, color: WINE_DEEP, fontWeight: 700, fontSize: 13, padding: '7px 14px', borderRadius: 99 };
const ft: React.CSSProperties = { textAlign: 'center', padding: 22, color: MUTE, fontSize: 11, borderTop: `1px solid ${LINE}` };
