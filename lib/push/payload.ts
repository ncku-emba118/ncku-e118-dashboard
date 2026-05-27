/**
 * Push notification payload formatter
 *
 * 對應 ARCHITECTURE.md v3 第 7 章 + Codex Rel F8：
 *   • payload 只含 post_id / department_id / short_title (≤80) / short_excerpt (≤120)
 *   • **不**送完整 markdown 內容（browser push service 有 payload size limit ~4KB）
 *   • 標題 / 摘要剪裁但保留語意
 */

const MAX_TITLE = 80;
const MAX_EXCERPT = 120;

export type PushPayload = {
  post_id: string;
  department_id: string;
  short_title: string;
  short_excerpt: string;
};

function truncate(text: string, max: number): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function makePayload(post: {
  id: string;
  department_id: string;
  title: string;
  content: string;
}): PushPayload {
  return {
    post_id: post.id,
    department_id: post.department_id,
    short_title: truncate(post.title, MAX_TITLE),
    short_excerpt: truncate(post.content, MAX_EXCERPT),
  };
}
