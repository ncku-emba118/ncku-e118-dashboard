/**
 * POST /api/board/comments — 公開新留言
 *
 * 對應 ARCHITECTURE.md v3 第 8 章「留言系統」：
 *   • author_name 可留空 → 前端顯示「匿名同學」
 *   • 內容 2-1000 字 (DB CHECK 也擋)
 *   • IP HMAC hash 防 spam（不存原始 IP, Codex Sec F9）
 *   • 同 IP 30 秒/則 in-memory rate limit
 *   • 內容含 URL → 同 IP 24h > 3 次自動 pending_review（不對外、要 super/dept 審）
 *   • visible 留言透過 Supabase Realtime 即時推到所有訂閱的 client
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getServerClient } from '@/lib/supabase/server';
import { hashIp } from '@/lib/ip-hash';

const MAX_BODY_BYTES = 4096;

const createSchema = z.object({
  post_id: z.string().uuid(),
  author_name: z.string().max(40).optional().nullable(),
  content: z.string().min(2).max(1000),
});

// In-memory rate limit (Netlify Function instance scope, OK 給班規模)
const ipBuckets = new Map<string, number>(); // ip → lastPostTime
const PER_IP_WINDOW_MS = 30 * 1000;

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-nf-client-connection-ip') ||
    (process.env.NODE_ENV !== 'production'
      ? req.headers.get('x-forwarded-for')?.split(',')[0].trim() || null
      : null) ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

const URL_RE = /\bhttps?:\/\/\S+/i;

function traceHeaders(traceId: string): HeadersInit {
  return { 'x-trace-id': traceId };
}

export async function POST(req: NextRequest) {
  const traceId = crypto.randomUUID();

  // 1. Body size
  const contentLength = Number(req.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: '請求過大' },
      { status: 413, headers: traceHeaders(traceId) },
    );
  }

  // 2. IP rate limit (30s)
  const ip = getClientIp(req);
  const now = Date.now();
  const last = ipBuckets.get(ip) ?? 0;
  if (now - last < PER_IP_WINDOW_MS) {
    return NextResponse.json(
      { error: '留言太頻繁，請過 30 秒再試' },
      { status: 429, headers: traceHeaders(traceId) },
    );
  }
  ipBuckets.set(ip, now);

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
  const authorName = (input.author_name ?? '').trim() || null;
  const content = input.content.trim();
  const hasUrl = URL_RE.test(content);

  const supabase = getServerClient();

  // 4. 確認 post 存在 + 已發布（避免對未發布或 deleted 公告留言）
  const { data: post, error: postErr } = await supabase
    .from('posts')
    .select('id, department_id, published')
    .eq('id', input.post_id)
    .maybeSingle();

  if (postErr) {
    console.error('[comments.create.post_lookup_failed]', {
      traceId,
      error: postErr.message,
    });
    return NextResponse.json(
      { error: '系統暫時無法留言' },
      { status: 503, headers: traceHeaders(traceId) },
    );
  }
  if (!post || !post.published) {
    return NextResponse.json(
      { error: '找不到對應公告' },
      { status: 404, headers: traceHeaders(traceId) },
    );
  }

  // 5. URL spam check — 同 IP 24h 內已有 3 則含 URL → 本次標 pending_review
  const ipHashInfo = hashIp(ip);
  let status: 'visible' | 'pending_review' = 'visible';
  let reviewReason: string | null = null;

  if (hasUrl) {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from('comments')
      .select('id', { count: 'exact', head: true })
      .eq('ip_hash', ipHashInfo.hash)
      .gte('created_at', dayAgo)
      .ilike('content', '%http%');
    if ((count ?? 0) >= 3) {
      status = 'pending_review';
      reviewReason = 'url_spam';
    }
  }

  // 6. Insert
  const { data: inserted, error: insertErr } = await supabase
    .from('comments')
    .insert({
      post_id: input.post_id,
      author_name: authorName,
      content,
      status,
      ip_hash: ipHashInfo.hash,
      ip_hash_version: ipHashInfo.version,
      review_reason: reviewReason,
    })
    .select('id, post_id, author_name, content, status, created_at')
    .single();

  if (insertErr || !inserted) {
    console.error('[comments.create.insert_failed]', {
      traceId,
      error: insertErr?.message,
    });
    return NextResponse.json(
      { error: '留言失敗' },
      { status: 503, headers: traceHeaders(traceId) },
    );
  }

  console.info('[comments.create.success]', {
    traceId,
    comment_id: inserted.id,
    post_id: input.post_id,
    status,
  });

  return NextResponse.json(
    {
      comment: status === 'visible' ? inserted : null,
      pending: status === 'pending_review',
      message:
        status === 'pending_review'
          ? '留言已送出、含網址需審核後才公開'
          : undefined,
    },
    { status: 201, headers: traceHeaders(traceId) },
  );
}
