/**
 * 簽核 PDF 引擎 — 簽核表生成 + 最終合成（SIGNOFF-ARCHITECTURE.md §6）。
 *
 *   generateSignoffSheet : 建立「簽核表」底圖（標題/金額/用途 + 各簽核欄位框）
 *   composeFinalPdf      : 重建簽核表 → overlay 簽名 PNG + 姓名/時間戳 → 夾帶原始憑證
 *
 * ⚠ CJK 字型踩雷（實測 2026-05-28，已 render 驗證）：
 *   pdf-lib 這版對 CJK 字型做 subset（OTF 或 TTF 皆然）會掉 glyph → 中文變空白方框 / 缺字。
 *   只有 subset:false（嵌完整字型）能正確顯示所有中文（含生僻姓名）。
 *   代價：字型本體 ~5MB。為避免「最終 PDF = 簽核表(含字型) + 再嵌一次字型 = 雙份」，
 *   composeFinalPdf **重建**簽核表（不載入已存的 sheet bytes），全程只嵌一次字型 → 最終 ~5MB。
 *   v2 縮小：離線把字型 pyftsubset 到常用字（subset:false 嵌小字型）。
 *
 * ⚠ 字型格式必須是 TrueType 輪廓（.ttf / glyf），不可用 CFF 輪廓的 .otf（實測 2026-08-13）：
 *   原本用 NotoSansTC-Regular.otf（OTTO/CFF），pdf-lib 會嵌成 CIDFontType0 + FontFile3
 *   /OpenType，poppler 一路噴 "Mismatch between font type and embedded font file"，
 *   寬鬆的 reader（瀏覽器 pdf.js、macOS CoreGraphics）容錯過去照樣顯示，嚴格的 reader
 *   則整份中文變亂碼——使用者 2026-08-13 回報「PDF 電腦打開是亂碼」即此。
 *   改用離線 cu2qu 轉出的 TrueType 輪廓版後嵌成 CID TrueType（FontFile2），警告消失、
 *   相容性最廣，且 PDF 反而小約 17%（實測同一頁 4.76MB → 3.96MB）。
 *   ⚠ 換字型檔前務必先確認 sfnt 版本是 0x00010000（有 glyf 表、無 CFF 表），不要直接換回 .otf。
 *
 * 純（吃 bytes 回 bytes），可在 node/vitest 直接測，不需 DB。
 *
 * ⚠ Netlify 部署：font 由 fs 讀取，需在 next.config 的 outputFileTracingIncludes
 *    把 lib/signoff/assets/** 納入 function bundle（部署前處理）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { SLOT_X } from './layout';

const A4 = { w: 595.28, h: 841.89 };
const INK = rgb(0.1, 0.09, 0.07);
const MUTE = rgb(0.54, 0.5, 0.45);
const WINE = rgb(0.545, 0.122, 0.184); // #8B1F2F
const BOX = rgb(0.7, 0.66, 0.6);

const FONT_PATH = path.join(process.cwd(), 'lib/signoff/assets/NotoSansTC-Regular.ttf');
let fontCache: Buffer | null = null;
function loadFontBytes(): Buffer {
  if (!fontCache) fontCache = fs.readFileSync(FONT_PATH);
  return fontCache;
}
// subset 必須 false（見檔頭說明）
const FONT_EMBED_OPTS = { subset: false } as const;

export type SheetSlot = {
  role_label: string;
  signer_name: string;
  slot_page: number;
  slot_x: number;
  slot_y: number;
  slot_w: number;
  slot_h: number;
};

/** 收款帳號（0027）。畫 PDF 用的最小形狀，故意跟 lib/signoff/payment-account.ts
 *  的 PaymentAccount 型別分開定義，避免 pdf.ts（純函式、無 DB 依賴）反過來
 *  依賴那支模組——欄位剛好同名同義，呼叫端直接把 doc.payment_account 傳進來即可。 */
export type SheetPaymentAccount = {
  bank: string | null;
  branch: string | null;
  account_name: string | null;
  account_number: string | null;
};

