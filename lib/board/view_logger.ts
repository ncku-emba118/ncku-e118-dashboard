/**
 * Post view logger — 公告閱讀數追蹤（隱私友善）
 *
 * 設計：
 *   - SHA256(ip + ua + post_id + yyyy-mm-dd + IP_HASH_SECRET) → visitor_hash
 *   - 不存 raw IP；ua 截到 120 字（裝置統計用、不可識別個人）
 *   - 同 visitor 同天同 post → DB unique constraint dedup（ON CONFLICT DO NOTHING）
 *   - **Fail-soft**：任何錯誤吞掉（讓 page render 不受影響）。
 *
 * 用法（server component）：
 *   import { headers } from 'next/headers';
 *   const h = await headers();
 *   await logPostView(postId, h);  // fire-and-await 但 try/catch 內、永不 throw
 */

import 'server-only';
import { createHash } from 'node:crypto';
import { getServerClient } from '@/lib/supabase/server';

type HeadersLike = {
  get(name: string): string | null;
};

/**
 * 從 request headers 拿 client IP。Netlify / Vercel / Cloudflare 各家 header 不同。
 * Fallback chain：x-nf-client-connection-ip → cf-connecting-ip → x-forwarded-for(first) → x-real-ip → ''
 */
function getClientIp(h: HeadersLike): string {
  const candidates = [
    h.get('x-nf-client-connection-ip'),
    h.get('cf-connecting-ip'),
    h.get('x-forwarded-for')?.split(',')[0]?.trim(),
    h.get('x-real-ip'),
  ];
  for (const c of candidates) {
    if (c && c.length > 0) return c;
  }
  return '';
}

/**
 * 同 visitor 同 post 同天 → 同 hash → DB unique 擋住重複 insert。
 * Salt 用 IP_HASH_SECRET（既有 env，bot/finance 共用同把）— 防 rainbow table。
 */
function computeVisitorHash(ip: string, ua: string, postId: string): string {
  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
  const secret = process.env.IP_HASH_SECRET || '';
  return createHash('sha256')
    .update(`${ip}|${ua}|${postId}|${day}|${secret}`)
    .digest('hex');
}

/**
 * 紀錄一次公告 view。Fail-soft：吞掉所有錯誤、不影響 page render。
 *
 * @param postId UUID of post
 * @param h request headers (from next/headers 的 headers())
 */
export async function logPostView(
  postId: string,
  h: HeadersLike,
): Promise<void> {
  try {
    const ip = getClientIp(h);
    const ua = (h.get('user-agent') || '').slice(0, 500);
    if (!ip && !ua) return; // 連 IP / UA 都沒有，不記
    const visitorHash = computeVisitorHash(ip, ua, postId);
    const uaShort = ua.slice(0, 120);
    const supabase = getServerClient();
    // ON CONFLICT DO NOTHING (依 unique index `idx_post_views_dedup` on (post_id, visitor_hash))
    const { error } = await supabase.from('post_views').insert({
      post_id: postId,
      visitor_hash: visitorHash,
      ua_short: uaShort,
    });
    if (error && !/duplicate key|already exists|conflict/i.test(error.message)) {
      // 真錯誤（非 dedup conflict）才 log 一下，但仍不 throw
      console.warn('[view_logger.insert.failed]', { postId, error: error.message });
    }
  } catch (err) {
    // 任何 throw（DB down、env 不在、headers 出怪）都吞掉
    console.warn('[view_logger.swallowed]', err instanceof Error ? err.message : String(err));
  }
}

/**
 * 批量撈每則 post 的 view count。給 admin list 用。
 * Fail-soft：撈不到回空 Map（admin 不會崩、只是顯示 0 或 —）。
 */
export async function getPostViewCounts(
  postIds: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (postIds.length === 0) return result;
  try {
    const supabase = getServerClient();
    const { data, error } = await supabase
      .from('post_views')
      .select('post_id')
      .in('post_id', postIds);
    if (error) {
      console.warn('[view_logger.count.failed]', { error: error.message });
      return result;
    }
    for (const row of data || []) {
      const pid = row.post_id as string;
      result.set(pid, (result.get(pid) || 0) + 1);
    }
  } catch (err) {
    console.warn('[view_logger.count.swallowed]', err instanceof Error ? err.message : String(err));
  }
  return result;
}
