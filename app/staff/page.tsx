/**
 * /staff — 幹部專區（登入後的落地頁）。
 *
 * 原本登入後一律丟到公告欄後台，但幹部最常做的其實是經費簽核；
 * 而且不同職務能做的事不同（收入管理只有財務長與 super 能用），
 * 丟一個共同入口再讓人自己找路，等於把權限判斷推給使用者去猜。
 *
 * 這頁依身分只列出「這個人真的能做」的事，並把待辦數字直接標在卡片上，
 * 讓待簽件數自己推著人去處理，不必秘書長一個個催。
 */
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Breadcrumb from '@/components/Breadcrumb';
import { readSession } from '@/lib/auth/session';
import { listInbox, listCreatedBy } from '@/lib/signoff/dal';
import { canManageIncome } from '@/lib/finance/income';
import { deptInfo } from '@/lib/depts';

export const dynamic = 'force-dynamic';

const WINE = '#8B1F2F';
const WINE_DEEP = '#6B1622';
const GOLD = '#C9A961';
const CREAM = '#FAF7F2';
const INK = '#1A1612';
const MUTE = '#8A7F73';
const LINE = '#E8DFD0';
const OK = '#2D5F4E';
const TC = "'Noto Serif TC', 'PingFang TC', serif";

export const metadata = {
  title: '幹部專區｜E118',
  description: '幹部登入後的入口：待簽核、發起經費單、收入管理、公告管理。',
};

