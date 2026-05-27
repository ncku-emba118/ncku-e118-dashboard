/**
 * /api/board/posts/[id] — single post operations
 *
 *   GET     公開 — fetch single published post（middleware 已 whitelist GET）
 *   PATCH   需登入 — update title/content/attachments/pinned/published（optimistic lock）
 *   DELETE  需登入 — hard delete（cascade comments/push_jobs/push_deliveries via FK）
 *
 * 對應 ARCHITECTURE.md v3 第 6 章 + Codex Rel F5 (optimistic lock via posts.version):
 *   UPDATE posts SET ... WHERE id=? AND version=$client_version
 *   不等 → 409 conflict，告知 user「公告剛被別人改過，請重新載入」
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getServerClient } from '@/lib/supabase/server';
import { readSession, canManageDept } from '@/lib/auth/session';

const UUID_RE = /^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/;
const MAX_BODY_BYTES = 32 * 1024;

function traceHeaders(traceId: string): HeadersInit {
  return { 'x-trace-id': traceId };
}

// ============================================================
// GET — 單篇公告（公開、middleware whitelist GET）
// ============================================================
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const traceId = crypto.randomUUID();
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { error: '無效的 ID' },
      { status: 400, headers: traceHeaders(traceId) },
    );
  }
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from('posts')
    .select(
      'id, department_id, title, content, attachments, pinned, version, created_at, updated_at, accounts(username)',
    )
    .eq('id', id)
    .eq('published', true)
    .maybeSingle();
  if (error) {
    return NextResponse.json(
      { error: '系統暫時無法取得公告' },
      { status: 503, headers: traceHeaders(traceId) },
    );
  }
  if (!data) {
    return NextResponse.json(
      { error: '公告不存在' },
      { status: 404, headers: traceHeaders(traceId) },
    );
  }
  return NextResponse.json(
    { post: data },
    { headers: traceHeaders(traceId) },
  );
}

// ============================================================
// PATCH — 編輯（version optimistic lock）
// ============================================================
const patchSchema = z.object({
  version: z.number().int().positive(),
  title: z.string().min(1).max(120).optional(),
  content: z.string().min(1).max(20480).optional(),
  attachments: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        gdrive_id: z.string().regex(/^[A-Za-z0-9_-]{20,60}$/),
        type: z.enum([
          'file',
          'folder',
          'document',
          'spreadsheet',
          'presentation',
        ]),
      }),
    )
    .max(10)
    .optional(),
  pinned: z.boolean().optional(),
  published: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const traceId = crypto.randomUUID();
  const { id } = await params;

  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { error: '無效的 ID' },
      { status: 400, headers: traceHeaders(traceId) },
    );
  }

  const contentLength = Number(req.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: '請求過大' },
      { status: 413, headers: traceHeaders(traceId) },
    );
  }

  const session = await readSession();
  if (!session) {
    return NextResponse.json(
      { error: '未登入或 session 過期' },
      { status: 401, headers: traceHeaders(traceId) },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: '欄位格式錯誤', detail: parsed.error.flatten().fieldErrors },
      { status: 400, headers: traceHeaders(traceId) },
    );
  }
  const input = parsed.data;

  const supabase = getServerClient();

  // Load existing post to verify dept permission（不能改 department）
  const { data: existing, error: lookupErr } = await supabase
    .from('posts')
    .select('id, department_id, version')
    .eq('id', id)
    .maybeSingle();

  if (lookupErr) {
    console.error('[posts.patch.lookup_failed]', {
      traceId,
      error: lookupErr.message,
    });
    return NextResponse.json(
      { error: '系統暫時無法更新' },
      { status: 503, headers: traceHeaders(traceId) },
    );
  }
  if (!existing) {
    return NextResponse.json(
      { error: '公告不存在' },
      { status: 404, headers: traceHeaders(traceId) },
    );
  }
  if (!canManageDept(session, existing.department_id as string)) {
    return NextResponse.json(
      { error: '無權編輯此公告' },
      { status: 403, headers: traceHeaders(traceId) },
    );
  }

  // pinned 只有 super 能改
  const updates: Record<string, unknown> = {
    version: (existing.version as number) + 1,
    updated_at: new Date().toISOString(),
  };
  if (input.title !== undefined) updates.title = input.title;
  if (input.content !== undefined) updates.content = input.content;
  if (input.attachments !== undefined) updates.attachments = input.attachments;
  if (input.pinned !== undefined && session.role === 'super') {
    updates.pinned = input.pinned;
  }
  if (input.published !== undefined) updates.published = input.published;

  // ⚠ Codex Rel F5: optimistic lock — id + version 雙條件
  const { data: updated, error: updateErr } = await supabase
    .from('posts')
    .update(updates)
    .eq('id', id)
    .eq('version', input.version)
    .eq('department_id', existing.department_id) // 額外防衛
    .select('id, version, updated_at')
    .maybeSingle();

  if (updateErr) {
    console.error('[posts.patch.update_failed]', {
      traceId,
      error: updateErr.message,
    });
    return NextResponse.json(
      { error: '更新失敗' },
      { status: 503, headers: traceHeaders(traceId) },
    );
  }

  if (!updated) {
    // version mismatch — concurrent edit conflict
    console.warn('[posts.patch.version_conflict]', {
      traceId,
      post_id: id,
      client_version: input.version,
      server_version: existing.version,
    });
    return NextResponse.json(
      {
        error: '公告已被其他人改過，請重新整理頁面取最新版本後再編輯',
        current_version: existing.version,
      },
      { status: 409, headers: traceHeaders(traceId) },
    );
  }

  console.info('[posts.patch.success]', {
    traceId,
    post_id: id,
    by: session.username,
    new_version: updated.version,
  });

  return NextResponse.json(
    { ok: true, post: updated },
    { headers: traceHeaders(traceId) },
  );
}

// ============================================================
// DELETE — hard delete（cascade comments/push_jobs via FK）
// ============================================================
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const traceId = crypto.randomUUID();
  const { id } = await params;

  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { error: '無效的 ID' },
      { status: 400, headers: traceHeaders(traceId) },
    );
  }

  const session = await readSession();
  if (!session) {
    return NextResponse.json(
      { error: '未登入' },
      { status: 401, headers: traceHeaders(traceId) },
    );
  }

  const supabase = getServerClient();

  // Permission check
  const { data: existing, error: lookupErr } = await supabase
    .from('posts')
    .select('id, department_id')
    .eq('id', id)
    .maybeSingle();
  if (lookupErr) {
    return NextResponse.json(
      { error: '系統暫時無法刪除' },
      { status: 503, headers: traceHeaders(traceId) },
    );
  }
  if (!existing) {
    return NextResponse.json(
      { ok: true, already: true },
      { headers: traceHeaders(traceId) },
    );
  }
  if (!canManageDept(session, existing.department_id as string)) {
    return NextResponse.json(
      { error: '無權刪除此公告' },
      { status: 403, headers: traceHeaders(traceId) },
    );
  }

  // push_log 沒有 ON DELETE CASCADE（schema 0001 設計遺漏）— 先手動清
  await supabase.from('push_log').delete().eq('post_id', id);

  // posts DELETE cascades: comments / push_jobs（→ push_deliveries 連帶 cascade）
  const { error: deleteErr } = await supabase
    .from('posts')
    .delete()
    .eq('id', id);

  if (deleteErr) {
    console.error('[posts.delete.failed]', {
      traceId,
      error: deleteErr.message,
    });
    return NextResponse.json(
      { error: '刪除失敗' },
      { status: 503, headers: traceHeaders(traceId) },
    );
  }

  console.info('[posts.delete.success]', {
    traceId,
    post_id: id,
    by: session.username,
  });
  return NextResponse.json(
    { ok: true },
    { headers: traceHeaders(traceId) },
  );
}
