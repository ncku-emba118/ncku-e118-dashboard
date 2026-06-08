import cards from '@/lib/dashboard/cards.json';
import { getLatestPosts, getUpcomingEvents } from '@/lib/dashboard/feeds';
import ClassPhotoSection from '@/components/ClassPhotoSection';

/**
 * 主 dashboard 首頁 — Bento 版型（2026-05 改版）。
 * 上方兩個「即時看板」：班級行事曆（Google ICS）+ 班級公告欄（Supabase posts），server 端撈、ISR 5 分快取。
 * 下方功能卡 + 班級幹部（倒數第二）+ 班級成員（最後）。保留 PWA 安裝區與 footer。
 * 舊版單欄 + ? help popover 設計保留在 git 歷史，可隨時還原。
 */
export const revalidate = 300;

type Card = {
  key: string; title: string; meta: string; domain: string; svg: string;
  href: string; localHref: string | null; external: boolean; feed: string | null;
};
const byKey = Object.fromEntries((cards as Card[]).map((c) => [c.key, c]));
const SMALL = ['finance', 'drive', 'thesis', 'reports', 'clubs', 'activities', 'field-study'];
const OFFICER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M18 21a8 8 0 0 0-16 0"/><circle cx="10" cy="8" r="5"/><path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3"/></svg>';

function extAttrs(c: Card) {
  return c.external ? { target: '_blank', rel: 'noopener noreferrer' } : {};
}

