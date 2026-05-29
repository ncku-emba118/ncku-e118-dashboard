-- ============================================================
-- 簽核刪除功能 — Codex 安全審查修正（P0 + P1）
--   P0: signoff_delete 未撤 anon/authenticated execute + 無 in-function 角色驗證
--   P1: 放行 flag 改 document-scoped、tombstone 強化 + append-only、search_path 釘住
-- ============================================================

-- 清掉先前 RPC 直測留下的 NULL deleted_by 列（之後設 NOT NULL）
DELETE FROM signoff_deletion_log WHERE deleted_by IS NULL;

-- tombstone 強化（補問責欄位）
ALTER TABLE signoff_deletion_log
  ADD COLUMN IF NOT EXISTS created_by       UUID,
  ADD COLUMN IF NOT EXISTS owner_dept_id    TEXT,
  ADD COLUMN IF NOT EXISTS manifest_sha256  TEXT,
  ADD COLUMN IF NOT EXISTS final_pdf_sha256 TEXT;
ALTER TABLE signoff_deletion_log ALTER COLUMN deleted_by SET NOT NULL;

-- tombstone 本身嚴格 append-only（連刪除流程也不可改/刪它）
CREATE OR REPLACE FUNCTION forbid_all_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'append-only table %: % not allowed', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_deletion_log_append_only ON signoff_deletion_log;
CREATE TRIGGER trg_deletion_log_append_only
  BEFORE UPDATE OR DELETE ON signoff_deletion_log
  FOR EACH ROW EXECUTE FUNCTION forbid_all_mutation();

-- 放行 flag 改 document-scoped：trigger 只在 flag == 該列 document_id 時放行（Codex P1-5）
CREATE OR REPLACE FUNCTION forbid_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.document_id IS NOT NULL
     AND current_setting('app.allow_signoff_delete', true) = OLD.document_id::text THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'append-only table %: % not allowed', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION signoff_assignment_guard()
RETURNS TRIGGER AS $$
DECLARE v_doc_status TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_setting('app.allow_signoff_delete', true) = OLD.document_id::text THEN
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

-- signoff_delete：in-function super 驗證 + flag=doc_id + 強化 tombstone + schema-qualified
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
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_doc   public.signoff_documents%ROWTYPE;
  v_paths TEXT[] := ARRAY[]::TEXT[];
  v_att   TEXT[];
  v_sig   TEXT[];
  v_role  TEXT;
BEGIN
  -- in-function 授權：caller 必須是 super（防 route 被繞過）
  SELECT role INTO v_role FROM public.accounts WHERE id = p_account_id;
  IF v_role IS DISTINCT FROM 'super' THEN
    RAISE EXCEPTION 'signoff_delete: requires super account' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_doc FROM public.signoff_documents WHERE id = p_document_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'signoff_delete: document not found' USING ERRCODE = 'no_data_found';
  END IF;

  v_paths := v_paths || v_doc.signoff_sheet_object_path;
  IF v_doc.final_pdf_object_path IS NOT NULL THEN
    v_paths := v_paths || v_doc.final_pdf_object_path;
  END IF;
  SELECT array_agg(a->>'object_path') INTO v_att FROM jsonb_array_elements(v_doc.attachments) a;
  IF v_att IS NOT NULL THEN v_paths := v_paths || v_att; END IF;
  SELECT array_agg(signature_png_path) INTO v_sig FROM public.signoff_signatures WHERE document_id = p_document_id;
  IF v_sig IS NOT NULL THEN v_paths := v_paths || v_sig; END IF;

  INSERT INTO public.signoff_deletion_log(
    document_id, title, amount, status_before, created_by, owner_dept_id,
    manifest_sha256, final_pdf_sha256, deleted_by, ip_hash, ip_hash_version, user_agent, trace_id)
  VALUES (
    p_document_id, v_doc.title, v_doc.amount, v_doc.status, v_doc.created_by, v_doc.owner_dept_id,
    v_doc.assignment_manifest_sha256, v_doc.final_pdf_sha256, p_account_id, p_ip_hash, p_ip_hash_version, p_user_agent, p_trace_id);

  -- document-scoped 放行：只允許刪這一份文件的子列
  PERFORM set_config('app.allow_signoff_delete', p_document_id::text, true);
  DELETE FROM public.signoff_signatures  WHERE document_id = p_document_id;
  DELETE FROM public.signoff_audit       WHERE document_id = p_document_id;
  DELETE FROM public.signoff_assignments WHERE document_id = p_document_id;
  DELETE FROM public.signoff_documents   WHERE id = p_document_id;
  PERFORM set_config('app.allow_signoff_delete', '', true);

  RETURN to_jsonb(v_paths);
END;
$$;

-- P0：鎖死 execute 權限 —— 撤 public/anon/authenticated，只給 service_role（route 走 service role）
REVOKE ALL ON FUNCTION signoff_delete(uuid, uuid, text, integer, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION signoff_delete(uuid, uuid, text, integer, text, text) FROM anon;
REVOKE ALL ON FUNCTION signoff_delete(uuid, uuid, text, integer, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION signoff_delete(uuid, uuid, text, integer, text, text) TO service_role;
