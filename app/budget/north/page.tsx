import type { Metadata } from 'next';
import Link from 'next/link';
import { META, NORTH_ALLOCATION, NORTH_TOTAL_ESTIMATE, ACTIVITIES, fmt } from '@/lib/budget/data';

export const metadata: Metadata = {
  title: '北班分攤通知｜E118 班費預算說明書',
  description: '給北班幹部的合辦活動分攤估算 — 7 項合辦項目按 15/99 比例的應付金額、結算機制、匯款資訊。',
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

export default function NorthPage() {
  const ratio = (META.northMembers / META.totalMembers * 100).toFixed(2);
  const northActivities = NORTH_ALLOCATION.map((row) => {
    const full = ACTIVITIES.find((a) => a.slug === row.slug)!;
    return { ...row, organizer: full.organizer, statusNote: full.statusNote };
  });

  return (
    <>
      <div style={{ marginBottom: 20 }}>
        <Link href="/budget" style={{ fontSize: 13, color: MUTE, textDecoration: 'none' }}>← 回總覽</Link>
        <h1 style={{ fontFamily: TC, fontSize: 28, color: WINE_DEEP, fontWeight: 600, margin: '12px 0 6px' }}>給北班的分攤通知</h1>
        <p style={{ fontSize: 14, color: '#4A413A', lineHeight: 1.8, maxWidth: 800 }}>
          E118 採南北分帳；合辦項目（南北班一起用到的）按南北人頭比例攤分，由 E118 統一執行、活動結束後按 84:15 向北班請款。
          本頁為「估算金額」，實際金額以每場活動結束後的結算單為準；三年期末總對帳調整差額。
        </p>
      </div>

      {/* 三大數字 */}
      <section className="bdg-grid bdg-grid-3 bdg-grid-gap-sm" style={{ marginBottom: 28 }}>
        <Stat label="北班人數" value={`${META.northMembers} 人`} sub={`佔全班 ${ratio}%`} accent={INK} />
        <Stat label="合辦項目分攤估算" value={`NT$ ${fmt(NORTH_TOTAL_ESTIMATE)}`} sub={`${northActivities.length} 項合辦項目合計（依保守預算估）`} accent={WINE} />
        <Stat label="期末總對帳" value="差額退補" sub="實際以結算為準；多付退、少付補" accent={GOLD} />
      </section>

      {/* 預算性質說明 */}
      <div
        style={{
          background: '#FFF8E7',
          border: `1px solid ${GOLD}`,
          borderLeft: `4px solid ${GOLD}`,
          padding: '14px 18px',
          borderRadius: 6,
          fontSize: 13.5,
          color: '#7a5c00',
          lineHeight: 1.8,
          marginBottom: 24,
        }}
      >
        <strong style={{ color: WINE_DEEP }}>※ 重要說明：</strong>
        以下金額皆為「預估」，作為北班預備該年度資金池的參考；實際請款以每場活動結束後南班財務長提供的結算單為準。
        預算估算採保守口徑（學長姐實際決算 + 6% 漲幅、收入 6 折）。
      </div>

      {/* 7 項合辦項目分攤表 */}
      <h2 style={{ fontFamily: TC, fontSize: 20, color: WINE_DEEP, borderLeft: `4px solid ${GOLD}`, paddingLeft: 12, margin: '24px 0 12px' }}>
        北班分攤估算（按 15/99 ≈ 15.15%）
      </h2>
      <div className="bdg-table-wrap" style={{ marginBottom: 24 }}>
        <table className="bdg-table">
          <caption>合辦項目北班分攤估算（金額單位：新台幣元）</caption>
          <thead>
            <tr>
              <th scope="col">項目</th>
              <th scope="col">日期</th>
              <th scope="col">主辦</th>
              <th scope="col" className="num">全班淨支出</th>
              <th scope="col" className="num">南班 84/99</th>
              <th scope="col" className="num">北班 15/99</th>
            </tr>
          </thead>
          <tbody>
            {northActivities.map((a) => (
              <tr key={a.slug}>
                <td className="strong">
                  <Link href={`/budget/activities/${a.slug}`} style={{ color: WINE, textDecoration: 'none' }}>
                    {a.name}
                  </Link>
                </td>
                <td className="mute">{a.date}</td>
                <td className="mute">{a.organizer}</td>
                <td className="num">{fmt(a.totalNet)}</td>
                <td className="num">{fmt(a.southNet)}</td>
                <td className="num strong" style={{ color: WINE }}>{fmt(a.northEstimate)}</td>
              </tr>
            ))}
            <tr className="sub">
              <td colSpan={3} className="strong">合計（估算）</td>
              <td className="num strong">{fmt(northActivities.reduce((s, a) => s + a.totalNet, 0))}</td>
              <td className="num strong">{fmt(northActivities.reduce((s, a) => s + a.southNet, 0))}</td>
              <td className="num strong" style={{ color: WINE, fontSize: 15 }}>{fmt(NORTH_TOTAL_ESTIMATE)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 結算機制 */}
      <h2 style={{ fontFamily: TC, fontSize: 20, color: WINE_DEEP, borderLeft: `4px solid ${GOLD}`, paddingLeft: 12, margin: '24px 0 12px' }}>
        結算與請款機制
      </h2>
      <div className="bdg-grid bdg-grid-2 bdg-grid-gap-sm" style={{ marginBottom: 20 }}>
        <Card
          title="每場活動結束後"
          desc="南班財務長於 30 日內製作結算單，列出實際支出 / 收入 / 淨負擔 / 南北應付，email 或 LINE 給北班財務長；北班依結算單金額匯款至南班財務指定帳戶。"
        />
        <Card
          title="三年期末總對帳"
          desc="2028 年 8 月（118 畢業後一個月內）做總帳，列出所有合辦活動實際結算數字，跟預估比對；差額部分退補。"
        />
      </div>

      {/* 北班不分攤項目 */}
      <h2 style={{ fontFamily: TC, fontSize: 20, color: WINE_DEEP, borderLeft: `4px solid ${GOLD}`, paddingLeft: 12, margin: '24px 0 12px' }}>
        北班<strong style={{ color: WINE }}>不</strong>需分攤的項目
      </h2>
      <ul style={{ paddingLeft: 22, color: '#4A413A', lineHeight: 2, fontSize: 14 }}>
        <li><strong>119 迎新晚會（2026 年 9 月）</strong>：南班自辦，由南班獨自負擔淨額 NT$ 256,124</li>
        <li><strong>南班聯誼機動金</strong>（150,000）：南班內部聯誼補助池</li>
        <li><strong>南班緊急預備金</strong>（150,000）：南班自理</li>
        <li><strong>南班婚喪喜慶</strong>（36,000）：南班同學的人情往來</li>
        <li><strong>南班參與北班活動補助</strong>（50,000）：補助南班同學上去參加，跟北班無關</li>
      </ul>

      <div
        style={{
          marginTop: 20,
          background: PAPER,
          border: `1px solid ${LINE}`,
          borderLeft: `4px solid ${OK}`,
          padding: '14px 18px',
          borderRadius: 6,
          fontSize: 13.5,
          color: '#4A413A',
          lineHeight: 1.9,
        }}
      >
        <strong style={{ color: WINE_DEEP }}>北班自行決定的項目：</strong>
        北班的緊急預備金、婚喪喜慶、機動金、北班自辦活動（如北班招生說明會聚餐、北班聖誕晚會）等，
        由北班自行編列與管理，不在此份說明書範圍。
      </div>

      {/* 聯絡 */}
      <h2 style={{ fontFamily: TC, fontSize: 20, color: WINE_DEEP, borderLeft: `4px solid ${GOLD}`, paddingLeft: 12, margin: '28px 0 12px' }}>
        聯絡窗口
      </h2>
      <p style={{ fontSize: 13.5, color: '#4A413A', lineHeight: 1.9 }}>
        南班財務長 / 秘書長為主要對接窗口；結算單、匯款戶名、對帳請聯繫南班秘書處。
      </p>
    </>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent: string }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderTop: `3px solid ${accent}`, borderRadius: 8, padding: '14px 18px' }}>
      <div style={{ fontSize: 12, color: MUTE, marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: DISPLAY, fontSize: 24, fontWeight: 600, color: accent, letterSpacing: 0.3 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: MUTE, marginTop: 4, lineHeight: 1.6 }}>{sub}</div>}
    </div>
  );
}

function Card({ title, desc }: { title: string; desc: string }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderLeft: `3px solid ${GOLD}`, borderRadius: 6, padding: '14px 18px' }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: WINE_DEEP, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, color: '#4A413A', lineHeight: 1.8 }}>{desc}</div>
    </div>
  );
}
