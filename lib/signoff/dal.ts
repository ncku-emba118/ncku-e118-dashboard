/**
 * 簽核模組 — server-only 資料存取層（service role）。
 *
 * SIGNOFF-ARCHITECTURE.md §5 / §6 / §9 + Codex #1。
 * service_role key 只透過 getServerClient（lib/supabase/server）取得；
 * 所有 mutation route 應先過 requireSignoffAccess（access.ts）再呼叫此層。
 */
import 'server-only';
import { getServerClient } from '../supabase/server';
import { SIGNOFF_BUCKET, SIGNED_READ_URL_TTL_S } from './constants';
import { retryResult, isTransientStorageError } from './retry';

export type SignoffStatus = 'routing' | 'approved' | 'rejected' | 'voided';
export type AssignmentStatus = 'pending' | 'signed' | 'rejected';

export type AttachmentMeta = {
  object_path: string;
  sha256: string;
  mime: string;
  name: string;
};

export type SignoffDocumentRow = {
  id: string;
  title: string;
  amount: string | null;
  currency: string;
  purpose: string | null;
  applicant: string | null;
  created_by: string;
  owner_dept_id: string;
  category: string | null;
  attachments: AttachmentMeta[];
  signoff_sheet_object_path: string;
  assignment_manifest_sha256: string;
  flow_type: 'parallel' | 'sequential';
  status: SignoffStatus;
  final_pdf_object_path: string | null;
  final_pdf_sha256: string | null;
  supersedes_document_id: string | null;
  due_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SignoffAssignmentRow = {
  id: string;
  document_id: string;
  signer_account_id: string;
  role_label: string;
  sequence_order: number | null;
  slot_page: number;
  slot_x: number;
  slot_y: number;
  slot_w: number;
  slot_h: number;
  status: AssignmentStatus;
  reject_reason: string | null;
  acted_at: string | null;
  // active_challenge_* 不外洩，access/detail 不 select
};

export type DocumentBundle = {
  doc: SignoffDocumentRow;
  assignments: (SignoffAssignmentRow & { signer_username: string | null })[];
};

// ── audit ────────────────────────────────────────────────
export type AuditEvent =
  | 'viewed'
  | 'challenge_issued'
  | 'upload_url_issued'
  | 'nudged';

export async function recordAudit(args: {
  documentId: string | null;
  accountId: string;
  eventType: AuditEvent;
  ipHash?: string | null;
  ipHashVersion?: number | null;
  userAgent?: string | null;
  traceId: string;
  detail?: Record<string, unknown>;
}) {
  const supabase = getServerClient();
  return supabase.from('signoff_audit').insert({
    document_id: args.documentId,
    account_id: args.accountId,
    event_type: args.eventType,
    ip_hash: args.ipHash ?? null,
    ip_hash_version: args.ipHashVersion ?? null,
    user_agent: args.userAgent ?? null,
    trace_id: args.traceId,
    detail: args.detail ?? {},
  });
}

// ── 讀取 ──────────────────────────────────────────────────
export async function getDocumentBundle(
  documentId: string,
): Promise<{ data: DocumentBundle | null; error: string | null }> {
  const supabase = getServerClient();
  const { data: doc, error: docErr } = await supabase
    .from('signoff_documents')
    .select('*')
    .eq('id', documentId)
    .maybeSingle();
  if (docErr) return { data: null, error: docErr.message };
  if (!doc) return { data: null, error: null };

  const { data: assigns, error: aErr } = await supabase
    .from('signoff_assignments')
    .select(
      'id, document_id, signer_account_id, role_label, sequence_order, slot_page, slot_x, slot_y, slot_w, slot_h, status, reject_reason, acted_at, accounts(username)',
    )
    .eq('document_id', documentId);
  if (aErr) return { data: null, error: aErr.message };

  const assignments = (assigns ?? []).map((a) => {
    const { accounts, ...rest } = a as typeof a & {
      accounts: { username: string } | null;
    };
    return {
      ...(rest as unknown as SignoffAssignmentRow),
      signer_username: accounts?.username ?? null,
    };
  });

  return {
    data: { doc: doc as SignoffDocumentRow, assignments },
    error: null,
  };
}

/** 收件匣：指派給我、pending、且文件仍在簽核中（!inner + 過濾 doc 狀態，
 *  避免退回/作廢/已核准的文件殘留在待簽清單 — Codex P1）。 */
export async function listInbox(accountId: string) {
  const supabase = getServerClient();
  return supabase
    .from('signoff_assignments')
    .select(
      'role_label, status, signoff_documents!inner(id, title, amount, currency, status, created_at, due_at)',
    )
    .eq('signer_account_id', accountId)
    .eq('status', 'pending')
    .eq('signoff_documents.status', 'routing')
    .order('created_at', { ascending: false });
}

/** 我發起的文件 */
export async function listCreatedBy(accountId: string) {
  const supabase = getServerClient();
  return supabase
    .from('signoff_documents')
    .select('id, title, amount, currency, status, created_at, due_at')
    .eq('created_by', accountId)
    .order('created_at', { ascending: false })
    .limit(100);
}

// ── 建立（atomic RPC）─────────────────────────────────────
export type CreateDocPayload = {
  id: string; // app 預先產的 doc UUID（sheet 路徑需要）
  title: string;
  amount: string | null;
  currency: string;
  purpose: string | null;
  applicant: string | null;
  created_by: string;
  owner_dept_id: string;
  category?: string | null;
  client_request_id: string;
  attachments: AttachmentMeta[];
  signoff_sheet_object_path: string;
  assignment_manifest_sha256: string;
  flow_type: 'parallel' | 'sequential';
  supersedes_document_id?: string | null;
  due_at?: string | null;
};

export type CreateAssignment = {
  signer_account_id: string;
  role_label: string;
  sequence_order: number | null;
  slot_page: number;
  slot_x: number;
  slot_y: number;
  slot_w: number;
  slot_h: number;
};

export async function createSignoffDocument(args: {
  doc: CreateDocPayload;
  assignments: CreateAssignment[];
  audit: { ip_hash: string | null; ip_hash_version: number | null; user_agent: string | null; trace_id: string };
}): Promise<{ documentId: string | null; error: string | null }> {
  const supabase = getServerClient();
  const { data, error } = await supabase.rpc('signoff_create_document', {
    p_doc: args.doc,
    p_assignments: args.assignments,
    p_audit: args.audit,
  });
  if (error) return { documentId: null, error: error.message };
  return { documentId: data as string, error: null };
}

// ── challenge（防重放）─────────────────────────────────────
export async function setAssignmentChallenge(args: {
  assignmentId: string;
  documentId: string;
  signerAccountId: string;
  nonce: string;
  expiresAt: string;
}): Promise<{ ok: boolean; error: string | null }> {
  const supabase = getServerClient();
  const { error, count } = await supabase
    .from('signoff_assignments')
    .update(
      {
        active_challenge_nonce: args.nonce,
        active_challenge_expires_at: args.expiresAt,
      },
      { count: 'exact' },
    )
    .eq('id', args.assignmentId)
    .eq('document_id', args.documentId)
    .eq('signer_account_id', args.signerAccountId)
    .eq('status', 'pending');
  if (error) return { ok: false, error: error.message };
  return { ok: (count ?? 0) === 1, error: null };
}

// ── 簽署 / 退回 / 作廢（atomic RPC）────────────────────────
export async function signAssignment(args: {
  assignmentId: string;
  documentId: string;
  signerAccountId: string;
  signaturePngPath: string;
  signatureSha256: string;
  nonce: string;
  comment: string | null;
  ipHash: string;
  ipHashVersion: number;
  userAgent: string | null;
  traceId: string;
}): Promise<{ finalized: boolean | null; error: string | null }> {
  const supabase = getServerClient();
  const { data, error } = await supabase.rpc('signoff_sign', {
    p_assignment_id: args.assignmentId,
    p_document_id: args.documentId,
    p_signer_account_id: args.signerAccountId,
    p_signature_png_path: args.signaturePngPath,
    p_signature_sha256: args.signatureSha256,
    p_nonce: args.nonce,
    p_comment: args.comment,
    p_ip_hash: args.ipHash,
    p_ip_hash_version: args.ipHashVersion,
    p_user_agent: args.userAgent,
    p_trace_id: args.traceId,
  });
  if (error) return { finalized: null, error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  return { finalized: !!row?.finalized, error: null };
}

export async function rejectAssignment(args: {
  assignmentId: string;
  documentId: string;
  signerAccountId: string;
  reason: string;
  ipHash: string;
  ipHashVersion: number;
  userAgent: string | null;
  traceId: string;
}): Promise<{ error: string | null }> {
  const supabase = getServerClient();
  const { error } = await supabase.rpc('signoff_reject', {
    p_assignment_id: args.assignmentId,
    p_document_id: args.documentId,
    p_signer_account_id: args.signerAccountId,
    p_reason: args.reason,
    p_ip_hash: args.ipHash,
    p_ip_hash_version: args.ipHashVersion,
    p_user_agent: args.userAgent,
    p_trace_id: args.traceId,
  });
  return { error: error?.message ?? null };
}

export async function voidDocument(args: {
  documentId: string;
  accountId: string;
  ipHash: string;
  ipHashVersion: number;
  userAgent: string | null;
  traceId: string;
}): Promise<{ error: string | null }> {
  const supabase = getServerClient();
  const { error } = await supabase.rpc('signoff_void', {
    p_document_id: args.documentId,
    p_account_id: args.accountId,
    p_ip_hash: args.ipHash,
    p_ip_hash_version: args.ipHashVersion,
    p_user_agent: args.userAgent,
    p_trace_id: args.traceId,
  });
  return { error: error?.message ?? null };
}

// ── Storage（private bucket、server 分配 path、短效 signed URL）─────
export async function createSignedUploadUrl(
  path: string,
): Promise<{ data: { signedUrl: string; token: string; path: string } | null; error: string | null }> {
  const supabase = getServerClient();
  const { data, error } = await supabase.storage
    .from(SIGNOFF_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) return { data: null, error: error?.message ?? 'no signed url' };
  return { data: { signedUrl: data.signedUrl, token: data.token, path: data.path }, error: null };
}

export async function createSignedReadUrl(
  path: string,
  expiresIn: number = SIGNED_READ_URL_TTL_S,
): Promise<{ url: string | null; error: string | null }> {
  const supabase = getServerClient();
  const { data, error } = await supabase.storage
    .from(SIGNOFF_BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error || !data) return { url: null, error: error?.message ?? 'no signed url' };
  return { url: data.signedUrl, error: null };
}

export async function downloadObject(
  path: string,
): Promise<{ bytes: Buffer | null; error: string | null }> {
  const supabase = getServerClient();
  const { data, error } = await supabase.storage.from(SIGNOFF_BUCKET).download(path);
  if (error || !data) return { bytes: null, error: error?.message ?? 'download failed' };
  const buf = Buffer.from(await data.arrayBuffer());
  return { bytes: buf, error: null };
}

export async function uploadObject(
  path: string,
  bytes: Buffer | Uint8Array,
  contentType: string,
  upsert = false,
): Promise<{ error: string | null }> {
  const supabase = getServerClient();
  // 大檔（簽核 PDF ≈ 4.8MB、subset:false 內嵌完整中文字型）上傳偶發
  // 'This operation was aborted'：慢上傳逼近 Netlify function timeout / 網路抖動。
  // 對暫時性錯誤重試最多 3 次；重試時強制 upsert，避免前一次中斷殘留造成「已存在」。
  return retryResult(
    async (attempt) => {
      const { error } = await supabase.storage
        .from(SIGNOFF_BUCKET)
        .upload(path, bytes, { contentType, upsert: upsert || attempt > 1 });
      return { error: error?.message ?? null };
    },
    {
      maxAttempts: 3,
      shouldRetry: (r) => isTransientStorageError(r.error),
      delayMs: (n) => 500 * (n - 1), // 第 2 次等 500ms、第 3 次等 1000ms
    },
  );
}

// ── accounts 查詢（驗指派人存在 + 取 username）──────────────
export type AccountLite = {
  id: string;
  username: string;
  role: 'super' | 'dept';
  home_dept_id: string | null;
};

export async function listAccounts(): Promise<{
  data: AccountLite[] | null;
  error: string | null;
}> {
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from('accounts')
    .select('id, username, role, home_dept_id')
    .order('username');
  if (error) return { data: null, error: error.message };
  return { data: (data ?? []) as AccountLite[], error: null };
}

export async function getAccountsByIds(
  ids: string[],
): Promise<{ data: AccountLite[] | null; error: string | null }> {
  if (ids.length === 0) return { data: [], error: null };
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from('accounts')
    .select('id, username, role, home_dept_id')
    .in('id', ids);
  if (error) return { data: null, error: error.message };
  return { data: (data ?? []) as AccountLite[], error: null };
}

// ── finalize：取所有簽名 + 對應 slot/姓名（合成最終 PDF 用）──
export type SignatureForFinalize = {
  signature_png_path: string;
  comment: string | null;
  signed_at: string;
  signer_username: string | null;
  role_label: string;
  slot_page: number;
  slot_x: number;
  slot_y: number;
  slot_w: number;
  slot_h: number;
};

export async function getSignaturesForFinalize(
  documentId: string,
): Promise<{ data: SignatureForFinalize[] | null; error: string | null }> {
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from('signoff_signatures')
    .select(
      'signature_png_path, comment, signed_at, signoff_assignments(role_label, slot_page, slot_x, slot_y, slot_w, slot_h, accounts(username))',
    )
    .eq('document_id', documentId);
  if (error) return { data: null, error: error.message };
  const rows = (data ?? []).map((r) => {
    const a = (r as { signoff_assignments: unknown }).signoff_assignments as {
      role_label: string;
      slot_page: number;
      slot_x: number;
      slot_y: number;
      slot_w: number;
      slot_h: number;
      accounts: { username: string } | null;
    };
    return {
      signature_png_path: (r as { signature_png_path: string }).signature_png_path,
      comment: (r as { comment: string | null }).comment,
      signed_at: (r as { signed_at: string }).signed_at,
      signer_username: a?.accounts?.username ?? null,
      role_label: a?.role_label,
      slot_page: a?.slot_page,
      slot_x: a?.slot_x,
      slot_y: a?.slot_y,
      slot_w: a?.slot_w,
      slot_h: a?.slot_h,
    } as SignatureForFinalize;
  });
  return { data: rows, error: null };
}

export async function setFinalPdf(
  documentId: string,
  finalPath: string,
  finalSha256: string,
): Promise<{ error: string | null }> {
  const supabase = getServerClient();
  const { error } = await supabase
    .from('signoff_documents')
    .update({ final_pdf_object_path: finalPath, final_pdf_sha256: finalSha256 })
    .eq('id', documentId);
  return { error: error?.message ?? null };
}

// ── 經費中心（公開透明頁）資料 ──────────────────────────────
export type FinanceSettings = { income_total: string; term_label: string };
export type FinanceExpense = {
  id: string;
  title: string;
  amount: string | null;
  category: string | null;
  status: SignoffStatus;
  owner_dept_id: string;
  created_at: string;
};
export type FinanceReportRow = {
  id: string;
  period_label: string;
  object_path: string;
  created_at: string;
};

export async function getFinanceSettings(): Promise<FinanceSettings> {
  const supabase = getServerClient();
  const { data } = await supabase
    .from('finance_settings')
    .select('income_total, term_label')
    .eq('id', 1)
    .maybeSingle();
  return {
    income_total: (data?.income_total as string) ?? '0',
    term_label: (data?.term_label as string) ?? '',
  };
}

/** 公開透明用：只回安全欄位（不含憑證/簽名），routing + approved 的支出 */
export async function listFinanceExpenses(): Promise<FinanceExpense[]> {
  const supabase = getServerClient();
  const { data } = await supabase
    .from('signoff_documents')
    .select('id, title, amount, category, status, owner_dept_id, created_at')
    .in('status', ['routing', 'approved'])
    .order('created_at', { ascending: false })
    .limit(1000); // 班級量遠低於此；總計需涵蓋完整集合（Codex P1）
  return (data ?? []) as FinanceExpense[];
}

export async function listFinanceReports(): Promise<FinanceReportRow[]> {
  const supabase = getServerClient();
  const { data } = await supabase
    .from('finance_reports')
    .select('id, period_label, object_path, created_at')
    .order('created_at', { ascending: false })
    .limit(24);
  return (data ?? []) as FinanceReportRow[];
}

// ── 收入明細帳本（feature B）：財務長 / super 記帳；公開頁加總顯示 ──
export type FinanceIncome = {
  id: string;
  occurred_on: string;
  category: string;
  amount: string;
  note: string | null;
  created_at: string;
};

export async function listFinanceIncome(): Promise<FinanceIncome[]> {
  const supabase = getServerClient();
  const { data } = await supabase
    .from('finance_income')
    .select('id, occurred_on, category, amount, note, created_at')
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1000); // 班級量遠低於此；總計需涵蓋完整集合
  return (data ?? []) as FinanceIncome[];
}

export async function createFinanceIncome(input: {
  occurred_on: string;
  category: string;
  amount: number;
  note: string | null;
  created_by: string;
}): Promise<{ id: string | null; error: string | null }> {
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from('finance_income')
    .insert({
      occurred_on: input.occurred_on,
      category: input.category,
      amount: input.amount,
      note: input.note,
      created_by: input.created_by,
    })
    .select('id')
    .single();
  if (error) return { id: null, error: error.message };
  return { id: data.id as string, error: null };
}

export async function deleteFinanceIncome(
  id: string,
  deletedBy: string,
): Promise<{ error: string | null }> {
  const supabase = getServerClient();
  // 稽核：刪除前先 snapshot → 寫 append-only tombstone → 再硬刪（Codex 審查 #6）。
  const { data: row, error: selErr } = await supabase
    .from('finance_income')
    .select('id, occurred_on, category, amount, note, created_by')
    .eq('id', id)
    .maybeSingle();
  if (selErr) return { error: selErr.message };
  if (!row) return { error: null }; // 已不存在 → 視為刪除成功（idempotent）

  const { error: logErr } = await supabase.from('finance_income_deletion_log').insert({
    income_id: row.id,
    occurred_on: row.occurred_on,
    category: row.category,
    amount: row.amount,
    note: row.note,
    original_created_by: row.created_by,
    deleted_by: deletedBy,
  });
  if (logErr) return { error: logErr.message };

  const { error: delErr } = await supabase.from('finance_income').delete().eq('id', id);
  return { error: delErr?.message ?? null };
}

// ── 刪除（super only）：受控 admin 刪除 RPC + storage 清檔 ──
export async function deleteSignoffDocument(args: {
  documentId: string;
  accountId: string;
  ipHash: string;
  ipHashVersion: number;
  userAgent: string | null;
  traceId: string;
}): Promise<{ paths: string[] | null; error: string | null }> {
  const supabase = getServerClient();
  const { data, error } = await supabase.rpc('signoff_delete', {
    p_document_id: args.documentId,
    p_account_id: args.accountId,
    p_ip_hash: args.ipHash,
    p_ip_hash_version: args.ipHashVersion,
    p_user_agent: args.userAgent,
    p_trace_id: args.traceId,
  });
  if (error) return { paths: null, error: error.message };
  return { paths: (data as string[]) ?? [], error: null };
}

export async function removeObjects(paths: string[]): Promise<{ error: string | null }> {
  if (paths.length === 0) return { error: null };
  const supabase = getServerClient();
  const { error } = await supabase.storage.from(SIGNOFF_BUCKET).remove(paths);
  return { error: error?.message ?? null };
}
