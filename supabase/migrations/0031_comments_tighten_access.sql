-- 手動順序 2：先套用 0030 → 部署新版網站 → 舊頁面重新載入 → 最後套用本檔。
-- 僅在新版網站已部署且舊頁面已重新載入後才套用。
-- 非重複執行腳本；此步驟會停止舊網站的 comments 直讀與 Realtime。
BEGIN;

ALTER PUBLICATION supabase_realtime DROP TABLE public.comments;
DROP POLICY "anon read visible comments" ON public.comments;
REVOKE SELECT ON public.comments FROM PUBLIC, anon, authenticated;

COMMIT;
