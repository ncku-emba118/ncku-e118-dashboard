-- ============================================================
-- 簽核單刪除權限（super = 班代/副班代/秘書）
-- append-only 設計原本禁刪；這裡開一個受控的 admin 刪除路徑：
--   • 只有 signoff_delete RPC（SECURITY DEFINER）在交易內設 session flag 放行 trigger
--   • 刪除前寫一筆 tombstone 到 signoff_deletion_log（誰刪了什麼，問責保留）
--   • 一般路徑仍然禁止改/刪（防竄改不變）
-- ============================================================

-- 刪除紀錄（tombstone）
CREATE TABLE IF NOT EXISTS signoff_deletion_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID NOT NULL,
  title           TEXT,
  amount          NUMERIC(12,2),
  status_before   TEXT,
  deleted_by      UUID REFERENCES accounts(id),
  ip_hash         TEXT,
  ip_hash_version INT,
  user_agent      TEXT,
  trace_id        TEXT,
  deleted_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE signoff_deletion_log ENABLE ROW LEVEL SECURITY;  -- 私有，只走 service role

-- forbid_mutation：UPDATE 永遠禁；DELETE 僅在 admin flag 開啟時放行
CREATE OR REPLACE FUNCTION forbid_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('app.allow_signoff_delete', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'append-only table %: % not allowed', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

-- assignment guard：定義欄位 immutable / INSERT 限 routing；DELETE 僅 admin flag 放行
CREATE OR REPLACE FUNCTION signoff_assignment_guard()
RETURNS TRIGGER AS $$
DECLARE
  v_doc_status TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_setting('app.allow_signoff_delete', true) = 'on' THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'signoff_assignments: DELETE not allowed (void document instead)';
  ELSIF TG_OP = 'INSERT' THEN
    SELECT status INTO v_doc_status FROM signoff_documents WHERE id = NEW.document_id;
    IF v_doc_status IS DISTINCT FROM 'routing' THEN
      RAISE EXCEPTION 'cannot add assignment to non-routing document (status=%)', v_doc_status;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.document_id        IS DISTINCT FROM OLD.document_id
       OR NEW.signer_account_id IS DISTINCT FROM OLD.signer_account_id
       OR NEW.role_label      IS DISTINCT FROM OLD.role_label
       OR NEW.sequence_order  IS DISTINCT FROM OLD.sequence_order
       OR NEW.slot_page       IS DISTINCT FROM OLD.slot_page
       OR NEW.slot_x          IS DISTINCT FROM OLD.slot_x
       OR NEW.slot_y          IS DISTINCT FROM OLD.slot_y
       OR NEW.slot_w          IS DISTINCT FROM OLD.slot_w
       OR NEW.slot_h          IS DISTINCT FROM OLD.slot_h THEN
      RAISE EXCEPTION 'signoff_assignments: definitional columns are immutable';
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 受控 admin 刪除：寫 tombstone → 放行 flag → 依序刪子表與主檔 → 回傳 storage 物件路徑供 route 清檔
CREATE OR REPLACE FUNCTION signoff_delete(
  p_document_id     UUID,
  p_account_id      UUID,
  p_ip_hash         TEXT,
  p_ip_hash_version INT,
  p_user_agent      TEXT,
  p_trace_id        TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc   signoff_documents%ROWTYPE;
  v_paths TEXT[] := ARRAY[]::TEXT[];
  v_att   TEXT[];
  v_sig   TEXT[];
BEGIN
  SELECT * INTO v_doc FROM signoff_documents WHERE id = p_document_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'signoff_delete: document not found' USING ERRCODE = 'no_data_found';
  END IF;

  -- 收集 storage 物件路徑
  v_paths := v_paths || v_doc.signoff_sheet_object_path;
  IF v_doc.final_pdf_object_path IS NOT NULL THEN
    v_paths := v_paths || v_doc.final_pdf_object_path;
  END IF;
  SELECT array_agg(a->>'object_path') INTO v_att FROM jsonb_array_elements(v_doc.attachments) a;
  IF v_att IS NOT NULL THEN v_paths := v_paths || v_att; END IF;
  SELECT array_agg(signature_png_path) INTO v_sig FROM signoff_signatures WHERE document_id = p_document_id;
  IF v_sig IS NOT NULL THEN v_paths := v_paths || v_sig; END IF;

  -- tombstone（問責保留）
  INSERT INTO signoff_deletion_log(document_id, title, amount, status_before, deleted_by, ip_hash, ip_hash_version, user_agent, trace_id)
  VALUES (p_document_id, v_doc.title, v_doc.amount, v_doc.status, p_account_id, p_ip_hash, p_ip_hash_version, p_user_agent, p_trace_id);

  -- 受控刪除（session-local flag，僅本交易放行 trigger）
  PERFORM set_config('app.allow_signoff_delete', 'on', true);
  DELETE FROM signoff_signatures  WHERE document_id = p_document_id;
  DELETE FROM signoff_audit       WHERE document_id = p_document_id;
  DELETE FROM signoff_assignments WHERE document_id = p_document_id;
  DELETE FROM signoff_documents   WHERE id = p_document_id;
  PERFORM set_config('app.allow_signoff_delete', 'off', true);

  RETURN to_jsonb(v_paths);
END;
$$;
