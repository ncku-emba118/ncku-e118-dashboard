-- ============================================================
-- 0029_class_gate.sql — 班級共用密碼（外層閘門）
-- ------------------------------------------------------------
-- 網站要包成 App 給全班用，原本「免登入可看」的班級內容（首頁、行事曆、
-- 社團總表、成員圖鑑、公告欄前台…）改成要先輸入一組「班級共用密碼」。
--
-- ⚠ 這是跟既有幹部個人帳密（accounts + JWT，見 0002_auth_rpc.sql）完全
--   獨立的外層：只證明「知道班級密碼」，不含任何身分；幹部帳密的可歸責性
--   （誰核准了哪筆經費）不受影響、也不能被這層取代。
--
-- app_settings：通用 key-value 設定表。密碼存 bcrypt hash（不存明文），
--   放 DB 而不是環境變數 → 之後換密碼不用重新部署。
--   目前用到的 key：
--     • class_gate_password_hash — bcrypt(cost 12) 班級密碼 hash
--
-- class_gate_attempts：班級密碼登入嘗試紀錄（防暴力猜密碼用）。
--   只存 IP 的 HMAC（IP_HASH_SECRET，比照 comments.ip_hash），不存原始 IP。
--   寫入路徑：POST /api/class-gate/login（service_role）。
-- ============================================================

create table if not exists app_settings (
  key         text primary key,
  value       text not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references accounts(id) on delete set null
);

alter table app_settings enable row level security;
-- RLS 啟用但無 policy = anon/authenticated 全擋；只走 service_role 從 server 端進。

create table if not exists class_gate_attempts (
  id          bigint generated always as identity primary key,
  ip_hash     text not null,
  succeeded   boolean not null default false,
  created_at  timestamptz not null default now()
);

-- 同 IP 近 N 分鐘失敗次數
create index if not exists idx_class_gate_attempts_ip_time
  on class_gate_attempts (ip_hash, created_at desc);
-- 全站近 N 分鐘失敗次數 + 過期清理
create index if not exists idx_class_gate_attempts_time
  on class_gate_attempts (created_at);

alter table class_gate_attempts enable row level security;
-- 同上：無 policy，只走 service_role。
