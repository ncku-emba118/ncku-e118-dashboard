-- ============================================================
-- 0022 — 結算單關聯簽核（settlement_no）
--
-- 背景：/budget/settlement/[slug] 結算單頁原本要靠人工把已核准的
-- signoff_documents.id 手動填進 lib/budget/data.ts 的 Activity.settlement.
-- signoffRef 再重新部署，才會顯示「已完成幹部簽核」。
--
-- 本 migration 加一個 settlement_no 欄位，讓建立簽核文件時可以標註
-- 對應哪一張結算單編號（例如 E118-S-2026-001）。結算單頁面之後直接
-- 在 server 端即時查 signoff_documents WHERE settlement_no = ...，
-- 不必再手動維護 signoffRef、也不必為了顯示簽核狀態重新部署。
--
-- 只加欄位 + index，不動既有 RLS / append-only 規則；
-- signoff_create_document（0007）需要一併更新才能實際寫入這個新欄位，
-- 一併在本 migration 內 CREATE OR REPLACE（邏輯與 0007 完全相同，只多帶
-- 一個 settlement_no 欄位）。
-- ============================================================

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- ------------------------------------------------------------
-- 1. 欄位 + index
-- ------------------------------------------------------------
ALTER TABLE signoff_documents ADD COLUMN IF NOT EXISTS settlement_no TEXT;

CREATE INDEX IF NOT EXISTS idx_signoff_documents_settlement_no
  ON signoff_documents(settlement_no) WHERE settlement_no IS NOT NULL;

-- ------------------------------------------------------------
-- 2. signoff_create_document — 補寫 settlement_no（其餘邏輯與 0007 相同）
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION signoff_create_document(
  p_doc         JSONB,
  p_assignments JSONB,
  p_audit       JSONB
) RETURNS UUID AS $$
DECLARE
  v_existing UUID;
  v_id       UUID;
  v_a        JSONB;
BEGIN
  -- idempotency：同 created_by + client_request_id 已存在 → 回原 id
  SELECT id INTO v_existing FROM signoff_documents
   WHERE created_by = (p_doc->>'created_by')::uuid
     AND client_request_id = (p_doc->>'client_request_id')::uuid;
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  INSERT INTO signoff_documents(
    id,
    title, amount, currency, purpose, applicant, created_by, owner_dept_id,
    client_request_id, attachments,
    signoff_sheet_object_path, assignment_manifest_sha256, flow_type,
    supersedes_document_id, due_at, settlement_no)
  VALUES (
    COALESCE(NULLIF(p_doc->>'id','')::uuid, gen_random_uuid()),  -- app 預先產 id（sheet 路徑需要）
    p_doc->>'title',
    NULLIF(p_doc->>'amount','')::numeric,
    COALESCE(p_doc->>'currency','TWD'),
    p_doc->>'purpose',
    p_doc->>'applicant',
    (p_doc->>'created_by')::uuid,
    p_doc->>'owner_dept_id',
    (p_doc->>'client_request_id')::uuid,
    COALESCE(p_doc->'attachments', '[]'::jsonb),
    p_doc->>'signoff_sheet_object_path',
    p_doc->>'assignment_manifest_sha256',
    COALESCE(p_doc->>'flow_type','parallel'),
    NULLIF(p_doc->>'supersedes_document_id','')::uuid,
    NULLIF(p_doc->>'due_at','')::timestamptz,
    NULLIF(p_doc->>'settlement_no',''))                          -- 0022 新增
  RETURNING id INTO v_id;

  FOR v_a IN SELECT jsonb_array_elements(p_assignments) LOOP
    INSERT INTO signoff_assignments(
      document_id, signer_account_id, role_label, sequence_order,
      slot_page, slot_x, slot_y, slot_w, slot_h)
    VALUES (
      v_id,
      (v_a->>'signer_account_id')::uuid,
      v_a->>'role_label',
      NULLIF(v_a->>'sequence_order','')::int,
      (v_a->>'slot_page')::int,
      (v_a->>'slot_x')::real,
      (v_a->>'slot_y')::real,
      (v_a->>'slot_w')::real,
      (v_a->>'slot_h')::real);
  END LOOP;

  INSERT INTO signoff_audit(document_id, account_id, event_type, ip_hash, ip_hash_version, user_agent, trace_id)
  VALUES (v_id, (p_doc->>'created_by')::uuid, 'created',
          p_audit->>'ip_hash', NULLIF(p_audit->>'ip_hash_version','')::int,
          p_audit->>'user_agent', p_audit->>'trace_id');

  RETURN v_id;
END;
$$ LANGUAGE plpgsql;
