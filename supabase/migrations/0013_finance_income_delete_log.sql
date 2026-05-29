-- ============================================================
-- 0013_finance_income_delete_log.sql — 收入刪除稽核（Codex feature B 審查 #6）
-- ------------------------------------------------------------
-- 收入刪除原本是硬刪、無痕；對透明系統而言應留下「誰、何時、刪了哪一筆收入」。
-- 仿 signoff_deletion_log：刪除前先寫一筆 append-only tombstone，連 service_role
-- 也不能竄改／刪除 tombstone（沿用 0011 已建立的 forbid_all_mutation()）。
-- 寫入動作由 lib/signoff/dal.ts:deleteFinanceIncome 以 service role 執行
-- （先 snapshot → 寫 log → 硬刪）。
-- ============================================================

CREATE TABLE IF NOT EXISTS finance_income_deletion_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  income_id           UUID NOT NULL,
  occurred_on         DATE NOT NULL,
  category            TEXT NOT NULL,
  amount              NUMERIC(12,2) NOT NULL,
  note                TEXT,
  original_created_by UUID,                              -- 原記帳人
  deleted_by          UUID NOT NULL REFERENCES accounts(id), -- 執行刪除的幹部
  deleted_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_finance_income_del_log_at
  ON finance_income_deletion_log (deleted_at DESC);

ALTER TABLE finance_income_deletion_log ENABLE ROW LEVEL SECURITY;

-- append-only：tombstone 不可被 UPDATE / DELETE（連 service_role 也擋；
-- forbid_all_mutation() 由 0011_signoff_delete_hardening.sql 建立）
DROP TRIGGER IF EXISTS trg_finance_income_del_log_append_only ON finance_income_deletion_log;
CREATE TRIGGER trg_finance_income_del_log_append_only
  BEFORE UPDATE OR DELETE ON finance_income_deletion_log
  FOR EACH ROW EXECUTE FUNCTION forbid_all_mutation();
