import Link from 'next/link';
import { ACTIVITIES, META, fmt } from '@/lib/budget/data';

const WINE_DEEP = '#6B1622';
const GOLD = '#C9A961';
const INK = '#1A1612';
const MUTE = '#8A7F73';
const LINE = '#E8DFD0';
const WINE = '#8B1F2F';
const OK = '#2D5F4E';
const PAPER = '#F4EFE6';
const TC = "'Noto Serif TC', 'PingFang TC', 'Songti TC', serif";

const TYPE_LABEL: Record<string, { label: string; bg: string; color: string }> = {
  'co-hosted': { label: '南北合辦', bg: '#E8E0D0', color: WINE_DEEP },
  'south-only': { label: '南班自辦', bg: '#F4DDE0', color: WINE_DEEP },
  'fixed-cost': { label: '固定費用', bg: '#E0E8DD', color: OK },
};

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  planning: { label: '規劃中', color: MUTE },
  preparing: { label: '籌備中', color: '#B26B1F' },
  'in-progress': { label: '執行中', color: WINE },
  settled: { label: '已結算', color: OK },
};

export default function ActivitiesPage() {
  const coHosted = ACTIVITIES.filter((a) => a.type === 'co-hosted' || a.type === 'fixed-cost');
  const southOnly = ACTIVITIES.filter((a) => a.type === 'south-only');
  const totalNet = ACTIVITIES.reduce((s, a) => s + a.net, 0);
  const totalSouth = ACTIVITIES.reduce((s, a) => s + a.southBurden, 0);
  const totalNorth = ACTIVITIES.reduce((s, a) => s + a.northBurden, 0);

  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <Link href="/budget" style={{ fontSize: 13, color: MUTE, textDecoration: 'none' }}>← 回總覽</Link>
        <h1 style={{ fontFamily: TC, fontSize: 28, color: WINE_DEEP, fontWeight: 600, margin: '12px 0 6px' }}>活動明細</h1>
        <p style={{ fontSize: 14, color: '#4A413A', lineHeight: 1.8, maxWidth: 800 }}>
          E118 三年期共 <strong>{ACTIVITIES.length} 場</strong>活動 / 固定費用，含南北合辦 {coHosted.length} 項與南班自辦 {southOnly.length} 項。
          所有金額為保守預算估算，實際以結算為準；點擊任一項目可查看完整明細。
        </p>
      </div>

      {/* 統計 */}
      <section className="bdg-grid bdg-grid-3 bdg-grid-gap-sm" style={{ marginBottom: 28 }}>
        <Stat label="活動總淨支出" value={`NT$ ${fmt(totalNet)}`} sub={`${ACTIVITIES.length} 場 / 全期`} />
        <Stat label="南班負擔合計" value={`NT$ ${fmt(totalSouth)}`} sub={`南 ${META.southMembers} 人攤分`} accent={WINE} />
        <Stat label="北班分攤估算" value={`NT$ ${fmt(totalNorth)}`} sub={`北 ${META.northMembers} 人攤分（不含南班自辦）`} />
      </section>

      {/* 南北合辦 */}
      <h2 style={{ fontFamily: TC, fontSize: 20, color: WINE_DEEP, borderLeft: `4px solid ${GOLD}`, paddingLeft: 12, margin: '0 0 12px' }}>
        南北合辦 / 固定費用
      </h2>
      <div style={{ display: 'grid', gap: 10, marginBottom: 28 }}>
        {coHosted.map((a) => (
          <ActivityRow key={a.slug} activity={a} />
        ))}
      </div>

      {/* 南班自辦 */}
      <h2 style={{ fontFamily: TC, fontSize: 20, color: WINE_DEEP, borderLeft: `4px solid ${GOLD}`, paddingLeft: 12, margin: '0 0 12px' }}>
        南班自辦
      </h2>
      <div style={{ display: 'grid', gap: 10 }}>
        {southOnly.map((a) => (
          <ActivityRow key={a.slug} activity={a} />
        ))}
      </div>

      <div
        style={{
          marginTop: 28,
          background: PAPER,
          border: `1px solid ${LINE}`,
          borderRadius: 6,
          padding: '14px 18px',
          fontSize: 13,
          color: '#4A413A',
          lineHeight: 1.8,
        }}
      >
        <strong style={{ color: WINE_DEEP }}>關於數字：</strong>
        所有預算為保守估算（參考學長姐實際決算 + 6% 漲幅）。實際支出將以每場活動結算為準，差額在期末總對帳時退補。
        合辦活動由 E118 統一執行，事後按 83:16 比例向北班請款。
      </div>
    </>
  );
}

function ActivityRow({ activity }: { activity: typeof ACTIVITIES[number] }) {
  const a = activity;
  const t = TYPE_LABEL[a.type];
  const s = STATUS_LABEL[a.status];
  return (
    <Link href={`/budget/activities/${a.slug}`} className="bdg-row-act">
      <div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 4, flexWrap: 'wrap' }}>
          <strong style={{ fontFamily: TC, fontSize: 16, color: WINE_DEEP }}>{a.name}</strong>
          <span style={{ fontSize: 11, color: t.color, background: t.bg, padding: '2px 8px', borderRadius: 10, fontWeight: 500 }}>
            {t.label}
          </span>
          <span style={{ fontSize: 11, color: s.color }}>● {s.label}</span>
        </div>
        <div style={{ fontSize: 12, color: MUTE }}>
          {a.date}　·　{a.location}　·　主辦：{a.organizer}
        </div>
      </div>
      <ColCell label="淨支出" value={`NT$ ${fmt(a.net)}`} />
      <ColCell label="南班負擔" value={`NT$ ${fmt(a.southBurden)}`} accent={WINE} />
      <ColCell label="北班分攤" value={a.northBurden > 0 ? `NT$ ${fmt(a.northBurden)}` : '—'} />
    </Link>
  );
}

function ColCell({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: 11, color: MUTE }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: accent ?? INK }}>{value}</div>
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderTop: `3px solid ${accent ?? INK}`, borderRadius: 8, padding: '14px 16px' }}>
      <div style={{ fontSize: 12, color: MUTE, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, color: accent ?? INK }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: MUTE, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}
