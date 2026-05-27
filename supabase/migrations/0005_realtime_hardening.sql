-- ============================================================
-- E118 公告欄 — Realtime publication 收緊
-- 對應第三輪 Codex review P0-5/P0-6 修正
-- ============================================================
--
-- 原本 migration 0003 把 `posts` 跟 `comments` 都加進 supabase_realtime publication。
--
-- 問題：
--   P0-6 (posts):  client 端**沒有任何地方訂閱 posts table**（公告列表是 SSR + ISR 30s，
--                  詳情頁也是 SSR）— publication 留著只增加攻擊面：anon 仍可訂閱 channel
--                  收到 UPDATE event 的 row payload。雖然 RLS (published=true) 會 broadcast
--                  filter，但「published=true → false」這種 transition 的 UPDATE event
--                  仍會把舊欄位送出去（payload.old.published=true 仍通過 broadcast filter）。
--                  最簡單防護：移出 publication，cron-based + ISR 已足夠。
--
--   P0-5 (comments): 唯一一個真正用 Realtime 的 client 是 components/Comments.tsx。
--                  保留 publication 但**強制依賴 RLS filter (status='visible' AND
--                  deleted_at IS NULL)** — 這已經正確設定在 migration 0001。
--                  Supabase Realtime 對 anon role 廣播時會評估 RLS USING clause，
--                  status='pending_review' 的 row 不會被 broadcast。
--                  client 端 Comments.tsx:56 的 status check 是 defense-in-depth、不可移除。
--
-- ============================================================

-- 移出 posts（client 沒在用）
ALTER PUBLICATION supabase_realtime DROP TABLE posts;

-- comments 保留在 publication（components/Comments.tsx 依賴）
-- RLS USING (status='visible' AND deleted_at IS NULL) 已在 0001_initial.sql 設定
-- 此處不動 publication，僅留註解說明依賴關係
