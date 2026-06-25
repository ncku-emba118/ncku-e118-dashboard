import type { Metadata } from 'next';
import Link from 'next/link';
import { RESERVES, META, fmt } from '@/lib/budget/data';

export const metadata: Metadata = {
  title: '預備金與補助池｜E118 南班班費預算說明書',
  description: '南班自理的 4 項預備金 — 聯誼機動金、緊急預備金、婚喪喜慶、南班參與北班補助 — 用途、動用機制、退回原則一覽。',
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
const DISPLAY = "'Cormorant Garamond', Georgia, serif";

export default function ReservesPage() {
  const totalAmount = RESERVES.reduce((s, r) => s + r.amount, 0);

  return (
    <>
      <div style={{ marginBottom: 20 }}>
        <Link href="/budget" style={{ fontSize: 13, color: MUTE, textDecoration: 'none' }}>← 回總覽</Link>
        <h1 style={{ fontFamily: TC, fontSize: 28, color: WINE_DEEP, fontWeight: 600, margin: '12px 0 6px' }}>預備金與補助池</h1>
        <p style={{ fontSize: 14, color: '#4A413A', lineHeight: 1.8, maxWidth: 800 }}>
          南班自理 4 項，合計 <strong>NT$ {fmt(totalAmount)}</strong>。每一項都有明確用途與動用機制；屬「備而不用」性質，作為班費安全水位。
        </p>
      </div>

      {/* 結餘處理統一說明 — 取代每項個別寫退回原則 */}
      <div
        style={{
          background: '#FFF8E7',
          border: `1px solid ${GOLD}`,
          borderLeft: `4px solid ${GOLD}`,
          padding: '14px 18px',
          borderRadius: 6,
          fontSize: 13.5,
          color: '#7a5c00',
          lineHeight: 1.9,
          marginBottom: 24,
        }}
      >
        <strong style={{ color: WINE_DEEP }}>📋 結餘處理原則：</strong>各項預備金若有結餘，將全數歸入班費總額，作為後續活動超支、匯率變動、突發狀況的安全水位、由秘書處統一管理。
      </div>

      <section className="bdg-grid bdg-grid-2 bdg-grid-gap-sm" style={{ marginBottom: 28 }}>
        <Stat label="4 項合計" value={`NT$ ${fmt(totalAmount)}`} accent={WINE} sub={`每人約 NT$ ${fmt(Math.round(totalAmount / META.southMembers))}（分攤到 ${META.southMembers} 人）`} />
        <Stat label="性質" value="備而不用" sub="作為班費安全水位、用於應對突發狀況；結餘統一歸入班費總額" accent={GOLD} />
      </section>

      {RESERVES.map((r) => (
        <article
          key={r.slug}
          id={r.slug}
          style={{
            background: '#fff',
            border: `1px solid ${LINE}`,
            borderLeft: `4px solid ${WINE}`,
            borderRadius: 8,
            padding: '20px 24px',
            marginBottom: 20,
          }}
        >
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
            <h2 style={{ fontFamily: TC, fontSize: 22, color: WINE_DEEP, fontWeight: 600, margin: 0 }}>{r.name}</h2>
            <div style={{ fontFamily: DISPLAY, fontSize: 26, fontWeight: 600, color: WINE }}>NT$ {fmt(r.amount)}</div>
          </header>

          <p style={{ fontSize: 14, color: '#4A413A', lineHeight: 1.9, marginBottom: 16 }}>{r.purpose}</p>

          <div className="bdg-grid bdg-grid-2 bdg-grid-gap-sm" style={{ marginBottom: 14 }}>
            <InfoBlock title="動用情境" items={r.trigger} />
            <InfoBlock title="動用機制" items={[r.approvers]} />
          </div>

          {r.examples && r.examples.length > 0 && (
            <div style={{ marginTop: 14, background: PAPER, border: `1px solid ${LINE}`, borderRadius: 6, padding: '12px 16px' }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: WINE_DEEP, marginBottom: 6 }}>細節 / 範例</div>
              <ul style={{ paddingLeft: 20, color: '#4A413A', lineHeight: 1.8, fontSize: 13, margin: 0 }}>
                {r.examples.map((ex, i) => <li key={i}>{ex}</li>)}
              </ul>
            </div>
          )}
        </article>
      ))}

      <section
        style={{
          marginTop: 28,
          background: '#FFF8E7',
          border: `1px solid ${GOLD}`,
          borderLeft: `4px solid ${GOLD}`,
          padding: '16px 20px',
          borderRadius: 8,
          fontSize: 13.5,
          color: '#7a5c00',
          lineHeight: 1.9,
        }}
      >
        <strong style={{ color: WINE_DEEP, fontSize: 14 }}>關於南北分帳的提醒：</strong>
        以上四項預備金為「南班自理」項目，由南班 84 人攤分；北班的緊急預備金 / 婚喪喜慶 / 機動金等由北班自決，不在此清單。
        南班參與北班活動的補助為南班內部支出，目的是補助南班同學的車馬費與餐費，不會匯款給北班。
      </section>
    </>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent: string }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderTop: `3px solid ${accent}`, borderRadius: 8, padding: '14px 18px' }}>
      <div style={{ fontSize: 12, color: MUTE, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, color: accent }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: MUTE, marginTop: 6, lineHeight: 1.6 }}>{sub}</div>}
    </div>
  );
}

function InfoBlock({ title, items, accent }: { title: string; items: string[]; accent?: 'ok' }) {
  const stripe = accent === 'ok' ? OK : GOLD;
  return (
    <div style={{ background: PAPER, border: `1px solid ${LINE}`, borderLeft: `3px solid ${stripe}`, borderRadius: 4, padding: '10px 14px' }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: WINE_DEEP, marginBottom: 6 }}>{title}</div>
      <ul style={{ paddingLeft: 18, color: '#4A413A', lineHeight: 1.8, fontSize: 13, margin: 0 }}>
        {items.map((s, i) => <li key={i}>{s}</li>)}
      </ul>
    </div>
  );
}