export type SheetInput = {
  title: string;
  amount: string | null;
  currency: string;
  purpose: string | null;
  applicant: string | null;
  dateLabel: string;
  slots: SheetSlot[];
  legalNote?: string;
  /** 收款帳號（0027，選填）；財務長要看這個決定付款要匯去哪。 */
  paymentAccount?: SheetPaymentAccount | null;
};

const DEFAULT_LEGAL_NOTE = '本簽核適用班級內部事務，不作為對外法律文件用途。';

// ── 左欄長文字換行（2026-08-14 追加：正式站實例「聖誕晚宴總召預支－財務長
//    補核」的『用途』欄位一長就整行畫出頁面右邊界並直接穿過簽名格；收款帳號
//    同樣的問題先前已修，這裡把換行邏輯抽成 drawSheet 共用 helper，套用到
//    標題／申請人／金額／日期／用途／收款帳號全部左欄文字，不再只修收款
//    帳號那一區）──
//
// 設計：
//   • 左欄所有文字固定畫在 x=50（或收款帳號值再縮排到 x=60）起，換行寬度收在
//     簽核欄位框（layout.ts SLOT_X，右欄）左邊留一段安全間距。這樣「不論畫幾
//     行、畫到多低」在 x 軸上都不可能碰到簽核框——不用去猜簽核框的 y 座標，
//     兩者天生分屬不同 x 範圍。
//   • 高度動態：所有欄位共用同一個往下走的游標（drawSheet 內的 my），內容
//     長就自然往下推。
//   • 底線：不可畫到蓋住頁尾法律聲明（同一個 x=50 欄，y=36）。截斷策略選
//     「文字截斷＋顯示刪節提示」而非「另開新頁」——因為簽核欄位的頁碼/座標
//     （slot_page/slot_x/slot_y）在呼叫端（app/api/board/signoff/route.ts）
//     用 computeSlotLayout 算好、且已經編進 assignment_manifest_sha256，
//     drawSheet 這裡如果因為左欄文字太長而多插一頁，會讓簽核框的頁碼跟
//     manifest hash 對不上；截斷不影響頁面數與簽核框位置，是唯一不動到
//     已提交契約就能收尾的做法。單據標題本身另有 120 字上限（zod schema），
//     真正會踩到截斷的幾乎只有用途/收款帳號這類自由長文字。
const LEFT_X = 50;
const LEFT_MARGIN_BEFORE_SLOT_COL = 20;
/** 左欄（未縮排）文字換行寬度上限：留在簽核欄位框（SLOT_X）左側，含安全間距。 */
export const LEFT_COLUMN_MAX_WIDTH = SLOT_X - LEFT_X - LEFT_MARGIN_BEFORE_SLOT_COL;
const BODY_LINE_HEIGHT = 15;
const BODY_FONT_SIZE = 11;
const TITLE_LINE_HEIGHT = 18;
const TITLE_FONT_SIZE = 14;
/** 底線：所有左欄動態文字都不可畫到這個 y 以下，留給頁尾法律聲明（y=36, size 8）安全間距。 */
export const MIN_CONTENT_Y = 58;
// 提示文字本身也要留在同一份寬度限制內（否則提示自己撐版），故刻意寫短，
// 不用完整句子；完整內容請見原始附件/補充說明的引導已經在 UI 文案層面處理。
const TRUNCATION_NOTICE = '…（內容過長已截斷）';

const PAYMENT_VALUE_INDENT_X = 60;
/** 收款帳號縮排值那一行的換行寬度上限（比左欄未縮排文字窄一點，起點多縮 10pt）。 */
export const PAYMENT_MAX_WIDTH = SLOT_X - PAYMENT_VALUE_INDENT_X - LEFT_MARGIN_BEFORE_SLOT_COL;
const PAYMENT_LINE_HEIGHT = BODY_LINE_HEIGHT;
const PAYMENT_FONT_SIZE = BODY_FONT_SIZE;

