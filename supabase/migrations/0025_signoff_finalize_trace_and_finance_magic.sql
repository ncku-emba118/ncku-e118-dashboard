-- ============================================================
-- 0025 — 最終 PDF 合成失敗留痕 + 財務長完成通知一次性 magic token
--
-- 背景：sign route 全員簽完後 best-effort 呼叫 composeAndStoreFinal，實測約
-- 25-33% 會失敗；失敗時只 console.error，DB 端「approved 但 final_pdf_object_path
-- 為 null」這個狀態雖然本來就可從既有欄位推得，但看不出「是否曾經嘗試過、
-- 最後一次錯在哪」，對列表頁標示與事後除錯都不夠。
--
-- 兩件事，都只加不改（不動既有 RLS / trigger / RPC）：
--   1. signoff_documents 加 finalize_failed_at / finalize_last_error：
--      最近一次合成失敗的時間與錯誤摘要；合成成功（setFinalPdf）時清空。
--   2. signoff_documents 加文件層級的一次性 magic token 三欄，供
--      notifyApprovalCompleted 的收件人（財務長）使用。
--      ⚠ 刻意不沿用 0023 掛在 signoff_assignments 的 magic token：那一組的
--      查驗鏈（getAssignmentByMagicTokenHash）強制要求 token 對應到一筆
--      signoff_assignments row（signer_account_id + document_id + assignment
--      三鍵 FK），但財務長是「listAccounts() 篩 home_dept_id==='finance'」
--      找出來的通知對象，不代表他在這張特定文件上有指派列（一般經費簽核
--      不見得指派財務長會簽）。因此改在 signoff_documents 上開一組同構的
--      token 欄位（同樣的產生方式：crypto.randomBytes(32) → sha256 存庫、
--      同樣的 14 天 TTL、同樣過 /api/board/signoff/magic/[token] 這一個
--      既有端點驗證與換發 session），只是掛的資料表不同——驗證邏輯與
--      /api/board/signoff/magic/[token] 端點本身完全重用，不另開新路由。
-- ============================================================

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- ------------------------------------------------------------
-- 1. 最終 PDF 合成失敗留痕
-- ------------------------------------------------------------
ALTER TABLE signoff_documents
  ADD COLUMN IF NOT EXISTS finalize_failed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS finalize_last_error TEXT;

-- ------------------------------------------------------------
-- 2. 財務長完成通知用的文件層級 magic token（非指派人也可用）
--    finance_magic_token_account_id：token 核發給誰（換發 session 用），
--    不是文件的簽核指派人，故獨立存、不進 signoff_assignments。
-- ------------------------------------------------------------
ALTER TABLE signoff_documents
  ADD COLUMN IF NOT EXISTS finance_magic_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS finance_magic_token_account_id UUID REFERENCES accounts(id),
  ADD COLUMN IF NOT EXISTS finance_magic_token_expires_at TIMESTAMPTZ;

-- 以 hash 反查文件（magic 端點擴充查詢用）。partial index：只索引有 token 的列。
CREATE INDEX IF NOT EXISTS idx_signoff_doc_finance_magic
  ON signoff_documents(finance_magic_token_hash)
  WHERE finance_magic_token_hash IS NOT NULL;
