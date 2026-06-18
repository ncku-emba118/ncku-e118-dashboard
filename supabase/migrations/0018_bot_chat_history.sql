-- ============================================================
-- 0018_bot_chat_history.sql — Bot 私訊聊天記憶（per-user）
-- ------------------------------------------------------------
-- LINE Bot 跟同學一對一私訊聊天的歷史紀錄，給 Gemini 做 context。
--   • 以 LINE userId 為主 → 同學一人一份、跨人隔離
--   • soft delete（deleted_at）+ 7 天緩衝、365 天 hard delete
--   • 偵測到敏感資料（末五碼/身分證/手機/信用卡）→ redact 後才存
-- 寫入路徑：Bot webhook → POST /api/board/bot/chat（Bearer BOT_SYNC_SECRET）→ 本表
-- ============================================================

create table if not exists bot_chat_history (
  id           bigint generated always as identity primary key,
  user_id      text not null,
  role         text not null check (role in ('user', 'assistant')),
  content      text not null,
  redacted     boolean not null default false,
  token_count  int,
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz                     -- soft delete（7 天緩衝後 cron 真刪）
);

-- 撈該 user 最近 N 條 context 用（排除 soft deleted）
create index if not exists idx_bot_chat_user_active
  on bot_chat_history (user_id, created_at desc)
  where deleted_at is null;

-- 365 天保留檢查 + soft delete cron 掃描用
create index if not exists idx_bot_chat_created_at
  on bot_chat_history (created_at);
create index if not exists idx_bot_chat_deleted_at
  on bot_chat_history (deleted_at)
  where deleted_at is not null;

alter table bot_chat_history enable row level security;
-- RLS 啟用但無 policy = anon/authenticated 全擋；只走 service_role 從 server 端進。

-- ----------------------------------------------------------
-- 同學偏好設定（記憶開關 / 首次告知是否秀過）
-- ----------------------------------------------------------
create table if not exists bot_chat_prefs (
  user_id          text primary key,
  memory_enabled   boolean not null default true,   -- 「不要記」=false
  greeting_shown   boolean not null default false,  -- 第一次聊天告知訊息已秀過
  updated_at       timestamptz not null default now()
);

alter table bot_chat_prefs enable row level security;
