-- ============================================================
-- 0017_group_messages.sql — 群組對話記錄（年度回顧 / 風格模仿素材）
-- ------------------------------------------------------------
-- LINE Bot 把「群組列表『記錄對話=是』」群組的成員發言上報進來。
--   • 以 LINE userId（偽匿名）為主 → 可依 user_id 一鍵刪除（個資）
--   • 預設關：只記管理員在群組列表打開的群
--   • 未來：撈某 user_id 的語料 → 丟 LLM 產年度回顧 / 模仿語氣
-- 寫入路徑：Bot webhook → POST /api/board/group-log（Bearer BOT_SYNC_SECRET）→ 本表
-- ============================================================

create table if not exists group_messages (
  id           bigint generated always as identity primary key,
  group_id     text not null,
  user_id      text not null,
  type         text not null default 'text',   -- text / sticker / image / ...
  content      text,                           -- 文字內容（非文字訊息可為 null）
  line_msg_id  text,                           -- LINE message id，去重用
  sent_at      timestamptz,                    -- LINE 事件時間
  created_at   timestamptz not null default now()
);

-- RLS：開啟但不設任何 policy = 對外（anon / authenticated 公鑰）全擋。
-- 寫入/讀取一律走班網 server 端 service_role 金鑰（繞過 RLS），對話資料不對外曝光。
alter table group_messages enable row level security;

-- 撈「某群 + 某人 + 某段時間」用（年度回顧主查詢）
create index if not exists idx_group_messages_g_u_t
  on group_messages (group_id, user_id, sent_at);

-- 去重：同一則 LINE 訊息只記一次。
-- 用「完整 unique index」（非 partial）才相容 Supabase .upsert({onConflict:'line_msg_id'})。
-- line_msg_id 可為 null（Postgres 視多個 null 為相異 → 不會互相衝突，仍可多筆）。
create unique index if not exists uniq_group_messages_linemsg
  on group_messages (line_msg_id);
