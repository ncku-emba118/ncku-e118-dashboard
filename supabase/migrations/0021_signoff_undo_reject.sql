-- ============================================================
-- 0021 — 撤銷退回（誤觸復原）
--
-- 事故：簽核人誤觸「退回」、理由欄填「滑到」，一張已有 2 人簽名的單
-- 整份停止簽核。原本唯一的補救是班代作廢後整張重開 —— 欄位重打、
-- 附件重傳、已簽的人重簽，連補充資料都會被一起刪掉。
--
-- 但實際觀察資料庫：退回時「其他簽核人的 assignment 完全沒被動過」，
-- 只有文件 status 轉 rejected、退回者自己那筆轉 rejected。既有簽名對應的
-- 內容也沒有任何改變。因此誤觸的正確補救不是重建文件，而是把狀態轉回去：
--   • 文件 status: rejected → routing
--   • 退回者那筆 assignment: rejected → pending（清掉理由與處理時間）
--   • 其他人的簽名完全不動（他們簽的內容從頭到尾沒變過）
--
-- 授權：退回本人（自己知道按錯）或 super。
-- 稽核：退回與撤銷都留在 append-only 的 signoff_audit，時序完整可查。
--
-- 註：若是「內容真的要改」而退回，仍須版本鏈重簽（另案），本 migration
-- 只處理誤觸復原。
-- ============================================================

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- ------------------------------------------------------------
-- 1. audit event_type 擴充
-- ------------------------------------------------------------
ALTER TABLE signoff_audit DROP CONSTRAINT IF EXISTS signoff_audit_event_type_check;
ALTER TABLE signoff_audit ADD CONSTRAINT signoff_audit_event_type_check
  CHECK(event_type IN (
    'created','viewed','challenge_issued','upload_url_issued',
    'signed','rejected','nudged','finalized','voided',
    'supplemented','reject_undone'
  ));

-- ------------------------------------------------------------
-- 2. RPC: signoff_undo_reject
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION signoff_undo_reject(
  p_document_id     UUID,
  p_account_id      UUID,
  p_ip_hash         TEXT,
  p_ip_hash_version INT,
  p_user_agent      TEXT,
  p_trace_id        TEXT
) RETURNS VOID AS $$
DECLARE
  v_status        TEXT;
  v_role          TEXT;
  v_assignment_id UUID;
  v_rejecter      UUID;
  v_reason        TEXT;
BEGIN
  -- 與 sign / reject / void / add_supplement 共用同一鎖點
  SELECT status INTO v_status
    FROM signoff_documents WHERE id = p_document_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'signoff_undo_reject: document not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_status IS DISTINCT FROM 'rejected' THEN
    RAISE EXCEPTION 'signoff_undo_reject: document is not rejected (status=%)', v_status
      USING ERRCODE = 'check_violation';
  END IF;

  -- 找出造成退回的那筆指派
  SELECT id, signer_account_id, reject_reason
    INTO v_assignment_id, v_rejecter, v_reason
    FROM signoff_assignments
   WHERE document_id = p_document_id AND status = 'rejected'
   ORDER BY acted_at DESC NULLS LAST
   LIMIT 1;
  IF v_assignment_id IS NULL THEN
    RAISE EXCEPTION 'signoff_undo_reject: no rejected assignment found'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- in-function 授權（比照 signoff_delete / add_supplement）：
  -- 退回本人或 super；API 層已擋一次，此處防繞過與冒名。
  SELECT role INTO v_role FROM accounts WHERE id = p_account_id;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'signoff_undo_reject: unknown account'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_role IS DISTINCT FROM 'super' AND p_account_id IS DISTINCT FROM v_rejecter THEN
    RAISE EXCEPTION 'signoff_undo_reject: requires the rejecter or super'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 還原：退回者回到待簽，其他人的簽名完全不動
  UPDATE signoff_assignments
     SET status = 'pending', reject_reason = NULL, acted_at = NULL
   WHERE id = v_assignment_id;

  UPDATE signoff_documents SET status = 'routing' WHERE id = p_document_id;

  INSERT INTO signoff_audit(
    document_id, account_id, event_type, ip_hash, ip_hash_version, user_agent, trace_id, detail
  ) VALUES (
    p_document_id, p_account_id, 'reject_undone', p_ip_hash, p_ip_hash_version, p_user_agent, p_trace_id,
    jsonb_build_object(
      'restored_assignment_id', v_assignment_id,
      'original_rejecter', v_rejecter,
      'original_reason', v_reason
    )
  );
END;
$$ LANGUAGE plpgsql;

REVOKE ALL ON FUNCTION signoff_undo_reject(UUID,UUID,TEXT,INT,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION signoff_undo_reject(UUID,UUID,TEXT,INT,TEXT,TEXT) TO service_role;
