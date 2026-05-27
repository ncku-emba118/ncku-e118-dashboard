-- ============================================================
-- E118 公告欄 — 啟用 Realtime publication
-- 修 Codex #1 Rel F8: Realtime publication 未在 migration 設定，未來重建 prod 漂移
-- ============================================================
--
-- Supabase Realtime 透過 supabase_realtime publication 廣播 row 變化。
-- 加入 table 後，anon client 可以 .channel().on('postgres_changes', ...) 訂閱。
-- RLS 仍然生效（anon 只會收到 status='visible' AND deleted_at IS NULL 的 row）。

-- Comments — 留言即時更新（公告詳情頁訂閱）
ALTER PUBLICATION supabase_realtime ADD TABLE comments;

-- Posts — 公告列表即時更新（可選、首頁 timeline 用）
ALTER PUBLICATION supabase_realtime ADD TABLE posts;
