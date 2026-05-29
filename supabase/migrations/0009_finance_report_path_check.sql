-- 月報 object_path 必須在 reports/ 前綴、不含 .. （Codex P1 防簽出 bucket 內其他私有檔）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_finance_reports_path'
  ) THEN
    ALTER TABLE finance_reports
      ADD CONSTRAINT chk_finance_reports_path
      CHECK (object_path LIKE 'reports/%' AND position('..' in object_path) = 0);
  END IF;
END $$;
