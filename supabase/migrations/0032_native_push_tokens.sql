-- ============================================================
-- E118 — 原生推播（Capacitor App：iOS APNs / Android FCM）token 表
-- 2026-10-07。⚠ 只寫檔，未套用到任何 Supabase 專案；套用前請使用者確認目標專案
--   （正式庫 ref 見 CLAUDE.md／1Password，不寫在此）。
-- ============================================================
--
-- 設計（對應既有 push_subscriptions）：
--   • 既有 Web Push 沒有「使用者帳號」，身分 = 裝置端隨機 management_token（bcrypt 存雜湊）。
--     原生 token 沿用同一機制：management_token_hash 對應 push_subscriptions.management_token_hash。
--   • 唯一鍵 (app, token)：同一 App 同一 device token 只存一列（重新註冊 = upsert）。
--     app 欄預留給 E118SLC（'e118slc'）共用同一張表。
--   • 失效 token 不刪列，只標 disabled_at（保留稽核；APNs 410 Unregistered / FCM UNREGISTERED）。
--   • RLS：與 push_subscriptions 一致 — 啟用 RLS 且不建任何 policy（anon／authenticated 完全讀不到）；
--     寫入與讀取只走 Next.js API route / dispatcher 的 service_role。
--   • push_log 加 native_* 計數欄（原生通道彙總；不動 push_deliveries，因其 FK 綁 push_subscriptions）。
-- ============================================================

CREATE TABLE IF NOT EXISTS native_push_tokens (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app                   TEXT NOT NULL CHECK (app IN ('e118emba', 'e118slc')),
  platform              TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  token                 TEXT NOT NULL,                       -- iOS=APNs device token(hex)；Android=FCM registration token
  app_version           TEXT,
  apns_env              TEXT CHECK (apns_env IN ('sandbox', 'production')),  -- 僅 iOS；後端依 BadDeviceToken 回報自動修正
  dept_filter           TEXT[] NOT NULL DEFAULT '{}',        -- 與 push_subscriptions 對齊，預留（目前原生通道只發 post_published）
  management_token_hash TEXT NOT NULL,                       -- bcrypt(client random token)，供退訂驗證
  failure_count         INT  NOT NULL DEFAULT 0,             -- 暫時性失敗累計，連續 5 次標 disabled
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  disabled_at           TIMESTAMPTZ,                         -- 非 NULL = 不再發送（失效或使用者關閉）
  CONSTRAINT native_push_tokens_app_token_key UNIQUE (app, token),
  CONSTRAINT native_push_tokens_apns_env_ios_only
    CHECK (apns_env IS NULL OR platform = 'ios')
);

-- dispatcher 只撈有效 token
CREATE INDEX IF NOT EXISTS idx_native_push_tokens_active
  ON native_push_tokens (app, platform)
  WHERE disabled_at IS NULL;

ALTER TABLE native_push_tokens ENABLE ROW LEVEL SECURITY;
-- ⚠ NO public access（與 push_subscriptions 相同）：device token 不可被 anon 列舉

ALTER TABLE push_log
  ADD COLUMN IF NOT EXISTS native_sent_count   INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS native_failed_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS native_gone_count   INT NOT NULL DEFAULT 0;
