-- ============================================================
-- 0023 — 簽核 LINE 化（C 案・先明細後簽核）班網側 schema
--
-- 對應「2026-07-27_簽核LINE化-C案先明細後簽核-實作規格.md」§1-1。
--
-- 兩件事，都只加不改（不動既有 RLS / trigger / RPC）：
--   1. signoff_assignments 加一次性 magic token 欄位（LINE 卡片單鍵免帳密
--      換發 session 用）。token 本身 256-bit 隨機、庫內只存 sha256；單一
--      assignment 同時只有一個有效 token（重發即覆蓋），簽署後由 API 清除。
--   2. 新表 account_stored_signatures：幹部的「預存簽名」（一鍵蓋章用）。
--      只存 Storage 路徑 + sha256，PNG 本體在 private bucket。
--
-- 安全（規格 §4）：token 只存 sha256、TTL ≤14 天、簽署後即清除。
-- RLS 全開但不給 anon/authenticated policy＝比照 0007，一律只走 service-role。
-- ============================================================

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- ------------------------------------------------------------
-- 1. signoff_assignments — magic token 欄位（單一有效、只存 hash）
--    magic_token_hash        = sha256(token)，token=randomBytes(32) hex
--    magic_token_expires_at  = min(now()+14d, 單據期限 due_at)
--    這兩欄是可變操作欄位、非定義欄位，signoff_assignment_guard（0007）
--    的 UPDATE 分支不會擋（它只鎖 signer/role/slot/sequence/document）。
-- ------------------------------------------------------------
ALTER TABLE signoff_assignments
  ADD COLUMN IF NOT EXISTS magic_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS magic_token_expires_at TIMESTAMPTZ;

-- 以 hash 反查 assignment（magic 端點）。partial index：只索引有 token 的列。
CREATE INDEX IF NOT EXISTS idx_signoff_assign_magic
  ON signoff_assignments(magic_token_hash)
  WHERE magic_token_hash IS NOT NULL;

-- ------------------------------------------------------------
-- 2. account_stored_signatures — 幹部預存簽名（一鍵蓋章）
--    account_id 為 PK（一人一張預存簽名，重存即覆蓋）。
--    ON DELETE CASCADE：帳號刪除時連帶清掉其預存簽名。
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS account_stored_signatures (
  account_id  UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  png_path    TEXT NOT NULL,
  sha256      TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- updated_at 自動更新（重用 0001 的 set_updated_at；INSERT 走 DEFAULT now()）
DROP TRIGGER IF EXISTS account_stored_signatures_updated_at ON account_stored_signatures;
CREATE TRIGGER account_stored_signatures_updated_at
  BEFORE UPDATE ON account_stored_signatures
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS：比照 0007，ENABLE 但不給 anon/authenticated policy＝對外完全讀不到，
-- 只有 service-role（DAL）能存取。預存簽名等同個人印鑑，絕不對外。
ALTER TABLE account_stored_signatures ENABLE ROW LEVEL SECURITY;
