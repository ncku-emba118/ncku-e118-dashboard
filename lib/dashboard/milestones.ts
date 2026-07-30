/**
 * 班級里程碑 — 「啟程」彩蛋（footer）與 logo 連點彩蛋共用的單一資料來源。
 *
 * ── 新增一個里程碑 ──
 * 1. 照片丟 public/assets/
 * 2. 這裡的 STAGES 補一筆（或往既有 stage 的 photos 陣列加一張）
 * 兩顆彩蛋都會自動吃到，元件邏輯不用動。
 *
 * ⚠️ SLC 站（~/Documents/2_EMBA/e118-slc/index.html 裡的 QC_STAGES）是各自獨立的
 *    vanilla JS 實作，改這裡務必同步改那邊 — 雙站同步規則。
 */

export type Photo = { date: string; title: string; src: string; alt: string; line: string };
export type Stage = { id: string; en: string; zh: string; photos: Photo[] };

export const STAGES: Stage[] = [
  {
    id: 'qicheng',
    en: 'Embark, together.',
    zh: '啟　程',
    photos: [
      {
        date: '2026.03.14',
        title: '新生報到',
        src: '/assets/class.jpeg',
        alt: 'E118 新生報到大合照',
        line: '一百種顏色，第一次站進同一張照片。',
      },
    ],
  },
  {
    id: 'tongxing',
    en: 'Side by side.',
    zh: '同　行',
    photos: [
      {
        date: '2026.07.24',
        title: '新生成長營',
        src: '/assets/camp-2026-lawn.jpeg',
        alt: '成大管理學院 EMBA 新生成長營 草地大合影',
        line: '同一件灰，同一條紅繩。',
      },
      {
        date: '2026.07.24',
        title: '成長營結業式',
        src: '/assets/camp-2026-closing.jpeg',
        alt: '成大管理學院 EMBA 新生成長營結業式大合照',
        line: '手上多了一張紙，身邊多了一群人。',
      },
    ],
  },
];

/** 全部看完後浮出的未解鎖行（等畢業時改成真的 stage） */
export const LOCKED = { en: 'Arrival.', zh: '抵　達' };

export const UNLOCK_KEY = 'e118-qicheng-unlocked';

/** 讀解鎖進度（0 = 只有啟程）。SSR / localStorage 被擋時一律回 0。 */
export function readUnlocked(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const n = Number(window.localStorage.getItem(UNLOCK_KEY) ?? '0');
    return Number.isFinite(n) && n > 0 ? Math.min(n, STAGES.length) : 0;
  } catch {
    return 0;
  }
}

/** 目前已解鎖的所有照片（攤平）。未解鎖任何東西時就只有啟程那張。 */
export function unlockedPhotos(unlocked: number = readUnlocked()): Photo[] {
  return STAGES.slice(0, unlocked + 1).flatMap((s) => s.photos);
}
