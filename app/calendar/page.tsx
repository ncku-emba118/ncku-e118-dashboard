'use client';

import { useState } from 'react';
import './calendar.css';

const ICAL_URL =
  'https://calendar.google.com/calendar/ical/ncku.emba.e118%40gmail.com/public/basic.ics';

/**
 * /calendar — 班級行事曆訂閱頁面（從 calendar/index.html 遷移）。
 * 整頁 'use client' 因為 copy button 需要 navigator.clipboard。
 * 簡單頁面、不需 SSG 紅利、所以 client component 合理。
 */
export default function CalendarPage() {
  const [toastShow, setToastShow] = useState(false);

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(ICAL_URL);
      setToastShow(true);
      window.setTimeout(() => setToastShow(false), 2200);
    } catch {
      window.prompt('請手動複製這段訂閱網址：', ICAL_URL);
    }
  };

  return (
    <div className="calendar-route">
      <div className="container">
        <a href="/" className="back-link">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back to E118 Dashboard
        </a>

        <header>
          <div className="icon-wrap">
            <svg
              width="36"
              height="36"
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
          <h1>Class Calendar</h1>
          <div className="h1-tc">E118 班級行事曆</div>
          <p className="lede">
            把全班課程、考試、放假、活動同步到你的手機，活動前由手機原生通知提醒。
            <span className="muted">
              一次設定，永久同步 · 全班 56 個學年事件已就緒
            </span>
          </p>
        </header>

        {/* ── Embedded Google Calendar ── */}
        <div className="cal-embed">
          <iframe
            src="https://calendar.google.com/calendar/embed?src=ncku.emba.e118%40gmail.com&ctz=Asia%2FTaipei&showTitle=0&showPrint=0&showCalendars=0&showTz=0"
            loading="lazy"
            title="Class Calendar"
          />
        </div>

        {/* ── Subscribe section ── */}
        <div className="sec-divider">
          Subscribe
          <span className="tc">把行事曆加到你的手機</span>
        </div>

        <div className="btn-grid">
          <a
            href="webcal://calendar.google.com/calendar/ical/ncku.emba.e118%40gmail.com/public/basic.ics"
            className="sub-btn"
          >
            <span className="btn-emoji">🍎</span>
            <span className="btn-text">
              <span className="btn-title">iPhone / Mac</span>
              <span className="btn-sub">點 → 跳系統對話框 → 訂閱</span>
            </span>
          </a>

          <a
            href="https://calendar.google.com/calendar/u/0/r?cid=ncku.emba.e118%40gmail.com"
            className="sub-btn"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="btn-emoji">🤖</span>
            <span className="btn-text">
              <span className="btn-title">Google Calendar</span>
              <span className="btn-sub">點 → 開 Google Cal App → 加入</span>
            </span>
          </a>

          <button
            className="sub-btn sub-btn-wide"
            type="button"
            onClick={copyUrl}
          >
            <span className="btn-emoji">📋</span>
            <span className="btn-text">
              <span className="btn-title">複製訂閱網址</span>
              <span className="btn-sub">給 Outlook / 其他行事曆 App 用</span>
            </span>
          </button>
        </div>

        {/* ── FAQ ── */}
        <div className="sec-divider" style={{ marginTop: '64px' }}>
          Frequently Asked
          <span className="tc">訂閱後常見問題</span>
        </div>

        <div className="faq">
          <details>
            <summary>Q1. 訂閱後，活動什麼時候出現在我的手機？</summary>
            <div className="faq-body">
              通常 <strong>15-60 分鐘內</strong>手機行事曆會自動把活動拉下來。
              <br />
              如果你急著看到，可以打開手機行事曆 App 然後下拉刷新（iPhone：在月曆任一畫面下拉；Google Cal：點右上重新整理）。
            </div>
          </details>

          <details>
            <summary>Q2. 怎麼設定「活動前 N 分鐘提醒」？</summary>
            <div className="faq-body">
              提醒由<strong>你自己手機設定</strong>，幹部端不負責推送。打開手機行事曆 App → 點任一活動 → 編輯 → 加入提醒。
              <br />
              建議至少設兩種：「<code>1 天前</code>」+「<code>1 小時前</code>」。國定假日不需要提醒可以不設。
            </div>
          </details>

          <details>
            <summary>Q3. 退訂怎麼做？</summary>
            <div className="faq-body">
              <strong>iPhone</strong>：設定 → 行事曆 → 帳號 → 訂閱式行事曆 → 找到「E118 成大EMBA」→ 刪除帳號
              <br />
              <strong>Android / Google Calendar</strong>：Cal App → 設定 → 行事曆清單 → 找到 E118 → 取消勾選或移除
            </div>
          </details>

          <details>
            <summary>Q4. 換手機後還要重新訂閱嗎？</summary>
            <div className="faq-body">
              不用。訂閱跟著你的 <strong>iCloud / Google 帳號</strong>跑，新手機登入同一個帳號就會自動同步過來。
            </div>
          </details>

          <details>
            <summary>Q5. 為什麼我看到活動但沒收到提醒？</summary>
            <div className="faq-body">
              訂閱式行事曆的活動<strong>預設沒有提醒</strong>，必須你自己在手機上點該活動 → 加入提醒。
              <br />
              這是 iOS / Google Cal 的設計：每位同學對「想被打擾的時機」需求不同，所以提醒由訂閱者自己掌握。
            </div>
          </details>

          <details>
            <summary>Q6. 我能修改活動內容嗎？</summary>
            <div className="faq-body">
              不能。這本行事曆是<strong>唯讀訂閱</strong>，只有幹部（秘書長 / 班代 / 活動長 / 公關長）能在 Google Calendar 後台新增 / 編輯活動。
              <br />
              想新增活動：請通知對應幹部，由他們統一更新後 15-60 分鐘內你會看到。
            </div>
          </details>

          <details>
            <summary>Q7. 訂閱網址是什麼？我可以分享嗎？</summary>
            <div className="faq-body">
              訂閱網址：
              <br />
              <code style={{ fontSize: '11px', wordBreak: 'break-all' }}>
                {ICAL_URL}
              </code>
              <br />
              <br />
              這是<strong>公開唯讀</strong>網址，可以分享給班上任何人。但<strong>請勿在班外公開傳閱</strong>，因為班務活動屬內部資訊。
            </div>
          </details>
        </div>

        <footer>
          <p>
            NCKU EMBA E118 Class Calendar · 由秘書長辦公室維護
            <br />
            <a href="/">回到 E118 Dashboard</a>
          </p>
        </footer>
      </div>

      <div className={`copy-toast${toastShow ? ' show' : ''}`}>
        已複製訂閱網址 ✓
      </div>
    </div>
  );
}
