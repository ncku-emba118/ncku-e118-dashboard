import type { Metadata } from 'next';
import Link from 'next/link';
import { ACTIVITIES, RESERVES, META, fmt } from '@/lib/budget/data';

export const metadata: Metadata = {
  title: '執行追蹤｜E118 南班班費預算說明書',
  description: '全部活動與預備金的預算 vs 實際對照總表 — 每場結算後更新，累積至三年期末即為總對帳基礎。',
};

const WINE = '#8B1F2F';
const WINE_DEEP = '#6B1622';
const GOLD = '#C9A961';
const PAPER = '#F4EFE6';
const INK = '#1A1612';
const MUTE = '#8A7F73';
const LINE = '#E8DFD0';
const OK = '#2D5F4E';
const TC = "'Noto Serif TC', 'PingFang TC', 'Songti TC', serif";

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  planning: { label: '規劃中', color: MUTE, bg: '#EFEAE0' },
  preparing: { label: '籌備中', color: '#B26B1F', bg: '#F7EBD9' },
  'in-progress': { label: '執行中', color: WINE, bg: '#F4DDE0' },
  settled: { label: '已結算', color: OK, bg: '#E0E8DD' },
};

/** 實際數口徑：以結算後的班費實付為準（已扣個人自費），未結算者不填 */
const actualOf = (a: (typeof ACTIVITIES)[number]) => a.actualSplit?.paidByFund;

