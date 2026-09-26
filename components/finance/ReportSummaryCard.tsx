/**
 * 月報 Excel 自動解析後的整理版摘要（階段二）。純 server component，
 * 展開/收合用原生 <details>，不需要額外的 client-side JS。
 * 只顯示網站其他地方沒有追蹤到的資料（利息、班聚結餘款等零散收入、銀行餘額）；
 * 班費收入/支出明細本頁上方已經有自己的區塊，這裡不重複顯示，避免兩份數字
 * 各自更新不同步時看起來自相矛盾。
 */
import type { ParsedReportSummary } from '@/lib/finance/report-parser';

const WINE = '#8B1F2F';
const GOLD = '#C9A961';
const MUTE = '#8A7F73';
const LINE = '#E5DCCB';
const OK = '#2D5F4E';
const PAPER = '#F8F4EC';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

export default function ReportSummaryCard({ summary }: { summary: ParsedReportSummary }) {
  const { incomeItems, bankBalances, warnings } = summary;

  // 同標籤底下若有多筆日期子項（目前只有利息收入），分組後只顯示一次標題＋小計＋逐筆明細
  const groups = new Map<string, { total: number; items: typeof incomeItems }>();
  for (const item of incomeItems) {
    const g = groups.get(item.label) ?? { total: 0, items: [] };
    g.total += item.amount;
    g.items.push(item);
    groups.set(item.label, g);
  }

  if (groups.size === 0 && bankBalances.total === undefined) return null;

  return (
    <details style={{ marginTop: 8, marginBottom: 4 }}>
      <summary
        style={{
          cursor: 'pointer', fontSize: 12.5, color: WINE, fontWeight: 600,
          listStyle: 'none', display: 'inline-flex', alignItems: 'center', gap: 4,
        }}
      >
        📄 展開自動整理版（利息／雜項收入／銀行餘額）
      </summary>

      <div style={{ marginTop: 10, border: `1px solid ${LINE}`, borderRadius: 8, padding: 14, background: PAPER }}>
        {warnings.length > 0 && (
          <div style={{ fontSize: 11.5, color: WINE, marginBottom: 10, lineHeight: 1.6 }}>
            ⚠ {warnings.join('；')}
          </div>
        )}

        {groups.size > 0 && (
          <div style={{ marginBottom: bankBalances.total !== undefined ? 14 : 0 }}>
            <div style={{ fontSize: 11.5, color: MUTE, marginBottom: 6, fontWeight: 600 }}>零散收入（非班費本體）</div>
            {[...groups.entries()].map(([label, g]) => (
              <div key={label} style={{ marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span>{label}</span>
                  <span style={{ fontFamily: 'serif', fontWeight: 700, color: OK }}>+{fmt(g.total)}</span>
                </div>
                {g.items.length > 1 && (
                  <div style={{ fontSize: 11, color: MUTE, marginTop: 2 }}>
                    {g.items.map((it) => `${it.date}：${fmt(it.amount)}`).join('　·　')}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {bankBalances.total !== undefined && (
          <div>
            <div style={{ fontSize: 11.5, color: MUTE, marginBottom: 6, fontWeight: 600 }}>銀行存款餘額</div>
            <div style={{ display: 'flex', gap: 10 }}>
              {bankBalances.activeDeposit !== undefined && (
                <div style={{ flex: 1, background: '#fff', border: `1px solid ${LINE}`, borderRadius: 6, padding: '8px 10px' }}>
                  <div style={{ fontSize: 10.5, color: MUTE }}>活期存款</div>
                  <div style={{ fontFamily: 'serif', fontWeight: 700, fontSize: 14 }}>{fmt(bankBalances.activeDeposit)}</div>
                </div>
              )}
              {bankBalances.termDeposit !== undefined && (
                <div style={{ flex: 1, background: '#fff', border: `1px solid ${LINE}`, borderRadius: 6, padding: '8px 10px' }}>
                  <div style={{ fontSize: 10.5, color: MUTE }}>定期存款</div>
                  <div style={{ fontFamily: 'serif', fontWeight: 700, fontSize: 14 }}>{fmt(bankBalances.termDeposit)}</div>
                </div>
              )}
              <div style={{ flex: 1, background: GOLD, borderRadius: 6, padding: '8px 10px' }}>
                <div style={{ fontSize: 10.5, color: '#4A3F1F' }}>合計</div>
                <div style={{ fontFamily: 'serif', fontWeight: 700, fontSize: 14 }}>{fmt(bankBalances.total)}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </details>
  );
}
