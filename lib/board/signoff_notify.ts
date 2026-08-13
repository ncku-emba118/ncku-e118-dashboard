/**
 * 簽核 LINE 化 — 班網 → Bot → LINE 幹部單推卡片（規格 §1-3）。
 *
 * 建單／重新送簽完成後呼叫：為每筆 pending 指派產一次性 magic token（庫內只存
 * sha256），再 fire-and-forget POST 給 GAS webhook（沿用 lib/board/line_push.ts
 * 模式：secret 放 body、10s timeout、失敗只 log 不影響建單）。
 *
 * 通知 payload 是班網 ↔ Bot 的契約，鍵名與規格 §1-3 完全對齊：
 *   { type:"approval_requested", secret,
 *     doc:{ id, serial, title, amount, dept, reason, deadline, assign_total },
 *     targets:[ { account_id, role_label, magic_url } ] }
 *
 * 核准／退回寫入永遠走網頁 session，bot 只發通知；此模組不經手任何簽核寫入。
 */
import 'server-only';
import crypto from 'node:crypto';
import { getEnv } from '../env';
import { deptInfo } from '../depts';
import { MAGIC_TOKEN_TTL_MS } from '../signoff/constants';
import {
  getDocumentForNotify,
  listAccounts,
  setAssignmentMagicToken,
  setDocumentFinanceMagicToken,
  clearDocumentFinanceMagicToken,
  type AccountLite,
} from '../signoff/dal';
import { ACTIVITIES } from '../budget/data';

const PUBLIC_DASHBOARD_BASE = 'https://emba.aqualux.dev';

export type ApprovalNotifyResult =
  | { ok: true; status: number; targets: number }
  | {
      ok: false;
      reason:
        | 'no_url'
        | 'no_secret'
        | 'load_failed'
        | 'no_targets'
        | 'http_error'
        | 'notify_degraded'
        | 'network_error';
      detail?: string;
    };

/**
 * 為單張簽核文件推「請簽核」卡片給每位待簽幹部。
 *
 * 設計成「即使全程失敗也絕不 throw」——呼叫端（建單 route）在回 201 前 await 本函式
 * （承 line_push 慣例：await 但失敗不連坐主流程），故此處任何錯誤都收斂成 result。
 * 之所以 await 而非真正 detached fire-and-forget：serverless 回應後 lambda 可能凍結，
 * detached promise 會來不及寫 token / 送出通知。await + try 內化失敗＝兩者兼顧。
 */
