import HelpPopover from '../components/HelpPopover';
import PWARegister from '../components/PWARegister';

/**
 * 主 dashboard 首頁 — 從 ncku-emba118/ncku-e118-dashboard repo 既有 index.html 遷移為 Next.js App Router 結構。
 *
 * - Server Component（靜態渲染、SSG）：header / hero / app-grid 7 卡 / pwa-section / footer
 * - Client Components：HelpPopover（? 按鈕 modal）/ PWARegister（service worker + local href override）
 * - CSS：globals.css（從原 <style> block 抽出、verbatim 保留）
 *
 * 對應 ARCHITECTURE.md v3 第 1 章「主 dashboard 升 Next.js + /board 子模組」。
 * 8 張卡的第 8 張（班級公告欄 / `/board`）在後續 commit 加入。
 */
export default function Home() {
  return (
    <>
      <PWARegister />

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
            <li>
              <a href="#apps">系統入口</a>
            </li>
            <li>
              <a href="#install">安裝 App</a>
            </li>
          </ul>
        </div>
      </header>

      <main>
        <div className="container">
          {/* ── Hero ── */}
          <section className="hero">
            <div className="hero-eyebrow">NCKU EMBA · Class Dashboard</div>
            <h1>
              E<span className="num">118</span>
            </h1>
            <div className="hero-tc">
              國立成功大學 EMBA 高階管理碩士在職專班 第 118 班
            </div>
            <p className="lede">班級系統控制面板，整合課程、研究、活動與資源。</p>
            <div className="hero-divider">
              <span className="stat">7 Systems Online</span>
              <span className="line" />
              <span className="stat">Est. 2026</span>
            </div>
          </section>

          {/* ── 系統入口 ── */}
          <section id="apps" className="block">
            <div className="section-head">
              <h2>
                System Hub<span className="tc">系統入口</span>
              </h2>
              <span className="count">07 / 07</span>
            </div>

            <div className="app-grid">
              {/* 1. 班級行事曆 */}
              <a
                href="https://emba.aqualux.dev/calendar/"
                data-local-href="/calendar/"
                className="app-card"
                data-help="calendar"
              >
                <div className="app-icon">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect width="18" height="18" x="3" y="4" rx="2" />
                    <path d="M16 2v4M8 2v4M3 10h18" />
                    <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
                  </svg>
                </div>
                <button
                  type="button"
                  className="app-help"
                  data-help-btn="calendar"
                  aria-label="查看「班級行事曆」操作說明"
                >
                  ?
                </button>
                <div className="app-arrow">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M7 7h10v10M7 17L17 7" />
                  </svg>
                </div>
                <div className="app-title">班級行事曆</div>
                <div className="app-meta">
                  全班課程、放假、活動 — 一鍵訂閱到手機
                </div>
                <div className="app-domain">emba.aqualux.dev/calendar</div>
              </a>

              {/* 2. 班級雲端硬碟（外部、開新分頁）*/}
              <a
                href="https://drive.google.com/drive/folders/1q3ULP_ASkMnmBDhI0ed-yQ8QChXuTojd?usp=drive_link"
                className="app-card"
                target="_blank"
                rel="noopener noreferrer"
                data-help="drive"
              >
                <div className="app-icon">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9" />
                  </svg>
                </div>
                <button
                  type="button"
                  className="app-help"
                  data-help-btn="drive"
                  aria-label="查看「班級雲端硬碟」操作說明"
                >
                  ?
                </button>
                <div className="app-arrow">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M7 7h10v10M7 17L17 7" />
                  </svg>
                </div>
                <div className="app-title">班級雲端硬碟</div>
                <div className="app-meta">Google Drive · 共享資源</div>
                <div className="app-domain">drive.google.com</div>
              </a>

              {/* 3. 論文查詢系統 */}
              <a
                href="https://thesis.e118.aqualux.dev/"
                className="app-card"
                data-help="thesis"
              >
                <div className="app-icon">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M10 2v8l3-3l3 3V2" />
                    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" />
                  </svg>
                </div>
                <button
                  type="button"
                  className="app-help"
                  data-help-btn="thesis"
                  aria-label="查看「論文查詢系統」操作說明"
                >
                  ?
                </button>
                <div className="app-arrow">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M7 7h10v10M7 17L17 7" />
                  </svg>
                </div>
                <div className="app-title">論文查詢系統</div>
                <div className="app-meta">學位論文資料庫檢索</div>
                <div className="app-domain">thesis.e118.aqualux.dev</div>
              </a>

              {/* 4. 課程報告 */}
              <a
                href="https://reports.e118.aqualux.dev/"
                className="app-card"
                data-help="reports"
              >
                <div className="app-icon">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0zM22 10v6" />
                    <path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5" />
                  </svg>
                </div>
                <button
                  type="button"
                  className="app-help"
                  data-help-btn="reports"
                  aria-label="查看「課程報告」操作說明"
                >
                  ?
                </button>
                <div className="app-arrow">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M7 7h10v10M7 17L17 7" />
                  </svg>
                </div>
                <div className="app-title">課程報告</div>
                <div className="app-meta">期末／期中分組報告整理</div>
                <div className="app-domain">reports.e118.aqualux.dev</div>
              </a>

              {/* 5. 班級活動歷程 */}
              <a
                href="https://activities.e118.aqualux.dev/"
                data-local-href="http://localhost:5174/"
                className="app-card"
                data-help="activities"
              >
                <div className="app-icon">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                    <circle cx="9" cy="9" r="2" />
                    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                  </svg>
                </div>
                <button
                  type="button"
                  className="app-help"
                  data-help-btn="activities"
                  aria-label="查看「班級活動歷程」操作說明"
                >
                  ?
                </button>
                <div className="app-arrow">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M7 7h10v10M7 17L17 7" />
                  </svg>
                </div>
                <div className="app-title">班級活動歷程</div>
                <div className="app-meta">依時間軸瀏覽歷次活動與照片</div>
                <div className="app-domain">activities.e118.aqualux.dev</div>
              </a>

              {/* 6. 職業參訪 */}
              <a
                href="https://field-study.e118.aqualux.dev/"
                className="app-card"
                data-help="field-study"
              >
                <div className="app-icon">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M10 12h4m-4-4h4m0 13v-3a2 2 0 0 0-4 0v3" />
                    <path d="M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2" />
                    <path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" />
                  </svg>
                </div>
                <button
                  type="button"
                  className="app-help"
                  data-help-btn="field-study"
                  aria-label="查看「職業參訪」操作說明"
                >
                  ?
                </button>
                <div className="app-arrow">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M7 7h10v10M7 17L17 7" />
                  </svg>
                </div>
                <div className="app-title">職業參訪</div>
                <div className="app-meta">企業參訪行程與分組</div>
                <div className="app-domain">field-study.e118.aqualux.dev</div>
              </a>

              {/* 7. 班級成員圖鑑 */}
              <a
                href="https://members.e118.aqualux.dev/"
                data-local-href="http://localhost:5191/"
                className="app-card"
                data-help="members"
              >
                <div className="app-icon">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M18 21a8 8 0 0 0-16 0" />
                    <circle cx="10" cy="8" r="5" />
                    <path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3" />
                  </svg>
                </div>
                <button
                  type="button"
                  className="app-help"
                  data-help-btn="members"
                  aria-label="查看「班級成員圖鑑」操作說明"
                >
                  ?
                </button>
                <div className="app-arrow">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M7 7h10v10M7 17L17 7" />
                  </svg>
                </div>
                <div className="app-title">班級成員圖鑑</div>
                <div className="app-meta">
                  依專業領域 / 地區 / 產業瀏覽同學
                </div>
                <div className="app-domain">members.e118.aqualux.dev</div>
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
              {/* iOS */}
              <div className="pwa-card">
                <div className="pwa-card-head">
                  <div>
                    <div className="pwa-card-platform">iPhone / iPad</div>
                    <div className="pwa-card-platform-en">iOS · Safari</div>
                  </div>
                </div>
                <ol className="pwa-steps">
                  <li>
                    用 <strong>Safari</strong> 打開本頁面（Chrome 不支援）
                  </li>
                  <li>
                    點下方工具列正中央「<strong>分享</strong>」圖示（方框 + 上箭頭）
                  </li>
                  <li>
                    下滑選單，點「<strong>加入主畫面</strong>」
                  </li>
                  <li>
                    名稱保留「E118」，按右上「<strong>加入</strong>」
                  </li>
                </ol>
              </div>

              {/* Android */}
              <div className="pwa-card">
                <div className="pwa-card-head">
                  <div>
                    <div className="pwa-card-platform">Android 手機</div>
                    <div className="pwa-card-platform-en">Android · Chrome</div>
                  </div>
                </div>
                <ol className="pwa-steps">
                  <li>
                    用 <strong>Chrome</strong> 打開本頁面
                  </li>
                  <li>
                    點網址列右側「<strong>⋮</strong>」（三個點）
                  </li>
                  <li>
                    選「<strong>安裝應用程式</strong>」或「加到主畫面」
                  </li>
                  <li>確認後，桌面會出現 E118 圖示</li>
                </ol>
              </div>

              {/* Desktop */}
              <div className="pwa-card">
                <div className="pwa-card-head">
                  <div>
                    <div className="pwa-card-platform">電腦桌機</div>
                    <div className="pwa-card-platform-en">
                      Mac / Windows · Chrome / Edge
                    </div>
                  </div>
                </div>
                <ol className="pwa-steps">
                  <li>
                    用 <strong>Chrome</strong> 或 <strong>Edge</strong> 開啟本頁面
                  </li>
                  <li>
                    網址列右側會出現「<strong>安裝</strong>」小圖示（螢幕 + 下箭頭）
                  </li>
                  <li>
                    點下去，按「<strong>安裝</strong>」
                  </li>
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
          <div className="foot-mark">
            國立成功大學 EMBA <span className="wine">·</span> E118 Class Dashboard
          </div>
          <div className="foot-meta">NCKU EMBA · Class of 2026</div>
        </div>
      </footer>

      <HelpPopover />
    </>
  );
}
