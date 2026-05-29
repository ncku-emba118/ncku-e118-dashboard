/**
 * /api/board/signoff
 *   GET  — 待我簽核（inbox）+ 我發起的清單（需登入）
 *   POST — 建立簽核文件 + 指派（atomic RPC，idempotent）
 *
 * SIGNOFF-ARCHITECTURE.md §4 / §8。建立流程：
 *   驗 source path 屬於本 session incoming 前綴（Codex 4-1）→ 下載 source 算 sha →
 *   slot 排版 → 生簽核表上傳 → 算 manifest sha → atomic create RPC。
 */
import { type NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { z } from 'zod';
import { readSession, ALL_DEPTS } from '@/lib/auth/session';
import { resolveClientIp } from '@/lib/ip-resolve';
import { hashIp } from '@/lib/ip-hash';
import { jsonResp, isSameOrigin } from '@/lib/signoff/http';
import { rateLimit } from '@/lib/signoff/rate-limit';
import {
  SOURCE_ALLOWED_MIMES,
  MAX_SOURCE_BYTES,
  MIN_ASSIGNEES,
  MAX_ASSIGNEES,
  MIN_ATTACHMENTS,
  MAX_ATTACHMENTS,
  objectPaths,
} from '@/lib/signoff/constants';
import { computeSlotLayout } from '@/lib/signoff/layout';
import { computeAssignmentManifestSha256 } from '@/lib/signoff/manifest';
import { generateSignoffSheet } from '@/lib/signoff/pdf';
import {
  createSignoffDocument,
  downloadObject,
  getAccountsByIds,
  listInbox,
  listCreatedBy,
  uploadObject,
  type CreateAssignment,
  type AttachmentMeta,
} from '@/lib/signoff/dal';

const DEPT_IDS = ALL_DEPTS.map((d) => d.id) as readonly string[];

const createSchema = z.object({
  client_request_id: z.string().uuid(),
  title: z.string().min(1).max(120),
  amount: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .refine((v) => parseFloat(v) > 0, '金額必須大於 0')
    .nullable()
    .optional(),
  currency: z.string().min(1).max(8).default('TWD'),
  purpose: z.string().max(2000).nullable().optional(),
  applicant: z.string().max(120).nullable().optional(),
  category: z.string().max(20).nullable().optional(),
  owner_dept_id: z
    .string()
    .refine((v) => (DEPT_IDS as string[]).includes(v))
    .optional(),
  sources: z
    .array(
      z.object({
        object_path: z.string().min(1),
        mime: z.string().min(3),
        name: z.string().min(1).max(200),
      }),
    )
    .min(MIN_ATTACHMENTS)
    .max(MAX_ATTACHMENTS),
  assignees: z
    .array(
      z.object({
        account_id: z.string().uuid(),
        role_label: z.string().min(1).max(40),
      }),
    )
    .min(MIN_ASSIGNEES)
    .max(MAX_ASSIGNEES),
});

export async function GET() {
  const traceId = crypto.randomUUID();
  const session = await readSession();
  if (!session) return jsonResp({ error: '未登入或 session 過期' }, 401, traceId);
  if (!rateLimit(`signoff:list:${session.sub}`, 60, 60_000)) {
    return jsonResp({ error: '請求過於頻繁' }, 429, traceId);
  }

  const [inbox, created] = await Promise.all([
    listInbox(session.sub),
    listCreatedBy(session.sub),
  ]);
  if (inbox.error || created.error) {
    console.error('[signoff.list.failed]', { traceId, e: inbox.error || created.error });
    return jsonResp({ error: '系統暫時無法取得簽核清單' }, 503, traceId);
  }
  return jsonResp({ inbox: inbox.data ?? [], created: created.data ?? [] }, 200, traceId);
}

export async function POST(req: NextRequest) {
  const traceId = crypto.randomUUID();
  const session = await readSession();
  if (!session) return jsonResp({ error: '未登入或 session 過期' }, 401, traceId);
  if (!isSameOrigin(req)) return jsonResp({ error: '來源驗證失敗' }, 403, traceId);

  if (!rateLimit(`signoff:create:${session.sub}`, 10, 60_000)) {
    return jsonResp({ error: '建立過於頻繁，請稍候' }, 429, traceId);
  }
  const ip = resolveClientIp(req);
  if (!ip) return jsonResp({ error: '系統無法識別來源' }, 503, traceId);

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResp(
      { error: '欄位格式錯誤', detail: parsed.error.flatten().fieldErrors },
      400,
      traceId,
    );
  }
  const input = parsed.data;

  // 每個附件：mime 白名單 + path 屬於本 session incoming 前綴（Codex 4-1）
  const incomingPrefix = objectPaths.incomingSourcePrefix(session.sub);
  for (const s of input.sources) {
    if (!SOURCE_ALLOWED_MIMES.has(s.mime)) {
      return jsonResp({ error: `不支援的憑證類型：${s.mime}` }, 415, traceId);
    }
    if (!s.object_path.startsWith(incomingPrefix)) {
      return jsonResp({ error: '無效的憑證路徑' }, 400, traceId);
    }
  }

  // owner_dept：dept 用自己部門；super（班代/副班代）預設 secretary
  const ownerDept = input.owner_dept_id ?? session.home_dept_id ?? 'secretary';

  // 指派人去重 + 驗證存在
  const ids = [...new Set(input.assignees.map((a) => a.account_id))];
  if (ids.length !== input.assignees.length) {
    return jsonResp({ error: '同一人不可重複指派' }, 400, traceId);
  }
  const accountsRes = await getAccountsByIds(ids);
  if (accountsRes.error || !accountsRes.data) {
    return jsonResp({ error: '系統暫時無法驗證簽核人' }, 503, traceId);
  }
  if (accountsRes.data.length !== ids.length) {
    return jsonResp({ error: '指派名單含無效帳號' }, 400, traceId);
  }
  const nameById = new Map(accountsRes.data.map((a) => [a.id, a.username]));

  // 下載每個附件 → 驗實際 byte 數 + server 自算 sha（不信任 client 宣稱 size）
  const attachments: AttachmentMeta[] = [];
  for (const s of input.sources) {
    const b = await downloadObject(s.object_path);
    if (!b.bytes) {
      return jsonResp({ error: `附件「${s.name}」尚未上傳或上傳失敗，請重新上傳` }, 400, traceId);
    }
    if (b.bytes.length > MAX_SOURCE_BYTES) {
      return jsonResp({ error: `附件「${s.name}」超過 25 MB 上限` }, 413, traceId);
    }
    attachments.push({
      object_path: s.object_path,
      sha256: crypto.createHash('sha256').update(b.bytes).digest('hex'),
      mime: s.mime,
      name: s.name,
    });
  }

  // slot 排版 + 組指派（含座標）
  const slots = computeSlotLayout(input.assignees.length);
  const assignments: CreateAssignment[] = input.assignees.map((a, i) => ({
    signer_account_id: a.account_id,
    role_label: a.role_label,
    sequence_order: null,
    slot_page: slots[i].slot_page,
    slot_x: slots[i].slot_x,
    slot_y: slots[i].slot_y,
    slot_w: slots[i].slot_w,
    slot_h: slots[i].slot_h,
  }));

  const docId = crypto.randomUUID();
  const dateLabel = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });

  // 生簽核表底圖 + 上傳
  const sheetBytes = await generateSignoffSheet({
    title: input.title,
    amount: input.amount ?? null,
    currency: input.currency,
    purpose: input.purpose ?? null,
    applicant: input.applicant ?? null,
    dateLabel,
    slots: input.assignees.map((a, i) => ({
      role_label: a.role_label,
      signer_name: nameById.get(a.account_id) ?? '',
      slot_page: slots[i].slot_page,
      slot_x: slots[i].slot_x,
      slot_y: slots[i].slot_y,
      slot_w: slots[i].slot_w,
      slot_h: slots[i].slot_h,
    })),
  });
  const sheetPath = objectPaths.sheet(docId);
  const sheetUp = await uploadObject(sheetPath, sheetBytes, 'application/pdf', true);
  if (sheetUp.error) {
    console.error('[signoff.create.sheet_upload_failed]', { traceId, e: sheetUp.error });
    return jsonResp({ error: '簽核表生成失敗' }, 503, traceId);
  }

  // manifest sha（Codex 3-1）
  const manifest = computeAssignmentManifestSha256({
    doc: {
      title: input.title,
      amount: input.amount ?? null,
      currency: input.currency,
      purpose: input.purpose ?? null,
      applicant: input.applicant ?? null,
      owner_dept_id: ownerDept,
      attachment_shas: attachments.map((a) => a.sha256),
    },
    assignments,
  });

  const ipHash = hashIp(ip);
  const { documentId, error } = await createSignoffDocument({
    doc: {
      id: docId,
      title: input.title,
      amount: input.amount ?? null,
      currency: input.currency,
      purpose: input.purpose ?? null,
      applicant: input.applicant ?? null,
      created_by: session.sub,
      owner_dept_id: ownerDept,
      category: input.category ?? null,
      client_request_id: input.client_request_id,
      attachments,
      signoff_sheet_object_path: sheetPath,
      assignment_manifest_sha256: manifest,
      flow_type: 'parallel',
    },
    assignments,
    audit: {
      ip_hash: ipHash.hash,
      ip_hash_version: ipHash.version,
      user_agent: req.headers.get('user-agent'),
      trace_id: traceId,
    },
  });

  if (error || !documentId) {
    console.error('[signoff.create.rpc_failed]', { traceId, e: error });
    return jsonResp({ error: '建立簽核失敗，請稍後再試' }, 503, traceId);
  }

  console.info('[signoff.create.success]', {
    traceId,
    document_id: documentId,
    by: session.username,
    assignees: ids.length,
  });
  return jsonResp({ document_id: documentId }, 201, traceId);
}