export async function notifyApprovalRequested(
  documentId: string,
): Promise<ApprovalNotifyResult> {
  const env = getEnv();
  const url = env.LINE_BOT_WEBHOOK_URL;
  const secret = env.BOT_SYNC_SECRET;

  // fail-soft：未接好 bot（dev / 尚未設定）時直接跳過，不視為錯誤路徑。
  // Codex #9：明確 warn 記錄（維持不 throw、不阻擋建單），避免生產環境靜默略過簽核通知。
  if (!url) {
    console.warn('[signoff.notify.skipped]', { reason: 'no_url', detail: '缺 LINE_BOT_WEBHOOK_URL，跳過簽核通知（不阻擋建單）' });
    return { ok: false, reason: 'no_url' };
  }
  if (!secret) {
    console.warn('[signoff.notify.skipped]', { reason: 'no_secret', detail: '缺 BOT_SYNC_SECRET，跳過簽核通知（不阻擋建單）' });
    return { ok: false, reason: 'no_secret' };
  }

  const { data, error } = await getDocumentForNotify(documentId);
  if (error || !data) {
    return { ok: false, reason: 'load_failed', detail: error ?? 'not found' };
  }

  const pending = data.assignments.filter((a) => a.status === 'pending');
  if (pending.length === 0) return { ok: false, reason: 'no_targets' };

  // 到期＝min(now+14天, 單據期限)。單據無期限（due_at 為 null）時單純取 14 天。
  const now = Date.now();
  let expiresMs = now + MAGIC_TOKEN_TTL_MS;
  if (data.doc.due_at) {
    const dueMs = new Date(data.doc.due_at).getTime();
    if (Number.isFinite(dueMs) && dueMs < expiresMs) expiresMs = dueMs;
  }
  const expiresAt = new Date(expiresMs).toISOString();

  // 逐筆產 token（256-bit 隨機）→ 寫 sha256 → 組 target。改為並行寫入（Codex #8）：
  // 多幹部時避免序列往返累加延遲。單筆寫入失敗只略過該人、不整批中斷（其他幹部仍收卡片）。
  type Target = { account_id: string; role_label: string; magic_url: string };
  const results = await Promise.all(
    pending.map(async (a): Promise<Target | null> => {
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const res = await setAssignmentMagicToken({
        assignmentId: a.id,
        documentId,
        signerAccountId: a.signer_account_id,
        tokenHash,
        expiresAt,
      });
      if (res.error || !res.ok) {
        console.error('[signoff.notify.token_write_failed]', {
          document_id: documentId,
          assignment_id: a.id,
          e: res.error,
        });
        return null;
      }
      const magicUrl = `${PUBLIC_DASHBOARD_BASE}/api/board/signoff/magic/${token}?openExternalBrowser=1`;
      return { account_id: a.signer_account_id, role_label: a.role_label, magic_url: magicUrl };
    }),
  );
  const targets = results.filter((t): t is Target => t !== null);
  if (targets.length === 0) return { ok: false, reason: 'no_targets' };

  const payload = {
    type: 'approval_requested' as const,
    secret,
    doc: {
      id: data.doc.id,
      // 無專屬單號欄位：結算單請款用結算單編號，其餘取 doc id 前 8 碼大寫作對照碼。
      serial: data.doc.settlement_no ?? data.doc.id.slice(0, 8).toUpperCase(),
      title: data.doc.title,
      amount: data.doc.amount, // 原始數字字串；千分位由 bot 端格式化
      dept: deptInfo(data.doc.owner_dept_id).name, // 顯示用中文部門名（承 line_push 慣例）
      reason: data.doc.purpose,
      deadline: data.doc.due_at, // ISO 字串或 null
      assign_total: data.assignments.length,
    },
    targets,
  };

  try {
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 10_000); // GAS 可能慢、給 10s
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    clearTimeout(timeoutId);
    const bodyText = await r.text().catch(() => '');
    if (!r.ok) {
      console.warn('[signoff.notify.notify_degraded]', {
        document_id: documentId,
        reason: 'http_error',
        status: r.status,
        targets: targets.length,
        body: bodyText.slice(0, 200),
      });
      return { ok: false, reason: 'http_error', detail: `HTTP ${r.status} ${bodyText.slice(0, 200)}` };
    }
    // 解析 GAS approval_requested 分支回傳的 { ok, pushed, failed[] }（schema 由 bot 端提供）。
    // body.ok!==true 或 failed 非空＝部分/全部推播失敗：記 notify_degraded 摘要但不阻擋建單（Codex #3）。
    let parsed: unknown = null;
    try {
      parsed = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      parsed = null;
    }
    const obj = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
    const okFlag = obj !== null && obj.ok === true;
    const pushedVal = obj?.pushed;
    const pushed = typeof pushedVal === 'number' ? pushedVal : null;
    const failedVal = obj?.failed;
    const failedCount = Array.isArray(failedVal) ? failedVal.length : 0;
    if (!okFlag || failedCount > 0) {
      console.warn('[signoff.notify.notify_degraded]', {
        document_id: documentId,
        targets: targets.length,
        pushed,
        failed: failedCount,
        body: bodyText.slice(0, 200),
      });
      return {
        ok: false,
        reason: 'notify_degraded',
        detail: `pushed=${pushed ?? '?'} failed=${failedCount}`,
      };
    }
    return { ok: true, status: r.status, targets: targets.length };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: 'network_error', detail };
  }
}

