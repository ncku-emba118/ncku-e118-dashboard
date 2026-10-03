// Execute the server page with isolated session/query mocks. No DB/network.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as ts from 'typescript';
import { expect, test, vi } from 'vitest';
import { manageableDepts, deptInfo, ALL_DEPTS } from '../depts';

async function renderAdmin(role: 'super' | 'dept', home_dept_id: string | null, failed = false, count: number | null = 4) {
  const queries: Array<{ table: string; calls: Array<[string, ...unknown[]]> }> = [];
  const from = (table: string) => {
    const calls: Array<[string, ...unknown[]]> = [];
    queries.push({ table, calls });
    const query: Record<string, any> = {};
    for (const method of ['select', 'in', 'is', 'eq', 'gte', 'order', 'limit']) {
      query[method] = (...args: unknown[]) => { calls.push([method, ...args]); return query; };
    }
    query.then = (resolve: (result: unknown) => void) => resolve({ data: [], count, error: failed ? { message: 'private' } : null });
    return query;
  };
  const modules: Record<string, any> = {
    'next/navigation': { redirect: () => { throw new Error('redirect'); } },
    '@/lib/auth/session': { readSession: async () => ({ role, home_dept_id }), manageableDepts, deptInfo },
    '@/lib/supabase/server': { getServerClient: () => ({ from }) },
    '@/lib/board/view_logger': { getPostViewCounts: async () => new Map() },
    '@/lib/format': { formatDateTW: (value: string) => value },
    'react/jsx-runtime': { jsx: (type: unknown, props: unknown) => ({ type, props }), jsxs: (type: unknown, props: unknown) => ({ type, props }) },
  };
  for (const name of ['AdminPostsTable', 'AdminLineRouting', 'AdminCommentSubscribeButton', 'Breadcrumb']) modules[`@/components/${name}`] = { default: () => null };
  const exports: Record<string, any> = {};
  runInNewContext(ts.transpileModule(readFileSync('app/board/admin/page.tsx', 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, console: { error: vi.fn() }, require: (name: string) => {
    if (!(name in modules)) throw new Error(`Unexpected import ${name}`);
    return modules[name];
  } });
  const tree = await exports.default();
  function find(node: any): any {
    if (Array.isArray(node)) return node.map(find).find(Boolean);
    if (!node || typeof node !== 'object') return;
    if (node.type === 'a' && node.props.href === '/board/admin/reports') return node;
    return find(node.props?.children);
  }
  return { queries, link: find(tree) };
}

test.each([
  ['dept', 'academic', ['academic']],
  ['dept', null, []],
  ['super', null, ALL_DEPTS.map((dept) => dept.id)],
] as const)('後台計數僅限可管理部門 %s %s', async (role, dept, allowed) => {
  const { queries, link } = await renderAdmin(role, dept);
  const reports = queries.find((q) => q.table === 'comment_reports')!;
  const pending = queries.find((q) => q.table === 'comments')!;
  expect(reports.calls).toContainEqual(['select', 'id, comments!inner(posts!inner(department_id))', { count: 'exact', head: true }]);
  expect(reports.calls).toContainEqual(['in', 'comments.posts.department_id', allowed]);
  expect(reports.calls).toContainEqual(['is', 'resolved_at', null]);
  expect(pending.calls).toContainEqual(['select', 'id, posts!inner(department_id)', { count: 'exact', head: true }]);
  expect(pending.calls).toContainEqual(['in', 'posts.department_id', allowed]);
  expect(pending.calls).toContainEqual(['eq', 'status', 'pending_review']);
  expect(pending.calls).toContainEqual(['is', 'deleted_at', null]);
  expect(link.props.children.join('')).toBe('待處理檢舉 4、待審留言 4');
});

test.each([[true, 0], [false, null]] as const)('查詢失敗或沒有 count 不冒充零筆 %s %s', async (failed, count) => {
  const { link } = await renderAdmin('dept', 'academic', failed, count);
  expect(link.props.children.join('')).toBe('待處理檢舉 待確認、待審留言 待確認');
});

test('空佇列明確顯示零並保留管理入口', async () => {
  const { link } = await renderAdmin('dept', 'academic', false, 0);
  expect(link.props.children.join('')).toBe('待處理檢舉 0、待審留言 0');
});
