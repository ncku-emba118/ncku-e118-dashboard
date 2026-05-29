-- ============================================================
-- E118 經費簽核（會簽）系統 — schema
-- 對應 SIGNOFF-ARCHITECTURE.md v1.1（Codex #1 敵對審查 3 P0 + 11 P1 + 4 P2 全套用）
--
-- Codex finding 落點：
--   2-1 finalize 雙重合成   → signoff_sign RPC 內 document row FOR UPDATE 序列化 + status guard
--   2-3 reject/approve race → signoff_reject 同樣鎖 doc row、terminal transition atomic
--   3-1 hash 未涵蓋指派      → signoff_documents.assignment_manifest_sha256
--   5-1 三鍵不一致           → signoff_assignments UNIQUE(id,document_id,signer_account_id) + composite FK
--   1-1 dept 資料隔離        → signoff_documents.owner_dept_id
--   1-3 指派不可變           → signoff_assignment_guard trigger（定義欄位 immutable / 禁刪 / 禁事後新增）
--   2-2 鎖在 assignment 層   → signoff_sign 用 UPDATE ... WHERE status='pending' 當鎖點
--   3-2 nonce 防重放         → assignments.active_challenge_* + signatures.challenge_nonce
--   3-3 append-only          → forbid_mutation trigger on signatures + audit
--   5-2 金額                 → CHECK(amount > 0) + currency
--   5-3 證據鏈不可斷          → 禁 hard delete（無 CASCADE）+ audit FK RESTRICT
--   7-4 退回版本鏈           → supersedes_document_id
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- 1. signoff_documents — 簽核文件主檔
-- ============================================================
CREATE TABLE signoff_documents (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title                       TEXT NOT NULL CHECK(char_length(title) <= 120),
  amount                      NUMERIC(12,2) CHECK(amount IS NULL OR amount > 0),   -- 5-2
  currency                    TEXT NOT NULL DEFAULT 'TWD',                         -- 5-2
  purpose                     TEXT CHECK(purpose IS NULL OR char_length(purpose) <= 2000),
  applicant                   TEXT CHECK(applicant IS NULL OR char_length(applicant) <= 120),
  created_by                  UUID NOT NULL REFERENCES accounts(id),
  owner_dept_id               TEXT NOT NULL REFERENCES departments(id),            -- 1-1
  client_request_id           UUID NOT NULL,                                       -- idempotency
  attachments                 JSONB NOT NULL DEFAULT '[]'::jsonb,                   -- [{object_path,sha256,mime,name}] 1..N（發票/明細...）
  signoff_sheet_object_path   TEXT NOT NULL,
  assignment_manifest_sha256  TEXT NOT NULL,                                       -- 3-1
  flow_type                   TEXT NOT NULL DEFAULT 'parallel'
                              CHECK(flow_type IN ('parallel','sequential')),
  status                      TEXT NOT NULL DEFAULT 'routing'
                              CHECK(status IN ('routing','approved','rejected','voided')),
  final_pdf_object_path       TEXT,
  final_pdf_sha256            TEXT,
  supersedes_document_id      UUID REFERENCES signoff_documents(id),               -- 7-4
  version                     INT NOT NULL DEFAULT 1,
  due_at                      TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_signoff_doc_idem
  ON signoff_documents(created_by, client_request_id);
CREATE INDEX idx_signoff_doc_status
  ON signoff_documents(status, created_at DESC);
CREATE INDEX idx_signoff_doc_dept
  ON signoff_documents(owner_dept_id, status);

-- ============================================================
-- 2. signoff_assignments — 指派（誰簽 + 簽哪格 + 狀態 + 當前 challenge）
--    定義欄位 immutable（1-3），status/acted_at/challenge 為可變操作欄位
-- ============================================================
CREATE TABLE signoff_assignments (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id               UUID NOT NULL REFERENCES signoff_documents(id),       -- 5-3 無 CASCADE
  signer_account_id         UUID NOT NULL REFERENCES accounts(id),
  role_label                TEXT NOT NULL CHECK(char_length(role_label) <= 40),
  sequence_order            INT,                                                  -- parallel=NULL
  slot_page                 INT  NOT NULL DEFAULT 1,
  slot_x                    REAL NOT NULL,
  slot_y                    REAL NOT NULL,
  slot_w                    REAL NOT NULL,
  slot_h                    REAL NOT NULL,
  status                    TEXT NOT NULL DEFAULT 'pending'
                            CHECK(status IN ('pending','signed','rejected')),
  reject_reason             TEXT CHECK(reject_reason IS NULL OR char_length(reject_reason) <= 1000),
  active_challenge_nonce    TEXT,                                                 -- 3-2 /challenge 寫入
  active_challenge_expires_at TIMESTAMPTZ,
  acted_at                  TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(document_id, signer_account_id),
  UNIQUE(id, document_id, signer_account_id)                                      -- 5-1 composite FK target
);
CREATE INDEX idx_signoff_assign_inbox
  ON signoff_assignments(signer_account_id, status);
CREATE INDEX idx_signoff_assign_doc
  ON signoff_assignments(document_id, status);

-- ============================================================
-- 3. signoff_signatures — 簽名證據（append-only · 3-3）
-- ============================================================
CREATE TABLE signoff_signatures (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id         UUID NOT NULL,
  document_id           UUID NOT NULL,
  signer_account_id     UUID NOT NULL,
  signature_png_path    TEXT NOT NULL,
  signature_sha256      TEXT NOT NULL,                                            -- 4-2 server 重算
  challenge_nonce       TEXT NOT NULL,                                            -- 3-2 實際用掉的 nonce
  comment               TEXT CHECK(comment IS NULL OR char_length(comment) <= 1000),
  ip_hash               TEXT NOT NULL,
  ip_hash_version       INT  NOT NULL DEFAULT 1,
  user_agent            TEXT,
  signed_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(assignment_id),                                                          -- 一指派一簽名、不可覆蓋
  -- 5-1 三鍵一致性 composite FK
  FOREIGN KEY (assignment_id, document_id, signer_account_id)
    REFERENCES signoff_assignments(id, document_id, signer_account_id)
);
CREATE INDEX idx_signoff_sig_doc ON signoff_signatures(document_id);

-- ============================================================
-- 4. signoff_audit — 稽核事件（append-only · 3-3 / 5-3）
-- ============================================================
CREATE TABLE signoff_audit (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID REFERENCES signoff_documents(id) ON DELETE RESTRICT,       -- 5-3 不斷鏈
  account_id      UUID REFERENCES accounts(id),
  event_type      TEXT NOT NULL
                  CHECK(event_type IN (
                    'created','viewed','challenge_issued','upload_url_issued',
                    'signed','rejected','nudged','finalized','voided'
                  )),
  ip_hash         TEXT,
  ip_hash_version INT,
  user_agent      TEXT,
  trace_id        TEXT,
  detail          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_signoff_audit_doc ON signoff_audit(document_id, created_at);

-- ============================================================
-- updated_at trigger（重用 0001 的 set_updated_at）
-- ============================================================
CREATE TRIGGER signoff_documents_updated_at
  BEFORE UPDATE ON signoff_documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- append-only 強制（3-3）：signatures / audit 禁 UPDATE / DELETE
-- ============================================================
CREATE OR REPLACE FUNCTION forbid_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'append-only table %: % not allowed', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_signoff_sig_append_only
  BEFORE UPDATE OR DELETE ON signoff_signatures
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TRIGGER trg_signoff_audit_append_only
  BEFORE UPDATE OR DELETE ON signoff_audit
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- ============================================================
-- assignment 守門（1-3）：
--   • DELETE 一律禁
--   • UPDATE 禁改定義欄位（signer/role/slot/sequence/document）
--   • INSERT 僅允許 document.status='routing'（杜絕事後追加簽核人）
-- ============================================================
CREATE OR REPLACE FUNCTION signoff_assignment_guard()
RETURNS TRIGGER AS $$
DECLARE
  v_doc_status TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
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

CREATE TRIGGER trg_signoff_assignment_guard
  BEFORE INSERT OR UPDATE OR DELETE ON signoff_assignments
  FOR EACH ROW EXECUTE FUNCTION signoff_assignment_guard();

-- ============================================================
-- RPC: signoff_sign — atomic 簽署（2-1 / 2-2 / 2-3 / 3-2）
--   流程（單一 transaction）：
--     1. 鎖 document row FOR UPDATE，必須 status='routing'（序列化 finalize / reject）
--     2. assignment 層鎖：UPDATE ... WHERE status='pending'（rowcount=0 → 已簽/非本人）
--     3. 驗 nonce == active_challenge_nonce 且未過期
--     4. INSERT signature（append-only）
--     5. audit 'signed'
--     6. finalize-once：若無 pending → status routing→approved（atomic），回 finalized=true
--   呼叫端（service-role route）已先做：session/permission 驗、PNG 驗、sha256 server 重算
-- ============================================================
CREATE OR REPLACE FUNCTION signoff_sign(
  p_assignment_id     UUID,
  p_document_id       UUID,
  p_signer_account_id UUID,
  p_signature_png_path TEXT,
  p_signature_sha256  TEXT,
  p_nonce             TEXT,
  p_comment           TEXT,
  p_ip_hash           TEXT,
  p_ip_hash_version   INT,
  p_user_agent        TEXT,
  p_trace_id          TEXT
) RETURNS TABLE(finalized BOOLEAN) AS $$
DECLARE
  v_doc_status      TEXT;
  v_active_nonce    TEXT;
  v_nonce_exp       TIMESTAMPTZ;
  v_locked          INT;
  v_finrows         INT;
BEGIN
  -- 1. lock document, must be routing
  SELECT status INTO v_doc_status
    FROM signoff_documents WHERE id = p_document_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'signoff_sign: document not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_doc_status <> 'routing' THEN
    RAISE EXCEPTION 'signoff_sign: document not open (status=%)', v_doc_status
      USING ERRCODE = 'check_violation';
  END IF;

  -- 2. validate nonce against the (still-pending) assignment
  SELECT active_challenge_nonce, active_challenge_expires_at
    INTO v_active_nonce, v_nonce_exp
    FROM signoff_assignments
   WHERE id = p_assignment_id
     AND document_id = p_document_id
     AND signer_account_id = p_signer_account_id
     AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'signoff_sign: assignment not pending or identity mismatch'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_active_nonce IS NULL OR v_active_nonce <> p_nonce
     OR v_nonce_exp IS NULL OR v_nonce_exp < now() THEN
    RAISE EXCEPTION 'signoff_sign: invalid or expired challenge nonce'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 3. assignment-layer lock point（2-2）
  UPDATE signoff_assignments
     SET status = 'signed', acted_at = now(),
         active_challenge_nonce = NULL, active_challenge_expires_at = NULL
   WHERE id = p_assignment_id AND status = 'pending';
  GET DIAGNOSTICS v_locked = ROW_COUNT;
  IF v_locked <> 1 THEN
    RAISE EXCEPTION 'signoff_sign: concurrent state change'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 4. signature evidence (append-only)
  INSERT INTO signoff_signatures(
    assignment_id, document_id, signer_account_id,
    signature_png_path, signature_sha256, challenge_nonce, comment,
    ip_hash, ip_hash_version, user_agent)
  VALUES (
    p_assignment_id, p_document_id, p_signer_account_id,
    p_signature_png_path, p_signature_sha256, p_nonce, p_comment,
    p_ip_hash, p_ip_hash_version, p_user_agent);

  -- 5. audit
  INSERT INTO signoff_audit(document_id, account_id, event_type, ip_hash, ip_hash_version, user_agent, trace_id)
  VALUES (p_document_id, p_signer_account_id, 'signed', p_ip_hash, p_ip_hash_version, p_user_agent, p_trace_id);

  -- 6. finalize-once（2-1）：單一 atomic UPDATE，rowcount=1 才算本次完成
  UPDATE signoff_documents
     SET status = 'approved'
   WHERE id = p_document_id
     AND status = 'routing'
     AND NOT EXISTS (
       SELECT 1 FROM signoff_assignments
        WHERE document_id = p_document_id AND status = 'pending'
     );
  GET DIAGNOSTICS v_finrows = ROW_COUNT;
  IF v_finrows = 1 THEN
    INSERT INTO signoff_audit(document_id, account_id, event_type, trace_id)
    VALUES (p_document_id, p_signer_account_id, 'finalized', p_trace_id);
    finalized := TRUE;
  ELSE
    finalized := FALSE;
  END IF;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- RPC: signoff_reject — atomic 退回（2-3）
--   鎖 doc row、必須 routing → 設該 assignment rejected + reason、doc→rejected
-- ============================================================
CREATE OR REPLACE FUNCTION signoff_reject(
  p_assignment_id     UUID,
  p_document_id       UUID,
  p_signer_account_id UUID,
  p_reason            TEXT,
  p_ip_hash           TEXT,
  p_ip_hash_version   INT,
  p_user_agent        TEXT,
  p_trace_id          TEXT
) RETURNS VOID AS $$
DECLARE
  v_doc_status TEXT;
  v_locked     INT;
BEGIN
  SELECT status INTO v_doc_status
    FROM signoff_documents WHERE id = p_document_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'signoff_reject: document not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_doc_status <> 'routing' THEN
    RAISE EXCEPTION 'signoff_reject: document not open (status=%)', v_doc_status
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE signoff_assignments
     SET status = 'rejected', acted_at = now(), reject_reason = p_reason,
         active_challenge_nonce = NULL, active_challenge_expires_at = NULL
   WHERE id = p_assignment_id AND document_id = p_document_id
     AND signer_account_id = p_signer_account_id AND status = 'pending';
  GET DIAGNOSTICS v_locked = ROW_COUNT;
  IF v_locked <> 1 THEN
    RAISE EXCEPTION 'signoff_reject: assignment not pending or identity mismatch'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE signoff_documents SET status = 'rejected' WHERE id = p_document_id AND status = 'routing';

  INSERT INTO signoff_audit(document_id, account_id, event_type, ip_hash, ip_hash_version, user_agent, trace_id)
  VALUES (p_document_id, p_signer_account_id, 'rejected', p_ip_hash, p_ip_hash_version, p_user_agent, p_trace_id);
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- RPC: signoff_void — super 作廢（保留證據、可重開新版）
-- ============================================================
CREATE OR REPLACE FUNCTION signoff_void(
  p_document_id   UUID,
  p_account_id    UUID,
  p_ip_hash       TEXT,
  p_ip_hash_version INT,
  p_user_agent    TEXT,
  p_trace_id      TEXT
) RETURNS VOID AS $$
DECLARE
  v_doc_status TEXT;
BEGIN
  SELECT status INTO v_doc_status
    FROM signoff_documents WHERE id = p_document_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'signoff_void: document not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_doc_status NOT IN ('routing','rejected') THEN
    RAISE EXCEPTION 'signoff_void: cannot void document in status %', v_doc_status
      USING ERRCODE = 'check_violation';
  END IF;
  UPDATE signoff_documents SET status = 'voided' WHERE id = p_document_id;
  INSERT INTO signoff_audit(document_id, account_id, event_type, ip_hash, ip_hash_version, user_agent, trace_id)
  VALUES (p_document_id, p_account_id, 'voided', p_ip_hash, p_ip_hash_version, p_user_agent, p_trace_id);
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- RPC: signoff_create_document — atomic 建立文件 + 指派（Codex 1-3）
--   PostgREST 無法多語句交易；文件與全部 assignments 必須同 transaction，
--   否則 assignment guard trigger（要求 doc.status='routing'）會在 doc 未建好時擋下，
--   或產生「有文件無指派」的孤兒。含 idempotency（created_by + client_request_id）。
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
    supersedes_document_id, due_at)
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

-- ============================================================
-- RLS — 全部私有（含金額/個資/簽名）。寫入與讀取一律走 service-role API route。
-- 比照 0001：ENABLE RLS 但不給 anon/authenticated policy = 對外完全讀不到。
-- ============================================================
ALTER TABLE signoff_documents   ENABLE ROW LEVEL SECURITY;
ALTER TABLE signoff_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE signoff_signatures  ENABLE ROW LEVEL SECURITY;
ALTER TABLE signoff_audit       ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Storage bucket（PRIVATE）— 原始憑證 / 簽核表 / 簽名圖 / 最終 PDF（§9）
-- 與 board-attachments(public) 相反：private，只能透過 API 發短效 signed URL 存取。
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'signoff-documents',
  'signoff-documents',
  false,                       -- ⚠ private
  26214400,                    -- 25 MiB
  ARRAY['application/pdf', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
