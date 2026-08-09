-- ============================================================
-- E118 公告欄 — 留言推播（comment_created event）
-- 對應 2026-08-09 需求：有人留言時通知該部門幹部（部門層級 opt-in，非全班廣播）
-- ============================================================
--
-- 設計：
--   • push_jobs 加 comment_id，讓同一篇公告可以有多筆 comment_created job
--     （原本 idx_push_jobs_dedup 是 (post_id, event_type) unique，
--      同一篇公告第二則留言會直接撞 unique constraint 被吃掉）
--   • dedup 規則拆成兩條 partial unique index：
--       post_published  → 同 post 只一個 job（維持原行為，防雙送出）
--       comment_created → 同 comment 只一個 job（每則留言各自一個 job）
--   • push_subscriptions.dept_filter 重新啟用：
--       原本「全班統一推播」設計下這欄位永遠 []、dispatcher 不讀。
--       現在 comment_created 事件會讀這欄位，只推給 dept_filter 有包含
--       該公告 department_id 的訂閱（部門幹部在後台自己 opt-in）。
--       post_published 事件維持原行為（不讀 dept_filter、全班照舊 fan-out）。
-- ============================================================

ALTER TABLE push_jobs
  ADD COLUMN comment_id UUID REFERENCES comments(id) ON DELETE CASCADE;

DROP INDEX IF EXISTS idx_push_jobs_dedup;

CREATE UNIQUE INDEX idx_push_jobs_dedup_post
  ON push_jobs(post_id)
  WHERE event_type = 'post_published';

CREATE UNIQUE INDEX idx_push_jobs_dedup_comment
  ON push_jobs(comment_id)
  WHERE event_type = 'comment_created';

-- claim_push_jobs 要多回傳 comment_id 給 dispatcher 判斷事件類型該讀哪張表
-- ⚠ 回傳型別變了（多一欄），CREATE OR REPLACE 對 return type 改變會噴
-- 42P13「cannot change return type of existing function」，要先 DROP 再建。
DROP FUNCTION IF EXISTS claim_push_jobs(int);

CREATE FUNCTION claim_push_jobs(p_limit int DEFAULT 5)
RETURNS TABLE(
  job_id uuid,
  post_id uuid,
  event_type text,
  attempt_count int,
  comment_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT pj.id
    FROM push_jobs pj
    WHERE pj.status = 'queued'
       OR (pj.status = 'sending' AND pj.locked_at < now() - interval '5 minutes')
    ORDER BY pj.created_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE push_jobs pj
  SET
    status = 'sending',
    locked_at = now(),
    started_at = COALESCE(pj.started_at, now()),
    attempt_count = pj.attempt_count + 1
  FROM claimed
  WHERE pj.id = claimed.id
  RETURNING pj.id, pj.post_id, pj.event_type, pj.attempt_count, pj.comment_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION claim_push_jobs(int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION claim_push_jobs(int) FROM anon, authenticated;
