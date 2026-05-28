/**
 * 測試 Markdown 渲染 pipeline — 對照舊 normalize（buggy）vs 新 normalize（fixed）
 * Run: npx tsx scripts/test-markdown.tsx
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeSanitize from 'rehype-sanitize';

// 舊版（目前線上、有 bug）
function normalizeOld(src: string): string {
  return src
    .replace(/^(#{1,6})(?=[^\s#])/gm, '$1 ')
    .replace(/^(-|\*)(?=\S)/gm, '$1 ');
}

// 新版（修正：list 只處理 dash、不碰 *）
function normalizeNew(src: string): string {
  return src
    .replace(/^(#{1,6})(?=[^\s#])/gm, '$1 ')
    .replace(/^(-)(?=[^\s-])/gm, '$1 ');
}

function render(src: string): string {
  return renderToStaticMarkup(
    React.createElement(
      ReactMarkdown,
      {
        remarkPlugins: [remarkGfm, remarkBreaks],
        rehypePlugins: [[rehypeSanitize]],
      } as any,
      src,
    ),
  );
}

const tests = [
  '**粗體**',
  '這是**粗體**測試',
  '*斜體*',
  '# 標題',
  '#標題沒空格',
  '- 列表項',
  '-列表沒空格',
  '1. 數字列表',
  '[連結](https://example.com)',
  '~~刪除線~~',
  '`程式碼`',
];

console.log('═══════════════════════════════════════════════');
for (const t of tests) {
  const old = render(normalizeOld(t));
  const neu = render(normalizeNew(t));
  const same = old === neu ? '' : '  ⚠ 不同';
  console.log(`\nINPUT:  ${JSON.stringify(t)}`);
  console.log(`  舊 normalize → ${normalizeOld(t) !== t ? JSON.stringify(normalizeOld(t)) + ' → ' : ''}${old}`);
  console.log(`  新 normalize → ${normalizeNew(t) !== t ? JSON.stringify(normalizeNew(t)) + ' → ' : ''}${neu}${same}`);
}
console.log('\n═══════════════════════════════════════════════');
