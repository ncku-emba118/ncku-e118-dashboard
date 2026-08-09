/**
 * Push outbox dispatcher — process queued push_jobs
 *
 * 對應 ARCHITECTURE.md v3 第 7 章 + Codex Rel F1/F3/F4:
 *   • claim_push_jobs RPC: atomic 領 job、FOR UPDATE SKIP LOCKED 防 worker 互搶
 *   • 過 5min lock 自動 release（stale-sending 重 claim）
 *   • 每批 concurrency 限制（PUSH_CONCURRENCY, 預設 20）
 *   • 每個 sub call 限 PUSH_PER_CALL_TIMEOUT_MS（預設 3s）
 *   • 失敗分類：410 → 刪訂閱、429/5xx/timeout → retryable（attempt+1）、4xx → failed
 *   • 寫每筆 push_deliveries + aggregate push_log
 *   • 結果：sent / partial_failed / failed
 *
 * 2026-08-09 加 comment_created 事件（見 migration 0024_comment_push.sql）：
 *   • post_published → 全班統一 fan-out（不讀 dept_filter，維持原行為）
 *   • comment_created → 只推給 dept_filter 包含該公告 department_id 的訂閱
 *     （部門幹部在後台 opt-in，見 /api/board/admin/comment-subscribe）
 */
import 'server-only';
import crypto from 'node:crypto';
import { getServerClient } from '../supabase/server';
import { getEnv } from '../env';
import { makePayload, makeCommentPayload, type PushPayload } from './payload';
import { sendOne, type SubscriptionShape, type DeliveryResult } from './web-push';
import { pushPostToLineGroup } from '../board/line_push';
import { deptInfo } from '../depts';

type ClaimedJob = {
  job_id: string;
  post_id: string;
  event_type: string;
  attempt_count: number;
  comment_id: string | null;
};

type SubRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  dept_filter: string[];
  failure_count: number;
};

type PostRow = {
  id: string;
  department_id: string;
  title: string;
  content: string;
  published: boolean;
};

type CommentRow = {
  id: string;
  post_id: string;
  author_name: string | null;
  content: string;
  status: string;
};

const DELIVERY_MAX_FAILURES = 5;

function hashEndpoint(endpoint: string): string {
  return crypto.createHash('sha256').update(endpoint).digest('hex');
}

async function markJobFailed(
  supabase: ReturnType<typeof getServerClient>,
  jobId: string,
  reason: string,
) {
  await supabase
    .from('push_jobs')
    .update({
      status: 'failed',
      finished_at: new Date().toISOString(),
      last_error: reason,
    })
    .eq('id', jobId);
}

async function markJobSentEmpty(
  supabase: ReturnType<typeof getServerClient>,
  jobId: string,
  postId: string,
) {
  await supabase
    .from('push_jobs')
    .update({ status: 'sent', finished_at: new Date().toISOString() })
    .eq('id', jobId);
  await supabase.from('push_log').insert({
    job_id: jobId,
    post_id: postId,
    total_subscribers: 0,
    sent_count: 0,
    failed_count: 0,
    gone_count: 0,
  });
}

async function processChunk<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const r = await Promise.all(chunk.map(fn));
    out.push(...r);
  }
  return out;
}

