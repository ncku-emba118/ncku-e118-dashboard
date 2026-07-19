import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ACTIVITIES, fmt } from '@/lib/budget/data';
import SettlementDoc from '@/components/budget/SettlementDoc';

const WINE = '#8B1F2F';
const WINE_DEEP = '#6B1622';
const MUTE = '#8A7F73';
const TC = "'Noto Serif TC', 'PingFang TC', 'Songti TC', serif";

const settledActivities = ACTIVITIES.filter((a) => a.settlement);

export function generateStaticParams() {
  return settledActivities.map((a) => ({ slug: a.slug }));
}

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
          一致。用瀏覽器列印（⌘P）即可存成 PDF 傳給北班財務長；匯款帳號請另行私訊提供。
        </p>
      </div>

      <SettlementDoc activity={activity} />

      <div className="no-print" style={{ marginTop: 18, textAlign: 'center', fontSize: 12.5, color: MUTE }}>
        {activity.settlement!.no}　第 {activity.settlement!.revision} 版　·　製表 {activity.settlement!.issuedAt}
        {activity.actualSplit && `　·　北班應付 NT$ ${fmt(activity.actualSplit.north.amount)}`}
      </div>
    </>
  );
}
