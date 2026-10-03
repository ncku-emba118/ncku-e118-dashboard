-- 手動順序 1：先套用 0030，再部署新版網站；最後才考慮 0031。
-- 本檔僅新增檢舉資料及權限，不收緊 comments，允許新舊網站並存。
-- 非重複執行腳本；若舊版 0030 曾套用，請先確認實際 schema，勿直接重跑。
BEGIN;

CREATE TABLE public.comment_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL,
  reporter_ip_hash text NOT NULL,
  reason text NOT NULL CHECK (reason IN ('inappropriate', 'spam', 'harassment', 'other')),
  details text NOT NULL DEFAULT '' CHECK (char_length(details) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  reviewed_by uuid REFERENCES public.accounts(id),
  reviewed_at timestamptz,
  resolution text CHECK (resolution IN ('dismissed', 'deleted')),
  CHECK ((resolved_at IS NULL AND resolution IS NULL)
      OR (resolved_at IS NOT NULL AND resolution IS NOT NULL)),
  UNIQUE (comment_id, reporter_id)
);
CREATE INDEX comment_reports_ip_time ON public.comment_reports(reporter_ip_hash, created_at);
CREATE INDEX comment_reports_pending_time ON public.comment_reports(created_at DESC, id) WHERE resolved_at IS NULL;
ALTER TABLE public.comment_reports ENABLE ROW LEVEL SECURITY;
-- No public policy: role accounts use the server's existing session/RBAC checks.
REVOKE ALL ON public.comment_reports FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.comment_reports TO service_role;

-- Validation, source rate limiting and deduplication are one transaction.
-- Reports never change comment status; only the reporter hides it locally.
CREATE FUNCTION public.report_comment(
  p_comment_id uuid, p_reporter_id uuid, p_reason text, p_details text, p_ip_hash text
) RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  target public.comments%ROWTYPE;
BEGIN
  IF p_reporter_id IS NULL OR p_ip_hash IS NULL OR p_ip_hash !~ '^[0-9a-f]{64}$'
     OR p_reason IS NULL OR p_reason NOT IN ('inappropriate', 'spam', 'harassment', 'other')
     OR p_details IS NULL OR char_length(p_details) > 500 THEN
    RAISE EXCEPTION 'invalid report';
  END IF;
  -- Serialize per source first, then per comment (same lock order for every call).
  PERFORM pg_advisory_xact_lock(hashtextextended('comment-report:' || p_ip_hash, 0));
  SELECT * INTO target FROM public.comments WHERE id = p_comment_id FOR UPDATE;
  IF NOT FOUND OR target.deleted_at IS NOT NULL OR target.status = 'deleted'
     OR NOT EXISTS (SELECT 1 FROM public.posts WHERE id = target.post_id AND published = true) THEN
    RETURN 'not_found';
  END IF;
  IF EXISTS (SELECT 1 FROM public.comment_reports WHERE comment_id = p_comment_id AND reporter_id = p_reporter_id) THEN
    RETURN 'duplicate';
  END IF;
  IF target.status <> 'visible' THEN
    RETURN 'not_found';
  END IF;
  IF (SELECT count(*) FROM public.comment_reports WHERE reporter_ip_hash = p_ip_hash
      AND created_at > now() - interval '1 hour') >= 10 THEN
    RETURN 'rate_limited';
  END IF;
  INSERT INTO public.comment_reports(comment_id, reporter_id, reporter_ip_hash, reason, details)
    VALUES (p_comment_id, p_reporter_id, p_ip_hash, p_reason, p_details);
  RETURN 'ok';
END;
$$;
REVOKE ALL ON FUNCTION public.report_comment(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_comment(uuid, uuid, text, text, text) TO service_role;

-- Verify only the objects introduced here; failed checks roll back this file.
DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.comment_reports'::regclass) THEN
    RAISE EXCEPTION 'comment_reports RLS is disabled';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'comment_reports') THEN
    RAISE EXCEPTION 'comment_reports must have no public policies';
  END IF;
  IF has_table_privilege('anon', 'public.comment_reports', 'SELECT,INSERT,UPDATE,DELETE')
     OR has_table_privilege('authenticated', 'public.comment_reports', 'SELECT,INSERT,UPDATE,DELETE')
     OR has_function_privilege('anon', 'public.report_comment(uuid,uuid,text,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.report_comment(uuid,uuid,text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'public report access must be disabled';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.comment_reports', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.comment_reports', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.comment_reports', 'UPDATE')
     OR NOT has_function_privilege('service_role', 'public.report_comment(uuid,uuid,text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role report access is missing';
  END IF;
END;
$$;

COMMIT;
