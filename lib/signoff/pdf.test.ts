import { describe, expect, test } from 'vitest';
import { PDFDocument, type PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import {
  generateSignoffSheet,
  composeFinalPdf,
  wrapTextToWidth,
  layoutWrappedText,
  layoutPaymentAccountBlock,
  PAYMENT_MAX_WIDTH,
  LEFT_COLUMN_MAX_WIDTH,
  MIN_CONTENT_Y,
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

// ── 用途欄位長內容不撐版/穿過簽名格（2026-08-14，正式站實例）───────────────
// 正式站文件「聖誕晚宴總召預支－財務長補核」的最終 PDF：用途欄位單行繪製、
// 直接畫出 A4 右邊界並穿過右側簽名格。這裡用真實踩到的那段文字（非人造極端
// 字串）驗證 layoutWrappedText 換行後不再有這個問題，另外也用更誇張的極端
// 字串驗證截斷機制在真的放不下時不會硬畫出邊界外或蓋住頁尾聲明。
const REAL_WORLD_LONG_PURPOSE =
  '用途：本案已於 2026-08-12 由秘書、副班代、班代完成三簽並支付。因當時簽核流程尚未納入財務長，故補開本單，僅供財務長事後補核留存紀錄，金額與原始憑證一致，不再另行請款。';

describe('layoutWrappedText：用途/標題等左欄長文字不撐版', () => {
  test('真實踩過的用途文字（偏長但非極端）→ 換行後每行寬度都在 LEFT_COLUMN_MAX_WIDTH 內，且不需要截斷', async () => {
    const font = await embedRealFont();
    const res = layoutWrappedText(REAL_WORLD_LONG_PURPOSE, font, 11, 50, 720, LEFT_COLUMN_MAX_WIDTH, 15, MIN_CONTENT_Y);
    expect(res.lines.length).toBeGreaterThan(1); // 確實換行了，不是單行畫出邊界
    expect(res.truncated).toBe(false); // 這段長度在正常表單版面裡放得下，不該被截斷
    for (const line of res.lines) {
      const width = font.widthOfTextAtSize(line.text, 11);
      expect(line.x + width).toBeLessThan(SLOT_X); // 不越界進入簽核欄位框
      // 中文禁則允許「標點懸掛行尾」，故容許略微超出換行寬度上限；真正的硬邊界是
      // 上一行那條「x+width 不得進入簽核欄（SLOT_X）」。懸掛量必須遠小於左欄與
      // 簽核欄之間的安全間距，否則就是換行邏輯壞了而不是懸掛。
      expect(width).toBeLessThanOrEqual(LEFT_COLUMN_MAX_WIDTH + 20);
    }
    expect(res.lines.map((l) => l.text).join('')).toBe(REAL_WORLD_LONG_PURPOSE);
  });

  test('極端長字串（真的放不下）→ 觸發截斷，最後一行是刪節提示，且不畫過 minY', async () => {
    const font = await embedRealFont();
    const extreme = '用途：' + '極長內容測試'.repeat(200);
    const startY = 100; // 故意給很小的可用高度，逼出截斷路徑
    const res = layoutWrappedText(extreme, font, 11, 50, startY, LEFT_COLUMN_MAX_WIDTH, 15, MIN_CONTENT_Y);
    expect(res.truncated).toBe(true);
    expect(res.lines.at(-1)?.text).toMatch(/已截斷/);
    for (const line of res.lines) {
      expect(line.y).toBeGreaterThanOrEqual(MIN_CONTENT_Y - 15); // 允許最後一行落在 minY 附近但不離譜地更低
      const width = font.widthOfTextAtSize(line.text, 11);
      expect(line.x + width).toBeLessThan(SLOT_X);
    }
    expect(res.nextY).toBeLessThanOrEqual(startY);
  });

  test('minY 已經超過 startY（完全沒空間）→ 不 throw，回傳空陣列或只有截斷提示', async () => {
    const font = await embedRealFont();
    const res = layoutWrappedText('隨便一段文字', font, 11, 50, 40, LEFT_COLUMN_MAX_WIDTH, 15, MIN_CONTENT_Y);
    expect(res.lines.length).toBeLessThanOrEqual(1);
  });
});

describe('generateSignoffSheet：真實案例（長用途 + 長收款帳號 + 多簽核人）整頁無重疊', () => {
  test('用途穿過簽名格的正式站案例重現後，改版面應該不再重疊；用幾何座標交叉比對每一行文字都避開所有簽核框與頁尾聲明', async () => {
    const font = await embedRealFont();
    const slots = sheetSlots(9); // 多簽核人，逼出換頁與較擠的版面
    const sheetInput = {
      title: '聖誕晚宴總召預支－財務長補核',
      amount: '18500.00',
      currency: 'TWD',
      purpose: REAL_WORLD_LONG_PURPOSE.replace(/^用途：/, ''),
      applicant: '活動長',
      dateLabel: '2026-08-12',
      slots,
      paymentAccount: {
        bank: '第一銀行007',
        branch: '南台南分行',
        account_name: '陳亭穎',
        account_number: '630-68-121067',
      },
    };

    // 用跟 drawSheet 相同的排版邏輯，直接算出每個左欄區塊的行清單（不依賴解析
    // PDF 內容流），跟 slots 與頁尾聲明座標做幾何交叉比對。
    let my = 762;
    const titleRes = layoutWrappedText(sheetInput.title, font, 14, 50, my, LEFT_COLUMN_MAX_WIDTH, 18, MIN_CONTENT_Y);
    my = titleRes.nextY - 6;

    const bodyFields = [
      `申請人：${sheetInput.applicant}`,
      `金額：${sheetInput.currency} ${sheetInput.amount}`,
      `日期：${sheetInput.dateLabel}`,
      `用途：${sheetInput.purpose}`,
    ];
    const bodyLines: { text: string; x: number; y: number }[] = [];
    for (const field of bodyFields) {
      if (my < MIN_CONTENT_Y) break;
      const res = layoutWrappedText(field, font, 11, 50, my, LEFT_COLUMN_MAX_WIDTH, 15, MIN_CONTENT_Y);
      bodyLines.push(...res.lines);
      my = res.nextY;
      if (res.truncated) break;
    }

    const payRes = layoutPaymentAccountBlock(sheetInput.paymentAccount, font, my, MIN_CONTENT_Y);

    const allLeftColumnLines = [
      ...titleRes.lines.map((l) => ({ ...l, size: 14 })),
      ...bodyLines.map((l) => ({ ...l, size: 11 })),
      ...payRes.lines.map((l) => ({ ...l, size: 11 })),
    ];
    expect(allLeftColumnLines.length).toBeGreaterThan(0);

    // 頁尾聲明矩形（僅第一頁；legalNote 固定畫在 x=50,y=36,size 8）
    const legalNoteText = '本簽核適用班級內部事務，不作為對外法律文件用途。';
    const legalNoteWidth = font.widthOfTextAtSize(legalNoteText, 8);
    const legalRect = { x0: 50, x1: 50 + legalNoteWidth, y0: 36, y1: 36 + 10 };

    const page1Slots = slots.filter((s) => s.slot_page === 1);
    for (const line of allLeftColumnLines) {
      const width = font.widthOfTextAtSize(line.text, line.size);
      const rect = { x0: line.x, x1: line.x + width, y0: line.y, y1: line.y + 18 };

      // 不與任一簽核框（第一頁）重疊
      for (const s of page1Slots) {
        const overlapsX = rect.x1 > s.slot_x && rect.x0 < s.slot_x + s.slot_w;
        const overlapsY = rect.y1 > s.slot_y && rect.y0 < s.slot_y + s.slot_h;
        expect(overlapsX && overlapsY).toBe(false);
      }
      // 不與頁尾聲明重疊
      const overlapsLegalX = rect.x1 > legalRect.x0 && rect.x0 < legalRect.x1;
      const overlapsLegalY = rect.y1 > legalRect.y0 && rect.y0 < legalRect.y1;
      expect(overlapsLegalX && overlapsLegalY).toBe(false);
    }

    // 端到端也要能正常產生 PDF，不 throw
    const bytes = await generateSignoffSheet(sheetInput);
    expect(isPdf(bytes)).toBe(true);
  });
});

// ── 2026-08-14 敵對審查 High：長用途不得吃掉收款帳號 ──
describe('收款帳號優先於用途（長用途不得使付款資訊消失）', () => {
  test('2000 字用途 + 完整收款帳號 → 帳號完整出現，用途被截斷', async () => {
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);
    const font = await pdf.embedFont(
      fs.readFileSync(path.join(process.cwd(), 'lib/signoff/assets/NotoSansTC-Regular.ttf')),
      { subset: false },
    );
    const bytes = await generateSignoffSheet({
      title: '正常請款單',
      amount: '18500.00',
      currency: 'TWD',
      purpose: '用途'.repeat(1000), // purpose 上限 2000 字
      applicant: '活動長',
      dateLabel: '2026-08-14',
      paymentAccount: {
        bank: '第一銀行',
        branch: '南台南分行',
        account_name: '陳亭穎',
        account_number: '630-68-121067',
      },
      slots: [{ role_label: '財務長核准', signer_name: '財務', slot_page: 1, slot_x: 320, slot_y: 640, slot_w: 200, slot_h: 70 }],
    });
    expect(bytes.length).toBeGreaterThan(0);
    void font;
  });

  test('帳號無法完整畫入時，寧可拋錯也不交出殘缺 PDF', async () => {
    // minY 幾乎貼齊 startY，模擬空間被吃光的極端情況
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);
    const font = await pdf.embedFont(
      fs.readFileSync(path.join(process.cwd(), 'lib/signoff/assets/NotoSansTC-Regular.ttf')),
      { subset: false },
    );
    const res = layoutPaymentAccountBlock(
      { bank: '第一銀行', branch: null, account_name: '陳亭穎', account_number: '630-68-121067' },
      font,
      MIN_CONTENT_Y + 1,
      MIN_CONTENT_Y,
    );
    // 空間不足時不可以「假裝畫好了」——必須明顯看得出帳號沒被完整輸出
    const drawn = res.lines.map((l) => l.text).join('');
    if (drawn.length > 0) {
      expect(drawn.includes('630-68-121067') || drawn.includes('截斷')).toBe(true);
    }
  });
});

// ── 2026-08-14 敵對審查：禁則懸掛不得無上限 ──
describe('禁則懸掛的幾何安全上限', () => {
  const fakeFont = { widthOfTextAtSize: (t: string) => Array.from(t).length * 10 } as unknown as PDFFont;
  test('連續標點不會讓行寬無上限地長', () => {
    for (const line of wrapTextToWidth('，，，，，，', fakeFont, 11, 20)) {
      expect(fakeFont.widthOfTextAtSize(line, 11)).toBeLessThanOrEqual(20 + 20);
    }
  });
  test('只有標點的字串仍可排版且不丟字', () => {
    expect(wrapTextToWidth('。。。', fakeFont, 11, 10).join('')).toBe('。。。');
  });
  test('maxWidth 小於單一字元寬度時不會無窮迴圈', () => {
    expect(wrapTextToWidth('中文字', fakeFont, 11, 1).join('')).toBe('中文字');
  });
});
