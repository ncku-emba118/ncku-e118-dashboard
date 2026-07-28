/**
 * POST /api/board/signoff/[id]/sign — 提交手寫簽名。
 *
 * 限待簽被指派者本人。server 端：驗 PNG（Codex 6-2）→ 自算 sha（Codex 4-2，不信任 client）
 * → 上傳 private bucket → atomic signoff_sign RPC（nonce + assignment 鎖 + finalize-once）。
 * 若本次簽完使全員到齊 → 觸發 server 合成最終 PDF。
 */
import { type NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { z } from 'zod';
import { readSession } from '@/lib/auth/session';
import { resolveClientIp } from '@/lib/ip-resolve';
import { hashIp } from '@/lib/ip-hash';
import { jsonResp, isSameOrigin } from '@/lib/signoff/http';
import { rateLimit } from '@/lib/signoff/rate-limit';
import { objectPaths } from '@/lib/signoff/constants';
import { requireSignoffAccess } from '@/lib/signoff/access';
import { validateSignaturePng } from '@/lib/signoff/png';
import {
  signAssignment,
  uploadObject,
  clearAssignmentMagicToken,
  upsertStoredSignature,
} from '@/lib/signoff/dal';
import { composeAndStoreFinal } from '@/lib/signoff/finalize';

const UUID_RE =
  /^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/;

const schema = z.object({
  nonce: z.string().min(8).max(128),
  comment: z.string().max(1000).optional(),
  signature_data_url: z.string().min(64).max(5 * 1024 * 1024),
  // 選填：把這次的手寫簽名存成「預存簽名」，日後可一鍵蓋章（規格 §1-5）
  save_as_stored: z.boolean().optional(),
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
  if (
    !rateLimit(`signoff:sign:${session.sub}`, 20, 60_000) ||
    !rateLimit(`signoff:sign:doc:${id}`, 5, 60_000)
  ) {
    return jsonResp({ error: '簽署請求過於頻繁' }, 429, traceId);
  }
  const ip = resolveClientIp(req);
  if (!ip) return jsonResp({ error: '系統無法識別來源' }, 503, traceId);

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return jsonResp({ error: '欄位格式錯誤' }, 400, traceId);
  const input = parsed.data;

  const access = await requireSignoffAccess(session, 'sign', id);
  if (!access.ok) return jsonResp({ error: access.error }, access.status, traceId);
  const mine = access.bundle.assignments.find(
    (a) => a.signer_account_id === session.sub && a.status === 'pending',
  );
  if (!mine) return jsonResp({ error: '沒有待你簽核的項目' }, 409, traceId);

  // 解 data URL（限 PNG）
  const m = input.signature_data_url.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return jsonResp({ error: '簽名格式錯誤（需 PNG）' }, 400, traceId);
  let png: Buffer;
  try {
    png = Buffer.from(m[1], 'base64');
  } catch {
    return jsonResp({ error: '簽名解碼失敗' }, 400, traceId);
  }

  // 驗證簽名圖（Codex 6-2）
  const v = validateSignaturePng(png);
  if (!v.ok) {
    const msg =
      v.reason === 'blank_signature'
        ? '請簽名後再送出（偵測到空白）'
        : v.reason === 'too_large'
          ? '簽名檔過大'
          : '簽名圖檔無效';
    return jsonResp({ error: msg }, 400, traceId);
  }

  // server 自算 sha（Codex 4-2）
  const sha = crypto.createHash('sha256').update(png).digest('hex');
  // 內容定址路徑（Codex #2/#4）：帶 sha 前 8 碼，不同內容→不同路徑→永不覆寫；
  // 寫進 signoff_signatures.signature_png_path 的即此唯一路徑，finalize 照讀該欄不變。
  const sigPath = objectPaths.signature(id, session.sub, sha);
  const up = await uploadObject(sigPath, png, 'image/png', true);
  if (up.error) {
    console.error('[signoff.sign.upload_failed]', { traceId, e: up.error });
    return jsonResp({ error: '簽名上傳失敗' }, 503, traceId);
  }

  const ipHash = hashIp(ip);
  const { finalized, error } = await signAssignment({
    assignmentId: mine.id,
    documentId: id,
    signerAccountId: session.sub,
    signaturePngPath: sigPath,
    signatureSha256: sha,
    nonce: input.nonce,
    comment: input.comment ?? null,
    ipHash: ipHash.hash,
    ipHashVersion: ipHash.version,
    userAgent: req.headers.get('user-agent'),
    traceId,
  });

  if (error) {
    console.warn('[signoff.sign.rpc_rejected]', { traceId, e: error });
    const isNonce = /nonce/i.test(error);
    return jsonResp(
      { error: isNonce ? '簽章驗證過期，請重新開啟簽名' : '簽核狀態已變更，請重新載入' },
      isNonce ? 400 : 409,
      traceId,
    );
  }

  // 簽完即失效該 assignment 的 magic token（規格 §1-7；best-effort，不影響已完成的簽署）
  const cleared = await clearAssignmentMagicToken({ documentId: id, signerAccountId: session.sub });
  if (cleared.error) {
    console.error('[signoff.sign.clear_magic_failed]', { traceId, e: cleared.error });
  }

  // 全員到齊 → 合成最終 PDF（best-effort：失敗不回滾簽署，可後續重生）。
  // 關鍵路徑：刻意排在下方非關鍵的「存預存簽名」之前，確保最後一位簽署觸發的
  // finalize 不被 stored-signature 的上傳 / upsert 拖慢（Codex #10）。
  if (finalized) {
    try {
      const fin = await composeAndStoreFinal(access.bundle.doc);
      if (!fin.ok) {
        console.error('[signoff.sign.finalize_failed]', { traceId, e: fin.error });
      }
    } catch (e) {
      console.error('[signoff.sign.finalize_threw]', { traceId, e: (e as Error).message });
    }
  }

  // 選填：存為預存簽名，日後可一鍵蓋章（規格 §1-5；非關鍵、best-effort，失敗不影響本次簽署）。
  // 內容定址路徑帶 sha（Codex #2）；排在 finalize 之後（Codex #10）。
  if (input.save_as_stored) {
    const storedPath = objectPaths.storedSignature(session.sub, sha);
    const storeUp = await uploadObject(storedPath, png, 'image/png', true);
    if (storeUp.error) {
      console.error('[signoff.sign.store_upload_failed]', { traceId, e: storeUp.error });
    } else {
      const storeRes = await upsertStoredSignature({
        accountId: session.sub,
        pngPath: storedPath,
        sha256: sha,
      });
      if (storeRes.error) {
        console.error('[signoff.sign.store_upsert_failed]', { traceId, e: storeRes.error });
      }
    }
  }

  console.info('[signoff.sign.success]', {
    traceId,
    document_id: id,
    by: session.username,
    finalized: !!finalized,
  });
  return jsonResp({ ok: true, finalized: !!finalized }, 200, traceId);
}
