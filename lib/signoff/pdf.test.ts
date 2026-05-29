import { describe, expect, test } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { PNG } from 'pngjs';
import { generateSignoffSheet, composeFinalPdf } from './pdf';
import { computeSlotLayout } from './layout';

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
