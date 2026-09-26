/**
 * /finance/report/[id] — 整理過的收支報表（給全班看的版本）。
 *
 * 財務長上傳的原始 Excel 不對外公開下載——這頁只呈現整理過的內容：
 * 班費收入/支出/結餘用網站本來就在追蹤的資料（listFinanceIncome/
 * listFinanceExpenses，跟 /finance 首頁同一份資料來源、同一套去重邏輯），
 * 銀行存款餘額才是 Excel 解析出來、網站別處沒有的部分。
 *
 * 刻意不重複顯示「利息/班聚結餘款」這類零散收入細項——財務長已經另外
 * 手動記在收入明細帳本裡了（見 lib/finance/income.ts），Excel 解析出來的
 * 版本只是同一件事的另一份副本，兩邊一起顯示只會讓人搞不清楚要信哪個。
 */
import { notFound } from 'next/navigation';
import {
  getFinanceReport,
  listFinanceExpenses,
  listFinanceIncome,
} from '@/lib/signoff/dal';
import { computeFinanceOverview } from '@/lib/finance/overview';
import { ACTIVITIES } from '@/lib/budget/data';
import Breadcrumb from '@/components/Breadcrumb';

export const dynamic = 'force-dynamic';

const WINE = '#8B1F2F', WINE_DEEP = '#6B1622', GOLD = '#C9A961';
const CREAM = '#FAF7F2', PAPER = '#F4EFE6', INK = '#1A1612', MUTE = '#8A7F73', LINE = '#E8DFD0', OK = '#2D5F4E';

const fmt = (v: number) => Math.round(v).toLocaleString('en-US');
const n = (v: string | null) => (v ? parseFloat(v) || 0 : 0);

export default async function FinanceReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [report, expenses, incomeRows] = await Promise.all([
    getFinanceReport(id),
    listFinanceExpenses(),
    listFinanceIncome(),
  ]);
  if (!report) notFound();

  const { income, spent, balance, approvedExpenses } = computeFinanceOverview(incomeRows, expenses);
  const bank = report.parsed_summary?.bankBalances;
  const northPaid = ACTIVITIES.filter((a) => a.actualSplit?.northPaidAt);

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '16px 16px 48px' }}>
      <Breadcrumb
        items={[
          { label: '班級面板', href: '/' },
          { label: '班級經費中心', href: '/finance' },
          { label: report.period_label },
        ]}
      />

      <div
        style={{
          background: `linear-gradient(135deg, ${WINE_DEEP}, ${WINE})`,
          borderRadius: 14,
          padding: '26px 24px 22px',
          color: '#F7EFE4',
          marginTop: 12,
          marginBottom: -16,
          position: 'relative',
        }}
      >
        <div style={{ fontSize: 11.5, letterSpacing: '.12em', textTransform: 'uppercase', opacity: 0.8, marginBottom: 6 }}>
          E118　財務月報
        </div>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, fontFamily: 'serif' }}>{report.period_label}</h1>
        <div style={{ fontSize: 12.5, opacity: 0.85 }}>
          上傳時間：{new Date(report.created_at).toLocaleDateString('zh-TW')}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, position: 'relative', zIndex: 1, marginTop: 18 }}>
        <StatCard label="班費收入" value={income} color={OK} />
        <StatCard label="已支出" value={spent} color={WINE} />
        <StatCard label="結餘" value={balance} color={INK} />
      </div>

      <Box title="收入明細" tag={`${incomeRows.length} 筆`}>
        {incomeRows.length === 0 && <Empty text="尚無收入紀錄" />}
        {incomeRows.map((r) => (
          <Row
            key={r.id}
            left={r.category}
            note={`${r.occurred_on}${r.note ? `・${r.note}` : ''}`}
            right={`+${fmt(n(r.amount))}`}
            rightColor={OK}
          />
        ))}
      </Box>

      <Box title="支出明細" tag="已排除重複簽核單">
        {approvedExpenses.length === 0 && <Empty text="尚無支出紀錄" />}
        {approvedExpenses.map((e) => (
          <Row
            key={e.id}
            left={e.title}
            note={`${e.created_at.slice(0, 10)}${e.category ? `・${e.category}` : ''}`}
            right={fmt(n(e.amount))}
            rightColor={WINE}
          />
        ))}
        <Total label="支出合計" value={spent} />
      </Box>

      {northPaid.length > 0 && (
        <Box title="北班分攤款項" tag={`${northPaid.length} / ${northPaid.length} 已付清`}>
          {northPaid.map((a) => (
            <Row
              key={a.slug}
              left={`${a.shortName}${a.settlement ? `（${a.settlement.no}）` : ''}`}
              note={`匯款日期：${a.actualSplit!.northPaidAt}`}
              right={`${fmt(a.actualSplit!.north.amount)} ✓ 已付款`}
              rightColor={OK}
            />
          ))}
        </Box>
      )}

      {bank?.total !== undefined && (
        <Box title="銀行存款現況">
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {bank.activeDeposit !== undefined && <BalanceCard label="活期存款" value={bank.activeDeposit} />}
            {bank.termDeposit !== undefined && <BalanceCard label="定期存款" value={bank.termDeposit} />}
            <BalanceCard label="合計" value={bank.total} accent />
          </div>
        </Box>
      )}

      <div style={{ marginTop: 18, fontSize: 11.5, color: MUTE, textAlign: 'center' }}>
        本頁數字取自班網即時資料（收入/支出/北班分攤），銀行存款餘額來自財務長上傳的對帳單。原始檔案僅供幹部核對，不對外公開。
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 12, padding: '14px 12px', boxShadow: '0 6px 18px rgba(107,22,34,.08)' }}>
      <div style={{ fontSize: 11, color: MUTE, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: 'serif' }}>{fmt(value)}</div>
    </div>
  );
}

function Box({ title, tag, children }: { title: string; tag?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 12, padding: '18px 20px', marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <h2 style={{ fontFamily: 'serif', fontSize: 15, fontWeight: 700, color: WINE_DEEP, margin: 0 }}>{title}</h2>
        {tag && <span style={{ fontSize: 10.5, color: MUTE }}>{tag}</span>}
      </div>
      {children}
    </div>
  );
}

function Row({ left, note, right, rightColor }: { left: string; note?: string; right: string; rightColor: string }) {
  return (
    <div style={{ padding: '9px 0', borderBottom: `1px solid ${LINE}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}>
        <span>{left}</span>
        <span style={{ fontFamily: 'serif', fontWeight: 700, color: rightColor }}>{right}</span>
      </div>
      {note && <div style={{ fontSize: 11, color: MUTE, marginTop: 2 }}>{note}</div>}
    </div>
  );
}

function Total({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, marginTop: 4, borderTop: `1px solid ${LINE}`, fontWeight: 700 }}>
      <span>{label}</span>
      <span style={{ fontSize: 15 }}>NT$ {fmt(value)}</span>
    </div>
  );
}

function BalanceCard({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div style={{ flex: 1, minWidth: 100, background: accent ? GOLD : PAPER, borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ fontSize: 10.5, color: accent ? '#4A3F1F' : MUTE }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'serif' }}>{fmt(value)}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p style={{ color: MUTE, fontSize: 13 }}>{text}</p>;
}
