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
 * 純（吃 bytes 回 bytes），可在 node/vitest 直接測，不需 DB。
 *
 * ⚠ Netlify 部署：font 由 fs 讀取，需在 next.config 的 outputFileTracingIncludes
 *    把 lib/signoff/assets/** 納入 function bundle（部署前處理）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

const A4 = { w: 595.28, h: 841.89 };
const INK = rgb(0.1, 0.09, 0.07);
const MUTE = rgb(0.54, 0.5, 0.45);
const WINE = rgb(0.545, 0.122, 0.184); // #8B1F2F
const BOX = rgb(0.7, 0.66, 0.6);

const FONT_PATH = path.join(process.cwd(), 'lib/signoff/assets/NotoSansTC-Regular.otf');
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

export type SheetInput = {
  title: string;
  amount: string | null;
  currency: string;
  purpose: string | null;
  applicant: string | null;
  dateLabel: string;
  slots: SheetSlot[];
  legalNote?: string;
};

const DEFAULT_LEGAL_NOTE = '本簽核適用班級內部事務，不作為對外法律文件用途。';

/** 在 pdf 上畫出簽核表（建立頁面 + header + 欄位框 + 法律聲明），回傳頁面陣列。 */
function drawSheet(pdf: PDFDocument, font: PDFFont, input: SheetInput): PDFPage[] {
  const maxPage = input.slots.reduce((m, s) => Math.max(m, s.slot_page), 1);
  const pages: PDFPage[] = [];
  for (let i = 0; i < maxPage; i++) pages.push(pdf.addPage([A4.w, A4.h]));

  // header（僅第 1 頁）
  const p0 = pages[0];
  p0.drawText('經費簽核表', { x: 50, y: 792, size: 22, font, color: WINE });
  p0.drawText(input.title, { x: 50, y: 762, size: 14, font, color: INK });

  const meta: string[] = [];
  if (input.applicant) meta.push(`申請人：${input.applicant}`);
  if (input.amount) meta.push(`金額：${input.currency} ${input.amount}`);
  meta.push(`日期：${input.dateLabel}`);
  let my = 738;
  for (const line of meta) {
    p0.drawText(line, { x: 50, y: my, size: 11, font, color: INK });
    my -= 18;
  }
  if (input.purpose) {
    p0.drawText(`用途：${input.purpose}`, { x: 50, y: my, size: 11, font, color: INK });
  }

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
