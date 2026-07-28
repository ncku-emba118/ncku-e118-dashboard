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
  setAssignmentMagicToken,
} from '../signoff/dal';

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
