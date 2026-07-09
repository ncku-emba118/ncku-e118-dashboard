'use client';

/**
 * 首頁彩蛋（純 client、零新依賴）：
 *
 * 1. Logo 連點 5 下（間隔 <2 秒累計）→ 全螢幕 overlay 淡入：
 *    全班合照（僅 class.jpeg 一張，無輪播）+ 純 CSS 彩帶紙屑 +
 *    「E118，我們一起走過 🎓」。點任意處關閉。
 *    事件掛在既有 server-rendered header 的 .brand 上（不動 page.tsx 結構）。
 *
 * 2. 深夜問候 toast：台灣時間 00:00–05:00 開首頁，右下角淡入
 *    「這麼晚還在讀 case？辛苦了，早點休息 🌙」，8 秒自動淡出，
 *    每個 session 只出現一次（sessionStorage）。
 *
 * 3. 節慶小裝飾：日期落在 FESTIVALS 區間時，首頁右上角顯示一個小巧 emoji 徽章
 *    （hover/title 顯示祝福語，點擊關閉），每個 session 只出現一次（sessionStorage）。
 *
 * CSP note：next.config.mjs 的 style-src 有 'unsafe-inline'，
 * 元件內 <style> 與 inline style 皆可；JS 都在 bundle 內（script-src 'self' OK）。
 */
import { useEffect, useRef, useState } from 'react';

const CLASS_PHOTO = { src: '/assets/class.jpeg', alt: 'E118 班級合照' };

const CLICKS_NEEDED = 5;
const CLICK_WINDOW_MS = 2000;
const TOAST_KEY = 'e118-night-toast-shown';
const TOAST_MS = 8000;
const FESTIVAL_KEY = 'e118-festival-shown';

const CONFETTI_COLORS = ['#8c1515', '#d4a843', '#2c6e63', '#c0532f', '#5b7fa6', '#e8d5a3'];
const CONFETTI_COUNT = 50;

type Confetto = {
  left: number; delay: number; duration: number; color: string; size: number; tilt: number;
};

function makeConfetti(): Confetto[] {
  return Array.from({ length: CONFETTI_COUNT }, () => ({
    left: Math.random() * 100,
    delay: Math.random() * 2.5,
    duration: 2.5 + Math.random() * 2.5,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    size: 6 + Math.random() * 8,
    tilt: Math.random() * 360,
  }));
}

/** 台灣時區當下小時（0–23）。h23 確保午夜是 0 不是 24。 */
function taipeiHour(): number {
  const h = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    hour: 'numeric',
    hour12: false,
    hourCycle: 'h23',
  }).format(new Date());
  return Number(h) % 24;
}

/** 台灣時區當下的年/月/日（用於節慶區間比對）。 */
function taipeiDateParts(): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { y: get('year'), m: get('month'), d: get('day') };
}

type Festival = {
  key: string;
  emoji: string;
  message: string;
  match: (d: { y: number; m: number; d: number }) => boolean;
};

/**
 * 節慶區間（台灣時區、月/日比對，除非特別註明）。
 * 農曆節日（中秋／新年）逐年日期不同，寫死當年區間，每年需手動更新。
 */
const FESTIVALS: Festival[] = [
  {
    key: 'teachers-day',
    emoji: '🍎',
    message: '感謝每一位教授',
    match: ({ m, d }) => m === 9 && d === 28,
  },
  {
    key: 'mid-autumn-2026',
    emoji: '🌕',
    message: '中秋節快樂',
    // 中秋節 2026-09-25 前後 3 天（2026 年區間，農曆逐年不同，每年需更新）
    match: ({ y, m, d }) => y === 2026 && m === 9 && d >= 22 && d <= 28,
  },
  {
    key: 'christmas',
    emoji: '🎄',
    message: 'Merry Christmas',
    match: ({ m, d }) => m === 12 && (d === 24 || d === 25),
  },
  {
    key: 'lunar-new-year-2027',
    emoji: '🧧',
    message: '新年快樂',
    // 農曆新年 2027-02-16 前後 3 天（2027 年區間，農曆逐年不同，每年需更新）
    match: ({ y, m, d }) => y === 2027 && m === 2 && d >= 13 && d <= 19,
  },
];