/** 依 font.widthOfTextAtSize 做字元級換行（CJK 沒有空白可斷詞，逐字元累加最穩）。 */
export function wrapTextToWidth(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const chars = Array.from(text); // Array.from 依 code point 迭代，不切斷 surrogate pair
  const lines: string[] = [];
  let cur = '';
  for (const ch of chars) {
    const candidate = cur + ch;
    if (cur.length > 0 && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(cur);
      cur = ch;
    } else {
      cur = candidate;
    }
  }
  if (cur.length > 0) lines.push(cur);
  return lines.length > 0 ? lines : [''];
}

export type SheetTextLine = { text: string; x: number; y: number };

/**
 * 把任意一段文字排成「依寬度換行＋不畫過 minY」的座標清單，回傳畫完後下一個
 * 可用的 y。純函式，不吃 PDFPage，方便單獨測試斷言座標與截斷行為。
 *
 * 空間不夠時的策略：保留最後一行給刪節提示（TRUNCATION_NOTICE），不會讓正文
 * 最後一行跟提示疊在一起，也不會畫超過 minY。
 */
export function layoutWrappedText(
  text: string,
  font: PDFFont,
  size: number,
  x: number,
  startY: number,
  maxWidth: number,
  lineHeight: number,
  minY: number,
): { lines: SheetTextLine[]; nextY: number; truncated: boolean } {
  if (!text) return { lines: [], nextY: startY, truncated: false };
  const wrapped = wrapTextToWidth(text, font, size, maxWidth);
  const availableLines = Math.max(0, Math.floor((startY - minY) / lineHeight) + 1);
  let truncated = false;
  let toDraw = wrapped;
  if (wrapped.length > availableLines) {
    truncated = true;
    toDraw = wrapped.slice(0, Math.max(availableLines - 1, 0));
  }
  const lines: SheetTextLine[] = [];
  let y = startY;
  for (const line of toDraw) {
    lines.push({ text: line, x, y });
    y -= lineHeight;
  }
  if (truncated) {
    // 提示文字本身也套一次同樣的寬度限制（[0] 取第一行）——maxWidth 再窄也不會讓
    // 提示自己撐版，不用假設呼叫端傳進來的寬度一定夠放完整提示句。
    const noticeLine = wrapTextToWidth(TRUNCATION_NOTICE, font, size, maxWidth)[0] ?? TRUNCATION_NOTICE;
    lines.push({ text: noticeLine, x, y });
    y -= lineHeight;
  }
  return { lines, nextY: y, truncated };
}

export type PaymentAccountLine = SheetTextLine;

/**
 * 把收款帳號四欄排成「每欄各自成行＋依寬度換行」的清單，回傳每行的畫布座標
 * 與畫完後下一個可用的 y（供呼叫端接續往下畫，是本函式唯一需要外部知道的
 * 「動態高度」資訊）。純函式，不吃 PDFPage，方便單獨測試斷言座標。
 *
 * minY：不可畫過的下限（預設 MIN_CONTENT_Y，見上方常數說明）；一旦這一欄的
 * 空間被前面的標題/用途等欄位吃光，會直接跳過剩餘欄位並在目前位置補一行
 * 刪節提示，不會硬擠出超出邊界的文字。
 */
export function layoutPaymentAccountBlock(
  pay: SheetPaymentAccount | null | undefined,
  font: PDFFont,
  startY: number,
  minY: number = MIN_CONTENT_Y,
): { lines: PaymentAccountLine[]; nextY: number } {
  if (!pay || !(pay.bank || pay.branch || pay.account_name || pay.account_number)) {
    return { lines: [], nextY: startY };
  }
  const fields: string[] = [];
  if (pay.bank) fields.push(`銀行：${pay.bank}`);
  if (pay.branch) fields.push(`分行：${pay.branch}`);
  if (pay.account_name) fields.push(`戶名：${pay.account_name}`);
  if (pay.account_number) fields.push(`帳號：${pay.account_number}`);

  const lines: PaymentAccountLine[] = [];
  let y = startY;
  if (y >= minY) {
    lines.push({ text: '收款帳號', x: LEFT_X, y });
    y -= PAYMENT_LINE_HEIGHT;
  }
  for (const field of fields) {
    if (y < minY) break; // 空間已經用完，不再處理剩餘欄位（上一輪已補刪節提示）
    const res = layoutWrappedText(field, font, PAYMENT_FONT_SIZE, PAYMENT_VALUE_INDENT_X, y, PAYMENT_MAX_WIDTH, PAYMENT_LINE_HEIGHT, minY);
    lines.push(...res.lines);
    y = res.nextY;
    if (res.truncated) break; // 這一欄已經截斷，後面的欄位必然也放不下
  }
  return { lines, nextY: y };
}

