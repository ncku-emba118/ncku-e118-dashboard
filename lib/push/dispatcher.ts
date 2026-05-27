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
 */
import 'server-only';
import crypto from 'node:crypto';
import { getServerClient } from '../supabase/server';
import { getEnv } from '../env';
import { makePayload, type PushPayload } from './payload';
import { sendOne, type SubscriptionShape, type DeliveryResult } from './web-push';

type ClaimedJob = {
  job_id: string;
  post_id: string;
  event_type: string;
  attempt_count: number;
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

const DELIVERY_MAX_FAILURES = 5;

function hashEndpoint(endpoint: string): string {
  return crypto.createHash('sha256').update(endpoint).digest('hex');
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

  // 1. Claim jobs atomically
  const { data: jobsRows, error: claimErr } = await supabase.rpc(
    'claim_push_jobs',
    { p_limit: Math.min(batchSize, 10) },
  );
  if (claimErr) {
    console.error('[push.dispatcher.claim_failed]', {
      traceId,
      error: claimErr.message,
    });
    return { processed: 0, reason: claimErr.message };
  }
  const jobs = (jobsRows ?? []) as ClaimedJob[];
  if (jobs.length === 0) return { processed: 0 };

  console.info('[push.dispatcher.start]', {
    traceId,
    claimed: jobs.length,
  });

  let processed = 0;
  for (const job of jobs) {
    await processOneJob(job, supabase, perCallTimeout, concurrency, traceId);
    processed++;
  }

  return { processed };
}

async function processOneJob(
  job: ClaimedJob,
  supabase: ReturnType<typeof getServerClient>,
  perCallTimeout: number,
  concurrency: number,
  parentTrace: string,
) {
  const jobTrace = crypto.randomUUID();

  // Load post
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
    await supabase
      .from('push_jobs')
      .update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        last_error: 'post_unavailable',
      })
      .eq('id', job.job_id);
    return;
  }
  const post = postRow as unknown as PostRow;

  // 2026-05-27 設計簡化：全班統一一條推播 channel。
  // 任何部門發新公告 → fan-out 給所有 push_subscriptions。
  // dept_filter 欄位保留在 DB（不刪 schema、避免 migration 風險），但 dispatcher 不再讀。
  const { data: subsRows, error: subsErr } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, dept_filter, failure_count');

  if (subsErr) {
    console.error('[push.dispatcher.subs_load_failed]', {
      jobTrace,
      error: subsErr.message,
    });
    await supabase
      .from('push_jobs')
      .update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        last_error: subsErr.message,
      })
      .eq('id', job.job_id);
    return;
  }
  const subs = (subsRows ?? []) as SubRow[];

  if (subs.length === 0) {
    console.info('[push.dispatcher.no_subscribers]', {
      jobTrace,
      job_id: job.job_id,
      post_id: post.id,
    });
    await supabase
      .from('push_jobs')
      .update({
        status: 'sent',
        finished_at: new Date().toISOString(),
      })
      .eq('id', job.job_id);
    await supabase.from('push_log').insert({
      job_id: job.job_id,
      post_id: post.id,
      total_subscribers: 0,
      sent_count: 0,
      failed_count: 0,
      gone_count: 0,
    });
    return;
  }

  const payload: PushPayload = makePayload(post);

  // Fan-out with concurrency
  type DeliverItem = { sub: SubRow; result: DeliveryResult };
  const results = await processChunk<SubRow, DeliverItem>(
    subs,
    concurrency,
    async (sub) => {
      const r = await sendOne(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        payload,
        perCallTimeout,
      );
      return { sub, result: r };
    },
  );

  // Write push_deliveries + handle subscription failure_count / cleanup
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
      job_id: job.job_id,
      subscription_id: sub.id,
      endpoint_hash: hashEndpoint(sub.endpoint),
      status,
      http_status: result.statusCode ?? null,
      error_class: result.errorClass ?? null,
      attempt: job.attempt_count,
      duration_ms: result.durationMs,
      sent_at: result.ok ? new Date().toISOString() : null,
      trace_id: jobTrace,
    };
  });
  await supabase.from('push_deliveries').insert(deliveryRows);

  // 410 → 刪訂閱
  const gone = results.filter((r) => r.result.errorClass === '410_gone');
  if (gone.length > 0) {
    await supabase
      .from('push_subscriptions')
      .delete()
      .in('id', gone.map((g) => g.sub.id));
  }

  // retryable 失敗 → failure_count++；達 DELIVERY_MAX_FAILURES 刪
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
      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('id', r.sub.id);
    } else {
      await supabase
        .from('push_subscriptions')
        .update({ failure_count: nextCount })
        .eq('id', r.sub.id);
    }
  }

  // Aggregate stats
  const sentCount = results.filter((r) => r.result.ok).length;
  const goneCount = gone.length;
  const failedCount = results.length - sentCount;

  const jobStatus: 'sent' | 'partial_failed' | 'failed' =
    sentCount === results.length
      ? 'sent'
      : sentCount === 0
        ? 'failed'
        : 'partial_failed';

  await supabase
    .from('push_jobs')
    .update({
      status: jobStatus,
      finished_at: new Date().toISOString(),
    })
    .eq('id', job.job_id);

  await supabase.from('push_log').insert({
    job_id: job.job_id,
    post_id: post.id,
    total_subscribers: results.length,
    sent_count: sentCount,
    failed_count: failedCount,
    gone_count: goneCount,
  });

  console.info('[push.dispatcher.job_done]', {
    jobTrace,
    job_id: job.job_id,
    total: results.length,
    sent: sentCount,
    failed: failedCount,
    gone: goneCount,
    status: jobStatus,
  });
}
