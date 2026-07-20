-- ============================================================
-- 0020 — 修正 0019 的 attachments 結構檢查（NULL 語意漏判）
--
-- 0019 的 signoff_attachments_shape_ok 寫成：
--     jsonb_typeof(e->'object_path') <> 'string'
-- 當 key 根本不存在時 `e->'key'` 回 SQL NULL，`jsonb_typeof(NULL)` 也是 NULL，
-- 而 `NULL <> 'string'` 求值為 NULL（不是 TRUE）。WHERE 子句只選 TRUE 的列，
-- 因此缺欄位的元素不會被選中，NOT EXISTS 反而成立 → 畸形資料通過檢查。
-- 實測 '[{"bad":1}]'::jsonb 可寫入成功，證實漏判。
--
-- 改用 IS DISTINCT FROM：NULL IS DISTINCT FROM 'string' 為 TRUE，缺欄位會被抓出。
-- ============================================================

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION signoff_attachments_shape_ok(p JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT jsonb_typeof(p) = 'array'
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(p) e
        WHERE jsonb_typeof(e)                IS DISTINCT FROM 'object'
           OR jsonb_typeof(e->'object_path') IS DISTINCT FROM 'string'
           OR jsonb_typeof(e->'sha256')      IS DISTINCT FROM 'string'
           OR jsonb_typeof(e->'mime')        IS DISTINCT FROM 'string'
           OR jsonb_typeof(e->'name')        IS DISTINCT FROM 'string'
     );
$fn$;

-- 既有列重新驗證（目前為 0 列，仍保留以防未來重跑時已有資料）
ALTER TABLE signoff_supplements VALIDATE CONSTRAINT signoff_supplements_attachments_shape;
