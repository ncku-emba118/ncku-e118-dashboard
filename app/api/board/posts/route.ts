/**
 * /api/board/posts
 *
 *   GET   公開 — list published posts (filter by dept optional)
 *   POST  需登入 — create post，含 idempotency key 防雙擊
 *
 * 對應 ARCHITECTURE.md v3 第 6 章 API Route Security Table。
 * 對應 Codex #1 finding Rel F2 (idempotency)。
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getServerClient } from '@/lib/supabase/server';
import { readSession, canManageDept, ALL_DEPTS } from '@/lib/auth/session';
import { processQueuedJobs } from '@/lib/push/dispatcher';
import { attachmentsArraySchema } from '@/lib/attachment';
import { isSameOrigin } from '@/lib/signoff/http';

const DEPT_IDS = ALL_DEPTS.map((d) => d.id) as readonly string[];

const createSchema = z.object({
  department_id: z.string().refine((v) => (DEPT_IDS as string[]).includes(v), {
    message: 'invalid department_id',
  }),
  client_request_id: z.string().uuid(),
  title: z.string().min(1).max(120),
  content: z.string().min(1).max(20480),
  attachments: attachmentsArraySchema.optional(),
  pinned: z.boolean().optional(),
});

const MAX_BODY_BYTES = 32 * 1024; // 32 KB（content 上限 20 KB + 一些 metadata 餘裕）

function traceHeaders(traceId: string): HeadersInit {
  return { 'x-trace-id': traceId };
}

// ============================================================
// GET — 列表（公開）
// ============================================================
export async function GET(req: NextRequest) {
  const traceId = crypto.randomUUID();
  const url = new URL(req.url);
  const deptFilter = url.searchParams.get('dept');
  const limit = Math.min(
    Math.max(Number(url.searchParams.get('limit') || 50), 1),
    100,
  );

  const supabase = getServerClient();
  let query = supabase
    .from('posts')
    .select(
      'id, department_id, title, content, attachments, pinned, created_at, accounts(username)',
    )
    .eq('published', true)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (deptFilter && (DEPT_IDS as string[]).includes(deptFilter)) {
    query = query.eq('department_id', deptFilter);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[posts.list.failed]', { traceId, error: error.message });
    return NextResponse.json(
      { error: '系統暫時無法取得公告' },
      { status: 503, headers: traceHeaders(traceId) },
    );
  }

  return NextResponse.json(
    { posts: data || [] },
    { headers: traceHeaders(traceId) },
  );
}

// ============================================================
// POST — 新增公告（需登入、需部門權限、idempotency）
// ============================================================
export async function POST(req: NextRequest) {
  const traceId = crypto.randomUUID();

  // 0. CSRF 同源檢查（對齊 signoff 模組）
  if (!isSameOrigin(req)) {
    return NextResponse.json(
      { error: '來源驗證失敗' },
      { status: 403, headers: traceHeaders(traceId) },
    );
  }

  // 1. Body size limit
  const contentLength = Number(req.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: '請求過大' },
      { status: 413, headers: traceHeaders(traceId) },
    );
  }

  // 2. Auth
  const session = await readSession();
  if (!session) {
    return NextResponse.json(
      { error: '未登入或 session 過期' },
      { status: 401, headers: traceHeaders(traceId) },
    );
  }

  // 3. Parse + validate
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: '欄位格式錯誤', detail: parsed.error.flatten().fieldErrors },
      { status: 400, headers: traceHeaders(traceId) },
    );
  }
  const input = parsed.data;

  // 4. 部門權限：dept 只能發自己部門、super 全部能發
  if (!canManageDept(session, input.department_id)) {
    return NextResponse.json(
      { error: '無權發布到該部門' },
      { status: 403, headers: traceHeaders(traceId) },
    );
  }

  // 5. pinned 只有 super 能用（dept 即使 PATCH 也不可以）
  const pinned = session.role === 'super' ? !!input.pinned : false;

  const supabase = getServerClient();

  // 6. Idempotency check — 同 author + 同 client_request_id 已存在則直接回該 post
  const { data: existing, error: lookupError } = await supabase
    .from('posts')
    .select('id')
    .eq('author_account_id', session.sub)
    .eq('client_request_id', input.client_request_id)
    .maybeSingle();

  if (lookupError) {
    console.error('[posts.create.idempotency_lookup_failed]', {
      traceId,
      error: lookupError.message,
    });
    return NextResponse.json(
      { error: '系統暫時無法發布' },
      { status: 503, headers: traceHeaders(traceId) },
    );
  }

  if (existing) {
    console.info('[posts.create.idempotent_replay]', {
      traceId,
      post_id: existing.id,
    });
    return NextResponse.json(
      { post_id: existing.id, idempotent: true },
      { headers: traceHeaders(traceId) },
    );
  }

  // 7. Insert
  const { data: inserted, error: insertError } = await supabase
    .from('posts')
    .insert({
      department_id: input.department_id,
      author_account_id: session.sub,
      client_request_id: input.client_request_id,
      title: input.title,
      content: input.content,
      attachments: input.attachments ?? [],
      pinned,
      published: true,
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    console.error('[posts.create.insert_failed]', {
      traceId,
      error: insertError?.message,
    });
    return NextResponse.json(
      { error: '發布失敗，請稍後再試' },
      { status: 503, headers: traceHeaders(traceId) },
    );
  }

  console.info('[posts.create.success]', {
    traceId,
    post_id: inserted.id,
    dept: input.department_id,
    author: session.username,
    pinned,
  });

  // ── Enqueue push_job for outbox dispatcher ──
  // ON CONFLICT (post_id, event_type) DO NOTHING — 同 post 同事件只一個 job
  const { error: jobErr } = await supabase
    .from('push_jobs')
    .insert({
      post_id: inserted.id,
      event_type: 'post_published',
      status: 'queued',
    });
  if (jobErr) {
    // 已存在或其他 — 不阻擋 post create 本身（user 已看到成功）
    console.warn('[posts.create.push_job_enqueue_failed]', {
      traceId,
      post_id: inserted.id,
      error: jobErr.message,
    });
  } else {
    // 立刻 fire-and-forget 觸發 dispatcher（best effort、不 await 不阻擋 response）
    processQueuedJobs().catch((err) => {
      console.error('[posts.create.dispatcher_async_failed]', {
        traceId,
        error: (err as Error).message,
      });
    });
  }

  return NextResponse.json(
    { post_id: inserted.id, idempotent: false },
    { headers: traceHeaders(traceId), status: 201 },
  );
}
