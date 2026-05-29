/**
 * POST /api/board/signoff/upload-url — 原始憑證 signed upload URL。
 * object path 一律 server 分配並綁 accountId（Codex 4-1）；client 不可自帶路徑。
 */
import { type NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { z } from 'zod';
import { readSession } from '@/lib/auth/session';
import { jsonResp, isSameOrigin } from '@/lib/signoff/http';
import { rateLimit } from '@/lib/signoff/rate-limit';
import {
  SOURCE_ALLOWED_MIMES,
  SOURCE_MIME_EXT,
  MAX_SOURCE_BYTES,
  objectPaths,
} from '@/lib/signoff/constants';
import { createSignedUploadUrl } from '@/lib/signoff/dal';

const schema = z.object({
  mime: z.string().min(3).max(120),
  size: z.number().int().positive().max(MAX_SOURCE_BYTES),
});

export async function POST(req: NextRequest) {
  const traceId = crypto.randomUUID();
  const session = await readSession();
  if (!session) return jsonResp({ error: '未登入或 session 過期' }, 401, traceId);
  if (!isSameOrigin(req)) return jsonResp({ error: '來源驗證失敗' }, 403, traceId);

  if (!rateLimit(`signoff:upload:${session.sub}`, 10, 60_000)) {
    return jsonResp({ error: '上傳請求過於頻繁，請稍候' }, 429, traceId);
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return jsonResp({ error: '欄位格式錯誤' }, 400, traceId);
  }
  const { mime, size } = parsed.data;

  if (!SOURCE_ALLOWED_MIMES.has(mime)) {
    return jsonResp({ error: `不支援的憑證類型：${mime}（允許 PDF / JPG / PNG）` }, 415, traceId);
  }
  if (size > MAX_SOURCE_BYTES) {
    return jsonResp({ error: '檔案超過 25 MB 上限' }, 413, traceId);
  }

  const ext = SOURCE_MIME_EXT[mime] ?? 'bin';
  const rand = crypto.randomBytes(16).toString('hex');
  const path = objectPaths.incomingSource(session.sub, rand, ext);

  const { data, error } = await createSignedUploadUrl(path);
  if (error || !data) {
    console.error('[signoff.upload_url.failed]', { traceId, e: error });
    return jsonResp({ error: '無法產生上傳網址' }, 503, traceId);
  }

  return jsonResp(
    { signed_url: data.signedUrl, token: data.token, object_path: path, mime },
    200,
    traceId,
  );
}
