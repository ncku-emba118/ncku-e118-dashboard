/**
 * Signature PNG 驗證 — Codex #1 finding 6-2。
 *
 * signature_pad 在 client 端輸出 PNG，server 收到後不可盲信：
 *   • 必須是真 PNG（magic bytes）
 *   • 尺寸在合理範圍（防 1×1 透明圖混過）
 *   • 有足夠不透明筆跡（防空白簽名）
 *   • 檔案大小設上限
 * 純函式（吃 Buffer 回結果），可單元測試。
 */
import { PNG } from 'pngjs';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const MIN_W = 40;
const MIN_H = 20;
const MAX_W = 3000;
const MAX_H = 2000;
const MAX_BYTES = 3 * 1024 * 1024; // 3 MiB
const ALPHA_THRESHOLD = 16; // a > 16 視為有筆跡
const MIN_INK_RATIO = 0.002; // 0.2% 像素有筆跡才算有簽
const MIN_BBOX_W = 8;
const MIN_BBOX_H = 4;

export type PngValidationResult =
  | { ok: true; width: number; height: number; inkRatio: number }
  | {
      ok: false;
      reason:
        | 'not_png'
        | 'too_large'
        | 'bad_dimensions'
        | 'blank_signature'
        | 'decode_failed';
    };

export function validateSignaturePng(buffer: Buffer): PngValidationResult {
  if (buffer.length > MAX_BYTES) return { ok: false, reason: 'too_large' };
  if (buffer.length < PNG_MAGIC.length || !buffer.subarray(0, 8).equals(PNG_MAGIC)) {
    return { ok: false, reason: 'not_png' };
  }

  let png: PNG;
  try {
    png = PNG.sync.read(buffer);
  } catch {
    return { ok: false, reason: 'decode_failed' };
  }

  const { width, height, data } = png;
  if (width < MIN_W || width > MAX_W || height < MIN_H || height > MAX_H) {
    return { ok: false, reason: 'bad_dimensions' };
  }

  // 掃描不透明像素：算 ink ratio + bounding box
  let ink = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3];
      if (a > ALPHA_THRESHOLD) {
        ink++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const inkRatio = ink / (width * height);
  const bboxW = maxX - minX + 1;
  const bboxH = maxY - minY + 1;
  if (ink === 0 || inkRatio < MIN_INK_RATIO || bboxW < MIN_BBOX_W || bboxH < MIN_BBOX_H) {
    return { ok: false, reason: 'blank_signature' };
  }

  return { ok: true, width, height, inkRatio };
}
