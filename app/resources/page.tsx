import type { Metadata } from 'next';
import cards from '@/lib/dashboard/cards.json';
import './resources.css';

type Card = {
  key: string;
  title: string;
  meta: string;
  domain: string;
  svg: string;
  href: string;
  localHref: string | null;
  external: boolean;
  feed: string | null;
};

const byKey = Object.fromEntries((cards as Card[]).map((c) => [c.key, c]));

const PAGE_TITLE = 'EMBA 資源書院';
const PAGE_DESCRIPTION =
  'NCKU EMBA 學術資源共享站 — 課程報告、論文查詢、學分追蹤、社團總表，不分屆別的共用資料庫。';

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  // 根 layout 的 openGraph/twitter 寫死「E118 班」，這裡要整組覆寫，
  // 不然分享到 LINE／社群媒體時預覽卡片還是會顯示 E118 班而非本頁標題。
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: 'https://emba-resources.aqualux.dev',
    siteName: PAGE_TITLE,
    locale: 'zh_TW',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
  },
};

/**
 * /resources — EMBA 資源書院（不分屆別的公開學術資源站）。
 *
 * 刻意獨立於 E118 班級面板：
 * - 不含 Breadcrumb 元件（不連回 "/"，那是屆別專屬內部面板）
 * - 只有 4 張卡：課程報告 / 論文查詢系統 / 學分追蹤 / 社團總表，皆連到既有已上線系統
 * - 外部連結（reports / thesis / credits）都帶 ?src=resources，
 *   讓對方頁面能隱藏它自己的「回到班級面板」麵包屑（見各系統 repo 的對應修改）
 * - /clubs 是同一個 repo 內的靜態頁，走相對路徑，同樣帶 ?src=resources 隱藏它的麵包屑
 *
 * 由 Netlify domain-level redirect 把 emba-resources.aqualux.dev/* 導到這個路徑，
 * 對外呈現獨立網址；DNS/Netlify domain alias 需人工設定（見部署筆記）。
 */
export default function ResourcesPage() {
  const reports = byKey.reports;
  const thesis = byKey.thesis;
  const credits = byKey.credits;

  return (
    <div className="resources-route">
      <nav className="resources-nav">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/assets/ncku-emba-logo.png"
          alt="國立成功大學 EMBA 高階管理碩士在職專班"
        />
      </nav>

      <div className="resources-hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/resources/campus-hero.jpg" alt="國立成功大學校園" />
        <div className="resources-hero-copy">
          <div className="tag">Empowering Thought. Enriching Leadership.</div>
          <h1>不分屆別的 EMBA 學術資源共享站</h1>
        </div>
      </div>

      <div className="resources-section">
        <div className="resources-eyebrow">選擇一項資源</div>
        <div className="resources-grid">
          <a className="resources-tile" href={`${reports.href}?src=resources`}>
            <div
              className="badge"
              dangerouslySetInnerHTML={{ __html: reports.svg }}
            />
            <div>
              <h3>{reports.title}</h3>
              <p>{reports.meta}</p>
            </div>
          </a>

          <a
            className="resources-tile accent"
            href={`${thesis.href}?src=resources`}
          >
            <div
              className="badge"
              dangerouslySetInnerHTML={{ __html: thesis.svg }}
            />
            <div>
              <h3>{thesis.title}</h3>
              <p>{thesis.meta}</p>
            </div>
          </a>

          <a className="resources-tile" href={`${credits.href}?src=resources`}>
            <div
              className="badge"
              dangerouslySetInnerHTML={{ __html: credits.svg }}
            />
            <div>
              <h3>{credits.title}</h3>
              <p>{credits.meta}</p>
            </div>
          </a>

          <a className="resources-tile" href="/clubs?src=resources">
            <div className="badge">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                <path d="M4 22h16" />
                <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
                <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
                <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
              </svg>
            </div>
            <div>
              <h3>社團總表</h3>
              <p>校友總會 17 個社團一覽</p>
            </div>
          </a>
        </div>
      </div>

      <div className="resources-footbar">
        此頁面為非官方自建網站，內容由 E118 維護提供，非正式官方公告資料
      </div>
      <div className="resources-photo-credit">
        照片：
        <a
          href="https://commons.wikimedia.org/wiki/File:%E6%88%90%E5%8A%9F%E5%A4%A7%E5%AD%B8%E6%A6%95%E5%9C%92.jpg"
          target="_blank"
          rel="noopener noreferrer"
        >
          成功大學榕園
        </a>
        {' by Dosibot, '}
        <a
          href="https://creativecommons.org/licenses/by-sa/4.0/"
          target="_blank"
          rel="noopener noreferrer"
        >
          CC BY-SA 4.0
        </a>
        （已裁切）
      </div>
    </div>
  );
}
