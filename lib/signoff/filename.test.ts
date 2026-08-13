import { describe, expect, test } from 'vitest';
import { signoffDownloadFilename } from './filename';

describe('signoffDownloadFilename', () => {
  test('中文標題原樣保留（RFC 5987 編碼由 storage-js 處理，不在這層轉義）', () => {
    expect(signoffDownloadFilename('聖誕晚宴總召預支')).toBe('聖誕晚宴總召預支.pdf');
  });

  test('剝除路徑分隔符與檔案系統保留字元', () => {
    expect(signoffDownloadFilename('a/b\\c:d*e?f"g<h>i|j')).toBe('abcdefghij.pdf');
  });

  test('剝除控制字元（含換行，避免流入任何 header 字串路徑）', () => {
    expect(signoffDownloadFilename('班服\n費用\r\t用')).toBe('班服費用用.pdf');
  });

  test('空字串 / null / undefined 一律 fallback，不產生空檔名', () => {
    expect(signoffDownloadFilename('')).toBe('簽核單.pdf');
    expect(signoffDownloadFilename(null)).toBe('簽核單.pdf');
    expect(signoffDownloadFilename(undefined)).toBe('簽核單.pdf');
  });

  test('整串都是被擋字元時也 fallback，不留下空白檔名', () => {
    expect(signoffDownloadFilename('///***')).toBe('簽核單.pdf');
  });

  test('過長標題截斷到 80 字，且結尾不留空白', () => {
    const out = signoffDownloadFilename('長'.repeat(200));
    expect(out).toBe(`${'長'.repeat(80)}.pdf`);
    expect(out).not.toMatch(/\s\.pdf$/);
  });

  test('前後空白會被 trim 掉', () => {
    expect(signoffDownloadFilename('  班費  ')).toBe('班費.pdf');
  });

  test('輸出一律以 .pdf 結尾', () => {
    for (const t of ['班費', '', 'a/b', '長'.repeat(200)]) {
      expect(signoffDownloadFilename(t)).toMatch(/\.pdf$/);
    }
  });

  // ── Unicode 格式字元剝除（2026-08-13 敵對審查）─────────────────────────
  test('剝除 Unicode 格式字元（Cf，如 RTL override），不再只擋 ASCII 控制字元', () => {
    // U+202E RIGHT-TO-LEFT OVERRIDE：可以把「請款單.pdf」的副檔名視覺上偽裝
    // 成看起來像 .exe 藏在中間的樣子，這是原本只擋 \x00-\x1f 擋不住的攻擊面。
    const out = signoffDownloadFilename('請款單‮fdp.exe');
    expect(out).not.toMatch(/\p{Cf}/u);
    expect(out).toBe('請款單fdp.exe.pdf');
  });

  test('剝除零寬字元（LRM/ZWSP 等 Cf）', () => {
    expect(signoffDownloadFilename('班‎費​單')).toBe('班費單.pdf');
  });

  test('NFC 正規化：分解形式與組合形式的同一個字視為同一個檔名', () => {
    // é 的兩種 Unicode 表示法：U+00E9（組合字，NFC，單一 code point）vs
    // "e" + U+0301（分解形式：e + combining acute accent，兩個 code
    // point）——視覺上一模一樣、byte 序列不同，正規化後應輸出同一個檔名。
    const nfc = String.fromCharCode(0x00e9); // é（單一 code point，NFC）
    const nfd = 'e' + String.fromCharCode(0x0301); // e + 重音符（NFD，兩個 code point）
    expect(nfc).not.toBe(nfd); // 先確認測試前提：兩者原始字串真的不同
    const nfcOut = signoffDownloadFilename(`caf${nfc}`);
    const nfdOut = signoffDownloadFilename(`caf${nfd}`);
    expect(nfcOut).toBe(nfdOut);
    expect(nfcOut).toBe(`caf${nfc}.pdf`);
  });

  test('surrogate pair（emoji）截斷不切斷字元：80 字上限剛好落在 emoji 邊界也不產生殘缺字元', () => {
    // 79 個 ASCII 字元 + 1 個 emoji（surrogate pair，占 2 個 UTF-16 code unit）
    // 若用 String.prototype.slice(0,80) 會把 emoji 從中間切斷，留下半個代理對
    // （lone surrogate），可能在檔案系統/瀏覽器顯示成亂碼或替代字元。
    const title = 'A'.repeat(79) + '😀' + 'B'.repeat(20);
    const out = signoffDownloadFilename(title);
    // eslint-disable-next-line no-misleading-character-class
    expect(out).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u);
    // 前 80 個「字元」(code point) 應該是 79 個 A + 完整的 emoji，B 不會出現
    expect(out).toBe(`${'A'.repeat(79)}😀.pdf`);
  });

  test('全部都是格式字元 → 剝除後變空字串，一樣 fallback', () => {
    expect(signoffDownloadFilename('‎‏‪‬')).toBe('簽核單.pdf');
  });
});

// ── 2026-08-14 敵對審查：byte 預算與連續標點 ──
describe('檔名 byte 上限', () => {
  test('80 個 emoji 也不得超過 255 bytes', () => {
    const name = signoffDownloadFilename('😀'.repeat(80));
    expect(Buffer.byteLength(name, 'utf8')).toBeLessThanOrEqual(255);
    expect(name.endsWith('.pdf')).toBe(true);
  });
  test('一般中文標題不受 byte 預算影響', () => {
    expect(signoffDownloadFilename('聖誕晚宴總召預支')).toBe('聖誕晚宴總召預支.pdf');
  });
});
