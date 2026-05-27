-- ============================================================
-- E118 公告欄 — Push dispatcher RPC
-- 對應 ARCHITECTURE.md v3 第 7 章 outbox worker + Codex Rel F1/F3
-- ============================================================
--
-- claim_push_jobs: atomic 領 jobs（queued or stale-sending），UPDATE 到 sending +
-- attempt_count++ + locked_at=now。Postgres SKIP LOCKED 防多個 worker 搶同一 job。
-- ============================================================

CREATE OR REPLACE FUNCTION claim_push_jobs(p_limit int DEFAULT 5)
RETURNS TABLE(
  job_id uuid,
  post_id uuid,
  event_type text,
  attempt_count int
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
  RETURNING pj.id, pj.post_id, pj.event_type, pj.attempt_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION claim_push_jobs(int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION claim_push_jobs(int) FROM anon, authenticated;
