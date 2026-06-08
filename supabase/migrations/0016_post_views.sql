-- ============================================================
-- 0016 — post_views：公告閱讀數追蹤
-- ============================================================
--
-- 用途：秘書長 admin 看每則公告被點開幾次（engagement metric），
-- 配合 push 送達率判斷推播是否有效。
--
-- 隱私設計：
--   - 不存 raw IP（避免 PII）
--   - 不要求 cookie 識別
--   - 只存 visitor_hash = SHA256(IP + UA + post_id + day_bucket)
--   - 同 IP 同 UA 同 post 同一天 → 1 筆（natural dedup via unique）
--
-- 寫入點：app/board/post/[id]/page.tsx server component 渲染時 fire-and-forget
-- 讀取點：admin/page.tsx 撈每則 post 的 count(*)
--
-- RLS：
--   - service_role 全權（API 寫入用）
--   - anon 不能讀（隱私）
--
-- 注意：post_id ON DELETE CASCADE — 刪公告連帶清 views。
-- ============================================================

CREATE TABLE post_views (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id       UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  visitor_hash  TEXT NOT NULL,             -- SHA256(ip + ua + post_id + yyyy-mm-dd)
  ua_short      TEXT CHECK (char_length(ua_short) <= 120),  -- 截短的 UA prefix，僅用於裝置統計
  viewed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 同 visitor 同 post 同天只算一次；INSERT 端用 ON CONFLICT DO NOTHING
-- 這個 unique index 同時 cover「依 post_id 篩選」的查詢 → 不需要額外 idx_post_views_post_id
CREATE UNIQUE INDEX idx_post_views_dedup
  ON post_views(post_id, visitor_hash);

-- 撈時間範圍（例如「最近 7 天熱門公告」）
CREATE INDEX idx_post_views_viewed_at
  ON post_views(viewed_at DESC);

-- RLS：只允許 service_role 操作
-- 注意：service key 本身就 bypass RLS，這條 policy 是 defense-in-depth
-- 用 `TO service_role` 寫法（新版 Supabase 推薦；舊版 `auth.role() = 'service_role'` 已廢棄）
ALTER TABLE post_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role full access" ON post_views
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE post_views IS
  '公告閱讀計數（隱私友善：只存 hash + 截短 UA、無 raw IP）。同 visitor 同天同 post = 1 筆。';
COMMENT ON COLUMN post_views.visitor_hash IS
  'SHA256(client_ip + user_agent + post_id + yyyy-mm-dd)，server 端組裝後 hash。';
COMMENT ON COLUMN post_views.ua_short IS
  'UA 字串截前 120 字元（夠分 iPhone/Android/Mac/Windows）；不可識別個人。';
