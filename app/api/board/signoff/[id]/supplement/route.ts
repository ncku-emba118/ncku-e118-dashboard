/**
 * POST /api/board/signoff/[id]/supplement — 補充資料（0019）。
 *
 * 補充 ≠ 修改：只追加新的說明與附件，既有 attachments 完全不動，
 * 因此已簽名者的簽名仍對應到他們當初看到的內容、不需重簽。
 * 真正要改動已簽內容須走版本鏈（另案）。
 *
 * 權限：申請人本人或 super（秘書長 / 班代 / 副班代）。
 * 狀態：僅 routing / approved 可補（已退回、已作廢不行）—— 在 RPC 內強制，
 *       與快照取值同一 transaction，避免與簽署/作廢競態。
 *
 * 附件驗證比照建立流程（Codex 4-1）：path 必須落在本 session 的 incoming 前綴，
 * mime 走白名單，並實際下載回來驗位元組數與 server 自算 sha256，不信任前端宣稱值。
 */
import { type NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { z } from 'zod';
import { readSession } from '@/lib/auth/session';
import { resolveClientIp } from '@/lib/ip-resolve';
import { hashIp } from '@/lib/ip-hash';
import { jsonResp, isSameOrigin } from '@/lib/signoff/http';
import { rateLimit } from '@/lib/signoff/rate-limit';
import { requireSignoffAccess } from '@/lib/signoff/access';
import {
  SOURCE_ALLOWED_MIMES,
  MAX_SOURCE_BYTES,
  MAX_SUPPLEMENT_ATTACHMENTS,
  MAX_SUPPLEMENT_NOTE,
  ATTACHMENT_LABELS,
  MAX_ATTACHMENT_CAPTION,
  isValidIncomingSourcePath,
} from '@/lib/signoff/constants';
import { addSupplement, downloadObject, type AttachmentMeta } from '@/lib/signoff/dal';

const UUID_RE =
  /^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/;

const supplementSchema = z
  .object({
    client_request_id: z.string().uuid(),
    note: z.string().max(MAX_SUPPLEMENT_NOTE).nullable().optional(),
    sources: z
      .array(
        z.object({
          object_path: z.string().min(1),
          mime: z.string().min(3),
          name: z.string().min(1).max(200),
          label: z.enum(ATTACHMENT_LABELS).optional(),
          caption: z.string().max(MAX_ATTACHMENT_CAPTION).optional(),
        }),
      )
      .max(MAX_SUPPLEMENT_ATTACHMENTS)
      .optional()
      .default([]),
  })
  // 允許只補說明不附檔，或只附檔不補說明，但不能兩者皆空
  .refine((v) => (v.sources?.length ?? 0) > 0 || (v.note ?? '').trim().length > 0, {
    message: '請至少填寫補充說明或上傳一個附件',
  });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const traceId = crypto.randomUUID();
  const { id } = await params;
  if (!UUID_RE.test(id)) return jsonResp({ error: '無效的 ID' }, 400, traceId);

  const session = await readSession();
  if (!session) return jsonResp({ error: '未登入或 session 過期' }, 401, traceId);
  if (!isSameOrigin(req)) return jsonResp({ error: '來源驗證失敗' }, 403, traceId);
  if (!rateLimit(`signoff:supplement:${session.sub}`, 20, 60 * 60_000)) {
    return jsonResp({ error: '補充過於頻繁，請稍後再試' }, 429, traceId);
  }

  const access = await requireSignoffAccess(session, 'supplement', id);
  if (!access.ok) return jsonResp({ error: access.error }, access.status, traceId);

  // 先擋掉明顯不可補的狀態，給使用者清楚訊息；RPC 內仍會再驗一次（權威）
  const status = access.bundle.doc.status;
  if (status !== 'routing' && status !== 'approved') {
    return jsonResp(
      { error: status === 'rejected' ? '已退回的文件無法補充資料' : '已作廢的文件無法補充資料' },
      409,
      traceId,
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResp({ error: '請求格式錯誤' }, 400, traceId);
  }
  const parsed = supplementSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResp(
      { error: '欄位格式錯誤', detail: parsed.error.flatten() },
      400,
      traceId,
    );
  }
  const input = parsed.data;

  // mime 白名單 + path 必須完全等同 server 發出的格式（防 `..` 正規化穿越）
  for (const s of input.sources) {
    if (!SOURCE_ALLOWED_MIMES.has(s.mime)) {
      return jsonResp({ error: `不支援的附件類型：${s.mime}` }, 415, traceId);
    }
    if (!isValidIncomingSourcePath(s.object_path, session.sub)) {
      return jsonResp({ error: '無效的附件路徑' }, 400, traceId);
    }
  }

  // 下載驗實際位元組 + server 自算 sha256（不信任 client 宣稱值）
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
      ...(s.label ? { label: s.label } : {}),
      ...(s.caption ? { caption: s.caption } : {}),
    });
  }

  const ip = resolveClientIp(req);
  const ipHash = ip ? hashIp(ip) : null;
  const note = (input.note ?? '').trim() || null;

  const { supplementId, error } = await addSupplement({
    documentId: id,
    accountId: session.sub,
    clientRequestId: input.client_request_id,
    note,
    attachments,
    audit: {
      ip_hash: ipHash?.hash ?? null,
      ip_hash_version: ipHash?.version ?? null,
      user_agent: req.headers.get('user-agent'),
      trace_id: traceId,
    },
  });

  if (error || !supplementId) {
    // RPC 的狀態檢查失敗（競態下狀態已變）回 409，其餘視為暫時性故障
    const conflict = /cannot supplement document in status/.test(error ?? '');
    return jsonResp(
      { error: conflict ? '文件狀態已變更，無法補充' : '補充失敗，請稍後再試' },
      conflict ? 409 : 503,
      traceId,
    );
  }

  return jsonResp({ ok: true, supplement_id: supplementId }, 200, traceId);
}
