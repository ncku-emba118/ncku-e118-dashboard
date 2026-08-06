/**
 * 各活動總召名單 — 兩站共用的單一資料來源。
 *
 * 資料以幹部會議紀錄為準（2026-07-26 第二次幹部會議「活動分工」段），
 * 姓名／英文名／公司／職稱取自「學務-E118通訊錄」（Google Drive，2026-08-01 版，學務長維護）。
 * 公司一律用簡稱，全銜以通訊錄為準。
 * 活動日期與 lib/budget/data.ts 的 ACTIVITIES 對齊，改一邊記得對另一邊。
 *
 * 新增活動：在陣列末端加一筆即可，頁面依 sortKey 由小到大排，版面自動延長。
 * photo 留 null 時頁面顯示「照片待提供」佔位框，換圖不必改版型。
 */

export type Lead = {
  /** 排序用，YYYYMM（同月多場再往後加兩位） */
  sortKey: number;
  /** 顯示用年份 */
  year: string;
  /** 顯示用月份／日期 */
  when: string;
  activity: string;
  activityEn: string;
  /** 一句話說明活動性質 */
  desc: string;
  name: string;
  nameEn: string;
  /** 公司簡稱（避免全銜把版面撐亂） */
  org: string;
  title: string;
  /** public/assets/leads/ 底下的檔名；未提供時為 null */
  photo: string | null;
};

/**
 * 常設角色 — 不綁單一場次、整學年持續執行的職務。
 * 與 LEADS 分開存放：LEADS 是「一場活動一個總召」，這裡是「全年都在」。
 */
export type Principal = {
  role: string;
  name: string;
  nameEn: string;
  org: string;
  title: string;
  /** 一句話說明職務範圍 */
  note: string;
  photo: string | null;
};

export const PRINCIPALS: Principal[] = [
  {
    role: '活動長',
    name: '楊其峻',
    nameEn: 'Alex Yang',
    org: '太乙珠寶',
    title: '執行董事',
    note: '全年統籌．協助每場總召籌備、資源調度與跨組協調',
    photo: 'yang-qijun.jpg',
  },
  {
    role: '慶生天使',
    name: '趙芫儀',
    nameEn: 'Jill',
    org: '森吉企業',
    title: '負責人',
    note: '每月壽星驚喜',
    photo: 'zhao-yuanyi.jpg',
  },
];

export const LEADS: Lead[] = [
  {
    sortKey: 202611,
    year: '2026',
    when: '11月',
    activity: 'E119 新生報到',
    activityEn: 'Freshmen Registration',
    desc: '迎接 E119 新生入學報到，主題視覺、動線與接待由本班統籌。',
    name: '詹培梅',
    nameEn: 'Vivian',
    org: '成大醫院',
    title: '督導長',
    photo: 'zhan-peimei.jpg',
  },
  {
    sortKey: 202612,
    year: '2026',
    when: '12月19日 · 六',
    activity: 'E118 聖誕晚宴',
    activityEn: 'Christmas Gala',
    desc: '18:00 – 21:00。年度最大型對外活動，招待系所師長、校友總會與各級學長姐。',
    name: '陳亭穎',
    nameEn: 'Fion',
    org: '宜伸企業',
    title: '財務副理',
    photo: 'chen-tingying.jpg',
  },
  {
    sortKey: 202706,
    year: '2027',
    when: '6月',
    activity: 'E116 畢業午宴',
    activityEn: 'Graduation Luncheon',
    desc: '為 E116 學長姐舉辦，本班主辦；細部規格 2027 年初確認。',
    name: '李政慧',
    nameEn: 'Faye',
    org: '聯華電子',
    title: '高級管理師',
    photo: 'li-zhenghui.jpg',
  },
  {
    sortKey: 202707,
    year: '2027',
    when: '7月',
    activity: 'E119 新生營',
    activityEn: 'Freshmen Camp',
    desc: '兩天一夜，本班主辦。全年度規模最大、籌備期最長之活動。',
    name: '唐有建',
    nameEn: 'David',
    org: '錦揚企業／富驛集團',
    title: '總經理／法人董事代表',
    photo: 'tang-youjian.jpg',
  },
  {
    sortKey: 202709,
    year: '2027',
    when: '9月',
    activity: 'E119 迎新晚會',
    activityEn: 'Welcome Party',
    desc: '南班自辦，本班辦給 E119 學弟妹。',
    name: '林孟勤',
    nameEn: 'King',
    org: '瑞營塑膠',
    title: '營運長',
    photo: 'lin-mengqin.jpg',
  },
  {
    sortKey: 202806,
    year: '2028',
    when: '6月',
    activity: 'E117 畢業晚會',
    activityEn: 'E117 Commencement',
    desc: '為 E117 學長姐舉辦之畢業典禮、晚會與謝師宴，本班主辦。',
    name: '劉忠明',
    nameEn: 'Ethan',
    org: '長勝機電工程',
    title: '總經理',
    photo: 'liu-zhongming.jpg',
  },
];

/** 依時間序排好的名單 */
export function getLeads(): Lead[] {
  return [...LEADS].sort((a, b) => a.sortKey - b.sortKey);
}

/**
 * 已過期的活動仍留在頁面上（總召是功績、不是待辦），
 * 但時間軸節點改成實心以標示「已進入籌備／已完成」。
 * now 用 YYYYMM 數字比較，避免 timezone 問題。
 */
export function isUpcoming(lead: Lead, now = new Date()): boolean {
  const cur = now.getFullYear() * 100 + (now.getMonth() + 1);
  return lead.sortKey >= cur;
}