// ============================================================
// 全員簽畢通知（approval_completed）
//
// 呼叫時機：sign route 的 if (finalized) 區塊、composeAndStoreFinal 成功之後才呼叫
// （合成請款 PDF 失敗就不發——失敗代表請款單還生不出來，見呼叫端註解）。
//
// 「不會每個人簽完都通知一次」不是本函式自己保證的，是上游 signoff_sign RPC
// （supabase/migrations/0007_signoff.sql）保證：該 RPC 在同一個 transaction 內鎖
// document row FOR UPDATE，並用一條 atomic UPDATE 判斷 finalize-once——
//   UPDATE signoff_documents SET status='approved'
//    WHERE id=... AND status='routing' AND NOT EXISTS(pending assignments)
// 文件整個生命週期裡，這條 UPDATE 的 rowcount 只可能在「壓哨簽完最後一個 pending
// 指派」的那次呼叫命中 1（其餘簽署者呼叫時單據仍有其他 pending、status 已非
// routing，rowcount 必為 0）；RPC 把這個結果以 finalized 回傳，sign route 只在
// finalized===true 那一次呼叫本函式，故本函式對同一份文件全生命週期只會被觸發一次。
//
// 收件人＝財務長：listAccounts() 篩 home_dept_id==='finance'。查無或查到多筆一律
// fail-soft（不新增 DAL、不猜帳號、不比對中文姓名）。
//
// payload 契約比照 approval_requested：
//   { type:"approval_completed", secret,
//     doc:{ id, serial, title, amount, dept, settlement_url, doc_url },
//     target:{ account_id } }
// settlement_url：文件帶 settlement_no 且能在 lib/budget/data.ts 的 ACTIVITIES 查到
// 對應 slug 時才給值（指向免登入公開的結算單頁，財務長可直接下載請款單）；沒帶
// settlement_no、或帶了但查無對應 slug（寧可降級也不給壞連結），一律給 null。
// doc_url：一律嘗試給值，帶財務長專屬下載連結，指向 /finance/signoff/[id]
// （免登入即可看到完整原件與最終 PDF 下載連結）——settlement_url 只在「掛在
// 活動結算單」時才有，doc_url 補上「一般簽核單也要有可點連結」這個缺口。
// bot 端沒有 settlement_url 時應改用 doc_url 當「查看/下載」按鈕的目標。
//
// 敵對審查修正1定案（2026-08-13）：doc_url 這條連結不設 TTL、可重複使用，
// 只能由使用者在 /finance/signoff/[id] 頁面手動按「重新產生下載連結」作廢重發
// （app/api/board/signoff/[id]/finance-link/route.ts）。連結核發／重發的實際
// 邏輯抽成 issueFinanceMagicLink（純粹寫 token）+ regenerateFinanceMagicLink
// （含收件人查找 + 先作廢舊連結），兩處呼叫端（本函式 + finance-link route）
// 共用同一份邏輯，不重複維護。
// ============================================================
export type ApprovalCompletedNotifyResult =
  | { ok: true; status: number }
  | {
      ok: false;
      reason:
        | 'no_url'
        | 'no_secret'
        | 'load_failed'
        | 'recipient_lookup_failed'
        | 'no_recipient'
        | 'ambiguous_recipient'
        | 'http_error'
        | 'notify_degraded'
        | 'network_error';
      detail?: string;
    };

