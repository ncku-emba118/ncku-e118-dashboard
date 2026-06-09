'use client';

import { useState, useEffect } from 'react';

type HelpEntry = {
  title: string;
  domain: string;
  desc: string;
  steps: string[];
};

// 對應 ARCHITECTURE.md 第 5 章「help popover 文案」— 修改任一張卡時同步更新對應 entry
const HELP: Record<string, HelpEntry> = {
  credits: {
    title: '學分追蹤',
    domain: 'emba.aqualux.dev/credits',
    desc: '個人畢業學分自我試算工具：依成大 EMBA 修課規則（畢業 45 學分，分基礎／核心／必修／專業必選／選修五類），把修過的課打勾即自動計算進度，並可自填新生營、運動賽事等活動學分。資料只存在自己手機、不上傳，換手機可用備份連結還原。',
    steps: [
      '點各類別卡片展開，把修過的課打勾，上方進度環即時更新',
      '「其他／活動學分」可自填新生營、運動賽事、海外參訪等有學分的活動',
      '隨時看「離畢業還差幾學分」與各類別缺額',
      '換手機：按「備份／換手機」，把專屬連結用 LINE 傳給自己，新手機點開即還原',
      '採認與歸類以系辦公告為準，此表僅供個人自我追蹤',
    ],
  },
  clubs: {
    title: '社團總表',
    domain: 'emba.aqualux.dev/clubs',
    desc: '成大 EMBA 校友總會所屬 17 個社團的完整名錄，涵蓋球類競技、戶外探險、藝文品味與學習公益，方便找到興趣相投的社團加入。為保護個資，社長／總幹事僅顯示屆別＋姓名，電話不公開。',
    steps: [
      '首頁以卡片牆顯示全部 17 個社團（依成立年份排序）',
      '上方 4 個類別篩選：球類競技 / 戶外探險 / 藝文品味 / 學習公益',
      '點任一社團卡片展開詳情：社長、總幹事、例會時間地點、社費、年度活動',
      '社長／總幹事僅顯示屆別＋姓名，個人手機號碼不公開',
      '想加入請洽該社社長或校友總會社團窗口',
    ],
  },
  finance: {
    title: '班級經費中心',
    domain: 'emba.aqualux.dev/finance',
    desc: '班費收支全班可查的透明專區：自動統計收支總覽、支出明細（＝跑過簽核的經費）、財務長上傳的月報。幹部可在此線上手寫簽核請款，免在 LINE 傳照片來回。',
    steps: [
      '同學 → 直接看收支總覽、支出明細與月報（免登入）',
      '幹部發起 → 進「經費簽核」上傳發票／明細、指派簽核人',
      '簽核 → 被指派幹部登入，在收件匣手寫簽名送出',
      '全簽完 → 系統自動合成最終 PDF，支出自動顯示在透明報表',
      '班代／副班代／秘書 → 可刪除錯誤的簽核單（保留刪除紀錄）',
    ],
  },
  board: {
    title: '班級公告欄',
    domain: 'emba.aqualux.dev/board',
    desc: '7 個部門統一發布公告、可推播到手機、同學可在公告下方留言互動。主 dashboard 子模組，共用 PWA 與推播訂閱（不必另裝 app）。',
    steps: [
      '點卡片進入公告欄首頁，看全部公告 timeline',
      '可按部門 filter（秘書 / 學務 / 活動 / 公關 / 財務 / 文宣 / 醫務）',
      '點任一則公告進詳情、看附件、留言',
      '訂閱頁勾選想追蹤的部門 → 推播到手機',
      '部門負責同學 → 進 /board/login 寫公告（用負責人發的 4 位數密碼）',
    ],
  },
  reports: {
    title: '課程報告',
    domain: 'reports.e118.aqualux.dev',
    desc: '集中存放本班每門課的期中／期末分組報告，依「課程 → 組別 → 報告」三層分類，可直接線上瀏覽 PDF 或下載原檔。',
    steps: [
      '從上方挑選想看的「課程」（例如 戰略管理、組織行為）',
      '進入課程頁後，依「組別」找到報告（封面顯示組員與題目）',
      '點報告卡片即線上預覽 PDF，可全螢幕／下載',
      '右上方有「我的組別」捷徑，回到自己這組的繳交紀錄',
      '報告繳交：把 PDF 上傳到雲端硬碟對應資料夾，系統會自動納入',
    ],
  },
  thesis: {
    title: '論文查詢系統',
    domain: 'thesis.e118.aqualux.dev',
    desc: '聚合成大歷年 EMBA 學位論文（含管理、商學、會計、財金等所），提供關鍵字、指導教授、產業領域三種篩選方式，補足校內系統檢索介面的不便。',
    steps: [
      '首頁直接輸入關鍵字（中文或英文皆可），例如「品牌延伸」「ESG」',
      '左側可勾選「指導教授」「產業別」「學位別」做進階篩選',
      '結果按相關度排序，點論文標題進入摘要頁',
      '摘要頁可看到 PDF 連結、引用次數、相關論文推薦',
      '若搜尋無結果，試著用較通用的中文詞（中文索引完整度較高）',
    ],
  },
  activities: {
    title: '班級活動歷程',
    domain: 'activities.e118.aqualux.dev',
    desc: '以時間軸方式記錄本班所有正式／非正式活動，包含開學迎新、社團聚會、運動賽事、年度大餐等，搭配照片牆與活動花絮。',
    steps: [
      '首頁是時間軸，最新活動在最上方，向下滑可看到所有歷史活動',
      '每場活動卡片包含日期、地點、參與人數、精選照片',
      '點卡片進入活動頁，可看完整照片牆（瀑布流排版）',
      '若該活動有公關長／文宣長撰寫的紀錄文，會放在照片下方',
      '想分享照片：把照片上傳到該活動資料夾，活動長會整合進系統',
    ],
  },
  'field-study': {
    title: '職業參訪',
    domain: 'field-study.e118.aqualux.dev',
    desc: '記錄本班歷次企業參訪行程，包含台積電、聯電、各產業龍頭等。以時間軸瀏覽參訪內容、現場照片與企業介紹，僅供查詢回顧，不處理報名作業。',
    steps: [
      '首頁是時間軸，最新一次參訪在最上方，向下滑可看歷次紀錄',
      '每筆參訪卡片包含日期、企業名稱、所屬產業、精選照片',
      '點卡片進入參訪頁，可看完整照片牆與當天行程紀錄',
      '若有公關長／活動長撰寫的參訪心得，會放在照片下方',
      '想補充照片或資料：上傳到該參訪資料夾，活動長會整合進系統',
    ],
  },
  calendar: {
    title: '班級行事曆',
    domain: 'emba.aqualux.dev/calendar',
    desc: '把成大校曆、班級活動、企業參訪、慶生月等全部彙整在一本可訂閱的 Google Calendar。同學一次設定訂閱，手機行事曆自動同步更新，活動前由手機原生通知提醒。',
    steps: [
      '點進來會看到嵌入的月曆，可直接查看本班所有活動',
      '點「🍎 iPhone / Mac」按鈕，跳出系統訂閱對話框 → 點訂閱即完成',
      '點「🤖 Google Calendar」按鈕，跳到 Google 行事曆 App → 點加入',
      '訂閱後每位同學在自己手機設「活動前 X 分鐘提醒」（每人自決）',
      '幹部新增活動到 Google Cal 後，同學手機 15-60 分鐘內自動同步',
    ],
  },
  drive: {
    title: '班級雲端硬碟',
    domain: 'drive.google.com',
    desc: '本班共享的 Google Drive 雲端空間，存放上課教材、講義、案例討論、班務文件等共用資源。需以個人 Google 帳號登入後存取。',
    steps: [
      '點開連結後，會跳轉到 Google Drive 共享資料夾',
      '若未登入 Google，請先登入（建議用本人主用帳號）',
      '資料夾按「課程」「行政文件」「活動」「案例庫」分類',
      '可直接線上預覽 Word / PDF / PPT；如要編輯請複製到自己 Drive 再改',
      '上傳檔案：拖曳到對應資料夾即可（請依分類擺放，不要亂丟根目錄）',
    ],
  },
  members: {
    title: '班級成員圖鑑',
    domain: 'members.e118.aqualux.dev',
    desc: '101 位同學的公開資料庫，可依專業領域、所在地區、產業類別、職稱層級交叉瀏覽，協助找到產業互補對象、組讀書會、跨界合作。',
    steps: [
      '首頁顯示全班 101 位同學的縮圖牆（依姓氏排序）',
      '上方有 4 種篩選器：產業 / 地區 / 職稱 / 專業領域',
      '勾選後縮圖牆即時過濾（例如：篩「南部 + 製造業 + CEO」）',
      '點同學卡片進入個人頁：公司、職務、專業、可協助領域',
      '聯絡資訊（Email / Line / 電話）為保護個資不上線，請走 LINE 群／秘書長協助轉介',
    ],
  },
};

