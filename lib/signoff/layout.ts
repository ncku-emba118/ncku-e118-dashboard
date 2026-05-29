/**
 * 簽核欄位座標排版（pt，pdf-lib 左下原點）。
 *
 * 簽核表（A4 直式 595×842 pt）右側欄由上往下排簽名框，每頁 7 格，超過換頁。
 * 純函式 → slot 座標進 manifest hash（Codex 3-1）與簽核表生成（Phase 4）共用。
 */
export type Slot = {
  slot_page: number;
  slot_x: number;
  slot_y: number;
  slot_w: number;
  slot_h: number;
};

export const SLOT_W = 210;
export const SLOT_H = 64;

const SLOT_X = 320; // 右欄；左側留給角色標籤
const TOP_Y = 640; // 第一格 y（左下原點）
const ROW_STEP = 104; // 行距（留意見/時間戳一行的空間，避免與下一格標籤相黏）
const PER_PAGE = 6;

export function computeSlotLayout(count: number): Slot[] {
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error(`computeSlotLayout: count must be a positive integer, got ${count}`);
  }
  const slots: Slot[] = [];
  for (let i = 0; i < count; i++) {
    const page = Math.floor(i / PER_PAGE) + 1;
    const row = i % PER_PAGE;
    slots.push({
      slot_page: page,
      slot_x: SLOT_X,
      slot_y: TOP_Y - row * ROW_STEP,
      slot_w: SLOT_W,
      slot_h: SLOT_H,
    });
  }
  return slots;
}
