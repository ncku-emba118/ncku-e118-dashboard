-- 月報上傳（階段二）：Excel 自動解析摘要
-- 財務長上傳的 .xlsx 若能解析出「總表」分頁的利息/雜項收入與銀行餘額，
-- 存成結構化 JSON 供 /finance 頁自動排版顯示；解析失敗或非 .xlsx（例如 PDF、
-- 舊版 .xls）一律留 NULL，頁面 fallback 回原本「純下載連結」行為，不影響既有流程。
ALTER TABLE finance_reports
  ADD COLUMN IF NOT EXISTS parsed_summary JSONB;