/** 共用 fan-out + delivery 記錄 + 訂閱清理，post_published / comment_created 都走這條 */
async function fanOutAndRecord(opts: {
  supabase: ReturnType<typeof getServerClient>;
  jobId: string;
  postId: string;
  payload: PushPayload;
  subs: SubRow[];
  perCallTimeout: number;
  concurrency: number;
  jobTrace: string;
  attemptCount: number;
}) {
  const { supabase, jobId, postId, payload, subs, perCallTimeout, concurrency, jobTrace, attemptCount } = opts;

  if (subs.length === 0) {
    console.info('[push.dispatcher.no_subscribers]', { jobTrace, job_id: jobId, post_id: postId });
    await markJobSentEmpty(supabase, jobId, postId);
    return;
  }

  type DeliverItem = { sub: SubRow; result: DeliveryResult };
  const results = await processChunk<SubRow, DeliverItem>(subs, concurrency, async (sub) => {
    const r = await sendOne(
      { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
      payload,
      perCallTimeout,
    );
    return { sub, result: r };
  });

  const deliveryRows = results.map(({ sub, result }) => {
    const status: string = result.ok
      ? 'sent'
      : result.errorClass === '410_gone'
        ? 'gone'
        : result.errorClass === 'timeout' ||
            result.errorClass === '5xx' ||
            result.errorClass === '429_rate_limit'
          ? 'timeout_retryable'
          : 'failed';
    return {
      job_id: jobId,
      subscription_id: sub.id,
      endpoint_hash: hashEndpoint(sub.endpoint),
      status,
      http_status: result.statusCode ?? null,
      error_class: result.errorClass ?? null,
      attempt: attemptCount,
      duration_ms: result.durationMs,
      sent_at: result.ok ? new Date().toISOString() : null,
      trace_id: jobTrace,
    };
  });
  await supabase.from('push_deliveries').insert(deliveryRows);

  const gone = results.filter((r) => r.result.errorClass === '410_gone');
  if (gone.length > 0) {
    await supabase
      .from('push_subscriptions')
      .delete()
      .in('id', gone.map((g) => g.sub.id));
  }

  const retryable = results.filter(
    (r) =>
      !r.result.ok &&
      (r.result.errorClass === 'timeout' ||
        r.result.errorClass === '5xx' ||
        r.result.errorClass === '429_rate_limit'),
  );
  for (const r of retryable) {
    const nextCount = (r.sub.failure_count ?? 0) + 1;
    if (nextCount >= DELIVERY_MAX_FAILURES) {
      await supabase.from('push_subscriptions').delete().eq('id', r.sub.id);
    } else {
      await supabase
        .from('push_subscriptions')
        .update({ failure_count: nextCount })
        .eq('id', r.sub.id);
    }
  }

  const sentCount = results.filter((r) => r.result.ok).length;
  const goneCount = gone.length;
  const failedCount = results.length - sentCount;

  const jobStatus: 'sent' | 'partial_failed' | 'failed' =
    sentCount === results.length ? 'sent' : sentCount === 0 ? 'failed' : 'partial_failed';

  await supabase
    .from('push_jobs')
    .update({ status: jobStatus, finished_at: new Date().toISOString() })
    .eq('id', jobId);

  await supabase.from('push_log').insert({
    job_id: jobId,
    post_id: postId,
    total_subscribers: results.length,
    sent_count: sentCount,
    failed_count: failedCount,
    gone_count: goneCount,
  });

  console.info('[push.dispatcher.job_done]', {
    jobTrace,
    job_id: jobId,
    total: results.length,
    sent: sentCount,
    failed: failedCount,
    gone: goneCount,
    status: jobStatus,
  });
}

export async function processQueuedJobs(opts?: {
  batchSize?: number;
}): Promise<{ processed: number; reason?: string }> {
  const traceId = crypto.randomUUID();
  const env = getEnv();

  if (env.PUSH_ENABLED !== 'true') {
    console.warn('[push.dispatcher.disabled]', { traceId });
    return { processed: 0, reason: 'PUSH_ENABLED=false' };
  }
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) {
    console.warn('[push.dispatcher.no_vapid]', { traceId });
    return { processed: 0, reason: 'VAPID keys not configured' };
  }

  const supabase = getServerClient();
  const batchSize = opts?.batchSize ?? env.PUSH_BATCH_SIZE;
  const concurrency = env.PUSH_CONCURRENCY;
  const perCallTimeout = env.PUSH_PER_CALL_TIMEOUT_MS;

  const { data: jobsRows, error: claimErr } = await supabase.rpc('claim_push_jobs', {
    p_limit: Math.min(batchSize, 10),
  });
  if (claimErr) {
    console.error('[push.dispatcher.claim_failed]', { traceId, error: claimErr.message });
    return { processed: 0, reason: claimErr.message };
  }
  const jobs = (jobsRows ?? []) as ClaimedJob[];
  if (jobs.length === 0) return { processed: 0 };

  console.info('[push.dispatcher.start]', { traceId, claimed: jobs.length });

  let processed = 0;
  for (const job of jobs) {
    if (job.event_type === 'comment_created') {
      await processCommentJob(job, supabase, perCallTimeout, concurrency, traceId);
    } else {
      await processPostPublishedJob(job, supabase, perCallTimeout, concurrency, traceId);
    }
    processed++;
  }

  return { processed };
}

