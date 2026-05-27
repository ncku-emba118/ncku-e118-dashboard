/**
 * Markdown 安全渲染 — server component compatible
 *
 * Pipeline:
 *   markdown source → react-markdown → remark-gfm（表格/刪除線）→ rehype-sanitize（白名單）
 *
 * 安全性：rehype-sanitize 用 ../lib/markdown/sanitize-schema 嚴格白名單
 * 對應 ARCHITECTURE.md v3 第 17 章「內容渲染安全規格」+ Codex Sec F7
 */
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { sanitizeSchema } from '@/lib/markdown/sanitize-schema';

type Props = {
  source: string;
  className?: string;
};

export default function Markdown({ source, className }: Props) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
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
        {source}
      </ReactMarkdown>
    </div>
  );
}
