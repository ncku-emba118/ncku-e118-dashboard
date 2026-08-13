-- ============================================================
-- 0027 — 經費簽核：收款帳號欄位 + 財務長強制為必選簽核人（2026-08-13 使用者拍板）
--
-- 任務1（財務長必選、排最後一關）：純屬 route 層邏輯（app/api/board/signoff/
-- route.ts 建單時強制補上/重排），不需要新欄位、不需要動 RPC 的簽核人驗證，
-- 這裡不涉及。
--
-- 任務2（收款帳號）：新增 signoff_documents.payment_account（nullable JSONB，
-- 選填），存 { bank, branch, account_name, account_number }（四欄皆可為 null）。
-- 比照既有 attachments 欄位走 JSONB（同一張表已有前例），不用四支獨立欄位——
-- 這組資料只在「顯示 / 印 PDF」時整包讀出，沒有需要單獨索引查詢的欄位。
-- 帳號照片沿用既有 attachments 陣列（label='收款帳號證明'，見
-- lib/signoff/constants.ts ATTACHMENT_LABELS），不新增 storage 路徑或欄位。
--
-- 只加欄位、CREATE OR REPLACE 既有 RPC（signoff_create_document 需要吃新欄位），
-- 不動既有資料、不動其餘 0007-0026 已上線的欄位 / index / RLS / trigger。
-- ============================================================

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE signoff_documents
  ADD COLUMN IF NOT EXISTS payment_account JSONB
  CHECK (payment_account IS NULL OR jsonb_typeof(payment_account) = 'object');

-- ============================================================
-- CREATE OR REPLACE signoff_create_document：加入 payment_account 寫入。
-- 其餘邏輯（idempotency / assignments loop / audit）完全不變，只多帶一欄。
-- p_doc->'payment_account' 缺 key 時回傳 SQL NULL、帶 JSON null 時回傳
-- jsonb 'null'，兩者存進 nullable jsonb 欄位都是「沒有收款帳號」的正確語意。
-- ============================================================
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
    supersedes_document_id, due_at, payment_account)
  VALUES (
    COALESCE(NULLIF(p_doc->>'id','')::uuid, gen_random_uuid()),
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
    p_doc->'payment_account')
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
