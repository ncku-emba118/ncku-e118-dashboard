-- ============================================================
-- E118 公告欄 — Auth RPC functions (atomic lockout state machine)
-- 修 Codex #2 audit findings:
--   • Sec F1 / Rel F1 / Test F3: failed_attempts 非原子 RMW
--   • Rel F3: locked_until 過期後 failed_attempts 未歸零
--   • Rel F4: 成功登入無條件清 lockout，與並發失敗 race
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- record_failed_login — 原子增加 failed_attempts、必要時 lockout
-- 同時處理「過期 lockout 自動 reset」 → 一次 UPDATE 解 3 個 finding
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION record_failed_login(p_account_id uuid)
RETURNS TABLE(failed_attempts int, locked_until timestamptz, just_locked boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_failed int;
  v_locked_until timestamptz;
  v_just_locked boolean := false;
BEGIN
  -- 單一 UPDATE 完成所有狀態轉換（atomic, no read-then-write race）
  UPDATE accounts
  SET
    -- 過期 lockout 視為「fresh start」、本次失敗從 1 算起
    failed_attempts = CASE
      WHEN locked_until IS NOT NULL AND locked_until <= now() THEN 1
      ELSE failed_attempts + 1
    END,
    -- 達 10 次 → 鎖 24h；過期 lockout 已重設 counter、不會立刻又鎖
    locked_until = CASE
      WHEN locked_until IS NOT NULL AND locked_until <= now() THEN NULL
      WHEN failed_attempts + 1 >= 10 THEN now() + interval '24 hours'
      ELSE locked_until
    END
  WHERE id = p_account_id
  RETURNING accounts.failed_attempts, accounts.locked_until
  INTO v_failed, v_locked_until;

  -- 判斷本次更新是否剛好設了新的 lockout（給 caller 觸發 LINE notify）
  IF v_locked_until IS NOT NULL AND v_locked_until > now() AND v_failed >= 10 THEN
    v_just_locked := true;
  END IF;

  RETURN QUERY SELECT v_failed, v_locked_until, v_just_locked;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- record_successful_login — 條件式重設 counter，避免覆蓋並發 lock
-- 只在「目前未鎖」狀態下才清 counter；如果在我們驗密碼期間
-- 並發失敗剛把帳號鎖了，這次就不清、回 false
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION record_successful_login(p_account_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated int;
BEGIN
  UPDATE accounts
  SET
    failed_attempts = 0,
    locked_until = NULL,
    last_login_at = now()
  WHERE id = p_account_id
    AND (locked_until IS NULL OR locked_until <= now());

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 權限：只允許 service_role 呼叫，不對外（anon/authenticated）暴露
-- 防止有人從 anon REST 端直接戳 RPC 改別人 lockout 狀態
-- ────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION record_failed_login(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION record_failed_login(uuid) FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION record_successful_login(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION record_successful_login(uuid) FROM anon, authenticated;