export default function TrackingPage() {
  const settled = ACTIVITIES.filter((a) => a.actualSplit);
  const budgetTotal = ACTIVITIES.reduce((s, a) => s + a.net, 0);
  const settledBudget = settled.reduce((s, a) => s + a.net, 0);
  const settledActual = settled.reduce((s, a) => s + (actualOf(a) ?? 0), 0);
  const reservesTotal = RESERVES.reduce((s, r) => s + r.amount, 0);

  return (
    <>
      <div style={{ marginBottom: 20 }}>
        <Link href="/budget" style={{ fontSize: 13, color: MUTE, textDecoration: 'none' }}>← 回總覽</Link>
        <h1 style={{ fontFamily: TC, fontSize: 28, color: WINE_DEEP, fontWeight: 600, margin: '12px 0 6px' }}>執行追蹤</h1>
        <p style={{ fontSize: 14, color: '#4A413A', lineHeight: 1.8, maxWidth: 800 }}>
          全部活動與預備金的「預算 vs 實際」對照總表。每場活動結算後，本表的實際數與差異即更新；
          累積到三年期末（2028-08），這張表就是總對帳的基礎。實際數採「班費實付」口徑（個人自費不計入）。
        </p>
      </div>

      {/* 三大數字 */}
      <section className="bdg-grid bdg-grid-3 bdg-grid-gap-sm" style={{ marginBottom: 26 }}>
        <Stat label="活動預算合計" value={`NT$ ${fmt(budgetTotal)}`} sub={`${ACTIVITIES.length} 個項目（班費淨負擔口徑）`} accent={INK} />
        <Stat
          label="已結算實際數"
          value={`NT$ ${fmt(settledActual)}`}
          sub={`${settled.length} / ${ACTIVITIES.length} 項已結算${settled.length > 0 ? `・較預算 ${settledActual - settledBudget >= 0 ? '+' : '−'}${fmt(Math.abs(settledActual - settledBudget))}` : ''}`}
          accent={WINE}
        />
        <Stat label="預備金編列" value={`NT$ ${fmt(reservesTotal)}`} sub={`${RESERVES.length} 項・未動用則期末退回`} accent={GOLD} />
      </section>

      {/* 活動對照表 */}
      <h2 style={h2Style}>活動項目（{ACTIVITIES.length}）</h2>
      <div className="bdg-table-wrap" style={{ marginBottom: 26 }}>
        <table className="bdg-table">
          <caption>活動預算 vs 實際對照（金額單位：新台幣元；實際數＝班費實付）</caption>
          <thead>
            <tr>
              <th scope="col">項目</th>
              <th scope="col" className="num">預算</th>
              <th scope="col" className="num">實際</th>
              <th scope="col" className="num">差異</th>
              <th scope="col">狀態</th>
              <th scope="col">結算單</th>
            </tr>
          </thead>
          <tbody>
            {ACTIVITIES.map((a) => {
              const actual = actualOf(a);
              const diff = actual !== undefined ? actual - a.net : undefined;
              const st = STATUS_LABEL[a.status] ?? STATUS_LABEL.planning;
              return (
                <tr key={a.slug}>
                  <td className="strong" data-label="項目">
                    <Link href={`/budget/activities/${a.slug}`} style={{ color: WINE, textDecoration: 'none' }}>
                      {a.shortName}
                    </Link>
                  </td>
                  <td className="num" data-label="預算">{fmt(a.net)}</td>
                  <td className="num" data-label="實際">{actual !== undefined ? <strong>{fmt(actual)}</strong> : <span style={{ color: MUTE }}>—</span>}</td>
                  <td className="num" data-label="差異" style={diff !== undefined ? { color: diff > 0 ? WINE : OK, fontWeight: 600 } : undefined}>
                    {diff !== undefined ? `${diff >= 0 ? '+' : '−'}${fmt(Math.abs(diff))}` : <span style={{ color: MUTE }}>—</span>}
                  </td>
                  <td data-label="狀態">
                    <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 10, background: st.bg, color: st.color, fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {st.label}
                    </span>
                  </td>
                  <td data-label="結算單">
                    {a.settlement ? (
                      <Link href={`/budget/settlement/${a.slug}`} style={{ color: OK, fontSize: 12.5, fontWeight: 600 }}>
                        {a.settlement.no} →
                      </Link>
                    ) : (
                      <span style={{ color: MUTE, fontSize: 12.5 }}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            <tr className="sub">
              <td className="strong" data-label="">合計</td>
              <td className="num strong" data-label="">{fmt(budgetTotal)}</td>
              <td className="num strong" data-label="">{settled.length > 0 ? fmt(settledActual) : '—'}</td>
              <td className="num strong" data-label="">
                {settled.length > 0 ? `${settledActual - settledBudget >= 0 ? '+' : '−'}${fmt(Math.abs(settledActual - settledBudget))}` : '—'}
              </td>
              <td data-label="" colSpan={2} style={{ fontSize: 12, color: MUTE }}>
                差異合計僅含已結算項目
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 預備金對照表 */}
      <h2 style={h2Style}>預備金（{RESERVES.length}）</h2>
      <div className="bdg-table-wrap" style={{ marginBottom: 26 }}>
        <table className="bdg-table">
          <caption>預備金編列與動用（金額單位：新台幣元）</caption>
          <thead>
            <tr>
              <th scope="col">項目</th>
              <th scope="col" className="num">編列</th>
              <th scope="col" className="num">已動用</th>
              <th scope="col" className="num">餘額</th>
              <th scope="col">狀態</th>
            </tr>
          </thead>
          <tbody>
            {RESERVES.map((r) => (
              <tr key={r.slug}>
                <td className="strong" data-label="項目">
                  <Link href={`/budget/reserves#${r.slug}`} style={{ color: WINE, textDecoration: 'none' }}>
                    {r.name}
                  </Link>
                </td>
                <td className="num" data-label="編列">{fmt(r.amount)}</td>
                <td className="num" data-label="已動用"><span style={{ color: MUTE }}>0</span></td>
                <td className="num" data-label="餘額">{fmt(r.amount)}</td>
                <td data-label="狀態">
                  <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 10, background: '#EFEAE0', color: MUTE, fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap' }}>
                    未動用
                  </span>
                </td>
              </tr>
            ))}
            <tr className="sub">
              <td className="strong" data-label="">合計</td>
              <td className="num strong" data-label="">{fmt(reservesTotal)}</td>
              <td className="num strong" data-label="">0</td>
              <td className="num strong" data-label="">{fmt(reservesTotal)}</td>
              <td data-label="" />
            </tr>
          </tbody>
        </table>
      </div>

      {/* 口徑與規則說明 */}
      <div
        style={{
          background: PAPER,
          border: `1px solid ${LINE}`,
          borderLeft: `3px solid ${GOLD}`,
          borderRadius: 4,
          padding: '12px 16px',
          fontSize: 13,
          color: '#4A413A',
          lineHeight: 1.9,
        }}
      >
        <strong style={{ color: WINE_DEEP }}>本表口徑：</strong>
        「預算」為各活動的班費淨負擔（保守口徑）；「實際」為結算後的班費實付金額，個人自費／代收代付不計入。
        差異為紅字（+）代表實際高於預算、綠字（−）代表低於預算；已結算項目的南北請款以各活動
        <Link href="/budget/settlement" style={{ color: WINE }}> 結算單 </Link>為準。
        預備金動用經
        <Link href="/finance/signoff" style={{ color: WINE }}> 經費單簽核 </Link>核准後，由財務長更新本表。
      </div>
    </>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub: string; accent: string }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderTop: `3px solid ${accent}`, borderRadius: 8, padding: '14px 18px' }}>
      <div style={{ fontSize: 12, color: MUTE, marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 24, fontWeight: 600, color: INK }}>{value}</div>
      <div style={{ fontSize: 12, color: MUTE, marginTop: 4, lineHeight: 1.6 }}>{sub}</div>
    </div>
  );
}

const h2Style: React.CSSProperties = {
  fontFamily: TC,
  fontSize: 20,
  color: WINE_DEEP,
  borderLeft: `4px solid ${GOLD}`,
  paddingLeft: 12,
  margin: '24px 0 12px',
};
