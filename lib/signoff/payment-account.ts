/**
 * 收款帳號欄位 — 純函式 sanitize/驗證（不吃 DB，可直接 vitest）。
 *
 * 使用者（2026-08-13）拍板：分欄（銀行/分行/戶名/帳號）+ 可上傳帳號照片併存，
 * 整組選填但預設展開。這裡只處理「分欄文字」那一半；照片走既有附件上傳機制
 * （見 app/api/board/signoff/route.ts 的 sources + label='收款帳號證明'）。
 *
 * 設計：
 *   • 四欄各自 trim + 長度上限，全部留空視為「沒填」→ 回傳 null（不是空物件），
 *     避免 DB 存一個「全欄位都是空字串」的無意義 JSON。
 *   • 帳號只接受數字／連字號／空白（銀行帳號常見的分段格式，如 123-456-7890123），
 *     不做更嚴格的「必須符合某銀行規則」驗證（帳號格式各行不同，過嚴會擋掉正常輸入）。
 *   • 帳號長度採「純數字位數」計算 4–20 碼（涵蓋台灣銀行帳號 10–16 碼與其他常見長度），
 *     而非含分隔符的總長度，避免使用者多打幾個連字號就被擋。
 */

export type PaymentAccountInput = {
  bank?: string | null;
  branch?: string | null;
  account_name?: string | null;
  account_number?: string | null;
} | null | undefined;

export type PaymentAccount = {
  bank: string | null;
  branch: string | null;
  account_name: string | null;
  account_number: string | null;
};

export type SanitizePaymentAccountResult =
  | { ok: true; value: PaymentAccount | null }
  | { ok: false; error: string };

const MAX_BANK = 60;
const MAX_BRANCH = 60;
const MAX_ACCOUNT_NAME = 60;
// 帳號僅允許數字／連字號／空白（常見分段格式），其餘字元一律視為格式錯誤。
const ACCOUNT_NUMBER_CHARS_RE = /^[0-9\- ]+$/;
const MIN_ACCOUNT_DIGITS = 4;
const MAX_ACCOUNT_DIGITS = 20;

// Unicode 控制字元（Cc，如 \n \t \x00-\x1f）與格式字元（Cf，如 U+200E LRM、
// U+202E RTL override）。原本只剝 ASCII 控制字元擋不住 Cf——這些字元不換行、
// 幾乎不可見，卻能讓「收款帳號 PDF」內嵌換行/雙向覆寫，把座落位置或顯示順序
// 弄亂（2026-08-13 敵對審查）。用 \p{Cc}\p{Cf} 涵蓋全 Unicode 範圍，而不是只
// 擋 ASCII 那一段。
// eslint-disable-next-line no-control-regex
const UNSAFE_UNICODE_RE = /[\p{Cc}\p{Cf}]/gu;

function stripUnsafeUnicode(v: string): string {
  return v.replace(UNSAFE_UNICODE_RE, '');
}

export function sanitizePaymentAccount(input: PaymentAccountInput): SanitizePaymentAccountResult {
  if (!input) return { ok: true, value: null };

  const bank = stripUnsafeUnicode((input.bank ?? '').trim()).trim();
  const branch = stripUnsafeUnicode((input.branch ?? '').trim()).trim();
  const accountName = stripUnsafeUnicode((input.account_name ?? '').trim()).trim();
  const accountNumber = stripUnsafeUnicode((input.account_number ?? '').trim()).trim();

  // 四欄全空 → 視為「沒填這個選填區塊」，不是驗證錯誤。
  if (!bank && !branch && !accountName && !accountNumber) {
    return { ok: true, value: null };
  }

  if (bank.length > MAX_BANK) return { ok: false, error: '銀行名稱過長' };
  if (branch.length > MAX_BRANCH) return { ok: false, error: '分行名稱過長' };
  if (accountName.length > MAX_ACCOUNT_NAME) return { ok: false, error: '戶名過長' };

  if (accountNumber) {
    if (!ACCOUNT_NUMBER_CHARS_RE.test(accountNumber)) {
      return { ok: false, error: '收款帳號只能包含數字、連字號與空白' };
    }
    const digits = accountNumber.replace(/[^0-9]/g, '');
    if (digits.length < MIN_ACCOUNT_DIGITS || digits.length > MAX_ACCOUNT_DIGITS) {
      return { ok: false, error: `收款帳號位數不正確（需 ${MIN_ACCOUNT_DIGITS}–${MAX_ACCOUNT_DIGITS} 碼數字）` };
    }
  }

  return {
    ok: true,
    value: {
      bank: bank || null,
      branch: branch || null,
      account_name: accountName || null,
      account_number: accountNumber || null,
    },
  };
}

/** 收款帳號是否有任何可顯示內容（供前端/PDF 判斷要不要畫這個區塊）。 */
export function hasPaymentAccountContent(p: PaymentAccount | null | undefined): boolean {
  if (!p) return false;
  return !!(p.bank || p.branch || p.account_name || p.account_number);
}
