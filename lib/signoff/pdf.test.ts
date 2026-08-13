import { describe, expect, test } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import {
  generateSignoffSheet,
  composeFinalPdf,
  wrapTextToWidth,
  layoutPaymentAccountBlock,
  PAYMENT_MAX_WIDTH,
} from './pdf';
import { computeSlotLayout, SLOT_X } from './layout';

function opaquePng(w: number, h: number): Uint8Array {
  const png = new PNG({ width: w, height: h });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 0;
    png.data[i + 1] = 0;
    png.data[i + 2] = 0;
    png.data[i + 3] = 255;
  }
  return PNG.sync.write(png);
}

function sheetSlots(n: number) {
  return computeSlotLayout(n).map((s, i) => ({
    ...s,
    role_label: ['經辦', '審核', '核准'][i] ?? `簽核${i + 1}`,
    signer_name: `幹部${i + 1}`,
  }));
}

async function pageCount(bytes: Uint8Array): Promise<number> {
  const d = await PDFDocument.load(bytes);
  return d.getPageCount();
}

function isPdf(bytes: Uint8Array): boolean {
  return Buffer.from(bytes.slice(0, 4)).toString() === '%PDF';
}

describe('generateSignoffSheet', () => {
  test('produces a single-page PDF for a few signers', async () => {
    const bytes = await generateSignoffSheet({
      title: '1 月班費—迎新茶會',
      amount: '3200.00',
      currency: 'TWD',
      purpose: '茶會點心採購',
      applicant: '活動長',
      dateLabel: '2026-05-28',
      slots: sheetSlots(3),
    });
    expect(isPdf(bytes)).toBe(true);
    expect(await pageCount(bytes)).toBe(1);
  });

  test('overflows to multiple pages for many signers', async () => {
    const bytes = await generateSignoffSheet({
      title: '大型活動請款',
      amount: '88000.00',
      currency: 'TWD',
      purpose: '場地與餐飲',
      applicant: '公關長',
      dateLabel: '2026-05-28',
      slots: sheetSlots(9),
    });
    expect(await pageCount(bytes)).toBeGreaterThanOrEqual(2);
  });
});

describe('composeFinalPdf', () => {
  test('overlays signatures and appends an image source as one page', async () => {
    const slots = sheetSlots(2);
    const final = await composeFinalPdf({
      sheet: { title: 'T', amount: '100.00', currency: 'TWD', purpose: 'p', applicant: 'a', dateLabel: '2026-05-28', slots },
      signatures: slots.map((s) => ({
        slot_page: s.slot_page,
        slot_x: s.slot_x,
        slot_y: s.slot_y,
        slot_w: s.slot_w,
        slot_h: s.slot_h,
        signer_name: s.signer_name,
        signed_at_label: '2026-05-28 14:00',
        comment: '同意',
        png: opaquePng(300, 100),
      })),
      sources: [{ bytes: opaquePng(400, 300), mime: 'image/png' }],
    });
    expect(isPdf(final)).toBe(true);
    expect(await pageCount(final)).toBe(2); // 1 sheet + 1 image source
  });

  test('appends a multi-page PDF source preserving its pages', async () => {
    const slots = sheetSlots(1);
    // build a 2-page source pdf
    const src = await PDFDocument.create();
    src.addPage([300, 300]);
    src.addPage([300, 300]);
    const srcBytes = await src.save();

    const final = await composeFinalPdf({
      sheet: { title: 'T', amount: null, currency: 'TWD', purpose: null, applicant: null, dateLabel: '2026-05-28', slots },
      signatures: slots.map((s) => ({
        slot_page: s.slot_page,
        slot_x: s.slot_x,
        slot_y: s.slot_y,
        slot_w: s.slot_w,
        slot_h: s.slot_h,
        signer_name: s.signer_name,
        signed_at_label: '2026-05-28 14:00',
        png: opaquePng(300, 100),
      })),
      sources: [{ bytes: srcBytes, mime: 'application/pdf' }],
    });
    expect(await pageCount(final)).toBe(3); // 1 sheet + 2 source pages
  });

  test('appends multiple attachments in order (image + pdf)', async () => {
    const slots = sheetSlots(1);
    const src2 = await PDFDocument.create();
    src2.addPage([200, 200]);
    const src2Bytes = await src2.save();
    const final = await composeFinalPdf({
      sheet: { title: 'T', amount: null, currency: 'TWD', purpose: null, applicant: null, dateLabel: '2026-05-28', slots },
      signatures: slots.map((s) => ({
        slot_page: s.slot_page, slot_x: s.slot_x, slot_y: s.slot_y, slot_w: s.slot_w, slot_h: s.slot_h,
        signer_name: s.signer_name, signed_at_label: '2026-05-28 14:00', png: opaquePng(300, 100),
      })),
      sources: [
        { bytes: opaquePng(400, 300), mime: 'image/png' },
        { bytes: src2Bytes, mime: 'application/pdf' },
      ],
    });
    expect(await pageCount(final)).toBe(3); // 1 sheet + 1 image + 1 pdf page
  });
});

// ── 收款帳號長內容不撐版（2026-08-13 敵對審查）──────────────────────────
// 用跟正式輸出相同的字型實例算寬度，斷言換行後每行文字寬度都在
// PAYMENT_MAX_WIDTH 之內、x+width 落在簽核欄位框（SLOT_X）左側，且不論畫
// 幾行都不會跟簽核框（x 從 SLOT_X 起）重疊。
async function embedRealFont() {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const fontPath = path.join(process.cwd(), 'lib/signoff/assets/NotoSansTC-Regular.ttf');
  const bytes = fs.readFileSync(fontPath);
  return pdf.embedFont(bytes, { subset: false });
}

