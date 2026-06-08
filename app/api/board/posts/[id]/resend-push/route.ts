/**
 * POST /api/board/posts/[id]/resend-push — 重發推播
 *
 * 用途：同學說「我沒收到推播」、或 dispatcher 出問題只送到一半時，
 * 秘書長/部門幹部可手動重新 enqueue 一次 push_job。
 *
 * 設計：用獨立的 event_type='post_resend'（不跟 'post_published' 撞 unique constraint）。
 * 如果同則公告已重發過 → 先 delete 舊的 resend job，再插入新的（避免堆積）。
 *
 * 權限：需登入 + canManageDept（super 全部、dept 只能重發自家公告）。
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { readSession, canManageDept } from '@/lib/auth/session';

const UUID_RE = /^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/;

function traceHeaders(traceId: string): HeadersInit {
  return { 'x-trace-id': traceId };
}

export async function POST(
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
      { error: '請先登入' },
      { status: 401, headers: traceHeaders(traceId) },
    );
  }

  const supabase = getServerClient();

  // 查公告（確認存在且 user 有權限）
  const { data: post, error: postErr } = await supabase
    .from('posts')
    .select('id, department_id, title, published')
    .eq('id', id)
    .maybeSingle();
  if (postErr || !post) {
    return NextResponse.json(
      { error: '公告不存在' },
      { status: 404, headers: traceHeaders(traceId) },
    );
  }
  if (!canManageDept(session, post.department_id)) {
    return NextResponse.json(
      { error: '無權重發此部門公告' },
      { status: 403, headers: traceHeaders(traceId) },
    );
  }
  if (!post.published) {
    return NextResponse.json(
      { error: '草稿尚未發布，無法重發推播' },
      { status: 400, headers: traceHeaders(traceId) },
    );
  }

  // 先清掉舊的 resend job（如果有），再插入新的 — 避免 unique constraint 衝突
  await supabase
    .from('push_jobs')
    .delete()
    .eq('post_id', id)
    .eq('event_type', 'post_resend');

  const { error: jobErr } = await supabase
    .from('push_jobs')
    .insert({
      post_id: id,
      event_type: 'post_resend',
      status: 'queued',
    });
  if (jobErr) {
    console.error('[posts.resend-push.failed]', { traceId, post_id: id, error: jobErr.message });
    return NextResponse.json(
      { error: '排入推播失敗', detail: jobErr.message },
      { status: 500, headers: traceHeaders(traceId) },
    );
  }

  console.log('[posts.resend-push.queued]', {
    traceId,
    post_id: id,
    by_user: session.username,
  });

  return NextResponse.json(
    { ok: true, message: '已重新排入推播，Netlify cron 1 分鐘內 dispatch' },
    { status: 200, headers: traceHeaders(traceId) },
  );
}
