/**
 * POST /api/board/signoff/[id]/sign-stamp — 一鍵蓋「預存簽名」（規格 §1-4）。
 *
 * 與手寫 /sign 共用同一條 access 檢查鏈（限待簽被指派者本人），差別只在簽名來源：
 * 不收前端上傳的圖，改讀該幹部先前存下的預存簽名 → copy 到本單簽名格路徑 →
 * 內部發一次性 nonce（setAssignmentChallenge）→ 走同一支 atomic signoff_sign RPC
 * （帶 stored sha256）。簽署寫入一律走網頁 session、原子操作，與手寫完全同權。
 */
import { type NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { readSession } from '@/lib/auth/session';
import { resolveClientIp } from '@/lib/ip-resolve';
import { hashIp } from '@/lib/ip-hash';
import { jsonResp, isSameOrigin } from '@/lib/signoff/http';
import { rateLimit } from '@/lib/signoff/rate-limit';
import { objectPaths, CHALLENGE_TTL_MS } from '@/lib/signoff/constants';
import { requireSignoffAccess } from '@/lib/signoff/access';
import {
  getStoredSignature,
  downloadObject,
  uploadObject,
  setAssignmentChallenge,
  signAssignment,
  clearAssignmentMagicToken,
} from '@/lib/signoff/dal';
import { composeAndStoreFinal } from '@/lib/signoff/finalize';

const UUID_RE =
  /^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/;

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
  // 與手寫簽署共用同一組限速鍵：避免用兩個端點各刷一次繞過 per-doc 上限
  if (
    !rateLimit(`signoff:sign:${session.sub}`, 20, 60_000) ||
    !rateLimit(`signoff:sign:doc:${id}`, 5, 60_000)
  ) {
    return jsonResp({ error: '簽署請求過於頻繁' }, 429, traceId);
  }
  const ip = resolveClientIp(req);
  if (!ip) return jsonResp({ error: '系統無法識別來源' }, 503, traceId);

  const access = await requireSignoffAccess(session, 'sign', id);
  if (!access.ok) return jsonResp({ error: access.error }, access.status, traceId);
  const mine = access.bundle.assignments.find(
    (a) => a.signer_account_id === session.sub && a.status === 'pending',
  );
  if (!mine) return jsonResp({ error: '沒有待你簽核的項目' }, 409, traceId);

  // 讀預存簽名；沒有就明確回 409（前端據此引導改用手寫）
  const { data: stored, error: storedErr } = await getStoredSignature(session.sub);
  if (storedErr) {
    console.error('[signoff.sign_stamp.stored_lookup_failed]', { traceId, e: storedErr });
    return jsonResp({ error: '系統暫時無法讀取預存簽名' }, 503, traceId);
  }
  if (!stored) {
    return jsonResp({ error: '你尚未設定預存簽名，請改用手寫簽名' }, 409, traceId);
  }

  // copy 預存簽名 → 本單簽名格路徑。download+upload 而非 storage copy：沿用既有
  // retry 慣例，且順帶驗證位元組完整（sha 與存檔時一致，否則不拿去蓋章）。
  const dl = await downloadObject(stored.png_path);
  if (!dl.bytes) {
    console.error('[signoff.sign_stamp.stored_missing]', { traceId, e: dl.error });
    return jsonResp({ error: '找不到預存簽名檔，請改用手寫簽名重新設定' }, 409, traceId);
  }
  const sha = crypto.createHash('sha256').update(dl.bytes).digest('hex');
  if (sha !== stored.sha256) {
    console.error('[signoff.sign_stamp.stored_sha_mismatch]', { traceId });
    return jsonResp({ error: '預存簽名資料異常，請改用手寫並重新設定預存簽名' }, 409, traceId);
  }

  // 內容定址路徑（Codex #2/#4）：帶預存簽名 bytes 的 sha 前 8 碼→唯一路徑、不覆寫；
  // 寫進 signoff_signatures.signature_png_path 的即此路徑，與手寫 sign / finalize 三方一致。
  const sigPath = objectPaths.signature(id, session.sub, sha);
  const up = await uploadObject(sigPath, dl.bytes, 'image/png', true);
  if (up.error) {
    console.error('[signoff.sign_stamp.upload_failed]', { traceId, e: up.error });
    return jsonResp({ error: '簽名寫入失敗，請稍後再試' }, 503, traceId);
  }

  // 內部發一次性 nonce（signoff_sign RPC 要求 active challenge），隨即用掉
  const nonce = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS).toISOString();
  const ch = await setAssignmentChallenge({
    assignmentId: mine.id,
    documentId: id,
    signerAccountId: session.sub,
    nonce,
    expiresAt,
  });
  if (ch.error || !ch.ok) {
    return jsonResp({ error: '簽核狀態已變更，請重新載入' }, 409, traceId);
  }

  const ipHash = hashIp(ip);
  const { finalized, error } = await signAssignment({
    assignmentId: mine.id,
    documentId: id,
    signerAccountId: session.sub,
    signaturePngPath: sigPath,
    signatureSha256: sha,
    nonce,
    comment: null,
    ipHash: ipHash.hash,
    ipHashVersion: ipHash.version,
    userAgent: req.headers.get('user-agent'),
    traceId,
  });
  if (error) {
    console.warn('[signoff.sign_stamp.rpc_rejected]', { traceId, e: error });
    return jsonResp({ error: '簽核狀態已變更，請重新載入' }, 409, traceId);
  }

  // 簽完即失效該 assignment 的 magic token（規格 §1-7；best-effort）
  const cleared = await clearAssignmentMagicToken({ documentId: id, signerAccountId: session.sub });
  if (cleared.error) {
    console.error('[signoff.sign_stamp.clear_magic_failed]', { traceId, e: cleared.error });
  }

  // 全員到齊 → 合成最終 PDF（best-effort：失敗不回滾簽署，可後續重生）
  if (finalized) {
    try {
      const fin = await composeAndStoreFinal(access.bundle.doc);
      if (!fin.ok) console.error('[signoff.sign_stamp.finalize_failed]', { traceId, e: fin.error });
    } catch (e) {
      console.error('[signoff.sign_stamp.finalize_threw]', { traceId, e: (e as Error).message });
    }
  }

  console.info('[signoff.sign_stamp.success]', {
    traceId,
    document_id: id,
    by: session.username,
    finalized: !!finalized,
  });
  return jsonResp({ ok: true, finalized: !!finalized }, 200, traceId);
}
