/**
 * rehype-sanitize schema — 對應 ARCHITECTURE.md v3 第 17 章「內容渲染安全規格」
 *
 * 允許子集：
 *   • 標題 h1-h4 / 段落 / 換行 / 粗體 / 斜體 / 刪除線
 *   • 連結 <a>: href 限 https/mailto，拒 javascript:/data:/vbscript:/file:
 *   • 列表 / 引用 / 程式碼 / 表格
 *
 * 禁止：
 *   • <script> / <iframe> / <style> / <link> / <meta>
 *   • on* event handler 屬性
 *   • inline style 內 expression() / url()
 *   • <img> 來自非 https 的（防 mixed content + 防 data: URL XSS）
 */
import { defaultSchema } from 'hast-util-sanitize';

export const sanitizeSchema = {
  ...defaultSchema,
  protocols: {
    href: ['https', 'mailto'],
    src: ['https'],
    cite: ['https'],
  },
  tagNames: [
    'h1', 'h2', 'h3', 'h4',
    'p', 'br', 'hr',
    'strong', 'em', 'del', 's',
    'a',
    'ul', 'ol', 'li',
    'blockquote',
    'code', 'pre',
    'table', 'thead', 'tbody', 'tr', 'td', 'th',
    'img',
  ],
  attributes: {
    ...defaultSchema.attributes,
    a: ['href', 'title', ['rel', 'nofollow', 'noopener', 'noreferrer'], ['target', '_blank']],
    img: ['src', 'alt', 'title'],
    th: ['align'],
    td: ['align'],
  },
  // 顯式 disallow（覆蓋 defaultSchema 若有 include 的話）
  clobberPrefix: 'user-content-',
};