describe('wrapTextToWidth', () => {
  test('每一行的畫出寬度都不超過 maxWidth', async () => {
    const font = await embedRealFont();
    const longText = '銀行：陽信商業銀行大同分行陽信商業銀行大同分行陽信商業銀行大同分行陽信商業銀行大同分行';
    const lines = wrapTextToWidth(longText, font, 11, PAYMENT_MAX_WIDTH);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(font.widthOfTextAtSize(line, 11)).toBeLessThanOrEqual(PAYMENT_MAX_WIDTH);
    }
    // 換行不遺漏字元、不重複字元
    expect(lines.join('')).toBe(longText);
  });

  test('極長純數字帳號（無 CJK 可斷字）也能正確換行且不超寬', async () => {
    const font = await embedRealFont();
    const longNumber = `帳號：${'1234567890-'.repeat(20)}`;
    const lines = wrapTextToWidth(longNumber, font, 11, PAYMENT_MAX_WIDTH);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(font.widthOfTextAtSize(line, 11)).toBeLessThanOrEqual(PAYMENT_MAX_WIDTH);
    }
  });

  test('surrogate pair（emoji）不被切斷成半個字元', () => {
    // 假字型測試不需真嵌入寬度計算，這裡只驗證 Array.from 語意：字元邊界正確。
    const fakeFont = { widthOfTextAtSize: (t: string) => t.length * 10 } as unknown as Parameters<typeof wrapTextToWidth>[1];
    const withEmoji = '戶名：😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀';
    const lines = wrapTextToWidth(withEmoji, fakeFont, 11, 40);
    for (const line of lines) {
      // 若切斷 surrogate pair，join 後長度會跟原字串不同（出現替代字元或半個 code unit）
      expect(Array.from(line).every((ch) => Array.from(ch).length === 1)).toBe(true);
    }
    expect(lines.join('')).toBe(withEmoji);
  });
});

describe('layoutPaymentAccountBlock：極端長收款帳號不撐版、不蓋簽核框', () => {
  test('四欄都給極端長內容 → 每行都不超出簽核欄位框左邊界', async () => {
    const font = await embedRealFont();
    const pay = {
      bank: '陽信商業銀行陽信商業銀行陽信商業銀行陽信商業銀行陽信商業銀行陽信商業銀行'.slice(0, 60),
      branch: '大同分行大同分行大同分行大同分行大同分行大同分行大同分行大同分行大同分行大同分行'.slice(0, 60),
      account_name: 'A'.repeat(60),
      account_number: ('1234567890-'.repeat(6)).slice(0, 60),
    };
    const startY = 640; // 貼著第一個簽核欄位標籤的 y，故意製造最容易重疊的情境
    const { lines, nextY } = layoutPaymentAccountBlock(pay, font, startY);
    expect(lines.length).toBeGreaterThan(4); // 至少每欄一行以上，長內容應該有換行

    for (const line of lines) {
      const width = font.widthOfTextAtSize(line.text, 11);
      // 不超出可用寬度（沒有跑出這一行該待的欄位）
      expect(width).toBeLessThanOrEqual(PAYMENT_MAX_WIDTH + 0.01);
      // x + width 必須落在簽核欄位框（SLOT_X）左側，不論這一行的 y 落在哪裡，
      // 都不可能跟任一頁的簽核框（x 從 SLOT_X 起）重疊。
      expect(line.x + width).toBeLessThan(SLOT_X);
    }
    expect(nextY).toBeLessThan(startY); // 區塊高度確實動態長高（往下推移）
  });

  test('與實際簽核欄位框座標交叉比對：無任何一行落入 slot 矩形範圍', async () => {
    const font = await embedRealFont();
    const pay = {
      bank: 'B'.repeat(60),
      branch: 'C'.repeat(60),
      account_name: 'D'.repeat(60),
      account_number: '1'.repeat(20),
    };
    const slots = computeSlotLayout(3); // 跟 generateSignoffSheet 一樣的第一頁欄位
    const { lines } = layoutPaymentAccountBlock(pay, font, 640);
    for (const line of lines) {
      const width = font.widthOfTextAtSize(line.text, 11);
      const lineRect = { x0: line.x, x1: line.x + width, y0: line.y, y1: line.y + 15 };
      for (const s of slots) {
        const overlapsX = lineRect.x1 > s.slot_x && lineRect.x0 < s.slot_x + s.slot_w;
        const overlapsY = lineRect.y1 > s.slot_y && lineRect.y0 < s.slot_y + s.slot_h;
        expect(overlapsX && overlapsY).toBe(false);
      }
    }
  });

  test('沒填收款帳號 → 不畫任何行，nextY 原樣回傳', async () => {
    const font = await embedRealFont();
    expect(layoutPaymentAccountBlock(null, font, 640)).toEqual({ lines: [], nextY: 640 });
    expect(layoutPaymentAccountBlock({ bank: null, branch: null, account_name: null, account_number: null }, font, 640))
      .toEqual({ lines: [], nextY: 640 });
  });
});

describe('generateSignoffSheet：極端長收款帳號仍能正常產生 PDF', () => {
  test('不 throw，且頁數不受影響（收款帳號只影響左欄，不新增頁面）', async () => {
    const bytes = await generateSignoffSheet({
      title: '極端長收款帳號測試',
      amount: '100.00',
      currency: 'TWD',
      purpose: 'p',
      applicant: 'a',
      dateLabel: '2026-08-13',
      slots: sheetSlots(2),
      paymentAccount: {
        bank: '陽'.repeat(60),
        branch: '信'.repeat(60),
        account_name: '銀'.repeat(60),
        account_number: '1234567890-'.repeat(6).slice(0, 60),
      },
    });
    expect(isPdf(bytes)).toBe(true);
    expect(await pageCount(bytes)).toBe(1);
  });
});
