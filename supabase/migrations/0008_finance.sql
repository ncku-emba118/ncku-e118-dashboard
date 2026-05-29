-- ============================================================
-- E118 經費中心 — 支出分類 + 班費收入設定 + 月報
-- 「支出明細 = 跑過簽核的經費」（user 確認 2026-05-29）
-- ============================================================

-- 支出分類（班服/班遊/餐敘/迎新/雜支…）。分類為標籤、未納入 manifest hash（非金額/簽署核心）
ALTER TABLE signoff_documents ADD COLUMN IF NOT EXISTS category TEXT;

-- 班費收入設定（singleton）
CREATE TABLE IF NOT EXISTS finance_settings (
  id           INT PRIMARY KEY DEFAULT 1 CHECK(id = 1),
  income_total NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK(income_total >= 0),
  term_label   TEXT NOT NULL DEFAULT '',
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO finance_settings (id, income_total, term_label)
VALUES (1, 303000, '114 學年度上學期')
ON CONFLICT (id) DO NOTHING;

-- 月報（財務長上傳的正式 PDF）
CREATE TABLE IF NOT EXISTS finance_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_label TEXT NOT NULL,
  object_path  TEXT NOT NULL,
  sha256       TEXT,
  uploaded_by  UUID REFERENCES accounts(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_finance_reports_created ON finance_reports(created_at DESC);

ALTER TABLE finance_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_reports  ENABLE ROW LEVEL SECURITY;
-- 全私有：公開透明頁透過 server-only API（service role）回安全欄位，不開 anon 直讀

-- ============================================================
-- 重宣告 signoff_create_document：加入 category（CREATE OR REPLACE）
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
    client_request_id, attachments, category,
    signoff_sheet_object_path, assignment_manifest_sha256, flow_type,
    supersedes_document_id, due_at)
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
    NULLIF(p_doc->>'category',''),
    p_doc->>'signoff_sheet_object_path',
    p_doc->>'assignment_manifest_sha256',
    COALESCE(p_doc->>'flow_type','parallel'),
    NULLIF(p_doc->>'supersedes_document_id','')::uuid,
    NULLIF(p_doc->>'due_at','')::timestamptz)
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