export default async function StaffPage() {
  const session = await readSession();
  if (!session) redirect('/board/login?next=/staff');

  // 待辦數字：查詢失敗不擋頁面（入口頁不該因為統計失敗就打不開），
  // 改以 null 表示「無法取得」，卡片上不顯示假的 0。
  const [inboxRes, createdRes] = await Promise.all([
    listInbox(session.sub),
    listCreatedBy(session.sub),
  ]);
  const pendingCount = inboxRes.error ? null : (inboxRes.data ?? []).length;
  const myRoutingCount = createdRes.error
    ? null
    : (createdRes.data ?? []).filter(
        (d: { status?: string }) => d.status === 'routing',
      ).length;

  const isSuper = session.role === 'super';
  const showIncome = canManageIncome({ role: session.role, home_dept_id: session.home_dept_id });
  const dept = session.home_dept_id ? deptInfo(session.home_dept_id) : null;

  return (
    <>
      <Breadcrumb items={[{ label: '班級面板', href: '/' }, { label: '幹部專區' }]} />
      <main
        style={{
          minHeight: '100vh',
          background: CREAM,
          color: INK,
          padding: '28px 20px 60px',
          fontFamily: "-apple-system, BlinkMacSystemFont, system-ui, 'PingFang TC', sans-serif",
        }}
      >
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          {/* 身分列 */}
          <header style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 11.5, color: MUTE, letterSpacing: '.12em', marginBottom: 6 }}>
              NCKU EMBA · E118
            </div>
            <h1 style={{ fontFamily: TC, fontSize: 26, color: WINE_DEEP, fontWeight: 600, margin: '0 0 8px' }}>
              幹部專區
            </h1>
            <div style={{ fontSize: 13.5, color: '#4A413A' }}>
              目前登入：<strong>{session.username}</strong>
              <span style={{ color: MUTE }}>
                　{isSuper ? '（可管理全部部門）' : dept ? `（${dept.name}部）` : ''}
              </span>
            </div>
          </header>

          {/* 待辦：有待簽才出現，且排在最前面 */}
          {pendingCount !== null && pendingCount > 0 && (
            <Link
              href="/finance/signoff"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 14,
                padding: '16px 18px',
                background: '#fff',
                border: `1px solid ${WINE}`,
                borderLeft: `5px solid ${WINE}`,
                borderRadius: 8,
                textDecoration: 'none',
                color: INK,
                marginBottom: 14,
              }}
            >
              <div>
                <div style={{ fontFamily: TC, fontSize: 17, fontWeight: 600, color: WINE_DEEP }}>
                  有 {pendingCount} 件等你簽核
                </div>
                <div style={{ fontSize: 12.5, color: MUTE, marginTop: 4 }}>
                  點進去逐件檢視憑證後簽名
                </div>
              </div>
              <span
                style={{
                  background: WINE,
                  color: '#fff',
                  borderRadius: 20,
                  minWidth: 34,
                  textAlign: 'center',
                  padding: '6px 12px',
                  fontSize: 16,
                  fontWeight: 700,
                }}
              >
                {pendingCount}
              </span>
            </Link>
          )}

          {pendingCount === 0 && (
            <div
              style={{
                padding: '13px 16px',
                background: '#E8F0EA',
                border: `1px solid #C4D9C9`,
                borderRadius: 8,
                fontSize: 13.5,
                color: OK,
                marginBottom: 14,
              }}
            >
              ✓ 目前沒有待你簽核的單據
            </div>
          )}

          {/* 經費 */}
          <SectionLabel>經費</SectionLabel>
          <div style={{ display: 'grid', gap: 10, marginBottom: 22 }}>
            <Card
              href="/finance/signoff"
              title="經費單簽核"
              desc="待我簽核、我發起的、已簽核紀錄"
              meta={
                myRoutingCount !== null && myRoutingCount > 0
                  ? `我發起的還有 ${myRoutingCount} 件進行中`
                  : undefined
              }
              accent={WINE}
            />
            <Card
              href="/finance/signoff/new"
              title="發起經費單簽核"
              desc="上傳發票 / 報價單，指派簽核人"
              accent={GOLD}
            />
            {showIncome && (
              <Card
                href="/finance/income"
                title="收入管理"
                desc="記錄班費、補收、退款等收入"
                meta="限財務長與班代 / 副班代 / 秘書長"
                accent={OK}
              />
            )}
            <Card
              href="/finance"
              title="班級經費中心"
              desc="收支總覽、月報下載（全班可查）"
              accent={MUTE}
            />
          </div>

          {/* 預算與結算 */}
          <SectionLabel>預算與結算</SectionLabel>
          <div style={{ display: 'grid', gap: 10, marginBottom: 22 }}>
            <Card
              href="/budget/tracking"
              title="執行追蹤"
              desc="各活動的預算 vs 實際對照總表"
              accent={WINE}
            />
            <Card
              href="/budget/settlement"
              title="結算機制與結算單"
              desc="結算流程、請款規則、已產出的結算單"
              accent={GOLD}
            />
            <Card
              href="/budget/signoff"
              title="預算書簽核"
              desc="三年預算說明書的 9 位幹部簽名"
              meta="簽名需班級密碼"
              accent={MUTE}
            />
          </div>

          {/* 公告 */}
          <SectionLabel>公告</SectionLabel>
          <div style={{ display: 'grid', gap: 10 }}>
            <Card
              href="/board/admin"
              title="公告欄後台"
              desc={isSuper ? '發佈與管理全部部門公告' : `發佈與管理${dept ? dept.name : ''}部公告`}
              accent={WINE}
            />
          </div>

          <p style={{ marginTop: 26, fontSize: 12.5, color: MUTE, lineHeight: 1.8 }}>
            只列出你目前身分可以操作的項目。
            {!showIncome && '（收入管理限財務長與班代 / 副班代 / 秘書長）'}
          </p>
        </div>
      </main>
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11.5,
        color: MUTE,
        letterSpacing: '.14em',
        fontWeight: 600,
        margin: '0 0 9px 2px',
      }}
    >
      {children}
    </div>
  );
}

function Card({
  href,
  title,
  desc,
  meta,
  accent,
}: {
  href: string;
  title: string;
  desc: string;
  meta?: string;
  accent: string;
}) {
  return (
    <Link
      href={href}
      style={{
        display: 'block',
        padding: '14px 16px',
        background: '#fff',
        border: `1px solid ${LINE}`,
        borderLeft: `4px solid ${accent}`,
        borderRadius: 8,
        textDecoration: 'none',
        color: INK,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontFamily: TC, fontSize: 16, fontWeight: 600, color: WINE_DEEP }}>{title}</span>
        <span style={{ fontSize: 12, color: accent, fontWeight: 600, flexShrink: 0 }}>→</span>
      </div>
      <div style={{ fontSize: 12.5, color: '#4A413A', marginTop: 4, lineHeight: 1.6 }}>{desc}</div>
      {meta && <div style={{ fontSize: 11.5, color: MUTE, marginTop: 4 }}>{meta}</div>}
    </Link>
  );
}