export default async function Home() {
  const [posts, events] = await Promise.all([getLatestPosts(5), getUpcomingEvents(3)]);
  const cal = byKey['calendar'];
  const board = byKey['board'];
  const members = byKey['members'];

  return (
    <>
      <header className="top">
        <div className="container top-inner">
          <a href="#" className="brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/ncku-emba-logo.png" alt="NCKU EMBA" />
            <div className="brand-class">
              <span className="brand-class-num">E118</span>
              <span className="brand-class-label">Class Dashboard</span>
            </div>
          </a>
          <ul className="nav-links">
            <li><a href="#apps">系統入口</a></li>
            <li><a href="#help">使用說明</a></li>
            <li><a href="#install">安裝 App</a></li>
          </ul>
        </div>
      </header>

      <main>
        <div className="container">
          <section className="bx-hero">
            <div className="bx-hero-eyebrow">NCKU EMBA · E118</div>
            <h1 className="bx-hero-h1">班級控制面板</h1>
            <p className="bx-hero-lede">課程、研究、活動與班務資源 — 一頁總覽。最新公告與近期活動即時顯示在上方。</p>
          </section>

          <section id="apps" className="bx-wrap">
            <div className="bx-grid">
              {/* 行事曆 即時看板 */}
              <a className="bx-tile bx-lg bx-feedcal" href={cal.href} {...(cal.localHref ? { 'data-local-href': cal.localHref } : {})}>
                <div className="bx-feedhead">
                  <div className="bx-ic" dangerouslySetInnerHTML={{ __html: cal.svg }} />
                  <div><h3 className="bx-h3">班級行事曆</h3><div className="bx-live"><span className="bx-dot" />近期活動 · 即時同步</div></div>
                </div>
                <div className="bx-feedlist">
                  {events.length === 0 ? (
                    <div className="bx-empty">近期沒有活動</div>
                  ) : events.map((e, i) => (
                    <div className="bx-citem" key={i}>
                      <div className="bx-cdate"><div className="d">{e.date}</div><div className="w">週{e.weekday}</div></div>
                      <div className="bx-ctitle">{e.title}</div>
                    </div>
                  ))}
                </div>
                <div className="bx-feedfoot">看完整行事曆 →</div>
              </a>

              {/* 公告欄 即時看板（每則公告可獨立點擊跳詳細頁）*/}
              <div className="bx-tile bx-lg bx-feed">
                <a className="bx-feedhead-link" href={board.href}>
                  <div className="bx-feedhead">
                    <div className="bx-ic" dangerouslySetInnerHTML={{ __html: board.svg }} />
                    <div><h3 className="bx-h3">班級公告欄</h3><div className="bx-live"><span className="bx-dot" />最新動態 · 即時更新</div></div>
                  </div>
                </a>
                <div className="bx-feedlist">
                  {posts.length === 0 ? (
                    <div className="bx-empty">目前沒有公告</div>
                  ) : posts.filter((p) => p.id).map((p) => (
                    <a className="bx-fitem" key={p.id} href={`/board/post/${p.id}`}>
                      <span className="bx-dept">{p.dept}</span>
                      <span className="bx-ftitle">{p.title}</span>
                      <span className="bx-fmeta">{p.date}{p.att ? ` · ${p.att} 附` : ''}</span>
                    </a>
                  ))}
                </div>
                <a className="bx-feedfoot" href={board.href}>查看全部公告 →</a>
              </div>

              {/* 功能卡 */}
              {SMALL.map((k) => {
                const c = byKey[k];
                return (
                  <a key={k} className="bx-tile" href={c.href} {...extAttrs(c)} {...(c.localHref ? { 'data-local-href': c.localHref } : {})}>
                    <span className="bx-arr">{c.external ? '↗' : '→'}</span>
                    <div className="bx-ic" dangerouslySetInnerHTML={{ __html: c.svg }} />
                    <div className="bx-title">{c.title}</div>
                    <div className="bx-meta">{c.meta}</div>
                  </a>
                );
              })}

              {/* 倒數第二：班級幹部 */}
              <a className="bx-tile bx-gold" href="/officers">
                <span className="bx-arr">→</span>
                <div className="bx-ic" dangerouslySetInnerHTML={{ __html: OFFICER_SVG }} />
                <div className="bx-title">班級幹部</div>
                <div className="bx-meta">南班 / 北班 組織圖</div>
              </a>

              {/* 最後：班級成員 */}
              <a className="bx-tile bx-gold" href={members.href} {...extAttrs(members)}>
                <span className="bx-arr">{members.external ? '↗' : '→'}</span>
                <div className="bx-ic" dangerouslySetInnerHTML={{ __html: members.svg }} />
                <div className="bx-title">{members.title}</div>
                <div className="bx-meta">{members.meta}</div>
              </a>
            </div>
          </section>

          {/* ── 使用說明 + 安裝（極簡合併版） ── */}
          <section id="help" className="quick-links">
            <a
              href="/assets/E118-guide.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="ql-link"
              aria-label="開啟 E118 班網使用指南 PDF（16 頁，於新分頁瀏覽）"
            >
              📘 使用指南<span className="ql-meta"> · PDF</span>
            </a>
            <span className="ql-dot" aria-hidden="true">·</span>
            <details id="install" className="ql-install">
              <summary>📱 安裝成 App<span className="ql-meta"> · 3 步驟</span></summary>
              <div className="ql-install-body">
                <div className="ql-row"><strong>iPhone / iPad</strong>　Safari → 分享 → 加入主畫面</div>
                <div className="ql-row"><strong>Android</strong>　Chrome → ⋮ → 安裝應用程式</div>
                <div className="ql-row"><strong>桌機</strong>　Chrome / Edge 網址列右側「安裝」icon</div>
                <div className="ql-row-note">完整圖文步驟見 <a href="/assets/E118-guide.pdf" target="_blank" rel="noopener noreferrer">使用指南 PDF</a> 第 4 頁。</div>
              </div>
            </details>
          </section>
        </div>
      </main>

      <footer className="foot">
        <div className="container foot-inner">
          <div className="foot-left">
            <div className="foot-mark">國立成功大學 EMBA <span className="wine">·</span> E118 Class Dashboard</div>
            <div className="foot-meta">NCKU EMBA · Class of 2026</div>
          </div>
          <ClassPhotoSection />
        </div>
      </footer>
    </>
  );
}
