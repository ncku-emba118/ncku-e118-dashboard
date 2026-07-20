/**
 * 簽核模組 — server-only 資料存取層（service role）。
 *
 * SIGNOFF-ARCHITECTURE.md §5 / §6 / §9 + Codex #1。
 * service_role key 只透過 getServerClient（lib/supabase/server）取得；
 * 所有 mutation route 應先過 requireSignoffAccess（access.ts）再呼叫此層。
 */
import 'server-only';
import { getServerClient } from '../supabase/server';
import { SIGNOFF_BUCKET, SIGNED_READ_URL_TTL_S, MAX_SUPPLEMENTS_PER_DOC } from './constants';
import { retryResult, isTransientStorageError } from './retry';

export type SignoffStatus = 'routing' | 'approved' | 'rejected' | 'voided';
export type AssignmentStatus = 'pending' | 'signed' | 'rejected';

export type AttachmentMeta = {
  object_path: string;
  sha256: string;
  mime: string;
  name: string;
  /** 類型標籤（報價單/請款單/…）；0019 起新增，舊資料無此欄 */
  label?: string;
  /** 單張說明；0019 起新增，舊資料無此欄 */
  caption?: string;
};

/**
 * 補充資料（0019）。append-only：只追加、不修改既有 attachments，
 * 故既有簽名維持有效。doc_status_at_add / signed_count_at_add 為補充當下的
 * 快照，供畫面標示「於 N 人簽核後補充」。
 */
