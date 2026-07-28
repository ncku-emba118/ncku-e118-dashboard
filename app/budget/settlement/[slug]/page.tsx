import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ACTIVITIES, fmt } from '@/lib/budget/data';
import SettlementDoc from '@/components/budget/SettlementDoc';
import PrintButton from '@/components/budget/PrintButton';
import SettlementSignoffLauncher from '@/components/budget/SettlementSignoffLauncher';
import { readSession } from '@/lib/auth/session';
import { getSettlementSignoffStatus } from '@/lib/signoff/dal';
import { canInitiateSettlementSignoff } from '@/lib/signoff/permission';

const WINE = '#8B1F2F';
const WINE_DEEP = '#6B1622';
const MUTE = '#8A7F73';
const TC = "'Noto Serif TC', 'PingFang TC', 'Songti TC', serif";

const settledActivities = ACTIVITIES.filter((a) => a.settlement);

// 0022：頁面要在 server 端讀 session 判斷角色、並即時查 DB 顯示簽核狀態，
// 不能再靠 generateStaticParams 的靜態預先產生頁面（那條路徑無法讀 cookie / 查最新 DB 狀態）。
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const a = settledActivities.find((x) => x.slug === slug);
  if (!a) return { title: '結算單｜E118 南班班費執行與結算' };
  return {
    title: `${a.name} 結算單 ${a.settlement!.no}｜E118 南班班費執行與結算`,
    description: `${a.name} 活動結算單（第 ${a.settlement!.revision} 版，${a.settlement!.issuedAt} 製表）`,
  };
}

export default async function SettlementDocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const activity = settledActivities.find((a) => a.slug === slug);
  if (!activity) notFound();

  const settlementNo = activity.settlement!.no;

  // 頁面本身公開（未登入也看得到，符合原本靜態頁的行為）；
  // session 只用來判斷要不要顯示「送出簽核」按鈕，未登入一律不顯示。
  const [session, signoffRes] = await Promise.all([
    readSession(),
    getSettlementSignoffStatus(settlementNo),
  ]);

  if (signoffRes.error) {
    // 查詢失敗只記 log、不阻擋頁面渲染——退回顯示靜態資料（若有）或「待簽核」，
    // 不能讓 DB 暫時性錯誤變成整頁 500（這是公開頁）。
    console.error('[settlement.signoff_status_failed]', { slug, settlementNo, error: signoffRes.error });
  }
  // 查詢失敗時傳 undefined（觸發 SettlementDoc fallback 靜態 signoffRef 的邏輯），
  // 查詢成功但查無資料時傳 null（同樣 fallback），兩者對畫面呈現一致，差別只在 log。
  const liveSignoff = signoffRes.error ? undefined : signoffRes.data;

  const canInitiate = !!session && canInitiateSettlementSignoff(session);
  // 已有進行中（routing）或已核准（approved）的單不重複顯示送出按鈕；
  // 沒有單、或先前退回/作廢，才可以（重新）發起。
  const showLaunch =
    canInitiate && (!liveSignoff || liveSignoff.status === 'rejected' || liveSignoff.status === 'voided');

  // 送簽 modal 預設帶入值：金額用班費實際負擔（actualSplit.paidByFund，即結算單「班費淨負擔」），
  // 沒有 actualSplit 時退回帳單總額；用途帶活動名稱＋結算單編號方便簽核人辨識。
  const defaultAmount = activity.actualSplit?.paidByFund ?? activity.settlement?.invoiceTotal ?? null;
  const defaultPurpose = `${activity.name}（${settlementNo}）結算請款`;

  return (
    <>
      {/* 列印時隱藏導覽與說明，只留結算單本體 */}
      <div className="no-print" style={{ marginBottom: 20 }}>
        <Link href="/budget/settlement" style={{ fontSize: 13, color: MUTE, textDecoration: 'none' }}>
          ← 回結算機制
        </Link>
        <h1 style={{ fontFamily: TC, fontSize: 26, color: WINE_DEEP, fontWeight: 600, margin: '12px 0 6px' }}>
          {activity.name}　結算單
        </h1>
        <p style={{ fontSize: 13.5, color: '#4A413A', lineHeight: 1.8, maxWidth: 760 }}>
          本單由班費說明書的活動資料自動產生，數字與{' '}
          <Link href={`/budget/activities/${activity.slug}`} style={{ color: WINE }}>
            活動頁
          </Link>{' '}
          一致。幹部簽核完成後，按下方按鈕下載 PDF 寄給北班財務長請款；匯款帳號請另行私訊提供。
        </p>
        <div style={{ marginTop: 14, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <PrintButton />
          {showLaunch && (
            <SettlementSignoffLauncher
              settlementNo={settlementNo}
              defaultTitle={`${activity.name}　結算單`}
              defaultAmount={defaultAmount}
              defaultPurpose={defaultPurpose}
            />
          )}
          {!session && (
            <span style={{ fontSize: 12, color: MUTE }}>
              財務長／班代<Link href={`/board/login?next=/budget/settlement/${slug}`} style={{ color: WINE }}>登入</Link>後可送出簽核
            </span>
          )}
        </div>
      </div>

      <SettlementDoc activity={activity} liveSignoff={liveSignoff} />

      <div className="no-print" style={{ marginTop: 18, textAlign: 'center', fontSize: 12.5, color: MUTE }}>
        {activity.settlement!.no}　第 {activity.settlement!.revision} 版　·　製表 {activity.settlement!.issuedAt}
        {activity.actualSplit && `　·　北班應付 NT$ ${fmt(activity.actualSplit.north.amount)}`}
      </div>
    </>
  );
}
