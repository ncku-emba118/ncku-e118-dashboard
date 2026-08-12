-- ============================================================
-- 0026 — 財務長下載連結：加開發時的 session_version 快照欄位
--
-- 背景（敵對審查修正1，2026-08-13 定案）：財務長 magic 連結改為「不設 TTL、
-- 只靠手動作廢」的永久連結（finance_magic_token_expires_at 一律寫 NULL，
-- 語意＝永不過期，見 lib/signoff/redeem.ts isFinanceMagicTokenExpired）。
--
-- 連結永久有效時，唯一能讓「職務輪替 / 密碼重設」自動使舊連結失效的辦法，
-- 是在核發當下記錄 accounts.session_version 快照，兌換時與該帳號「現在」的
-- session_version 比對——不符即拒絕（比照系統既有的 session 撤銷機制：
-- lib/auth/jwt.ts 檔頭「Sec F2」、accounts.session_version 欄位註解）。
-- 只加欄位，不動既有 0025 已上線的欄位 / index / RLS。
-- ============================================================

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE signoff_documents
  ADD COLUMN IF NOT EXISTS finance_magic_token_session_version INT;
