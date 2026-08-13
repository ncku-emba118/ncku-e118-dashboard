import { describe, expect, test } from 'vitest';
import { signoffDownloadFilename } from './filename';

describe('signoffDownloadFilename', () => {
  test('中文標題原樣保留（RFC 5987 編碼由 storage-js 處理，不在這層轉義）', () => {
    expect(signoffDownloadFilename('聖誕晚宴總召預支')).toBe('簽核單_聖誕晚宴總召預支.pdf');
  });

  test('剝除路徑分隔符與檔案系統保留字元', () => {
    expect(signoffDownloadFilename('a/b\\c:d*e?f"g<h>i|j')).toBe('簽核單_abcdefghij.pdf');
  });

  test('剝除控制字元（含換行，避免流入任何 header 字串路徑）', () => {
    expect(signoffDownloadFilename('班服\n費用\r\t用')).toBe('簽核單_班服費用用.pdf');
  });

  test('空字串 / null / undefined 一律 fallback，不產生空檔名', () => {
    expect(signoffDownloadFilename('')).toBe('簽核單_簽核單.pdf');
    expect(signoffDownloadFilename(null)).toBe('簽核單_簽核單.pdf');
    expect(signoffDownloadFilename(undefined)).toBe('簽核單_簽核單.pdf');
  });

  test('整串都是被擋字元時也 fallback，不留下空白檔名', () => {
    expect(signoffDownloadFilename('///***')).toBe('簽核單_簽核單.pdf');
  });

  test('過長標題截斷到 80 字，且結尾不留空白', () => {
    const out = signoffDownloadFilename('長'.repeat(200));
    expect(out).toBe(`簽核單_${'長'.repeat(80)}.pdf`);
    expect(out).not.toMatch(/\s\.pdf$/);
  });

  test('前後空白會被 trim 掉', () => {
    expect(signoffDownloadFilename('  班費  ')).toBe('簽核單_班費.pdf');
  });

  test('輸出一律以 .pdf 結尾', () => {
    for (const t of ['班費', '', 'a/b', '長'.repeat(200)]) {
      expect(signoffDownloadFilename(t)).toMatch(/\.pdf$/);
    }
  });
});