type CardInfo = { href: string; target: string | null };

export default function HelpPopover() {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [cardInfo, setCardInfo] = useState<CardInfo>({ href: '#', target: null });

  // 1. Delegate click on any [data-help-btn] to open popover with that key
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      const btn = target.closest('[data-help-btn]') as HTMLElement | null;
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const key = btn.dataset.helpBtn || '';
      // 對應該 key 的 card 抓 href / target 給 popover CTA 用
      const card = document.querySelector(
        `[data-help="${key}"]`,
      ) as HTMLAnchorElement | null;
      setCardInfo({
        href: card?.href || '#',
        target: card?.target || null,
      });
      setOpenKey(key);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  // 2. Body scroll lock when popover is open
  useEffect(() => {
    document.body.style.overflow = openKey ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [openKey]);

  // 3. ESC to close
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenKey(null);
    };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, []);

  const data = openKey ? HELP[openKey] : null;
  const isNewTab = cardInfo.target === '_blank';
  const close = () => setOpenKey(null);

  return (
    <>
      <div
        className={`help-backdrop${openKey ? ' open' : ''}`}
        onClick={close}
      />
      <aside
        className={`help-modal${openKey ? ' open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="helpTitle"
      >
        <button
          type="button"
          className="help-close"
          onClick={close}
          aria-label="關閉"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
        <div className="help-eyebrow">系統說明</div>
        <h3 className="help-title" id="helpTitle">
          {data?.title || '—'}
        </h3>
        <div className="help-domain">{data?.domain || '—'}</div>
        <div className="help-section-label">用途說明</div>
        <p className="help-desc">{data?.desc || '—'}</p>
        <div className="help-section-label">操作流程</div>
        <ol className="help-steps">
          {data?.steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
        <div className="help-cta">
          <a
            href={cardInfo.href}
            target={isNewTab ? '_blank' : undefined}
            rel={isNewTab ? 'noopener noreferrer' : undefined}
          >
            開啟系統 {isNewTab ? '↗' : '→'}
          </a>
          <span className="help-cta-note">
            {isNewTab ? '在新分頁開啟' : '同視窗切換'}
          </span>
        </div>
      </aside>
    </>
  );
}