export type SignoffSupplementRow = {
  id: string;
  document_id: string;
  added_by: string;
  note: string | null;
  attachments: AttachmentMeta[];
  doc_status_at_add: 'routing' | 'approved';
  signed_count_at_add: number;
  created_at: string;
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

/** 公開摘要專用：單次查詢 + 條件鎖 status='approved'，join 簽核格與簽核者姓名。
 *  只回已核准文件，故無論「不存在」或「存在但未核准」都回 data=null（呼叫端一律統一 404，
 *  且兩者查詢成本相同 → 不留 timing oracle）；狀態過濾在 DB 端 atomic 完成，
 *  避免 getDocumentBundle 兩段式查詢在作廢競態下洩漏摘要。回傳欄位即為對外白名單。 */
export async function getPublicApprovedSummary(documentId: string): Promise<{
  data: {
    doc: {
      id: string; title: string; purpose: string | null; amount: string | null;
      currency: string; owner_dept_id: string; status: string;
      created_at: string; updated_at: string;
    };
    assignments: {
      signer_username: string | null; role_label: string;
      status: string; acted_at: string | null;
    }[];
  } | null;
  error: string | null;
}> {
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from('signoff_documents')
    .select(
      'id, title, purpose, amount, currency, owner_dept_id, status, created_at, updated_at, ' +
        'signoff_assignments(role_label, status, acted_at, sequence_order, accounts(username))',
    )
    .eq('id', documentId)
    .eq('status', 'approved')
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: null };

  // 動態 select 字串讓 PostgREST 型別推斷失效，明確 cast 成已知形狀。
  const raw = data as unknown as {
    id: string; title: string; purpose: string | null; amount: string | null;
    currency: string; owner_dept_id: string; status: string;
    created_at: string; updated_at: string;
    signoff_assignments: {
      role_label: string; status: string; acted_at: string | null;
      sequence_order: number | null; accounts: { username: string } | null;
    }[];
  };
  const assignments = (raw.signoff_assignments ?? [])
    .slice()
    .sort((a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0))
    .map((a) => ({
      signer_username: a.accounts?.username ?? null,
      role_label: a.role_label,
      status: a.status,
      acted_at: a.acted_at,
    }));

  return {
    data: {
      doc: {
        id: raw.id,
        title: raw.title,
        purpose: raw.purpose ?? null,
        amount: raw.amount ?? null,
        currency: raw.currency,
        owner_dept_id: raw.owner_dept_id,
        status: raw.status,
        created_at: raw.created_at,
        updated_at: raw.updated_at,
      },
      assignments,
    },
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

/** 我簽核過的紀錄：指派給我、且我已處理（signed / rejected）。依簽核時間倒序，
 *  join 文件拿標題/金額/狀態/建立時間。用於幹部總覽「已簽核紀錄」區塊。 */
export async function listSignedByMe(accountId: string) {
  const supabase = getServerClient();
  return supabase
    .from('signoff_assignments')
    .select(
      'role_label, status, acted_at, signoff_documents!inner(id, title, amount, currency, status, created_at)',
    )
    .eq('signer_account_id', accountId)
    .in('status', ['signed', 'rejected'])
    .order('acted_at', { ascending: false })
    .limit(100);
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

// ── 補充資料（0019，append-only）─────────────────────────────
export async function listSupplements(
  documentId: string,
): Promise<{ rows: SignoffSupplementRow[]; error: string | null }> {
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from('signoff_supplements')
    .select('id,document_id,added_by,note,attachments,doc_status_at_add,signed_count_at_add,created_at')
    .eq('document_id', documentId)
    .order('created_at', { ascending: true })
    // 上限保護：每筆補充的每個附件都要換一個 signed URL，無上限時單次開啟
    // 詳情頁可能對 Storage 打出上千次請求。實務上單一文件不會超過此數。
    .limit(MAX_SUPPLEMENTS_PER_DOC);
  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as SignoffSupplementRow[], error: null };
}

export async function addSupplement(args: {
  documentId: string;
  accountId: string;
  clientRequestId: string;
  note: string | null;
  attachments: AttachmentMeta[];
  audit: { ip_hash: string | null; ip_hash_version: number | null; user_agent: string | null; trace_id: string };
}): Promise<{ supplementId: string | null; error: string | null }> {
  const supabase = getServerClient();
  // 狀態檢查與快照取值在 RPC 內同一 transaction 完成（避免與簽署/作廢競態）
  const { data, error } = await supabase.rpc('signoff_add_supplement', {
    p_document_id: args.documentId,
    p_account_id: args.accountId,
    p_client_request_id: args.clientRequestId,
    p_note: args.note,
    p_attachments: args.attachments,
    p_ip_hash: args.audit.ip_hash,
    p_ip_hash_version: args.audit.ip_hash_version,
    p_user_agent: args.audit.user_agent,
    p_trace_id: args.audit.trace_id,
  });
  if (error) return { supplementId: null, error: error.message };
  return { supplementId: data as string, error: null };
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

/**
 * L1 · LINE Bot 對帳收款連動：每個班務活動一列，以 source_ref ("bot:<活動ID>") UPSERT。
 * 每次對帳完覆蓋成當前已入帳總額 → 冪等、永不重複、自我修正。created_by=null（系統）。
 */
export async function upsertBotIncome(input: {
  source_ref: string;
  occurred_on: string;
  category: string;
  amount: number;
  note: string | null;
}): Promise<{ error: string | null }> {
  const supabase = getServerClient();
  const { error } = await supabase
    .from('finance_income')
    .upsert(
      {
        source_ref: input.source_ref,
        occurred_on: input.occurred_on,
        category: input.category,
        amount: input.amount,
        note: input.note,
        created_by: null,
      },
      { onConflict: 'source_ref' },
    );
  return { error: error ? error.message : null };
}

// ── 群組對話記錄（年度回顧 / 風格模仿素材）─────────────────────────
/**
 * 寫入一則群組訊息（LINE Bot 上報）。
 * line_msg_id 去重：同一則訊息重送只記一次（onConflict 完整 unique index，相容 .upsert）。
 * 偽匿名：只存 LINE userId，姓名留待批次解析；可依 user_id 整批刪除（個資）。
 */
export async function insertGroupMessage(input: {
  groupId: string;
  userId: string;
  type: string;
  content: string | null;
  lineMsgId: string | null;
  sentAt: string | null;
}): Promise<{ error: string | null }> {
  const supabase = getServerClient();
  const { error } = await supabase.from('group_messages').upsert(
    {
      group_id: input.groupId,
      user_id: input.userId,
      type: input.type,
      content: input.content,
      line_msg_id: input.lineMsgId,
      sent_at: input.sentAt,
    },
    { onConflict: 'line_msg_id', ignoreDuplicates: true },
  );
  return { error: error ? error.message : null };
}

/** 依 LINE userId 整批刪除其群組訊息（個資刪除 / 管理員維運用）。回傳刪除筆數。 */
export async function deleteGroupMessagesByUser(
  userId: string,
  groupId?: string,
): Promise<{ error: string | null; count: number }> {
  const supabase = getServerClient();
  let q = supabase.from('group_messages').delete({ count: 'exact' }).eq('user_id', userId);
  if (groupId) q = q.eq('group_id', groupId);
  const { error, count } = await q;
  return { error: error ? error.message : null, count: count ?? 0 };
}

/** 該活動已入帳歸零 / 全退時，移除其 bot 收入列，避免殘留虛增收入。 */
export async function deleteBotIncomeByRef(
  source_ref: string,
): Promise<{ error: string | null }> {
  const supabase = getServerClient();
  const { error } = await supabase.from('finance_income').delete().eq('source_ref', source_ref);
  return { error: error ? error.message : null };
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
