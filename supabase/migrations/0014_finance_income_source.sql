-- ============================================================
-- 0014_finance_income_source.sql — LINE Bot 對帳收款連動（L1）
-- ------------------------------------------------------------
-- 讓 LINE Bot 把「每個班務活動的已入帳總額」UPSERT 進 finance_income：
--   • 每活動一列、source_ref = "bot:<活動ID>"（如 bot:A5）
--   • 每次對帳完覆蓋成「當前已入帳總額」→ 冪等、自我修正（退款也會降下來）
--   • 每活動彙總、不含姓名 / 個別金額（呼應「個人明細只在 LINE」）
-- 財務長手動記的收入 source_ref = NULL，不受影響、照常一起加總。
-- ============================================================

ALTER TABLE finance_income ADD COLUMN IF NOT EXISTS source_ref TEXT;

-- 完整（非 partial）unique index：
--   • Postgres 預設 NULL 互相視為相異 → 手動記帳（source_ref=NULL）仍可多筆
--   • bot 的非 NULL source_ref 唯一 → 每活動恰一列
--   • 用完整 index（非 partial）才相容 Supabase .upsert({onConflict:'source_ref'})
--     （ON CONFLICT 配 partial index 需在語句帶 WHERE predicate，Supabase 不會帶）
CREATE UNIQUE INDEX IF NOT EXISTS uniq_finance_income_source
  ON finance_income (source_ref);
