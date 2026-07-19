import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ACTIVITIES, META, BUDGET_DISCLAIMER, fmt } from '@/lib/budget/data';

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

export function generateStaticParams() {
  return ACTIVITIES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const a = ACTIVITIES.find((x) => x.slug === slug);
  if (!a) return { title: '活動不存在' };
  return {
    title: `${a.name}｜E118 南班班費預算說明書`,
    description: `${a.date}　·　${a.location}　·　淨支出 NT$ ${fmt(a.net)}　·　南班負擔 NT$ ${fmt(a.southBurden)}`,
  };
}

export default async function ActivityDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = ACTIVITIES.find((x) => x.slug === slug);
  if (!a) notFound();

  const t = TYPE_LABEL[a.type];
  const s = STATUS_LABEL[a.status];

  return (
    <>
      <div style={{ marginBottom: 20 }}>
        <Link href="/budget/activities" style={{ fontSize: 13, color: MUTE, textDecoration: 'none' }}>← 回活動明細</Link>
      </div>

      {/* Hero */}
      <section
        className="bdg-hero"
        style={{
          background: `linear-gradient(135deg, #fff 0%, ${PAPER} 100%)`,
          padding: '32px 36px',
          border: `1px solid ${LINE}`,
          borderRadius: 12,
          marginBottom: 24,
        }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: t.color, background: t.bg, padding: '3px 10px', borderRadius: 10, fontWeight: 500 }}>{t.label}</span>
          <span style={{ fontSize: 11, color: s.color }}>● {s.label}</span>
          {a.statusNote && <span style={{ fontSize: 11, color: MUTE }}>{a.statusNote}</span>}
        </div>
        <h1 style={{ fontFamily: TC, fontSize: 30, color: WINE_DEEP, fontWeight: 600, margin: '0 0 12px' }}>{a.name}</h1>
        <div className="bdg-grid bdg-grid-4" style={{ marginTop: 18, gap: 14 }}>
          <Meta label="日期" value={a.date} />
          <Meta label="地點" value={a.location} />
          <Meta label="主辦" value={a.organizer} />
          <Meta label="預估出席" value={a.estimatedAttendance} />
        </div>
        {a.organizerNote && (
          <div style={{ marginTop: 12, fontSize: 12.5, color: '#7a5c00', background: '#FFF8E7', border: `1px solid ${GOLD}`, padding: '8px 12px', borderRadius: 6 }}>
            ※ {a.organizerNote}
          </div>
        )}
      </section>

      {/* 全域預算備註 */}
      <div
        style={{
          background: '#FFF8E7',
          border: `1px solid ${GOLD}`,
          borderLeft: `4px solid ${GOLD}`,
          padding: '12px 16px',
          borderRadius: 6,
          fontSize: 13,
          color: '#7a5c00',
          lineHeight: 1.7,
          marginBottom: 22,
        }}
      >
        {a.actualSplit ? (
          <>
            <strong>※ 本項已結算：</strong>
            下方「實際總支出」與「班費分攤（實際結算）」為廠商實際帳單與實際請款金額，可直接依此金額轉帳；「預算總支出」欄保留原編列數供對照。
          </>
        ) : (
          <>
            <strong>※ 預算性質說明：</strong>
            {BUDGET_DISCLAIMER}
          </>
        )}
      </div>

      {/* 概述 */}
      <Section title="活動概述">
        <p style={{ fontSize: 14.5, color: '#4A413A', lineHeight: 2, marginBottom: 12 }}>{a.overview}</p>
        <div><strong style={{ color: WINE_DEEP, fontSize: 13 }}>對象：</strong><span style={{ fontSize: 13, color: '#4A413A' }}>{a.audience}</span></div>
        {a.highlights && a.highlights.length > 0 && (
          <>
            <div style={{ marginTop: 14, fontSize: 13, color: WINE_DEEP, fontWeight: 600 }}>活動亮點</div>
            <ul style={{ paddingLeft: 22, color: '#4A413A', lineHeight: 1.9, fontSize: 13.5, marginTop: 6 }}>
              {a.highlights.map((h, i) => <li key={i}>{h}</li>)}
            </ul>
          </>
        )}
      </Section>

      {/* 三大金額（有實際支出時擴為四項，預算 vs 實際並列） */}
      <section
        className={`bdg-grid ${a.actualExpense !== undefined ? 'bdg-grid-4' : 'bdg-grid-3'} bdg-grid-gap-sm`}
        style={{ marginTop: 28, marginBottom: 28 }}
      >
        <BigStat label="預算總支出" value={fmt(a.expense.total)} tone="ink" />
        {a.actualExpense !== undefined && (
          <BigStat
            label="實際總支出"
            value={fmt(a.actualExpense)}
            tone="wine"
            footnote={
              a.actualExpenseNote ??
              `較預算 ${a.actualExpense - a.expense.total >= 0 ? '+' : ''}NT$ ${fmt(a.actualExpense - a.expense.total)}`
            }
          />
        )}
        <BigStat
          label={a.conservativeIncome !== undefined ? '預估總收入（樂觀）' : '預估總收入'}
          value={fmt(a.income.total)}
          tone="ok"
          footnote={a.conservativeIncome !== undefined ? `保守估算：NT$ ${fmt(a.conservativeIncome)}` : undefined}
        />
        {a.actualSplit ? (
          <BigStat
            label="班費實付"
            value={fmt(a.actualSplit.paidByFund)}
            tone="wine"
            footnote={`由全班 ${a.actualSplit.members} 人分攤（預算原編列 NT$ ${fmt(a.net)}）`}
          />
        ) : (
          <BigStat label="班費淨負擔" value={fmt(a.net)} tone="wine" footnote={a.netNote} />
        )}
      </section>

      {/* 支出明細 */}
      <Section title={`支出明細（共 ${a.expense.items.length} 項）`} subtitle={a.budgetBasis ? `預算基礎：${a.budgetBasis}` : undefined}>
        {a.expense.items.length === 0 ? (
          <EmptyMsg text="細項待補" />
        ) : (
          <div className="bdg-table-wrap">
            <table className="bdg-table">
              <caption>{a.name} 支出明細（金額單位：新台幣元）</caption>
              <thead>
                <tr>
                  <th scope="col">項目</th>
                  <th scope="col" className="num" style={{ width: 80 }}>數量</th>
                  <th scope="col" style={{ width: 60 }}>單位</th>
                  <th scope="col" className="num" style={{ width: 100 }}>單價</th>
                  <th scope="col" className="num" style={{ width: 120 }}>金額</th>
                  <th scope="col">備註</th>
                </tr>
              </thead>
              <tbody>
                {a.expense.items.map((it, i) => (
                  <tr key={i}>
                    <td data-label="項目">{it.name}</td>
                    <td className="num" data-label="數量">{it.qty ?? '—'}</td>
                    <td data-label="單位">{it.unit ?? '—'}</td>
                    <td className="num" data-label="單價">{it.unitPrice ? fmt(it.unitPrice) : '—'}</td>
                    <td className="num strong" data-label="金額">{fmt(it.amount)}</td>
                    <td className="mute" data-label="備註">{it.note ?? ''}</td>
                  </tr>
                ))}
                <tr className="sub">
                  <td colSpan={4} className="num strong" data-label="">支出合計</td>
                  <td className="num" data-label="" style={{ fontWeight: 700 }}>{fmt(a.expense.total)}</td>
                  <td data-label=""></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* 收入明細 */}
      <Section title={`收入明細（共 ${a.income.items.length} 項）`} subtitle={a.conservativeIncomeNote}>
        {a.income.items.length === 0 ? (
          <EmptyMsg text="本場活動無收入項目" />
        ) : (
          <div className="bdg-table-wrap">
            <table className="bdg-table">
              <caption>{a.name} 收入明細（金額單位：新台幣元）</caption>
              <thead>
                <tr>
                  <th scope="col">項目</th>
                  <th scope="col" className="num" style={{ width: 80 }}>數量</th>
                  <th scope="col" style={{ width: 60 }}>單位</th>
                  <th scope="col" className="num" style={{ width: 100 }}>單價</th>
                  <th scope="col" className="num" style={{ width: 120 }}>金額</th>
                  <th scope="col">備註</th>
                </tr>
              </thead>
              <tbody>
                {a.income.items.map((it, i) => (
                  <tr key={i}>
                    <td data-label="項目">{it.name}</td>
                    <td className="num" data-label="數量">{it.qty ?? '—'}</td>
                    <td data-label="單位">{it.unit ?? '—'}</td>
                    <td className="num" data-label="單價">{it.unitPrice ? fmt(it.unitPrice) : '—'}</td>
                    <td className="num strong" style={{ color: OK }} data-label="金額">{fmt(it.amount)}</td>
                    <td className="mute" data-label="備註">{it.note ?? ''}</td>
                  </tr>
                ))}
                <tr className="sub">
                  <td colSpan={4} className="num strong" data-label="">{a.conservativeIncome !== undefined ? '收入合計（樂觀）' : '收入合計'}</td>
                  <td className="num" data-label="" style={{ fontWeight: 700 }}>{fmt(a.income.total)}</td>
                  <td data-label=""></td>
                </tr>
                {a.conservativeIncome !== undefined && (
                  <tr className="sub">
                    <td colSpan={4} className="num strong" data-label="">收入合計（保守，用於淨負擔計算）</td>
                    <td className="num" data-label="" style={{ fontWeight: 700 }}>{fmt(a.conservativeIncome)}</td>
                    <td data-label=""></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* 班費分攤 — 已結算者依實際領取人數均攤，未結算者維持預算比例攤分 */}
      {a.actualSplit ? (
        <Section
          title="班費分攤（實際結算）"
          subtitle={`班費實付 NT$ ${fmt(a.actualSplit.paidByFund)}　由全班 ${a.actualSplit.members} 人按南北 83:16 分攤，每人 NT$ ${fmt(a.actualSplit.perPerson)}`}
        >
          <div className="bdg-grid bdg-grid-2 bdg-grid-gap-sm">
            <SplitCard
              label={`南班負擔（${a.actualSplit.south.count} 人）`}
              amount={a.actualSplit.south.amount}
              perPerson={a.actualSplit.perPerson}
              accent={WINE}
            />
            <SplitCard
              label={`北班分攤（${a.actualSplit.north.count} 人）`}
              amount={a.actualSplit.north.amount}
              perPerson={a.actualSplit.perPerson}
              accent={INK}
              note={a.actualSplit.northNote}
            />
          </div>
          {a.actualSplit.basisNote && (
            <div
              style={{
                marginTop: 12,
                background: PAPER,
                border: `1px solid ${LINE}`,
                borderRadius: 6,
                padding: '12px 16px',
                fontSize: 12.5,
                color: '#4A413A',
                lineHeight: 1.8,
              }}
            >
              <strong style={{ color: WINE_DEEP }}>分攤方式：</strong>
              {a.actualSplit.basisNote}
            </div>
          )}
          <div style={{ marginTop: 10, fontSize: 12, color: MUTE, lineHeight: 1.7 }}>
            （預算階段原按南北 83:16 估算為南班 NT$ {fmt(a.southBurden)} ／ 北班 NT$ {fmt(a.northBurden)}；本項已結算，以上方實際金額為準。）
          </div>
          {a.settlement && (
            <div style={{ marginTop: 12 }}>
              <Link
                href={`/budget/settlement/${a.slug}`}
                style={{
                  display: 'inline-block',
                  padding: '8px 16px',
                  border: `1px solid ${WINE}`,
                  borderRadius: 6,
                  color: WINE,
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                檢視正式結算單（{a.settlement.no}　第 {a.settlement.revision} 版）→
              </Link>
            </div>
          )}
        </Section>
      ) : (
        <Section title="班費分攤" subtitle={`淨支出 NT$ ${fmt(a.net)}　${a.type === 'south-only' ? '由南班獨自負擔' : '按南北 83:16 比例攤分'}`}>
          <div className="bdg-grid bdg-grid-2 bdg-grid-gap-sm">
            <SplitCard label={`南班負擔（${META.southMembers} 人）`} amount={a.southBurden} perPerson={Math.round(a.southBurden / META.southMembers)} accent={WINE} />
            {a.type === 'south-only' ? (
              <div style={{ background: '#FFF8E7', border: `1px solid ${LINE}`, borderRadius: 8, padding: '14px 16px', fontSize: 13, color: '#4A413A', lineHeight: 1.7 }}>
                本場為南班自辦活動，北班不分攤。
              </div>
            ) : (
              <SplitCard label={`北班分攤（${META.northMembers} 人）`} amount={a.northBurden} perPerson={Math.round(a.northBurden / META.northMembers)} accent={INK} note="活動結束後按 83:16 比例向北班請款" />
            )}
          </div>
        </Section>
      )}

      {/* 註解 */}
      {(a.historicalReference || a.statusNote || a.settlementNote || a.notes) && (
        <Section title="附註">
          <ul style={{ paddingLeft: 22, color: '#4A413A', lineHeight: 1.9, fontSize: 13.5 }}>
            {a.historicalReference && <li><strong>歷史參考：</strong>{a.historicalReference}</li>}
            {a.statusNote && <li><strong>狀態說明：</strong>{a.statusNote}</li>}
            {a.settlementNote && <li><strong>結算說明：</strong>{a.settlementNote}</li>}
            {a.notes?.map((n, i) => <li key={i}>{n}</li>)}
            <li>
              {a.actualSplit
                ? '本項已完成結算，以上為實際金額；如後續有補製或退換再行更新。'
                : '活動結束後實際結算將更新於本頁；差額在期末總對帳時退補。'}
            </li>
          </ul>
        </Section>
      )}
    </>
  );
}

// ── 元件 ─────────────────────────────────────────────────────────────────
function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ fontFamily: TC, fontSize: 19, color: WINE_DEEP, fontWeight: 600, margin: '0 0 4px', borderLeft: `3px solid ${GOLD}`, paddingLeft: 10 }}>
        {title}
      </h2>
      {subtitle && <div style={{ fontSize: 12.5, color: MUTE, marginBottom: 12, paddingLeft: 14 }}>{subtitle}</div>}
      {!subtitle && <div style={{ marginBottom: 12 }} />}
      {children}
    </section>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: MUTE, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, color: INK, fontWeight: 500 }}>{value}</div>
    </div>
  );
}

