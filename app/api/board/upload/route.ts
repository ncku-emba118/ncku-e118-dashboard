/**
 * POST /api/board/upload — 產生 Supabase Storage signed upload URL
 *
 * 為什麼不直接讓 client POST 檔案？
 *   Netlify Functions 同步 invocation 有 6 MB request body 上限。
 *   multipart 二進位 5+ MB → 編碼後超 6 MB → Function 直接 500 crash。
 *   改成 signed URL pattern：API 只傳 metadata、檔案 client → Supabase Storage 直送。
 *
 * 流程：
 *   1. Client POST { filename, mime, size }
 *   2. API 驗 session + size 25 MB + MIME 白名單 + rate limit
 *   3. API 產 random storage path、用 service_role 產 signed upload URL
 *   4. API 回 { signed_url, token, attachment_template }
 *   5. Client PUT 檔案到 signed_url（繞 Netlify Function，直送 *.supabase.co）
 *   6. Supabase Storage 在 storage 層也驗 MIME / size（雙保險，bucket 設定）
 *   7. 上傳完成 → Client 把 attachment_template 加進 form state
 */
import { NextResponse, type NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { z } from 'zod';
import { getServerClient } from '@/lib/supabase/server';
import { readSession } from '@/lib/auth/session';
import { resolveClientIp } from '@/lib/ip-resolve';
import { isSameOrigin } from '@/lib/signoff/http';

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MiB
const ALLOWED_MIMES = new Set<string>([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
]);

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    'pptx',
  'text/plain': 'txt',
  'text/csv': 'csv',
};

const requestSchema = z.object({
  filename: z.string().min(1).max(255),
  mime: z.string().min(3).max(120),
  size: z.number().int().positive().max(MAX_FILE_BYTES),
});

function sanitizeFilename(raw: string): string {
  return (
    raw
      .replace(/[\x00-\x1f\x7f]/g, '')
      .replace(/[/\\]/g, '_')
      .trim()
      .slice(0, 120) || 'untitled'
  );
}

const sessionBuckets = new Map<string, { count: number; resetAt: number }>();
const RL_MAX = 20; // per minute per session — 拿 signed URL 不是真上傳，可以放寬
const RL_WINDOW_MS = 60 * 1000;

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const rec = sessionBuckets.get(key);
  if (!rec || now > rec.resetAt) {
    sessionBuckets.set(key, { count: 1, resetAt: now + RL_WINDOW_MS });
    return true;
  }
  if (rec.count >= RL_MAX) return false;
  rec.count++;
  return true;
}

function jsonResp(body: object, status: number, traceId: string) {
  return NextResponse.json(body, {
    status,
    headers: { 'x-trace-id': traceId },
  });
}

export async function POST(req: NextRequest) {
  const traceId = crypto.randomUUID();

  // 0. CSRF 同源檢查（對齊 signoff 模組）
  if (!isSameOrigin(req)) {
    return jsonResp({ error: '來源驗證失敗' }, 403, traceId);
  }

  // 1. Auth
  const session = await readSession();
  if (!session) {
    return jsonResp({ error: '未登入或 session 過期' }, 401, traceId);
  }

  // 2. Rate limit
  if (!checkRateLimit(session.sub)) {
    console.warn('[upload.rate_limit]', {
      traceId,
      account: session.username,
    });
    return jsonResp({ error: '上傳請求過於頻繁，請稍等 1 分鐘' }, 429, traceId);
  }

  // 3. IP available（同 P0-3）
  const ip = resolveClientIp(req);
  if (!ip) {
    return jsonResp({ error: '系統無法識別來源' }, 503, traceId);
  }

  // 4. Body parse + validate
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResp({ error: '請求 JSON 格式錯誤' }, 400, traceId);
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResp(
      { error: '欄位格式錯誤', detail: parsed.error.flatten().fieldErrors },
      400,
      traceId,
    );
  }
  const { filename, mime, size } = parsed.data;

  // 5. MIME / size 白名單（雙保險 — Storage bucket 也會擋）
  if (!ALLOWED_MIMES.has(mime)) {
    return jsonResp(
      {
        error: `不支援的檔案類型：${mime}（允許：圖片 / PDF / Word / Excel / PPT / 純文字 / CSV）`,
      },
      415,
      traceId,
    );
  }
  if (size > MAX_FILE_BYTES) {
    return jsonResp(
      {
        error: `檔案超過 25 MB 上限（您的檔案 ${Math.round(size / 1024 / 1024)} MB）`,
      },
      413,
      traceId,
    );
  }

  // 6. Generate random storage path
  const ext = MIME_EXT[mime] ?? 'bin';
  const randomId = crypto.randomBytes(16).toString('hex');
  const yyyymm = new Date().toISOString().slice(0, 7).replace('-', '');
  const deptFolder = session.home_dept_id || 'super';
  const storagePath = `${deptFolder}/${yyyymm}/${randomId}.${ext}`;

  // 7. Create signed upload URL（用 service_role bypass RLS）
  const supabase = getServerClient();
  const { data: signedData, error: signedErr } = await supabase.storage
    .from('board-attachments')
    .createSignedUploadUrl(storagePath);

  if (signedErr || !signedData) {
    console.error('[upload.signed_url_failed]', {
      traceId,
      error: signedErr?.message,
      account: session.username,
    });
    return jsonResp({ error: '無法產生上傳網址' }, 503, traceId);
  }

  // 8. 預先算 public URL（client 上傳完成後不必再 round-trip 拿）
  const { data: pubData } = supabase.storage
    .from('board-attachments')
    .getPublicUrl(storagePath);

  const displayName = sanitizeFilename(filename);

  console.info('[upload.signed_url_issued]', {
    traceId,
    account: session.username,
    dept: deptFolder,
    storage_path: storagePath,
    mime,
    size,
  });

  return jsonResp(
    {
      ok: true,
      signed_url: signedData.signedUrl,
      token: signedData.token,
      attachment_template: {
        source: 'supabase' as const,
        name: displayName,
        storage_path: storagePath,
        public_url: pubData.publicUrl,
        mime,
        size,
      },
    },
    200,
    traceId,
  );
}
