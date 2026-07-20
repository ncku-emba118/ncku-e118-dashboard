import { describe, expect, test } from 'vitest';
import { isValidIncomingSourcePath } from './constants';

/**
 * 迴歸保護：原本用 startsWith 檢查 incoming 前綴，
 * `incoming/A/../B/x.pdf` 會通過，但組成 URL 後被正規化成 `incoming/B/x.pdf`，
 * 等於可讀取他人上傳的檔案。改為完全比對 server 產生的格式後應全數擋下。
 */
const A = 'd2fcab70-ae06-47f7-b83d-838acfb6e010';
const HEX = 'a'.repeat(32);

describe('isValidIncomingSourcePath', () => {
  test('accepts server-generated path', () => {
    expect(isValidIncomingSourcePath(`incoming/${A}/${HEX}.pdf`, A)).toBe(true);
    expect(isValidIncomingSourcePath(`incoming/${A}/${HEX}.jpg`, A)).toBe(true);
    expect(isValidIncomingSourcePath(`incoming/${A}/${HEX}.png`, A)).toBe(true);
  });

  test('rejects dot-segment traversal', () => {
    expect(isValidIncomingSourcePath(`incoming/${A}/../other/${HEX}.pdf`, A)).toBe(false);
  });
  test('rejects percent-encoded traversal', () => {
    expect(isValidIncomingSourcePath(`incoming/${A}/%2e%2e/x/${HEX}.pdf`, A)).toBe(false);
  });
  test('rejects backslash variants', () => {
    expect(isValidIncomingSourcePath(`incoming/${A}\\..\\${HEX}.pdf`, A)).toBe(false);
  });
  test('rejects another account prefix', () => {
    expect(isValidIncomingSourcePath(`incoming/OTHER/${HEX}.pdf`, A)).toBe(false);
  });
  test('rejects disallowed extension', () => {
    expect(isValidIncomingSourcePath(`incoming/${A}/${HEX}.exe`, A)).toBe(false);
  });
  test('rejects appended suffix after valid name', () => {
    expect(isValidIncomingSourcePath(`incoming/${A}/${HEX}.pdf/../y.pdf`, A)).toBe(false);
  });
  test('rejects non-hex or wrong-length filename', () => {
    expect(isValidIncomingSourcePath(`incoming/${A}/abc.pdf`, A)).toBe(false);
    expect(isValidIncomingSourcePath(`incoming/${A}/${'z'.repeat(32)}.pdf`, A)).toBe(false);
  });
});
