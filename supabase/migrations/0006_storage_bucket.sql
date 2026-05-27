-- ============================================================
-- E118 公告欄 — Supabase Storage bucket for attachments
-- 對應「直接上傳 GDrive→改為 Supabase Storage」方案
-- ============================================================
--
-- bucket: board-attachments
-- public read: anon 可以直接拿 public URL 讀（公告頁面要顯示圖片/PDF）
-- write: 只允許 service_role（API route 端透過 SUPABASE_SERVICE_ROLE_KEY）
--        實際 API 端有 session 驗證才會呼叫 storage.upload，外部 anon 完全不能寫
--
-- size 上限：25 MB（單檔），在 API 層 enforce；Supabase Free tier 整體 1 GB
-- MIME 白名單：在 API 層 enforce（image/png|jpeg|webp|gif、pdf、office docs、txt/csv）

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'board-attachments',
  'board-attachments',
  true,
  26214400,  -- 25 MiB hard ceiling at storage layer
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
