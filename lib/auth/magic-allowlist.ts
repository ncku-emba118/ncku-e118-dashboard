/**
 * magic_scope（財務長唯讀 magic 連結）deny-by-default 的「第一層」防線 —— 明確
 * allowlist，供 middleware.ts 使用。
 *
 * 背景（敵對審查判定不可上線，見 fix/signoff-magic-hardening 分支交接）：
 * 原本 magic_scope 只在 lib/signoff/access.ts::requireSignoffAccess 這一個函式
 * 裡被檢查，任何沒呼叫它的 route（income、signoff 列表/accounts/delete、
 * upload-url……甚至 /staff /budget/settlement/[slug] 這些跟 signoff 完全無關的
 * 頁面）都會把這條唯讀連結換出的 session 當成該財務長帳號的完整正常 session。
 *
 * 修正後的三層防線：
 *   1. middleware.ts（本檔案）—— 看得到完整 path，deny-by-default，只放行這裡
 *      列出的 allowlist。
 *   2. lib/auth/session.ts::readSession() —— 第二層獨立防線：預設一律把
 *      magic_scope session 當成未登入（null），只有明確傳
 *      `{ allowMagicScope: true }` 的呼叫端才拿得到。即使有路徑繞過 middleware
 *      （RSC / server action / 未來新增的 route handler），這裡仍會擋下來。
 *   3. lib/signoff/access.ts::requireSignoffAccess（沿用既有，未拿掉）—— 最終
 *      「這個 action 是否真的允許」的判斷（見 lib/signoff/magic-scope.ts）。
 *
 * ⚠ 新增 allowlist 項目必須是有意識的動作：見 lib/auth/magic-scope-coverage.test.ts
 *   ——結構性回歸測試會枚舉 app/api/** 的所有 route + app/** 的所有 page，
 *   對每一個路徑斷言「在這份 allowlist 內、或是被拒絕」。忘記把新 route 納入
 *   考量（不管是加進這裡、還是讓它保持被拒絕）都不會漏測，但「被允許」永遠
 *   必須是改這個檔案這個動作本身。
 */

/** UUID（不分大小寫）比對用。與各 route 既有的 UUID_RE 慣例一致。 */
const UUID_SEGMENT = '[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}';

export type MagicAllowlistEntry = {
  /** 給人看的說明，也用在測試斷言訊息裡。 */
  readonly describe: string;
  readonly method: 'GET';
  /** pattern 必須恰好一個 capture group，抓出 URL 裡的 document id。 */
  readonly pattern: RegExp;
};

/**
 * 財務長唯讀連結實際需要的進入點——只有這兩個（已實測跑過完整流程確認缺一不可）：
 *
 *   1. 頁面殼 GET /finance/signoff/[id]：magic 連結 redirect 的落地頁
 *      （app/api/board/signoff/magic/[token]/route.ts:165-167）。'use client'
 *      殼本身不含資料，資料靠下面第 2 點的 API 抓；但若不放行這條，連殼都
 *      進不去，財務長會直接卡在 404，連 API 都打不到。
 *   2. GET /api/board/signoff/[id]：頁面掛載時打的唯一資料來源
 *      （app/finance/signoff/[id]/page.tsx:137），回 doc meta +
 *      signed read URL（sheet / final PDF）——PDF 下載連結就是這支 API 回應
 *      裡的 urls.final，不是另外一支下載 route；未登入訪客走同一支 API 的
 *      「② 公開摘要」分支，但那個分支刻意不含 signed URL（見 route.ts
 *      163-166 行），所以磁力 session 必須能走到「① 登入且有內部 view 權限」
 *      這條分支才下載得到 PDF。
 *
 * 頁面上其餘所有互動（sign / sign-stamp / reject / undo-reject / nudge /
 * finalize / finance-link / void / delete、以及 SupplementForm 用到的
 * upload-url / supplement）都是寫入動作，磁力 session 的語意是唯讀，
 * 一律不放行——即使畫面上因為 can_delete / can_supplement 算出來剛好是
 * true（那兩個欄位目前是用 DB 裡的真實 role 算的，見 route.ts 138/147-149
 * 行，不看 magic_scope），按鈕點下去也會在這一層被擋掉。
 */
export const MAGIC_SCOPE_ALLOWLIST: readonly MagicAllowlistEntry[] = [
  {
    describe: '財務長唯讀頁面殼',
    method: 'GET',
    pattern: new RegExp(`^/finance/signoff/(${UUID_SEGMENT})$`),
  },
  {
    describe: '財務長唯讀文件詳情 + signed PDF URL',
    method: 'GET',
    pattern: new RegExp(`^/api/board/signoff/(${UUID_SEGMENT})$`),
  },
];

/**
 * 帶 magic_scope 的 session 打這個 (method, pathname) 是否放行。
 *
 * 只有「方法相符 + path 命中某條 pattern + pattern 抓出的 document id
 * 與 claim 裡的 document_id 相符（不分大小寫）」才回 true。path 前綴相符
 * 但 id 不符（想用同一條連結存取別的文件）一律 false。
 */
export function isMagicScopeAllowed(
  method: string,
  pathname: string,
  claimDocumentId: string,
): boolean {
  return MAGIC_SCOPE_ALLOWLIST.some((entry) => {
    if (entry.method !== method) return false;
    const match = entry.pattern.exec(pathname);
    if (!match) return false;
    return match[1].toLowerCase() === claimDocumentId.toLowerCase();
  });
}