export async function notifyApprovalCompleted(
  documentId: string,
): Promise<ApprovalCompletedNotifyResult> {
  const env = getEnv();
  const url = env.LINE_BOT_WEBHOOK_URL;
  const secret = env.BOT_SYNC_SECRET;

  // fail-soft：未接好 bot（dev / 尚未設定）時直接跳過，不視為錯誤路徑（承 notifyApprovalRequested 慣例）。
  if (!url) {
    console.warn('[signoff.notify_completed.skipped]', { reason: 'no_url', detail: '缺 LINE_BOT_WEBHOOK_URL，跳過完成通知（不影響簽核已完成的事實）' });
    return { ok: false, reason: 'no_url' };
  }
  if (!secret) {
    console.warn('[signoff.notify_completed.skipped]', { reason: 'no_secret', detail: '缺 BOT_SYNC_SECRET，跳過完成通知（不影響簽核已完成的事實）' });
    return { ok: false, reason: 'no_secret' };
  }

  const { data, error } = await getDocumentForNotify(documentId);
  if (error || !data) {
    return { ok: false, reason: 'load_failed', detail: error ?? 'not found' };
  }

  // 收件人＝財務長；查無 / 查到多筆都不硬猜，fail-soft 收斂並記警告，絕不亂送。
  const financeLookup = await findSoleFinanceOfficer();
  if (!financeLookup.ok) {
    console.warn(`[signoff.notify_completed.${financeLookup.reason}]`, {
      document_id: documentId,
      detail: financeLookup.detail,
    });
    return { ok: false, reason: financeLookup.reason, detail: financeLookup.detail };
  }
  const financeAccount = financeLookup.account;
  const financeAccountId = financeAccount.id;

  // settlement_url：只有帶 settlement_no 且查得到對應 slug 才給值；查不到寧可降級
  // 給 null 也不給壞連結（見檔頭說明）。
  let settlementUrl: string | null = null;
  if (data.doc.settlement_no) {
    const activity = ACTIVITIES.find((a) => a.settlement?.no === data.doc.settlement_no);
    if (activity) {
      settlementUrl = `${PUBLIC_DASHBOARD_BASE}/budget/settlement/${activity.slug}`;
    } else {
      console.warn('[signoff.notify_completed.settlement_slug_not_found]', {
        document_id: documentId,
        settlement_no: data.doc.settlement_no,
      });
    }
  }

  // doc_url：財務長專屬下載連結（見檔頭「敵對審查修正1定案」說明，不設 TTL、
  // 可重複使用）。寫入失敗就不給連結（寧可 doc_url 為 null、由 bot 端退化成
  // 純文字通知，也不給壞連結）。
  const docUrl = await issueFinanceMagicLink(documentId, financeAccount);
  if (!docUrl) {
    console.error('[signoff.notify_completed.doc_url_token_write_failed]', { document_id: documentId });
  }

  const payload = {
    type: 'approval_completed' as const,
    secret,
    doc: {
      id: data.doc.id,
      // 無專屬單號欄位時比照 approval_requested：取 doc id 前 8 碼大寫作對照碼。
      serial: data.doc.settlement_no ?? data.doc.id.slice(0, 8).toUpperCase(),
      title: data.doc.title,
      amount: data.doc.amount, // 原始數字字串；千分位由 bot 端格式化
      dept: deptInfo(data.doc.owner_dept_id).name,
      settlement_url: settlementUrl,
      doc_url: docUrl,
    },
    target: { account_id: financeAccountId },
  };

  try {
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 10_000); // GAS 可能慢、給 10s
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    clearTimeout(timeoutId);
    const bodyText = await r.text().catch(() => '');
    if (!r.ok) {
      console.warn('[signoff.notify_completed.notify_degraded]', {
        document_id: documentId,
        reason: 'http_error',
        status: r.status,
        body: bodyText.slice(0, 200),
      });
      return { ok: false, reason: 'http_error', detail: `HTTP ${r.status} ${bodyText.slice(0, 200)}` };
    }
    // 解析 GAS approval_completed 分支回傳的 { ok, pushed, failed[] }（同一份結構化契約）。
    let parsed: unknown = null;
    try {
      parsed = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      parsed = null;
    }
    const obj = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
    const okFlag = obj !== null && obj.ok === true;
    const pushedVal = obj?.pushed;
    const pushed = typeof pushedVal === 'number' ? pushedVal : null;
    const failedVal = obj?.failed;
    const failedCount = Array.isArray(failedVal) ? failedVal.length : 0;
    if (!okFlag || failedCount > 0) {
      console.warn('[signoff.notify_completed.notify_degraded]', {
        document_id: documentId,
        pushed,
        failed: failedCount,
        body: bodyText.slice(0, 200),
      });
      return {
        ok: false,
        reason: 'notify_degraded',
        detail: `pushed=${pushed ?? '?'} failed=${failedCount}`,
      };
    }
    return { ok: true, status: r.status };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: 'network_error', detail };
  }
}

// ============================================================
// 財務長下載連結（doc_url）共用邏輯（敵對審查修正1）
//
// 抽成獨立函式的原因：連結不設 TTL、可重複使用，除了 notifyApprovalCompleted
// 首次核發之外，使用者還能在 /finance/signoff/[id] 頁面按「重新產生下載連結」
// 手動作廢重發（app/api/board/signoff/[id]/finance-link/route.ts）——兩處都要
// 「找出唯一財務長」與「寫入 token」，抽出來避免邏輯漂移。
// ============================================================