function BigStat({ label, value, tone, footnote }: { label: string; value: string; tone: 'ink' | 'wine' | 'ok'; footnote?: string }) {
  const color = tone === 'wine' ? WINE : tone === 'ok' ? OK : INK;
  return (
    <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderTop: `3px solid ${color}`, borderRadius: 8, padding: '14px 18px' }}>
      <div style={{ fontSize: 12, color: MUTE, marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: DISPLAY, fontSize: 30, fontWeight: 600, color, letterSpacing: 0.5 }}>NT$ {value}</div>
      {footnote && <div style={{ fontSize: 11.5, color: MUTE, marginTop: 6, lineHeight: 1.5 }}>{footnote}</div>}
    </div>
  );
}

function SplitCard({ label, amount, perPerson, accent, note }: { label: string; amount: number; perPerson: number; accent: string; note?: string }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderLeft: `3px solid ${accent}`, borderRadius: 8, padding: '14px 18px' }}>
      <div style={{ fontSize: 12, color: MUTE, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600, color: accent }}>NT$ {fmt(amount)}</div>
      <div style={{ fontSize: 12.5, color: MUTE, marginTop: 4 }}>平均每人 NT$ {fmt(perPerson)}</div>
      {note && <div style={{ fontSize: 11.5, color: MUTE, marginTop: 8, lineHeight: 1.6 }}>{note}</div>}
    </div>
  );
}

function EmptyMsg({ text }: { text: string }) {
  return <div style={{ background: PAPER, border: `1px dashed ${LINE}`, padding: 16, borderRadius: 6, color: MUTE, fontSize: 13, textAlign: 'center' }}>{text}</div>;
}

const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', background: '#fff', border: `1px solid ${LINE}`, borderRadius: 6, overflow: 'hidden', fontSize: 13 };
const th: React.CSSProperties = { background: PAPER, color: WINE_DEEP, padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: 12.5, borderBottom: `1px solid ${LINE}` };
const td: React.CSSProperties = { padding: '8px 12px', borderBottom: `1px solid ${LINE}`, color: INK };
