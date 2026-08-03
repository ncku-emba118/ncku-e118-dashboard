/**
 * 各活動總召名單 — 兩站共用的單一資料來源。
 *
 * 資料以幹部會議紀錄為準（2026-07-26 第二次幹部會議「活動分工」段），
 * 姓名／英文名／職稱取自 E118 通訊錄母檔（2026-06-11 版）。
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
  title: string;
  /** public/assets/leads/ 底下的檔名；未提供時為 null */
  photo: string | null;
};

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
    title: '護理長',
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
    title: '財務副理',
    photo: null,
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
    title: '營運長',
    photo: null,
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
    title: '總經理',
    photo: null,
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