export type FinanceOfficerLookupResult =
  | { ok: true; account: AccountLite }
  | { ok: false; reason: 'recipient_lookup_failed' | 'no_recipient' | 'ambiguous_recipient'; detail?: string };

/**
 * 找出「現在」唯一的財務長帳號；查無 / 查到多筆一律 fail-soft，不硬猜。
 *
 * export：0027（財務長強制簽核人）建單 route 沿用同一套判定，不另發明一套
 * 「誰是財務長」邏輯——兩處語意不同（這裡查無/多筆是「不通知」fail-soft，
 * 建單那邊查無/多筆是「擋下建立」明確錯誤），但「怎麼找到財務長」本身共用。
 */
export async function findSoleFinanceOfficer(): Promise<FinanceOfficerLookupResult> {
  const accountsRes = await listAccounts();
  if (accountsRes.error || !accountsRes.data) {
    return { ok: false, reason: 'recipient_lookup_failed', detail: accountsRes.error ?? 'listAccounts failed' };
  }
  const financeOfficers = accountsRes.data.filter((a) => a.home_dept_id === 'finance');
  if (financeOfficers.length === 0) return { ok: false, reason: 'no_recipient' };
  if (financeOfficers.length > 1) {
    return { ok: false, reason: 'ambiguous_recipient', detail: `count=${financeOfficers.length}` };
  }
  return { ok: true, account: financeOfficers[0] };
}

/**
 * 寫入財務長下載連結的 token（只做這一步：256-bit 隨機 → sha256 存庫 → 快照
 * 核發當下的 session_version → 組 URL）。收件人查找交給呼叫端。
 * 寫入失敗回 null，呼叫端各自決定要不要視為致命錯誤。
 */
async function issueFinanceMagicLink(
  documentId: string,
  financeAccount: Pick<AccountLite, 'id' | 'session_version'>,
): Promise<string | null> {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const tokenWrite = await setDocumentFinanceMagicToken({
    documentId,
    accountId: financeAccount.id,
    tokenHash,
    issuedSessionVersion: financeAccount.session_version,
  });
  if (tokenWrite.error || !tokenWrite.ok) return null;
  return `${PUBLIC_DASHBOARD_BASE}/api/board/signoff/magic/${token}?openExternalBrowser=1`;
}

export type RegenerateFinanceLinkResult =
  | { ok: true; url: string }
  | {
      ok: false;
      reason: 'recipient_lookup_failed' | 'no_recipient' | 'ambiguous_recipient' | 'token_write_failed';
      detail?: string;
    };

/**
 * 供 /api/board/signoff/[id]/finance-link route 使用：使用者手動按「重新產生
 * 下載連結」時的完整流程——先找出現在的財務長、清空舊 token（唯一作廢手段，
 * 見 dal.ts clearDocumentFinanceMagicToken），再核發新的。
 *
 * 先清後發，不是先發後清：清除失敗 best-effort（只記 log 不擋），因為新 token
 * 寫入時 hash 欄位本來就會被整列覆蓋，舊 hash 反正讀不到了；先清是為了讓
 * 「使用者按下這顆鍵＝舊連結立刻失效」這件事語意上更明確、也更早發生。
 */
export async function regenerateFinanceMagicLink(documentId: string): Promise<RegenerateFinanceLinkResult> {
  const lookup = await findSoleFinanceOfficer();
  if (!lookup.ok) {
    console.warn(`[signoff.finance_link.${lookup.reason}]`, { document_id: documentId, detail: lookup.detail });
    return lookup;
  }

  const cleared = await clearDocumentFinanceMagicToken(documentId);
  if (cleared.error) {
    console.error('[signoff.finance_link.clear_old_failed]', { document_id: documentId, e: cleared.error });
  }

  const url = await issueFinanceMagicLink(documentId, lookup.account);
  if (!url) {
    console.error('[signoff.finance_link.token_write_failed]', { document_id: documentId });
    return { ok: false, reason: 'token_write_failed' };
  }
  return { ok: true, url };
}
