/**
 * DELETE /api/board/comments/[id] — 軟刪除留言（auth + dept permission）
 *
 * 對應 ARCHITECTURE.md v3 第 6 章 API Route Security Table:
 *   • super 可刪任何部門留言
 *   • dept 只能刪自己部門公告下的留言
 *   • soft delete: status='deleted', deleted_at=now(), deleted_by=session.sub
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { readSession, canManageDept } from '@/lib/auth/session';
import { isSameOrigin } from '@/lib/signoff/http';

const UUID_RE = /^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/;

function traceHeaders(traceId: string): HeadersInit {
  return { 'x-trace-id': traceId };
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const traceId = crypto.randomUUID();
  const { id } = await params;

  // CSRF 同源檢查（對齊 signoff 模組）
  if (!isSameOrigin(req)) {
    return NextResponse.json(
      { error: '來源驗證失敗' },
      { status: 403, headers: traceHeaders(traceId) },
    );
  }

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
  if (session.role !== 'super' && session.role !== 'dept') {
    return NextResponse.json({ error: '僅限幹部處理留言' }, { status: 403 });
  }

  const supabase = getServerClient();

  // 1. Load comment + its post's department to check permission
  const { data: comment, error: lookupErr } = await supabase
    .from('comments')
    .select('id, deleted_at, posts(department_id)')
    .eq('id', id)
    .maybeSingle();

  if (lookupErr) {
    console.error('[comments.delete.lookup_failed]', {
      traceId,
      error: lookupErr.message,
    });
    return NextResponse.json(
      { error: '系統暫時無法刪除' },
      { status: 503, headers: traceHeaders(traceId) },
    );
  }
  if (!comment) {
    return NextResponse.json(
      { error: '留言不存在' },
      { status: 404, headers: traceHeaders(traceId) },
    );
  }

  // 2. Permission check
  const postDeptId = (comment.posts as unknown as { department_id: string } | null)
    ?.department_id;
  if (!postDeptId) {
    console.error('[comments.delete.post_dept_missing]', { traceId, id });
    return NextResponse.json(
      { error: '系統錯誤' },
      { status: 500, headers: traceHeaders(traceId) },
    );
  }
  if (!canManageDept(session, postDeptId)) {
    console.warn('[comments.delete.forbidden]', {
      traceId,
      session_dept: session.home_dept_id,
      post_dept: postDeptId,
    });
    return NextResponse.json(
      { error: '無權刪除此留言' },
      { status: 403, headers: traceHeaders(traceId) },
    );
  }

  // 3. Soft delete
  const { error: updateErr } = comment.deleted_at ? { error: null } : await supabase
    .from('comments')
    .update({
      status: 'deleted',
      deleted_at: new Date().toISOString(),
      deleted_by: session.sub,
      reviewed_by: session.sub,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (updateErr) {
    console.error('[comments.delete.update_failed]', {
      traceId,
      error: updateErr.message,
    });
    return NextResponse.json(
      { error: '刪除失敗' },
      { status: 503, headers: traceHeaders(traceId) },
    );
  }

  // Retry also settles reports if a previous delete succeeded but settlement failed.
  const { error: resolveErr } = await supabase.from('comment_reports')
    .update({ resolved_at: new Date().toISOString(), resolution: 'deleted', reviewed_by: session.sub, reviewed_at: new Date().toISOString() })
    .eq('comment_id', id).is('resolved_at', null);
  if (resolveErr) {
    return NextResponse.json({ error: '留言已刪除，但檢舉結案失敗，請重試刪除以完成結案' }, { status: 503 });
  }

  console.info('[comments.delete.success]', {
    traceId,
    comment_id: id,
    by: session.username,
  });

  return NextResponse.json(
    { ok: true },
    { headers: traceHeaders(traceId) },
  );
}

// PATCH: default dismisses reports; ?action=approve releases a pending comment.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: '來源驗證失敗' }, { status: 403 });
  const action = req.nextUrl.searchParams.get('action') ?? 'dismiss';
  if (action !== 'dismiss' && action !== 'approve') {
    return NextResponse.json({ error: '無效的操作' }, { status: 400 });
  }
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: '無效的 ID' }, { status: 400 });
  const session = await readSession();
  if (!session) return NextResponse.json({ error: '未登入' }, { status: 401 });
  if (session.role !== 'super' && session.role !== 'dept') {
    return NextResponse.json({ error: '僅限幹部處理留言' }, { status: 403 });
  }
  const supabase = getServerClient();
  const { data: comment, error } = await supabase.from('comments')
    .select('id, posts(department_id)').eq('id', id).maybeSingle();
  if (error) return NextResponse.json({ error: '無法讀取留言，請稍後重試' }, { status: 503 });
  if (!comment) return NextResponse.json({ error: '留言不存在' }, { status: 404 });
  const dept = (comment.posts as unknown as { department_id: string } | null)?.department_id;
  if (!dept || !canManageDept(session, dept)) {
    return NextResponse.json({ error: '無權處理此留言的檢舉' }, { status: 403 });
  }
  if (action === 'approve') {
    // Conditional update prevents a stale review screen from resurrecting a deleted row.
    const { data: approved, error: approveErr } = await supabase.from('comments')
      .update({ status: 'visible', review_reason: null, reviewed_by: session.sub, reviewed_at: new Date().toISOString() })
      .eq('id', id).eq('status', 'pending_review').is('deleted_at', null)
      .select('id').maybeSingle();
    if (approveErr) return NextResponse.json({ error: '放行失敗，請重試' }, { status: 503 });
    if (!approved) return NextResponse.json({ error: '留言狀態已變更，請重新整理清單' }, { status: 409 });
    return NextResponse.json({ ok: true });
  }
  const { error: resolveErr } = await supabase.from('comment_reports')
    .update({ resolved_at: new Date().toISOString(), resolution: 'dismissed', reviewed_by: session.sub, reviewed_at: new Date().toISOString() })
    .eq('comment_id', id).is('resolved_at', null);
  if (resolveErr) return NextResponse.json({ error: '駁回失敗，請重試' }, { status: 503 });
  return NextResponse.json({ ok: true });
}
