-- ============================================================
-- 0019 — 簽核補充資料（append-only）
--
-- 背景：原設計把「補充」與「修改」混為一談、一律禁止，導致連補一張
-- 報價單都做不到。但兩者性質不同：
--   • 修改 → 改動已簽過的內容，會使既有簽名失效，須重簽（版本鏈，另案）
--   • 補充 → 原內容不變、只追加證明，既有簽名仍然有效
-- 本 migration 只開放「補充」，並刻意不提供任何修改既有 attachments 的路徑，
-- 讓已簽名者的簽名始終對應到他們當初看到的原始內容。
--
-- 設計要點：
--   • 補充另存一張表，signoff_documents.attachments 完全不碰
--   • 比照 signatures / audit，append-only（trigger 擋 UPDATE/DELETE）
--   • 記錄補充當下的文件狀態與已簽人數，畫面上才能標示
--     「於 N 人簽核後補充」，稽核時看得出時序
--   • 允許狀態：routing / approved（已退回、已作廢不得補充）
-- ============================================================

-- ------------------------------------------------------------
-- 1. audit event_type 擴充（原為 CHECK 約束，非 enum type）
-- ------------------------------------------------------------
-- ACCESS EXCLUSIVE 鎖：若有長交易正握著 signoff_audit，後續 audit INSERT 會全部
-- 排在此 ALTER 後面（簽核 API 集體卡住）。設 timeout 讓 migration 快速失敗、重跑即可。
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE signoff_audit DROP CONSTRAINT IF EXISTS signoff_audit_event_type_check;
ALTER TABLE signoff_audit ADD CONSTRAINT signoff_audit_event_type_check
  CHECK(event_type IN (
    'created','viewed','challenge_issued','upload_url_issued',
    'signed','rejected','nudged','finalized','voided',
    'supplemented'
  ));

-- ------------------------------------------------------------
-- 2. attachments 結構驗證（CHECK 不能有子查詢 → 包成 IMMUTABLE 函式）
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION signoff_attachments_shape_ok(p JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT jsonb_typeof(p) = 'array'
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(p) e
        WHERE jsonb_typeof(e)                <> 'object'
           OR jsonb_typeof(e->'object_path') <> 'string'
           OR jsonb_typeof(e->'sha256')      <> 'string'
           OR jsonb_typeof(e->'mime')        <> 'string'
           OR jsonb_typeof(e->'name')        <> 'string'
     );
$fn$;

-- ------------------------------------------------------------
-- 3. signoff_supplements — 補充資料（append-only）
-- ------------------------------------------------------------
CREATE TABLE signoff_supplements (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id         UUID NOT NULL REFERENCES signoff_documents(id) ON DELETE RESTRICT,
  added_by            UUID NOT NULL REFERENCES accounts(id),
  note                TEXT CHECK(note IS NULL OR char_length(note) <= 2000),
  -- [{object_path,sha256,mime,name,label,caption}]；label/caption 由應用層驗證
  attachments         JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- 補充當下的快照，供畫面標示時序（例：於 2 人簽核後補充）
  doc_status_at_add   TEXT NOT NULL CHECK(doc_status_at_add IN ('routing','approved')),
  signed_count_at_add INT  NOT NULL DEFAULT 0 CHECK(signed_count_at_add >= 0),
  -- 冪等：回應在網路上遺失、前端重試時不重複建立補充
  client_request_id   UUID NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 補充內容不得為空（說明與附件至少要有一項）
  CONSTRAINT signoff_supplements_not_empty
    CHECK (jsonb_array_length(attachments) > 0 OR (note IS NOT NULL AND char_length(btrim(note)) > 0)),
  -- 結構防呆：必須是陣列，且每個元素都具備四個必填字串欄位。
  -- 應用層已驗過，此處為 defense-in-depth（防其他 route / 腳本寫入畸形資料）。
  -- CHECK 不允許子查詢，故包成 IMMUTABLE 函式。
  CONSTRAINT signoff_supplements_attachments_shape
    CHECK (signoff_attachments_shape_ok(attachments))
);

CREATE INDEX idx_signoff_supplements_doc ON signoff_supplements(document_id, created_at);
CREATE UNIQUE INDEX uq_signoff_supplements_idem
  ON signoff_supplements(document_id, added_by, client_request_id);

COMMENT ON TABLE signoff_supplements IS
  '簽核補充資料（append-only）。只追加、不修改原始 attachments，故既有簽名維持有效。';

-- ------------------------------------------------------------
-- 4. append-only 強制（重用 0007 的 forbid_mutation）
-- ------------------------------------------------------------
CREATE TRIGGER trg_signoff_supplement_append_only
  BEFORE UPDATE OR DELETE ON signoff_supplements
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- ------------------------------------------------------------
-- 5. RPC: signoff_add_supplement — atomic 補充 + 稽核
--    狀態與快照在同一 transaction 內取得，避免併發時
--    signed_count_at_add 與實際簽核進度對不上。
--    權限（申請人 or super）在 API 層判斷，此處只驗狀態。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION signoff_add_supplement(
  p_document_id       UUID,
  p_account_id        UUID,
  p_client_request_id UUID,
  p_note            TEXT,
  p_attachments     JSONB,
  p_ip_hash         TEXT,
  p_ip_hash_version INT,
  p_user_agent      TEXT,
  p_trace_id        TEXT
) RETURNS UUID AS $$
DECLARE
  v_doc_status   TEXT;
  v_created_by   UUID;
  v_signed_count INT;
  v_role         TEXT;
  v_id           UUID;