async function processPostPublishedJob(
  job: ClaimedJob,
  supabase: ReturnType<typeof getServerClient>,
  perCallTimeout: number,
  concurrency: number,
  parentTrace: string,
) {
  const jobTrace = crypto.randomUUID();

  const { data: postRow, error: postErr } = await supabase
    .from('posts')
    .select('id, department_id, title, content, published')
    .eq('id', job.post_id)
    .maybeSingle();
  if (postErr || !postRow || !postRow.published) {
    console.warn('[push.dispatcher.post_unavailable]', {
      parentTrace,
      jobTrace,
      job_id: job.job_id,
      reason: postErr?.message || 'unpublished_or_missing',
    });
    await markJobFailed(supabase, job.job_id, 'post_unavailable');
    return;
  }
  const post = postRow as unknown as PostRow;

  // L2: 同步 fire-and-forget 推 LINE 班群（不阻塞下方 web push fan-out）
  // 未設 LINE_BOT_WEBHOOK_URL / BOT_SYNC_SECRET → line_push.ts 自動 skip + 回 ok:false
  // 任何錯誤都吞掉、只 log，不影響 web push 流程或 job 標記
  void pushPostToLineGroup({
    postId: post.id,
    title: post.title,
    deptName: deptInfo(post.department_id).name,
  })
    .then((r) => {
      if (r.ok) {
        console.info('[push.dispatcher.line_pushed]', { jobTrace, post_id: post.id, status: r.status });
      } else if (r.reason !== 'no_url' && r.reason !== 'no_secret') {
        console.warn('[push.dispatcher.line_push_failed]', { jobTrace, post_id: post.id, reason: r.reason, detail: r.detail });
      }
    })
    .catch((err) => {
      console.warn('[push.dispatcher.line_push_throw]', { jobTrace, post_id: post.id, error: err instanceof Error ? err.message : String(err) });
    });

  // 2026-05-27 設計簡化：全班統一一條推播 channel。
  // 任何部門發新公告 → fan-out 給所有 push_subscriptions。
  // dept_filter 欄位只給 comment_created 用，這裡不讀。
  const { data: subsRows, error: subsErr } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, dept_filter, failure_count');

  if (subsErr) {
    console.error('[push.dispatcher.subs_load_failed]', { jobTrace, error: subsErr.message });
    await markJobFailed(supabase, job.job_id, subsErr.message);
    return;
  }
  const subs = (subsRows ?? []) as SubRow[];
  const payload: PushPayload = makePayload(post);

  await fanOutAndRecord({
    supabase,
    jobId: job.job_id,
    postId: post.id,
    payload,
    subs,
    perCallTimeout,
    concurrency,
    jobTrace,
    attemptCount: job.attempt_count,
  });
}

async function processCommentJob(
  job: ClaimedJob,
  supabase: ReturnType<typeof getServerClient>,
  perCallTimeout: number,
  concurrency: number,
  parentTrace: string,
) {
  const jobTrace = crypto.randomUUID();

  if (!job.comment_id) {
    console.warn('[push.dispatcher.comment_job_missing_id]', { parentTrace, jobTrace, job_id: job.job_id });
    await markJobFailed(supabase, job.job_id, 'comment_id_missing');
    return;
  }

  const { data: commentRow, error: commentErr } = await supabase
    .from('comments')
    .select('id, post_id, author_name, content, status')
    .eq('id', job.comment_id)
    .maybeSingle();
  // 只推 visible 留言——pending_review（url spam 嫌疑）審核前不通知，避免把未過濾內容推給幹部
  if (commentErr || !commentRow || commentRow.status !== 'visible') {
    console.warn('[push.dispatcher.comment_unavailable]', {
      parentTrace,
      jobTrace,
      job_id: job.job_id,
      reason: commentErr?.message || 'not_visible_or_missing',
    });
    await markJobFailed(supabase, job.job_id, 'comment_unavailable');
    return;
  }
  const comment = commentRow as unknown as CommentRow;

  const { data: postRow, error: postErr } = await supabase
    .from('posts')
    .select('id, department_id, title, content, published')
    .eq('id', job.post_id)
    .maybeSingle();
  if (postErr || !postRow || !postRow.published) {
    console.warn('[push.dispatcher.post_unavailable]', {
      parentTrace,
      jobTrace,
      job_id: job.job_id,
      reason: postErr?.message || 'unpublished_or_missing',
    });
    await markJobFailed(supabase, job.job_id, 'post_unavailable');
    return;
  }
  const post = postRow as unknown as PostRow;

  // 只推給有 opt-in 該部門留言通知的訂閱（dept_filter 包含 post.department_id）
  // 一般同學自助訂閱的裝置 dept_filter 永遠 []，不會中，不會被留言轟炸。
  const { data: subsRows, error: subsErr } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, dept_filter, failure_count')
    .contains('dept_filter', [post.department_id]);

  if (subsErr) {
    console.error('[push.dispatcher.subs_load_failed]', { jobTrace, error: subsErr.message });
    await markJobFailed(supabase, job.job_id, subsErr.message);
    return;
  }
  const subs = (subsRows ?? []) as SubRow[];
  const payload: PushPayload = makeCommentPayload(comment, post);

  await fanOutAndRecord({
    supabase,
    jobId: job.job_id,
    postId: post.id,
    payload,
    subs,
    perCallTimeout,
    concurrency,
    jobTrace,
    attemptCount: job.attempt_count,
  });
}
