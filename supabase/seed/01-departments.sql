-- ============================================================
-- E118 公告欄 — 部門 seed
-- 對應 ARCHITECTURE.md v3 第 2 章 + 第 16 章配色方案 A
-- 排序依負責人指定：行政與課務優先、機動性活動置中、後勤類在尾
-- ============================================================

INSERT INTO departments (id, name, color, sort_order) VALUES
  ('secretary', '秘書', '#8B1F2F', 1),  -- NCKU wine 本色，行政權威色
  ('academic',  '學務', '#1F3F5C', 2),  -- 學院靛藍
  ('activity',  '活動', '#C9742E', 3),  -- 暖橘
  ('pr',        '公關', '#8B2F4F', 4),  -- 玫瑰紫紅
  ('finance',   '財務', '#2D5F4E', 5),  -- 深森林綠
  ('media',     '文宣', '#7A5A2B', 6),  -- 金棕
  ('medical',   '醫務', '#3F5C6E', 7)   -- 醫療藍灰
ON CONFLICT (id) DO NOTHING;
