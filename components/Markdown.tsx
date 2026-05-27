/**
 * Markdown 安全渲染 — server component compatible
 *
 * Pipeline:
 *   raw → normalize（補 `#` / `-` 後空格）→ react-markdown
 *   → remark-gfm（表格/刪除線）+ remark-breaks（單 \n 當 <br>）
 *   → rehype-sanitize（白名單 XSS 防護）
 *
 * 為什麼要 normalize：
 *   中文用戶習慣打 `#新生體檢` / `##一、` / `-項目1`（# - 後沒空格），
 *   strict markdown 認不出 heading / list、會渲染成一坨內文。
 *   這裡前端 preprocess 把 `^(#{1,6})(?=\S)` / `^-(?=\S)` 自動補空格。
 *
 * 為什麼要 remark-breaks：
 *   標準 markdown 規定段落要空行（\n\n）才分；單一 \n 視為 inline space。
 *   班級公告用戶習慣是「打 Enter 換段落」，加 remark-breaks 把單 \n 渲染成 <br>，
 *   符合 GitHub comment / Slack / Discord 的「chat-style markdown」直覺。
 *
 * 安全性：rehype-sanitize 用 lib/markdown/sanitize-schema 嚴格白名單
 * 對應 ARCHITECTURE.md v3 第 17 章「內容渲染安全規格」+ Codex Sec F7
 */
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeSanitize from 'rehype-sanitize';
import { sanitizeSchema } from '@/lib/markdown/sanitize-schema';

type Props = {
  source: string;
  className?: string;
};

/**
 * 中文用戶常見的 markdown 寫法 normalize：
 * - `#新生體檢` → `# 新生體檢` (heading 後缺空格)
 * - `##一、` → `## 一、`
 * - `-項目1` → `- 項目1` (list 後缺空格)
 *
 * 不動：`* 斜體 *`, `**粗體**`, 程式碼區塊內、原本就有空格的 heading/list。
 */
function normalizeMarkdown(src: string): string {
  return src
    .replace(/^(#{1,6})(?=[^\s#])/gm, '$1 ')
    .replace(/^(-|\*)(?=\S)/gm, '$1 ');
}

export default function Markdown({ source, className }: Props) {
  const normalized = normalizeMarkdown(source);
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
        components={{
          // 強制所有 <a> 都帶 rel/target — 即使 markdown 沒寫
          a: ({ href, children, ...rest }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              {...rest}
            >
              {children}
            </a>
          ),
        }}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  );
}
