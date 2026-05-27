-- ============================================================
-- E118 公告欄 — 初始 schema
-- 對應 ARCHITECTURE.md v3 第 4 章
-- 已含 2026-05-26 Codex Security + Reliability 雙 persona 審查
-- 13 個 finding 修正：
--   • Sec F1 (service role 授權)、F2 (JWT 撤銷)、F3 (API middleware)、
--     F4 (push DoS)、F5 (subscription 寫入保護)、F6 (留言 status)、
--     F7 (XSS)、F8 (GDrive iframe)、F9 (IP hash HMAC)、F10 (JWT alg)
--   • Rel F1 (push outbox)、F2 (idempotency)、F3 (fan-out timeout)、
--     F4 (per-delivery log)、F5 (optimistic lock)、F7 (留言 status)、
--     F8 (size limit)、F9 (env validation)
-- ============================================================

-- 必要 extension（Supabase 預設已啟用、IF NOT EXISTS 保護）
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- 1. departments — 7 個部門板（公告分類）
-- ============================================================
CREATE TABLE departments (
  id          TEXT PRIMARY KEY,                              -- 'secretary' / 'academic' / ...
  name        TEXT NOT NULL,                                 -- '秘書' / '學務' / ...
  color       TEXT NOT NULL,                                 -- '#8B1F2F' 卡片配色
  sort_order  INT  NOT NULL,                                 -- 1..7（依負責人指定順序）
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. accounts — 9 個共享帳號（3 super + 6 dept）
-- ============================================================
CREATE TABLE accounts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username              TEXT UNIQUE NOT NULL,                -- '班代' / '副班代' / '秘書' / ...
  password_hash         TEXT NOT NULL,                       -- bcrypt cost 12（密碼是 4 位數，靠 lockout + bcrypt 補強）
  role                  TEXT NOT NULL CHECK(role IN ('super', 'dept')),
  home_dept_id          TEXT REFERENCES departments(id),     -- super 可 NULL（班代、副班代）
  session_version       INT  NOT NULL DEFAULT 1,             -- ⚠ Sec F2: 密碼 reset/職務輪替時 +1
  failed_attempts       INT  NOT NULL DEFAULT 0,             -- ⚠ 4 位數補強：lockout
  locked_until          TIMESTAMPTZ,                         -- 連 10 次錯誤鎖 24h
  password_changed_at   TIMESTAMPTZ,
  last_login_at         TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 3. posts — 公告
-- ============================================================
CREATE TABLE posts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id       TEXT NOT NULL REFERENCES departments(id),
  author_account_id   UUID NOT NULL REFERENCES accounts(id),
  client_request_id   UUID NOT NULL,                         -- ⚠ Rel F2: idempotency key
  title               TEXT NOT NULL CHECK(char_length(title) <= 120),
  content             TEXT NOT NULL CHECK(octet_length(content) <= 20480),  -- 20 KB
  attachments         JSONB NOT NULL DEFAULT '[]'::jsonb,    -- [{name, gdrive_id, type}, ...] max 10
  pinned              BOOLEAN NOT NULL DEFAULT false,
  published           BOOLEAN NOT NULL DEFAULT true,
  version             INT NOT NULL DEFAULT 1,                -- ⚠ Rel F5: optimistic lock
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_posts_idempotency
  ON posts(author_account_id, client_request_id);
CREATE INDEX idx_posts_dept_created
  ON posts(department_id, created_at DESC);
CREATE INDEX idx_posts_pinned
  ON posts(pinned) WHERE pinned = true;

-- ============================================================
-- 4. comments — 留言（半實名）
-- ============================================================
CREATE TABLE comments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id         UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_name     TEXT,                                      -- 可留空，NULL → 前端「匿名同學」
  content         TEXT NOT NULL CHECK(char_length(content) BETWEEN 2 AND 1000),
  status          TEXT NOT NULL DEFAULT 'visible'
                  CHECK(status IN ('visible', 'pending_review', 'deleted')),  -- ⚠ Sec F6/Rel F7
  ip_hash         TEXT NOT NULL,                             -- ⚠ Sec F9: HMAC-SHA256(secret, ip)
  ip_hash_version INT  NOT NULL DEFAULT 1,                   -- secret rotation
  review_reason   TEXT,                                      -- 'url_spam' / '人工' / ...
  reviewed_by     UUID REFERENCES accounts(id),
  reviewed_at     TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ,
  deleted_by      UUID REFERENCES accounts(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_comments_post_visible
  ON comments(post_id, created_at)
  WHERE status = 'visible' AND deleted_at IS NULL;

-- ============================================================
-- 5. push_subscriptions — PWA 推播訂閱
-- ============================================================
CREATE TABLE push_subscriptions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint                TEXT UNIQUE NOT NULL,              -- 瀏覽器 push endpoint
  p256dh                  TEXT NOT NULL,
  auth                    TEXT NOT NULL,
  dept_filter             TEXT[] NOT NULL DEFAULT '{}',      -- ['secretary', 'activity']
  management_token_hash   TEXT NOT NULL,                     -- ⚠ Sec F5: bcrypt(client random token)
  failure_count           INT  NOT NULL DEFAULT 0,           -- 連 5 次失敗自動刪
  user_agent              TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_push_dept_filter
  ON push_subscriptions USING GIN(dept_filter);

-- ============================================================
-- 6. push_jobs — outbox pattern（Rel F1）
-- ============================================================
CREATE TABLE push_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id         UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL DEFAULT 'post_published',
  status          TEXT NOT NULL DEFAULT 'queued'
                  CHECK(status IN (
                    'queued', 'sending', 'sent', 'partial_failed',
                    'failed', 'blocked_missing_config'
                  )),
  attempt_count   INT NOT NULL DEFAULT 0,
  locked_at       TIMESTAMPTZ,                               -- worker 領 job 時設、5min stale 後可搶
  started_at      TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ,
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_push_jobs_dedup
  ON push_jobs(post_id, event_type);                         -- 同公告同事件只一個 job
CREATE INDEX idx_push_jobs_ready
  ON push_jobs(status, created_at)
  WHERE status IN ('queued', 'sending');

-- ============================================================
-- 7. push_deliveries — per-subscriber 細節（Rel F4）
-- ============================================================
CREATE TABLE push_deliveries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          UUID NOT NULL REFERENCES push_jobs(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
  endpoint_hash   TEXT NOT NULL,                             -- 只存 hash、不存原始 endpoint
  status          TEXT NOT NULL
                  CHECK(status IN (
                    'pending', 'sent', 'failed', 'timeout_retryable', 'gone'
                  )),
  http_status     INT,
  error_class     TEXT,                                      -- '410_gone' / '429_rate_limit' / ...
  attempt         INT NOT NULL DEFAULT 1,
  duration_ms     INT,
  sent_at         TIMESTAMPTZ,
  trace_id        TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_push_deliveries_job
  ON push_deliveries(job_id);

-- ============================================================
-- 8. push_log — aggregate 總覽（保留為 dashboard 用，180d retention）
-- ============================================================
CREATE TABLE push_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id              UUID REFERENCES push_jobs(id),
  post_id             UUID REFERENCES posts(id),
  total_subscribers   INT NOT NULL,
  sent_count          INT NOT NULL,
  failed_count        INT NOT NULL,
  gone_count          INT NOT NULL DEFAULT 0,
  sent_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Row Level Security policies
-- ============================================================
-- 寫入路徑：全部走 Next.js API route 用 service_role key（bypass RLS）
-- 讀取路徑：anon role 只能讀公開 table、且限 published / visible 條件
-- ============================================================

ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read departments"
  ON departments FOR SELECT TO anon, authenticated
  USING (true);

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
-- ⚠ NO public access — 連 anon 都讀不到 accounts，避免 username/role 列舉攻擊

ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read published posts"
  ON posts FOR SELECT TO anon, authenticated
  USING (published = true);

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read visible comments"
  ON comments FOR SELECT TO anon, authenticated
  USING (status = 'visible' AND deleted_at IS NULL);                -- ⚠ Sec F6

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
-- ⚠ NO public access — endpoint 不可被 anon 列舉

ALTER TABLE push_jobs ENABLE ROW LEVEL SECURITY;
-- ⚠ NO public access

ALTER TABLE push_deliveries ENABLE ROW LEVEL SECURITY;
-- ⚠ NO public access — endpoint_hash 也不對外

ALTER TABLE push_log ENABLE ROW LEVEL SECURITY;
-- ⚠ NO public access — 推播統計算內部資訊

-- ============================================================
-- updated_at 自動觸發（給 posts 用）
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER posts_updated_at
  BEFORE UPDATE ON posts
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
