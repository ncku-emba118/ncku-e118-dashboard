import cards from '@/lib/dashboard/cards.json';
import { getLatestPosts, getUpcomingEvents } from '@/lib/dashboard/feeds';

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
const SMALL = ['finance', 'drive', 'thesis', 'reports', 'activities', 'field-study'];
const OFFICER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M18 21a8 8 0 0 0-16 0"/><circle cx="10" cy="8" r="5"/><path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3"/></svg>';

function extAttrs(c: Card) {
  return c.external ? { target: '_blank', rel: 'noopener noreferrer' } : {};
}

export default async function Home() {
  const [posts, events] = await Promise.all([getLatestPosts(3), getUpcomingEvents(3)]);
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

              {/* 公告欄 即時看板 */}
              <a className="bx-tile bx-lg bx-feed" href={board.href}>
                <div className="bx-feedhead">
                  <div className="bx-ic" dangerouslySetInnerHTML={{ __html: board.svg }} />
                  <div><h3 className="bx-h3">班級公告欄</h3><div className="bx-live"><span className="bx-dot" />最新動態 · 即時更新</div></div>
                </div>
                <div className="bx-feedlist">
                  {posts.length === 0 ? (
                    <div className="bx-empty">目前沒有公告</div>
                  ) : posts.map((p, i) => (
                    <div className="bx-fitem" key={i}>
                      <span className="bx-dept">{p.dept}</span>
                      <div>
                        <div className="bx-ftitle">{p.title}</div>
                        {i === 0 && p.excerpt ? <div className="bx-fexc">{p.excerpt}</div> : null}
                        <div className="bx-fmeta">{p.date}{p.att ? ` · ${p.att} 份附件` : ''}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="bx-feedfoot">查看全部公告 →</div>
              </a>

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

          {/* ── PWA Install ── */}
          <section id="install" className="pwa-section">
            <div className="pwa-head">
              <h3>Install as App</h3>
              <span className="tc">安裝到桌面，像 App 一樣使用</span>
            </div>
            <p className="pwa-lede">
              E118 Dashboard 採用 PWA（Progressive Web App）格式設計。把網址加到主畫面後，會在桌面產生一個 App 圖示，
              點開即直接進入 Dashboard，無瀏覽器網址列、開啟速度更快，視覺體驗等同原生 App。
            </p>
            <div className="pwa-grid">
              <div className="pwa-card">
                <div className="pwa-card-head"><div><div className="pwa-card-platform">iPhone / iPad</div><div className="pwa-card-platform-en">iOS · Safari</div></div></div>
                <ol className="pwa-steps">
                  <li>用 <strong>Safari</strong> 打開本頁面（Chrome 不支援）</li>
                  <li>點下方工具列正中央「<strong>分享</strong>」圖示（方框 + 上箭頭）</li>
                  <li>下滑選單，點「<strong>加入主畫面</strong>」</li>
                  <li>名稱保留「E118」，按右上「<strong>加入</strong>」</li>
                </ol>
              </div>
              <div className="pwa-card">
                <div className="pwa-card-head"><div><div className="pwa-card-platform">Android 手機</div><div className="pwa-card-platform-en">Android · Chrome</div></div></div>
                <ol className="pwa-steps">
                  <li>用 <strong>Chrome</strong> 打開本頁面</li>
                  <li>點網址列右側「<strong>⋮</strong>」（三個點）</li>
                  <li>選「<strong>安裝應用程式</strong>」或「加到主畫面」</li>
                  <li>確認後，桌面會出現 E118 圖示</li>
                </ol>
              </div>
              <div className="pwa-card">
                <div className="pwa-card-head"><div><div className="pwa-card-platform">電腦桌機</div><div className="pwa-card-platform-en">Mac / Windows · Chrome / Edge</div></div></div>
                <ol className="pwa-steps">
                  <li>用 <strong>Chrome</strong> 或 <strong>Edge</strong> 開啟本頁面</li>
                  <li>網址列右側會出現「<strong>安裝</strong>」小圖示（螢幕 + 下箭頭）</li>
                  <li>點下去，按「<strong>安裝</strong>」</li>
                  <li>會在 Dock / 工作列產生獨立 App 圖示</li>
                </ol>
              </div>
            </div>
            <div className="pwa-note">
              <strong>小提醒：</strong>安裝後若 Dashboard 有更新，App 會自動同步最新內容（連網時）。
              如需移除：iOS 長按圖示 → 刪除；Android 長按 → 解除安裝；桌機開啟 App 後右上「⋮」→ 解除安裝。
            </div>
          </section>
        </div>
      </main>

      <footer className="foot">
        <div className="container foot-inner">
          <div className="foot-mark">國立成功大學 EMBA <span className="wine">·</span> E118 Class Dashboard</div>
          <div className="foot-meta">NCKU EMBA · Class of 2026</div>
        </div>
      </footer>
    </>
  );
}
