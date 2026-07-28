import { describe, expect, test } from 'vitest';
import {
  signatureObjectPath,
  storedSignatureObjectPath,
  objectPaths,
} from './constants';

/**
 * 安全迴歸（Codex #2/#4）：簽名 PNG 路徑必須「內容定址」——路徑帶 sha256 前 8 碼，
 * 不同內容→不同路徑→永不互相覆寫。finalize 讀 DB 的 signature_png_path，故此處
 * 產生的唯一路徑就是最終被讀的路徑；三方（sign / sign-stamp / finalize）認知一致。
 */
const DOC = '11111111-2222-3333-4444-555555555555';
const ACCT = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const SHA_A = '0123456789abcdef'.repeat(4); // 64 hex
const SHA_B = 'fedcba9876543210'.repeat(4);

describe('signatureObjectPath（單據內簽名）', () => {
  test('格式＝documents/{docId}/signatures/{accountId}-{sha8}.png', () => {
    expect(signatureObjectPath(DOC, ACCT, SHA_A)).toBe(
      `documents/${DOC}/signatures/${ACCT}-01234567.png`,
    );
  });

  test('sha8 恰為 sha256 前 8 碼', () => {
    const p = signatureObjectPath(DOC, ACCT, SHA_A);
    expect(p.endsWith(`-${SHA_A.slice(0, 8)}.png`)).toBe(true);
  });

  test('不同內容→不同路徑（不覆寫）', () => {
    expect(signatureObjectPath(DOC, ACCT, SHA_A)).not.toBe(
      signatureObjectPath(DOC, ACCT, SHA_B),
    );
  });

  test('相同內容→相同路徑（idempotent）', () => {
    expect(signatureObjectPath(DOC, ACCT, SHA_A)).toBe(
      signatureObjectPath(DOC, ACCT, SHA_A),
    );
  });

  test('objectPaths.signature 委派到同一純函式', () => {
    expect(objectPaths.signature(DOC, ACCT, SHA_A)).toBe(
      signatureObjectPath(DOC, ACCT, SHA_A),
    );
  });
});

describe('storedSignatureObjectPath（帳號預存簽名）', () => {
  test('格式＝stored-signatures/{accountId}-{sha8}.png', () => {
    expect(storedSignatureObjectPath(ACCT, SHA_A)).toBe(
      `stored-signatures/${ACCT}-01234567.png`,
    );
  });

  test('不同內容→不同路徑（不覆寫舊印鑑）', () => {
    expect(storedSignatureObjectPath(ACCT, SHA_A)).not.toBe(
      storedSignatureObjectPath(ACCT, SHA_B),
    );
  });

  test('objectPaths.storedSignature 委派到同一純函式', () => {
    expect(objectPaths.storedSignature(ACCT, SHA_A)).toBe(
      storedSignatureObjectPath(ACCT, SHA_A),
    );
  });
});
