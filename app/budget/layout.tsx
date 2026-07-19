import type { Metadata } from 'next';
import Link from 'next/link';
import Breadcrumb from '@/components/Breadcrumb';
import { META } from '@/lib/budget/data';

export const metadata: Metadata = {
  title: 'E118 南班 班費預算說明書',
  description: '成大 EMBA E118 南班 2026–2028 班費收支預算總表',
  openGraph: {
    title: 'E118 南班 班費預算說明書',
    description: '成大 EMBA E118 南班 2026–2028 班費收支預算總表',
    images: [{ url: '/og-thumb.png', width: 400, height: 400, alt: '成大 EMBA 第 118 班' }],
  },
  twitter: {
    card: 'summary',
    title: 'E118 南班 班費預算說明書',
    images: ['/og-thumb.png'],
  },
};

const WINE_DEEP = '#6B1622';
const GOLD = '#C9A961';
const CREAM = '#FAF7F2';
const INK = '#1A1612';
const MUTE = '#8A7F73';
const LINE = '#E8DFD0';

// 注入 budget 區段共用 CSS（含 RWD 斷點）
const BUDGET_CSS = `
.bdg-shell { background: ${CREAM}; min-height: 100vh; color: ${INK}; }
.bdg-header { background: ${WINE_DEEP}; color: #fff; padding: 14px 0; border-bottom: 3px solid ${GOLD}; }
.bdg-header-inner { max-width: 1100px; margin: 0 auto; padding: 0 20px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
.bdg-brand { color: #fff; text-decoration: none; display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.bdg-brand-name { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 22px; font-weight: 600; letter-spacing: 0.5px; }
.bdg-brand-sub { font-size: 13px; color: #E0C896; font-weight: 500; }
.bdg-nav { display: flex; gap: 18px; font-size: 14px; flex-wrap: wrap; align-items: center; }
.bdg-nav a { color: #fff; text-decoration: none; padding: 4px 0; border-bottom: 1px solid transparent; transition: border-color 0.15s; }
.bdg-nav a:hover { border-bottom-color: ${GOLD}; }
.bdg-nav-sep { width: 1px; height: 14px; background: rgba(224, 200, 150, 0.4); }
.bdg-main { max-width: 1100px; margin: 0 auto; padding: 32px 20px 80px; }
.bdg-footer { background: #fff; border-top: 1px solid ${LINE}; padding: 24px 20px; text-align: center; color: ${MUTE}; font-size: 12px; }

/* Grid 系統 — 預設桌面寬，手機自動降欄 */
.bdg-grid { display: grid; gap: 16px; }
.bdg-grid-2 { grid-template-columns: repeat(2, 1fr); }
.bdg-grid-3 { grid-template-columns: repeat(3, 1fr); }
.bdg-grid-4 { grid-template-columns: repeat(4, 1fr); }
.bdg-grid-gap-sm { gap: 12px; }
.bdg-grid-gap-lg { gap: 20px; }

/* 表格 wrapper — 手機自動橫向滑 */
.bdg-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.bdg-table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid ${LINE}; border-radius: 6px; font-size: 13px; min-width: 560px; }
.bdg-table th { background: #F4EFE6; color: ${WINE_DEEP}; padding: 10px 12px; text-align: left; font-weight: 600; font-size: 12.5px; border-bottom: 1px solid ${LINE}; }
.bdg-table td { padding: 8px 12px; border-bottom: 1px solid ${LINE}; color: ${INK}; }
.bdg-table .num { text-align: right; }
.bdg-table .strong { font-weight: 600; }
.bdg-table .mute { color: ${MUTE}; font-size: 12px; }
.bdg-table .sub { background: #F4EFE6; font-weight: 600; }
.bdg-table caption { caption-side: top; text-align: left; padding: 6px 4px 10px; font-size: 12px; color: ${MUTE}; }

/* 活動列 - 桌面 4 欄、平板 2 欄、手機 1 欄 */
.bdg-row-act { display: grid; grid-template-columns: 1fr 140px 140px 140px; gap: 16px; align-items: center; background: #fff; border: 1px solid ${LINE}; border-radius: 8px; padding: 14px 18px; text-decoration: none; color: ${INK}; }

@media (max-width: 860px) {
  .bdg-grid-4 { grid-template-columns: repeat(2, 1fr); }
  .bdg-row-act { grid-template-columns: 1fr 1fr; row-gap: 10px; }
}
@media (max-width: 640px) {
  .bdg-grid-3 { grid-template-columns: 1fr; }
  .bdg-grid-2 { grid-template-columns: 1fr; }
  .bdg-grid-4 { grid-template-columns: 1fr; }
  .bdg-row-act { grid-template-columns: 1fr; }
  .bdg-nav { gap: 12px; font-size: 13px; width: 100%; justify-content: flex-start; }
  .bdg-nav-sep { display: none; }
  .bdg-main { padding: 24px 16px 60px; }
  .bdg-hero { padding: 26px 22px !important; }
  .bdg-hero h1 { font-size: 24px !important; }

  /* Mobile 響應式表格 — 改為上下滑（每列變卡片、欄位名用 data-label） */
  .bdg-table-wrap { overflow-x: visible; }
  .bdg-table { min-width: 0; border: 0; background: transparent; font-size: 13px; }
  .bdg-table caption { padding: 4px 4px 10px; }
  .bdg-table thead { display: none; }
  .bdg-table tbody { display: block; }
  .bdg-table tbody tr {
    display: block;
    background: #fff;
    border: 1px solid ${LINE};
    border-radius: 8px;
    padding: 8px 14px;
    margin-bottom: 10px;
  }
  .bdg-table tbody tr.sub {
    background: ${WINE_DEEP};
    color: #fff;
    border-color: ${WINE_DEEP};
  }
  .bdg-table tbody tr.sub td,
  .bdg-table tbody tr.sub td:before { color: #fff; }
  .bdg-table tbody td {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 6px 0;
    border-bottom: 1px dashed #F4EFE6;
    text-align: right;
    gap: 12px;
  }
  .bdg-table tbody td:last-child { border-bottom: 0; }
  .bdg-table tbody td:before {
    content: attr(data-label);
    color: ${MUTE};
    font-weight: 500;
    text-align: left;
    font-size: 12px;
    flex-shrink: 0;
    min-width: 60px;
  }
  .bdg-table tbody td:not([data-label]):before,
  .bdg-table tbody td[data-label=""]:before { content: none; }
  .bdg-table tbody td.num { text-align: right; }
  .bdg-table tbody tr.sub td:before { color: rgba(255,255,255,0.7); }
}

/* 列印：只留文件本體，供結算單存成 PDF */
@media print {
  @page { size: A4; margin: 12mm; }
  .no-print,
  .bdg-header,
  .bdg-footer,
  .bdg-nav,
  nav[aria-label] { display: none !important; }
  html, body { background: #fff !important; }
  .bdg-shell, .bdg-main {
    background: #fff !important;
    padding: 0 !important;
    margin: 0 !important;
    max-width: none !important;
  }
  .settlement-doc {
    max-width: none !important;
    margin: 0 !important;
    box-shadow: none !important;
    border-width: 1px !important;
    border-radius: 0 !important;
  }
  /* 每個區塊盡量不跨頁；表格列絕不從中斷開 */
  .settlement-doc > div { break-inside: avoid; }
  .settlement-doc tr { break-inside: avoid; }
}
`.trim();