/** 在 pdf 上畫出簽核表（建立頁面 + header + 欄位框 + 法律聲明），回傳頁面陣列。 */
function drawSheet(pdf: PDFDocument, font: PDFFont, input: SheetInput): PDFPage[] {
  const maxPage = input.slots.reduce((m, s) => Math.max(m, s.slot_page), 1);
  const pages: PDFPage[] = [];
  for (let i = 0; i < maxPage; i++) pages.push(pdf.addPage([A4.w, A4.h]));

  // header（僅第 1 頁）
  const p0 = pages[0];
  p0.drawText('經費單簽核表', { x: 50, y: 792, size: 22, font, color: WINE });

  // 標題（依寬度換行 + 不畫過 MIN_CONTENT_Y）。schema 已限 120 字上限，這裡
  // 仍套用同一套 wrap/truncate 機制，避免窄視窗字型下 120 字仍可能單行超寬。
  let my = 762;
  const titleRes = layoutWrappedText(input.title, font, TITLE_FONT_SIZE, LEFT_X, my, LEFT_COLUMN_MAX_WIDTH, TITLE_LINE_HEIGHT, MIN_CONTENT_Y);
  for (const line of titleRes.lines) {
    p0.drawText(line.text, { x: line.x, y: line.y, size: TITLE_FONT_SIZE, font, color: INK });
  }
  my = titleRes.nextY - 6; // 標題與下方 meta 之間留一點呼吸空間

  // 申請人／金額／日期／用途：同一套換行＋截斷邏輯，共用同一個往下走的游標
  // （my），內容長就自然往下推；一旦某一欄位空間被前面吃光就整段跳過並補
  // 刪節提示，不會硬擠出超出邊界或蓋住簽核框/頁尾聲明的文字（見上方常數區
  // 註解：2026-08-14 正式站「聖誕晚宴總召預支－財務長補核」用途欄位穿過簽名
  // 格即此類問題，原本只有收款帳號有換行，這裡把 helper 抽出來全部套用）。
  const bodyFields: string[] = [];
  if (input.applicant) bodyFields.push(`申請人：${input.applicant}`);
  if (input.amount) bodyFields.push(`金額：${input.currency} ${input.amount}`);
  bodyFields.push(`日期：${input.dateLabel}`);
  if (input.purpose) bodyFields.push(`用途：${input.purpose}`);

  for (const field of bodyFields) {
    if (my < MIN_CONTENT_Y) break; // 空間已用完，剩餘欄位（含用途）整段跳過
    const res = layoutWrappedText(field, font, BODY_FONT_SIZE, LEFT_X, my, LEFT_COLUMN_MAX_WIDTH, BODY_LINE_HEIGHT, MIN_CONTENT_Y);
    for (const line of res.lines) {
      p0.drawText(line.text, { x: line.x, y: line.y, size: BODY_FONT_SIZE, font, color: INK });
    }
    my = res.nextY;
    if (res.truncated) break;
  }

  // 收款帳號（0027）：財務長要看這一行決定付款要匯去哪，故用 WINE 強調色、
  // 緊接在 meta/用途下方，不擠進簽核欄位框裡。四欄都空時整塊不畫。每欄各自
  // 成行＋依寬度換行（layoutPaymentAccountBlock），區塊高度隨內容動態長高，
  // 換行寬度固定收在簽核欄位框（右欄）左側，兩者天生不同 x 範圍，不論這塊
  // 畫多少行都不會蓋到簽核框；同時吃 MIN_CONTENT_Y 下限不會蓋過頁尾聲明
  // （見 layoutPaymentAccountBlock 註解）。
  const { lines: payLines, nextY } = layoutPaymentAccountBlock(input.paymentAccount, font, my, MIN_CONTENT_Y);
  for (const line of payLines) {
    p0.drawText(line.text, { x: line.x, y: line.y, size: PAYMENT_FONT_SIZE, font, color: WINE });
  }
  my = nextY;

  // 簽核欄位框
  for (const s of input.slots) {
    const page = pages[s.slot_page - 1] ?? pages[0];
    page.drawText(`${s.role_label}：${s.signer_name}`, {
      x: s.slot_x, y: s.slot_y + s.slot_h + 6, size: 11, font, color: INK,
    });
    page.drawRectangle({
      x: s.slot_x, y: s.slot_y, width: s.slot_w, height: s.slot_h,
      borderColor: BOX, borderWidth: 1,
    });
  }

  // 法律聲明（每頁底部）
  for (const page of pages) {
    page.drawText(input.legalNote ?? DEFAULT_LEGAL_NOTE, {
      x: 50, y: 36, size: 8, font, color: MUTE,
    });
  }
  return pages;
}

