import Link from 'next/link';
import {
  META,
  INCOME,
  ACTIVITIES,
  RESERVES,
  SUMMARY,
  TOTAL_EXPENSE,
  NECESSARY_PER_PERSON,
  SURPLUS,
  SURPLUS_PER_PERSON,
  NORTH_TOTAL_ESTIMATE,
  CHANGELOG,
  fmt,
} from '@/lib/budget/data';

const WINE = '#8B1F2F';
const WINE_DEEP = '#6B1622';
const GOLD = '#C9A961';
const GOLD_SOFT = '#E0C896';
const CREAM = '#FAF7F2';
const PAPER = '#F4EFE6';
const INK = '#1A1612';
const MUTE = '#8A7F73';
const LINE = '#E8DFD0';
const OK = '#2D5F4E';

const TC = "'Noto Serif TC', 'PingFang TC', 'Songti TC', serif";
const DISPLAY = "'Cormorant Garamond', 'Iowan Old Style', Charter, Georgia, serif";

export default function BudgetHome() {
  return (
    <>
      {/* ─── Hero ────────────────────────────────────────────────────────── */}
      <section
        className="bdg-hero"
        style={{
          background: `linear-gradient(135deg, #fff 0%, ${PAPER} 100%)`,
          padding: '40px 36px',
          border: `1px solid ${LINE}`,
          borderRadius: 12,
          marginBottom: 28,
        }}
      >
        <div style={{ fontFamily: DISPLAY, fontSize: 13, color: GOLD, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>
          NCKU EMBA · Class of 2028 · South Cohort
        </div>
        <h1 style={{ fontFamily: TC, fontSize: 32, color: WINE_DEEP, fontWeight: 600, margin: '0 0 12px' }}>
          E118 南班 班費收支預算說明書
        </h1>
        <p style={{ fontSize: 15, color: '#4A413A', lineHeight: 1.8, maxWidth: 800 }}>
          適用期間 <strong>2026 – 2028</strong>（全期三年）　·　繳費基準 <strong>南班 {META.southMembers} 人</strong>　·
          支出採保守編列，多收沉澱、用不完按比例退回。
          本文件公開予全班同學與幹部，所有活動、預備金、結算機制透明可查；實際支出將定期更新於各活動頁。
        </p>
      </section>

      {/* 最新版本更新提示 */}
      {CHANGELOG[0] && (
        <Link
          href="/budget/changelog"
          style={{
            display: 'block',
            background: 'linear-gradient(135deg, #FFF8E7 0%, #FAF7F2 100%)',
            border: `1px solid ${GOLD}`,
            borderLeft: `4px solid ${GOLD}`,
            borderRadius: 8,
            padding: '14px 18px',
            color: INK,
            textDecoration: 'none',
            marginBottom: 28,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ background: GOLD, color: '#fff', fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 12, letterSpacing: 1 }}>
                最新 {CHANGELOG[0].version}
              </span>
              <strong style={{ fontFamily: TC, fontSize: 14.5, color: WINE_DEEP }}>
                {CHANGELOG[0].title}
              </strong>
              <span style={{ fontSize: 12, color: MUTE }}>{CHANGELOG[0].date}</span>
            </div>
            <span style={{ fontSize: 12.5, color: GOLD, fontWeight: 600 }}>查看版本歷史 →</span>
          </div>
          <div style={{ fontSize: 13, color: '#4A413A', lineHeight: 1.8, marginTop: 6 }}>
            {CHANGELOG[0].summary}
          </div>
        </Link>
      )}

      {/* ─── 三大數字 ────────────────────────────────────────────────────── */}
      <section className="bdg-grid bdg-grid-3" style={{ marginBottom: 32 }}>
        <KeyStat label="統一收取（每人）" value={`30,000`} unit="元" tone="wine" footnote="一次性收齊，含活動 + 預備金 + 安全水位" />
        <KeyStat label="必要支出（每人）" value={fmt(NECESSARY_PER_PERSON)} unit="元" tone="ink" footnote="活動公關 + 預備金，實際發生的部分" />
        <KeyStat label="預計退回（每人）" value={fmt(SURPLUS_PER_PERSON)} unit="元" tone="gold" footnote="多收沉澱、期末未動用按人頭退回" />
      </section>

      {/* ─── 收 30,000 怎麼分配 ────────────────────────────────────────── */}
      <Section title="你繳的 30,000 元怎麼用" subtitle="支出採保守編列，未動用餘額按比例退回">
        <div className="bdg-grid bdg-grid-2">
          <BreakdownRow
            band="A 合辦項目分攤（84/99）"
            desc="7 項合辦項目，按南北人頭比例攤分後南班負擔"
            amount={SUMMARY.coHosted.total}
            perPerson={Math.round(SUMMARY.coHosted.total / META.southMembers)}
          />
          <BreakdownRow
            band="B 南班自辦"
            desc="119 迎新晚會（南班獨立籌辦）"
            amount={SUMMARY.southOnly.total}
            perPerson={Math.round(SUMMARY.southOnly.total / META.southMembers)}
          />
          <BreakdownRow
            band="C 南班自理（4 項）"
            desc="聯誼機動金 + 緊急預備金 + 婚喪喜慶 + 南班參與北班補助"
            amount={SUMMARY.reserves.total}
            perPerson={Math.round(SUMMARY.reserves.total / META.southMembers)}
          />
          <BreakdownRow
            band="D 安全水位（多收）"
            desc="收入 - 必要支出，期末按人頭退回"
            amount={SURPLUS}
            perPerson={SURPLUS_PER_PERSON}
            tone="gold"
          />
        </div>
        <div
          style={{
            marginTop: 16,
            background: '#fff',
            border: `1px solid ${LINE}`,
            borderLeft: `3px solid ${GOLD}`,
            padding: '14px 18px',
            borderRadius: 4,
            fontSize: 13,
            color: '#4A413A',
            lineHeight: 1.8,
          }}
        >
          <strong style={{ color: WINE_DEEP }}>三個安心保證：</strong>
          ① 預備金未動用餘額於期末按人頭退回；
          ② 聯誼採補助制，不是用全班的錢請少數人；
          ③ 每場活動結算後將公告於對應活動頁。
        </div>
      </Section>

      {/* ─── 活動清單 ────────────────────────────────────────────────────── */}
      <Section title={`三年期 ${ACTIVITIES.length} 場活動`} subtitle="點進每場活動可看完整明細、預估收支、班費負擔、結算狀態">
        <div className="bdg-grid bdg-grid-2 bdg-grid-gap-sm">
          {ACTIVITIES.map((a) => (
            <Link
              key={a.slug}
              href={`/budget/activities/${a.slug}`}
              style={{
                display: 'block',
                background: '#fff',
                border: `1px solid ${LINE}`,
                borderRadius: 8,
                padding: '14px 16px',
                color: INK,
                textDecoration: 'none',
                transition: 'border-color 0.15s, transform 0.15s',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                <strong style={{ fontFamily: TC, fontSize: 15, color: WINE_DEEP }}>{a.name}</strong>
                <TypeBadge type={a.type} />
              </div>
              <div style={{ fontSize: 12, color: MUTE, marginBottom: 8 }}>
                {a.date}　·　{a.location}
              </div>
              <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#4A413A' }}>
                <span>淨支出 <strong style={{ color: INK }}>NT$ {fmt(a.net)}</strong></span>
                <span>南班負擔 <strong style={{ color: WINE }}>NT$ {fmt(a.southBurden)}</strong></span>
              </div>
            </Link>
          ))}
        </div>
      </Section>

      {/* ─── 預備金 ──────────────────────────────────────────────────────── */}
      <Section title="預備金與補助池（南班自理）" subtitle="每一項都有明確的用途、動用機制、退回原則">
        <div className="bdg-grid bdg-grid-2 bdg-grid-gap-sm">
          {RESERVES.map((r) => (
            <Link
              key={r.slug}
              href={`/budget/reserves#${r.slug}`}
              style={{
                background: '#fff',
                border: `1px solid ${LINE}`,
                borderRadius: 8,
                padding: '14px 16px',
                color: INK,
                textDecoration: 'none',
                display: 'block',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <strong style={{ fontFamily: TC, fontSize: 15, color: WINE_DEEP }}>{r.name}</strong>
                <span style={{ fontSize: 14, fontWeight: 600, color: INK }}>NT$ {fmt(r.amount)}</span>
              </div>
              <div style={{ fontSize: 12.5, color: '#4A413A', lineHeight: 1.6 }}>{r.purpose}</div>
            </Link>
          ))}
        </div>
      </Section>

      {/* ─── 北班分攤 / 結算 ────────────────────────────────────────────── */}
      <section className="bdg-grid bdg-grid-2" style={{ marginTop: 32 }}>
        <CalloutCard
          title="給北班的分攤通知"
          desc={`合辦活動的北班分攤估算合計 NT$ ${fmt(NORTH_TOTAL_ESTIMATE)}（15/99 比例）。實際以每場結算為準，期末總對帳。`}
          href="/budget/north"
          cta="查看北班分攤帳"
        />
        <CalloutCard
          title="預算 vs 實際的結算機制"
          desc="預算用 84:15 估，實際依各場活動結算後按比例請款；三年期末總對帳、差額退補。"
          href="/budget/settlement"
          cta="查看結算流程"
          tone="gold"
        />
      </section>

      {/* ─── 為什麼這樣設計 ─────────────────────────────────────────────── */}
      <Section title="設計邏輯（給想知道為什麼這樣訂的同學）">
        <ul style={{ paddingLeft: 22, color: '#4A413A', lineHeight: 2, fontSize: 14 }}>
          <li>
            <strong>南北分帳</strong>：南班 84 人、北班 15 人；合辦項目按 84:15 比例攤分，南班自辦（如 119 迎新晚會）由南班獨自負擔，北班不分攤。
          </li>
          <li>
            <strong>預備金獨立</strong>：南班的聯誼機動金、緊急預備金、婚喪喜慶、活動補助均由南班自理；北班是否要編列由北班自決。
          </li>
          <li>
            <strong>保守編列</strong>：活動參考學長姐實際決算 + 6% 漲幅；聖誕晚宴收入打 6 折（出席率保守估）；新生營「續用酒水」55,000 在 118 版本歸零。
          </li>
          <li>
            <strong>多收沉澱、用不完退</strong>：收 30,000 元 = 必要 {fmt(NECESSARY_PER_PERSON)} + 安全水位 {fmt(SURPLUS_PER_PERSON)}；安全水位三年期末按人頭退回。
          </li>
          <li>
            <strong>結算優於預算</strong>：所有跟北班的金錢往來以「該場活動實際結算 × 比例」為準，不是用預算估算數字；期末總對帳調整差額。
          </li>
        </ul>
      </Section>
    </>
  );
}

// ── 元件 ─────────────────────────────────────────────────────────────────

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 36 }}>
      <h2 style={{ fontFamily: TC, fontSize: 22, color: WINE_DEEP, fontWeight: 600, margin: '0 0 4px', borderLeft: `4px solid ${GOLD}`, paddingLeft: 12 }}>
        {title}
      </h2>
      {subtitle && <div style={{ fontSize: 13, color: MUTE, marginBottom: 16, paddingLeft: 16 }}>{subtitle}</div>}
      {!subtitle && <div style={{ marginBottom: 16 }} />}
      {children}
    </section>
  );
}

function KeyStat({ label, value, unit, tone, footnote }: { label: string; value: string; unit: string; tone: 'wine' | 'ink' | 'gold'; footnote?: string }) {
  const colorMap = { wine: WINE, ink: INK, gold: GOLD };
  return (
    <div
      style={{
        background: '#fff',
        border: `1px solid ${LINE}`,
        borderTop: `3px solid ${colorMap[tone]}`,
        borderRadius: 8,
        padding: '18px 20px',
      }}
    >
      <div style={{ fontSize: 12, color: MUTE, marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline' }}>
        <span style={{ fontFamily: DISPLAY, fontSize: 36, fontWeight: 600, color: colorMap[tone], letterSpacing: 0.5 }}>{value}</span>
        <span style={{ fontSize: 14, color: MUTE, marginLeft: 6 }}>{unit}</span>
      </div>
      {footnote && <div style={{ fontSize: 11.5, color: MUTE, marginTop: 6, lineHeight: 1.5 }}>{footnote}</div>}
    </div>
  );
}

function BreakdownRow({ band, desc, amount, perPerson, tone }: { band: string; desc: string; amount: number; perPerson: number; tone?: 'gold' }) {
  const bg = tone === 'gold' ? '#FFF8E7' : '#fff';
  const stripe = tone === 'gold' ? GOLD : WINE;
  return (
    <div style={{ background: bg, border: `1px solid ${LINE}`, borderLeft: `3px solid ${stripe}`, borderRadius: 4, padding: '12px 16px' }}>
      <div style={{ fontWeight: 600, fontSize: 14, color: WINE_DEEP, marginBottom: 4 }}>{band}</div>
      <div style={{ fontSize: 12.5, color: '#4A413A', lineHeight: 1.6, marginBottom: 8 }}>{desc}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
        <span style={{ color: MUTE }}>南班合計</span>
        <strong style={{ color: INK }}>NT$ {fmt(amount)}</strong>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
        <span style={{ color: MUTE }}>每人</span>
        <strong style={{ color: tone === 'gold' ? GOLD : WINE }}>NT$ {fmt(perPerson)}</strong>
      </div>
    </div>
  );
}

function TypeBadge({ type }: { type: 'co-hosted' | 'south-only' | 'fixed-cost' }) {
  const map = {
    'co-hosted': { label: '南北合辦', bg: '#E8E0D0', color: WINE_DEEP },
    'south-only': { label: '南班自辦', bg: '#F4DDE0', color: WINE_DEEP },
    'fixed-cost': { label: '固定費用', bg: '#E0E8DD', color: OK },
  };
  const s = map[type];
  return (
    <span style={{ fontSize: 11, color: s.color, background: s.bg, padding: '2px 8px', borderRadius: 10, fontWeight: 500 }}>
      {s.label}
    </span>
  );
}

function CalloutCard({ title, desc, href, cta, tone }: { title: string; desc: string; href: string; cta: string; tone?: 'gold' }) {
  const bg = tone === 'gold' ? '#FFF8E7' : '#fff';
  const accent = tone === 'gold' ? GOLD : WINE;
  return (
    <Link href={href} style={{ display: 'block', background: bg, border: `1px solid ${LINE}`, borderTop: `3px solid ${accent}`, borderRadius: 8, padding: '18px 20px', textDecoration: 'none', color: INK }}>
      <strong style={{ fontFamily: TC, fontSize: 16, color: WINE_DEEP, display: 'block', marginBottom: 8 }}>{title}</strong>
      <div style={{ fontSize: 13, color: '#4A413A', lineHeight: 1.7, marginBottom: 12 }}>{desc}</div>
      <div style={{ fontSize: 13, color: accent, fontWeight: 500 }}>{cta} →</div>
    </Link>
  );
}