export default function BudgetLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bdg-shell">
      <style dangerouslySetInnerHTML={{ __html: BUDGET_CSS }} />
      <Breadcrumb
        items={[
          { label: '班級面板', href: '/' },
          { label: '班級經費中心', href: '/finance' },
          { label: '預算說明書' },
        ]}
      />
      <header className="bdg-header">
        <div className="bdg-header-inner">
          <Link href="/budget" className="bdg-brand">
            <span className="bdg-brand-name">NCKU EMBA · E118 South</span>
            <span className="bdg-brand-sub">班費預算說明書</span>
          </Link>
          <nav className="bdg-nav" aria-label="班費網站導覽">
            <Link href="/budget">總覽</Link>
            <Link href="/budget/activities">活動明細</Link>
            <Link href="/budget/reserves">預備金</Link>
            <Link href="/budget/rules">申請規則</Link>
            <span className="bdg-nav-sep" aria-hidden="true" />
            <Link href="/budget/tracking">執行追蹤</Link>
            <Link href="/budget/settlement">結算機制</Link>
            <Link href="/budget/north">北班分攤</Link>
            <span className="bdg-nav-sep" aria-hidden="true" />
            <Link href="/budget/changelog">版本歷史</Link>
            <Link href="/budget/signoff" style={{ color: '#E0C896', fontWeight: 600 }}>✍️ 預算書簽核</Link>
          </nav>
        </div>
      </header>
      <main className="bdg-main">{children}</main>
      <footer className="bdg-footer">
        <div style={{ marginBottom: 6 }}>
          E118 南班秘書處 · 預算為估算值、實際以結算為準、結餘統一歸入班費總額
        </div>
        <div style={{ fontSize: 11.5 }}>
          當前版本 <strong style={{ color: '#6B1622' }}>{META.version}</strong> · 最後更新 {META.updatedAt} ·{' '}
          <Link href="/budget/changelog" style={{ color: '#8B1F2F', textDecoration: 'underline' }}>
            查看版本歷史
          </Link>
        </div>
      </footer>
    </div>
  );
}