export async function generateSignoffSheet(input: SheetInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(loadFontBytes(), FONT_EMBED_OPTS);
  drawSheet(pdf, font, input);
  return pdf.save();
}

export type ComposeSignature = {
  slot_page: number;
  slot_x: number;
  slot_y: number;
  slot_w: number;
  slot_h: number;
  signer_name: string;
  signed_at_label: string;
  comment?: string;
  png: Uint8Array;
};

export type ComposeInput = {
  sheet: SheetInput; // 重建簽核表（不吃已存 PDF，避免雙份字型）
  signatures: ComposeSignature[];
  sources: { bytes: Uint8Array; mime: string }[]; // 1..N 附件（發票/明細...），依序夾在後面
};

function fitInside(imgW: number, imgH: number, boxW: number, boxH: number) {
  const scale = Math.min(boxW / imgW, boxH / imgH);
  return { w: imgW * scale, h: imgH * scale };
}

export async function composeFinalPdf(input: ComposeInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(loadFontBytes(), FONT_EMBED_OPTS); // 只嵌一次
  const sheetPages = drawSheet(pdf, font, input.sheet);

  // overlay 每個簽名 + 姓名/時間戳
  for (const sig of input.signatures) {
    const page = sheetPages[sig.slot_page - 1] ?? sheetPages[0];
    const img = await pdf.embedPng(sig.png);
    const pad = 4;
    const fit = fitInside(img.width, img.height, sig.slot_w - pad * 2, sig.slot_h - pad * 2);
    page.drawImage(img, {
      x: sig.slot_x + (sig.slot_w - fit.w) / 2,
      y: sig.slot_y + (sig.slot_h - fit.h) / 2,
      width: fit.w,
      height: fit.h,
    });
    const caption = `${sig.signer_name} · ${sig.signed_at_label}${sig.comment ? ` · ${sig.comment}` : ''}`;
    page.drawText(caption, { x: sig.slot_x, y: sig.slot_y - 12, size: 8, font, color: MUTE });
  }

  // 依序夾帶每個附件（發票/明細...）
  for (const { bytes, mime } of input.sources) {
    if (mime === 'application/pdf') {
      const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const copied = await pdf.copyPages(src, src.getPageIndices());
      for (const pg of copied) pdf.addPage(pg);
    } else if (mime === 'image/png' || mime === 'image/jpeg') {
      const img = mime === 'image/png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      const page = pdf.addPage([A4.w, A4.h]);
      const margin = 40;
      const fit = fitInside(img.width, img.height, A4.w - margin * 2, A4.h - margin * 2);
      page.drawImage(img, {
        x: (A4.w - fit.w) / 2, y: (A4.h - fit.h) / 2, width: fit.w, height: fit.h,
      });
    } else {
      throw new Error(`composeFinalPdf: unsupported source mime ${mime}`);
    }
  }

  return pdf.save();
}
