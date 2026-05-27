/**
 * POST /api/board/upload — multipart 檔案上傳到 Supabase Storage
 *
 * 流程：
 *   1. 驗 session（super / dept 都可上傳）
 *   2. multipart/form-data 解析、取 'file' field
 *   3. 驗檔案大小 ≤ 25 MB、MIME 在白名單
 *   4. 產生 random storage path（防 collision + 不洩漏原始檔名給 storage layer）
 *   5. 用 service_role client 上傳到 board-attachments bucket
 *   6. 拿 public URL 回傳給 client，client 把 metadata 塞進 posts.attachments JSONB
 *
 * 認證：需登入；rate limit 10 次/分/session
 * size: API 層 25 MB；bucket 層也 25 MB（雙保險）
 * MIME 白名單：圖片 / PDF / Office docs / 純文字 / CSV — 拒絕執行檔 / archive
 */
import { NextResponse, type NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { getServerClient } from '@/lib/supabase/server';
import { readSession } from '@/lib/auth/session';
import { resolveClientIp } from '@/lib/ip-resolve';

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

/**
 * 副檔名對照（給 MIME → ext 用，避免完全相信 client 的 filename）
 */
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

/** 把 user-provided filename sanitize 一輪，去掉路徑分隔符 + 控制字元 */
function sanitizeFilename(raw: string): string {
  const cleaned = raw
    .replace(/[\x00-\x1f\x7f]/g, '') // control chars
    .replace(/[/\\]/g, '_')
    .trim()
    .slice(0, 120);
  return cleaned || 'untitled';
}

// In-memory rate limit (per session id)
const sessionBuckets = new Map<string, { count: number; resetAt: number }>();
const RL_MAX = 10;
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

  // 1. Auth
  const session = await readSession();
  if (!session) {
    return jsonResp({ error: '未登入或 session 過期' }, 401, traceId);
  }

  // 2. Rate limit by session.sub
  if (!checkRateLimit(session.sub)) {
    console.warn('[upload.rate_limit]', {
      traceId,
      account: session.username,
    });
    return jsonResp({ error: '上傳過於頻繁，請稍等 1 分鐘' }, 429, traceId);
  }

  // 3. Validate IP available (defensive, P0-3 same pattern)
  const ip = resolveClientIp(req);
  if (!ip) {
    return jsonResp({ error: '系統無法識別來源' }, 503, traceId);
  }

  // 4. Parse multipart
  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    console.error('[upload.bad_form]', {
      traceId,
      error: (err as Error).message,
    });
    return jsonResp({ error: '請求格式錯誤' }, 400, traceId);
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return jsonResp({ error: '請選擇檔案' }, 400, traceId);
  }

  // 5. Size validation
  if (file.size === 0) {
    return jsonResp({ error: '檔案為空' }, 400, traceId);
  }
  if (file.size > MAX_FILE_BYTES) {
    return jsonResp(
      {
        error: `檔案超過 25 MB 上限（您的檔案 ${Math.round(
          file.size / 1024 / 1024,
        )} MB）`,
      },
      413,
      traceId,
    );
  }

  // 6. MIME validation
  if (!ALLOWED_MIMES.has(file.type)) {
    return jsonResp(
      {
        error: `不支援的檔案類型：${file.type || '未知'}（允許：圖片 / PDF / Word / Excel / PPT / 純文字 / CSV）`,
      },
      415,
      traceId,
    );
  }

  // 7. Generate random storage path
  // 路徑格式：{dept_or_super}/{yyyymm}/{random16}.{ext}
  // dept 用於組織（同部門檔案分群、未來想批次清理某部門好操作）
  const ext = MIME_EXT[file.type] ?? 'bin';
  const randomId = crypto.randomBytes(16).toString('hex');
  const yyyymm = new Date().toISOString().slice(0, 7).replace('-', '');
  const deptFolder = session.home_dept_id || 'super';
  const storagePath = `${deptFolder}/${yyyymm}/${randomId}.${ext}`;

  // 8. Upload to Supabase Storage
  const supabase = getServerClient();
  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadErr } = await supabase.storage
    .from('board-attachments')
    .upload(storagePath, arrayBuffer, {
      contentType: file.type,
      upsert: false,
      cacheControl: '31536000', // 1 year，public 內容、URL 含 random id 不會變
    });

  if (uploadErr) {
    console.error('[upload.storage_failed]', {
      traceId,
      error: uploadErr.message,
      account: session.username,
    });
    return jsonResp({ error: '上傳失敗，請稍後再試' }, 503, traceId);
  }

  // 9. Get public URL
  const { data: pubData } = supabase.storage
    .from('board-attachments')
    .getPublicUrl(storagePath);

  const sanitizedDisplayName = sanitizeFilename(file.name);

  console.info('[upload.success]', {
    traceId,
    account: session.username,
    dept: deptFolder,
    storage_path: storagePath,
    mime: file.type,
    size: file.size,
  });

  return jsonResp(
    {
      ok: true,
      attachment: {
        name: sanitizedDisplayName,
        source: 'supabase',
        storage_path: storagePath,
        public_url: pubData.publicUrl,
        mime: file.type,
        size: file.size,
      },
    },
    201,
    traceId,
  );
}
