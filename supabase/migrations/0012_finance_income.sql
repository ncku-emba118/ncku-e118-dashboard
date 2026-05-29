-- ============================================================
-- 0012_finance_income.sql — 班費收入明細帳本（feature B）
-- ------------------------------------------------------------
-- 經費中心原本只有「支出 = 跑過簽核的經費」一側；收入這側只有
-- finance_settings.income_total 一個被 seed 的數字、無自助維護介面。
-- 本 migration 把收入也做成 ledger（跟支出明細對稱、全班可查）：
-- 收入 entry 由財務長 / super 直接記帳（不需簽核，純進帳紀錄）。
-- 公開頁的「班費收入」改為 = 所有 finance_income.amount 加總。
-- ============================================================

CREATE TABLE IF NOT EXISTS finance_income (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_on DATE NOT NULL,                         -- 進帳日期
  category    TEXT NOT NULL,                         -- 項目：收班費 / 補收 / 利息 / 退款 / 其他
  amount      NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  note        TEXT,                                  -- 備註（選填）
  created_by  UUID REFERENCES accounts(id),          -- 記帳人（稽核用）
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_income_date
  ON finance_income (occurred_on DESC, created_at DESC);

-- 全私有：透過 server-only API（service role）讀寫；
-- 公開透明頁由 server component（service role）直讀回安全欄位。
-- 不開 anon / authenticated 直接存取（與 finance_settings / finance_reports 一致）。
ALTER TABLE finance_income ENABLE ROW LEVEL SECURITY;
