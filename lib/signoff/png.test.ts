import { describe, expect, test } from 'vitest';
import { PNG } from 'pngjs';
import { validateSignaturePng } from './png';

/** 造一張 RGBA PNG，opaquePixels 個像素設為不透明黑，其餘全透明 */
function makePng(width: number, height: number, opaquePixels: number): Buffer {
  const png = new PNG({ width, height });
  png.data.fill(0); // 全透明 (a=0)
  let painted = 0;
  for (let i = 0; i < png.data.length && painted < opaquePixels; i += 4) {
    png.data[i] = 0; // r
    png.data[i + 1] = 0; // g
    png.data[i + 2] = 0; // b
    png.data[i + 3] = 255; // a
    painted++;
  }
  return PNG.sync.write(png);
}

describe('validateSignaturePng', () => {
  test('rejects a non-PNG buffer', () => {
    const res = validateSignaturePng(Buffer.from('this is not a png at all'));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('not_png');
  });

  test('rejects a fully transparent (blank) signature', () => {
    const blank = makePng(200, 80, 0);
    const res = validateSignaturePng(blank);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('blank_signature');
  });

  test('accepts a PNG with enough opaque ink', () => {
    const signed = makePng(200, 80, 2000); // 2000 / 16000 = 12.5% ink
    const res = validateSignaturePng(signed);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.width).toBe(200);
      expect(res.height).toBe(80);
      expect(res.inkRatio).toBeGreaterThan(0.002);
    }
  });

  test('rejects a too-small canvas', () => {
    const tiny = makePng(10, 5, 10);
    const res = validateSignaturePng(tiny);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('bad_dimensions');
  });
});