BEGIN
  -- 鎖住文件，確保狀態判斷與快照取值之間不會被簽署/作廢插隊
  SELECT status, created_by INTO v_doc_status, v_created_by
    FROM signoff_documents WHERE id = p_document_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'signoff_add_supplement: document not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- in-function 授權（比照 signoff_delete 的硬化）：API 層已擋過一次，
  -- 這裡再擋一次，避免其他持有 service-role 的 route/腳本誤用或繞過，
  -- 也防止偽造 p_account_id 冒名補充。
  SELECT role INTO v_role FROM accounts WHERE id = p_account_id;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'signoff_add_supplement: unknown account'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_role IS DISTINCT FROM 'super' AND p_account_id IS DISTINCT FROM v_created_by THEN
    RAISE EXCEPTION 'signoff_add_supplement: requires creator or super'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_doc_status NOT IN ('routing','approved') THEN
    RAISE EXCEPTION 'signoff_add_supplement: cannot supplement document in status %', v_doc_status
      USING ERRCODE = 'check_violation';
  END IF;

  -- 冪等：同 (document, account, client_request_id) 已存在 → 回原 id，不重複寫 audit
  SELECT id INTO v_id FROM signoff_supplements
   WHERE document_id = p_document_id
     AND added_by = p_account_id
     AND client_request_id = p_client_request_id;
  IF FOUND THEN
    RETURN v_id;
  END IF;

  SELECT count(*) INTO v_signed_count
    FROM signoff_signatures WHERE document_id = p_document_id;

  INSERT INTO signoff_supplements(
    document_id, added_by, note, attachments, doc_status_at_add, signed_count_at_add, client_request_id
  ) VALUES (
    p_document_id, p_account_id, p_note, COALESCE(p_attachments, '[]'::jsonb),
    v_doc_status, v_signed_count, p_client_request_id
  ) RETURNING id INTO v_id;

  INSERT INTO signoff_audit(
    document_id, account_id, event_type, ip_hash, ip_hash_version, user_agent, trace_id, detail
  ) VALUES (
    p_document_id, p_account_id, 'supplemented', p_ip_hash, p_ip_hash_version, p_user_agent, p_trace_id,
    jsonb_build_object(
      'supplement_id', v_id,
      'attachment_count', jsonb_array_length(COALESCE(p_attachments, '[]'::jsonb)),
      'doc_status_at_add', v_doc_status,
      'signed_count_at_add', v_signed_count
    )
  );

  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------
-- 6. signoff_delete 併入 supplements
--    新表以 ON DELETE RESTRICT 掛在 documents 上，若不在刪除 RPC 內一併清掉，
--    有補充資料的文件會刪不掉；補充附件也會留在 storage 變孤兒。
--    forbid_mutation 已是 document-scoped 放行版（0011），故 supplements 沿用即可。
--    僅在原函式基礎上加入補充附件路徑蒐集與刪除，其餘邏輯不動。
-- ------------------------------------------------------------
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
  v_sup   TEXT[];
  v_role  TEXT;
BEGIN
  -- in-function 授權：caller 必須是 super（防 route 被繞過）
  SELECT role INTO v_role FROM public.accounts WHERE id = p_account_id;
  IF v_role IS DISTINCT FROM 'super' THEN
    RAISE EXCEPTION 'signoff_delete: requires super account' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- FOR UPDATE：與 sign / reject / void / add_supplement 共用同一鎖點。
  -- 若只用普通 SELECT，併發的補充可在「路徑蒐集完成」與「實際刪除」之間 commit，
  -- 該筆補充的附件會被刪掉列卻沒進 v_paths → Storage 永久孤兒。
  SELECT * INTO v_doc FROM public.signoff_documents WHERE id = p_document_id FOR UPDATE;
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

  -- 補充附件（0019）：跨所有補充批次攤平取 object_path
  SELECT array_agg(a->>'object_path') INTO v_sup
    FROM public.signoff_supplements s, jsonb_array_elements(s.attachments) a
   WHERE s.document_id = p_document_id;
  IF v_sup IS NOT NULL THEN v_paths := v_paths || v_sup; END IF;

  INSERT INTO public.signoff_deletion_log(
    document_id, title, amount, status_before, created_by, owner_dept_id,
    manifest_sha256, final_pdf_sha256, deleted_by, ip_hash, ip_hash_version, user_agent, trace_id)
  VALUES (
    p_document_id, v_doc.title, v_doc.amount, v_doc.status, v_doc.created_by, v_doc.owner_dept_id,
    v_doc.assignment_manifest_sha256, v_doc.final_pdf_sha256, p_account_id, p_ip_hash, p_ip_hash_version, p_user_agent, p_trace_id);

  -- document-scoped 放行：只允許刪這一份文件的子列
  PERFORM set_config('app.allow_signoff_delete', p_document_id::text, true);
  DELETE FROM public.signoff_supplements WHERE document_id = p_document_id;
  DELETE FROM public.signoff_signatures  WHERE document_id = p_document_id;
  DELETE FROM public.signoff_audit       WHERE document_id = p_document_id;
  DELETE FROM public.signoff_assignments WHERE document_id = p_document_id;
  DELETE FROM public.signoff_documents   WHERE id = p_document_id;
  PERFORM set_config('app.allow_signoff_delete', '', true);

  RETURN to_jsonb(v_paths);
END;
$$;

REVOKE ALL ON FUNCTION signoff_delete(uuid, uuid, text, integer, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION signoff_delete(uuid, uuid, text, integer, text, text) TO service_role;

-- ------------------------------------------------------------
-- 7. RLS — 比照其他簽核表：啟用但不給 policy，一律走 service-role API
-- ------------------------------------------------------------
ALTER TABLE signoff_supplements ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON FUNCTION signoff_add_supplement(UUID,UUID,UUID,TEXT,JSONB,TEXT,INT,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION signoff_add_supplement(UUID,UUID,UUID,TEXT,JSONB,TEXT,INT,TEXT,TEXT) TO service_role;