export default function HomeEasterEggs() {
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [confetti, setConfetti] = useState<Confetto[]>([]);
  const [toastState, setToastState] = useState<'hidden' | 'in' | 'out'>('hidden');
  const [festival, setFestival] = useState<Festival | null>(null);
  const [festivalOpen, setFestivalOpen] = useState(false);
  const clickTimes = useRef<number[]>([]);

  // ── 彩蛋 1：logo 連點 5 下 ──
  useEffect(() => {
    const brand = document.querySelector('header.top .brand');
    if (!brand) return;
    const onClick = (e: Event) => {
      e.preventDefault(); // 攔掉 href="#" 的跳頂，避免連點時頁面抖動
      const now = Date.now();
      clickTimes.current = clickTimes.current.filter((t) => now - t < CLICK_WINDOW_MS);
      clickTimes.current.push(now);
      if (clickTimes.current.length >= CLICKS_NEEDED) {
        clickTimes.current = [];
        setConfetti(makeConfetti());
        setOverlayOpen(true);
      }
    };
    brand.addEventListener('click', onClick);
    return () => brand.removeEventListener('click', onClick);
  }, []);

  // overlay 開啟時：鎖 body scroll（單張合照，無需輪播計時器）
  useEffect(() => {
    if (!overlayOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [overlayOpen]);

  // ── 彩蛋 2：深夜問候 toast（台灣 00:00–05:00、每 session 一次）──
  useEffect(() => {
    try {
      if (sessionStorage.getItem(TOAST_KEY)) return;
      const h = taipeiHour();
      if (h >= 5) return; // 只在 00–04 點
      sessionStorage.setItem(TOAST_KEY, '1');
    } catch {
      return; // sessionStorage 不可用（隱私模式邊角）→ 直接不顯示
    }
    setToastState('in');
    const t1 = window.setTimeout(() => setToastState('out'), TOAST_MS);
    const t2 = window.setTimeout(() => setToastState('hidden'), TOAST_MS + 600);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  // ── 彩蛋 3：節慶小裝飾（命中區間才顯示、每 session 一次）──
  useEffect(() => {
    const found = FESTIVALS.find((f) => f.match(taipeiDateParts()));
    if (!found) return;
    try {
      if (sessionStorage.getItem(FESTIVAL_KEY)) return;
      sessionStorage.setItem(FESTIVAL_KEY, '1');
    } catch {
      return; // 隱私模式邊角 → 直接不顯示
    }
    setFestival(found);
    setFestivalOpen(true);
  }, []);

  return (
    <>
      <style>{`
        .ee-overlay{position:fixed;inset:0;z-index:9998;background:rgba(12,10,9,.92);
          display:flex;flex-direction:column;align-items:center;justify-content:center;
          gap:20px;padding:24px;cursor:pointer;animation:eeFadeIn .45s ease both;overflow:hidden;}
        @keyframes eeFadeIn{from{opacity:0}to{opacity:1}}
        .ee-photo-wrap{position:relative;width:min(92vw,860px);aspect-ratio:3/2;max-height:70vh;}
        .ee-photo{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;
          opacity:0;transition:opacity .8s ease;border-radius:12px;}
        .ee-photo.on{opacity:1;}
        .ee-caption{color:#f3ead9;font-size:clamp(18px,3.2vw,28px);letter-spacing:.08em;
          text-shadow:0 2px 12px rgba(0,0,0,.6);z-index:1;}
        .ee-hint{color:rgba(243,234,217,.55);font-size:13px;z-index:1;}
        .ee-confetto{position:absolute;top:-16px;border-radius:2px;pointer-events:none;
          animation-name:eeFall;animation-timing-function:linear;animation-iteration-count:infinite;}
        @keyframes eeFall{
          0%{transform:translateY(-5vh) rotate(0deg);opacity:1}
          85%{opacity:1}
          100%{transform:translateY(105vh) rotate(720deg);opacity:0}
        }
        .ee-toast{position:fixed;right:20px;bottom:20px;z-index:9999;max-width:280px;
          background:#2c2620;color:#f3ead9;padding:14px 18px;border-radius:12px;
          font-size:14px;line-height:1.6;box-shadow:0 8px 28px rgba(0,0,0,.35);
          border:1px solid rgba(212,168,67,.35);
          opacity:0;transform:translateY(12px);transition:opacity .6s ease,transform .6s ease;}
        .ee-toast.in{opacity:1;transform:translateY(0);}
        .ee-festival{position:fixed;top:96px;right:20px;z-index:60;
          display:flex;align-items:center;justify-content:center;
          width:38px;height:38px;border-radius:50%;
          background:#2c2620;border:1px solid rgba(212,168,67,.35);
          box-shadow:0 8px 20px rgba(0,0,0,.25);cursor:pointer;
          font-size:18px;line-height:1;padding:0;
          opacity:0;transform:translateY(-8px);
          transition:opacity .5s ease,transform .5s ease;
          animation:eeFadeIn .5s ease both;}
        .ee-festival.in{opacity:1;transform:translateY(0);}
        @media (max-width:720px){
          .ee-festival{top:74px;right:14px;width:34px;height:34px;font-size:16px;}
        }
        @media (prefers-reduced-motion:reduce){
          .ee-overlay{animation:none}
          .ee-confetto{animation:none;display:none}
          .ee-toast{transition:none}
          .ee-festival{transition:none;animation:none}
        }
      `}</style>

      {overlayOpen && (
        <div
          className="ee-overlay"
          role="dialog"
          aria-label="E118 班級合照彩蛋"
          onClick={() => setOverlayOpen(false)}
        >
          {confetti.map((c, i) => (
            <span
              key={i}
              className="ee-confetto"
              style={{
                left: `${c.left}%`,
                width: c.size,
                height: c.size * 0.45,
                background: c.color,
                transform: `rotate(${c.tilt}deg)`,
                animationDelay: `${c.delay}s`,
                animationDuration: `${c.duration}s`,
              }}
            />
          ))}
          <div className="ee-photo-wrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={CLASS_PHOTO.src} alt={CLASS_PHOTO.alt} className="ee-photo on" />
          </div>
          <div className="ee-caption">E118，我們一起走過 🎓</div>
          <div className="ee-hint">點擊任意處關閉</div>
        </div>
      )}

      {toastState !== 'hidden' && (
        <div className={`ee-toast${toastState === 'in' ? ' in' : ''}`} role="status">
          這麼晚還在讀 case？辛苦了，早點休息 🌙
        </div>
      )}

      {festival && festivalOpen && (
        <button
          type="button"
          className="ee-festival in"
          title={festival.message}
          aria-label={`${festival.message}（點擊關閉）`}
          onClick={() => setFestivalOpen(false)}
        >
          <span aria-hidden="true">{festival.emoji}</span>
        </button>
      )}
    </>
  );
}
