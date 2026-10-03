// Run real JSX event handlers with isolated hooks and mocked I/O; no browser/DB/network.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as ts from 'typescript';
import { expect, test, vi } from 'vitest';
type El = { type: unknown; props: Record<string, any> };
function find(node: any, predicate: (el: El) => boolean): El | undefined {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) return node.map((child) => find(child, predicate)).find(Boolean);
  return predicate(node) ? node : find(node.props?.children, predicate);
}
const comment = { id: '11111111-1111-4111-8111-111111111111', author_key: 'author-a', author_name: '測試同學', content: '測試留言', created_at: '2026-10-03', status: 'visible', post_id: 'post' };
function harness(file: string, props: Record<string, unknown>, failure: 'write' | 'getter' | 'none' = 'none') {
  const states: any[] = [], effects: Array<() => void> = [];
  const values = new Map<string, string>();
  let cursor = 0;
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => {
    if (failure === 'write') throw new Error('quota');
    values.set(key, value);
  } };
  const fetch = vi.fn(async (_url: string, init?: { method?: string }) => ({ ok: true, json: async () => init?.method ? { ok: true } : { comments: [comment] } }));
  const refresh = vi.fn();
  const modules: Record<string, any> = {
    react: {
      useState(value: any) { const i = cursor++; if (!(i in states)) states[i] = typeof value === 'function' ? value() : value; return [states[i], (next: any) => { states[i] = typeof next === 'function' ? next(states[i]) : next; }]; },
      useRef(value: any) { const i = cursor++; if (!(i in states)) states[i] = { current: value }; return states[i]; },
      useMemo(fn: () => unknown) { return fn(); },
      useEffect(fn: () => void) { const i = cursor++; if (!(i in states)) { states[i] = true; effects.push(fn); } },
    },
    'react/jsx-runtime': { jsx: (type: unknown, props: unknown) => ({ type, props }), jsxs: (type: unknown, props: unknown) => ({ type, props }), Fragment: 'fragment' },
    '@/lib/format': { formatDateTW: (value: string) => value },
    '@/components/Loading': { LoadingLabel: () => null },
    'next/navigation': { useRouter: () => ({ refresh }) },
  };
  const listeners = new Map<string, (...args: any[]) => void>();
  const sandbox: Record<string, any> = {
    crypto, fetch, AbortController, confirm: () => true, alert: vi.fn(),
    window: { addEventListener: (name: string, fn: () => void) => listeners.set(name, fn), removeEventListener() {}, setTimeout, clearTimeout },
    document: { hidden: false, addEventListener() {}, removeEventListener() {} },
  };
  function load(path: string) {
    const exports: Record<string, any> = {};
    const context = { ...sandbox, exports, require: (name: string) => {
      if (!(name in modules)) throw new Error(`Unexpected import: ${name}`);
      return modules[name];
    } };
    Object.defineProperty(context, 'localStorage', { get: () => { if (failure === 'getter') throw new Error('denied'); return storage; } });
    runInNewContext(ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
    return exports;
  }
  for (const name of ['preferences', 'reasons', 'contact']) modules[`@/lib/comments/${name}`] = load(`lib/comments/${name}.ts`);
  const Component = load(file).default;
  const render = () => { cursor = 0; return Component(props); };
  render();
  const cleanups = effects.splice(0).map((fn) => fn()).filter((fn) => typeof fn === 'function') as unknown as Array<() => void>;
  const button = (label: string) => find(render(), (el) => el.type === 'button' && el.props.children === label)!;
  return { render, button, fetch, refresh, listeners, unmount() { cleanups.forEach((fn) => fn()); }, setProps(next: Record<string, unknown>) { props = next; } };
}
for (const failure of ['write', 'getter'] as const) {
  test(`localStorage ${failure} 失敗仍 POST 檢舉、記憶體保留封鎖及本機隱藏`, async () => {
    const h = harness('components/Comments.tsx', { postId: 'post', initialComments: [comment], canModerate: false }, failure);
    await Promise.resolve(); await Promise.resolve();
    h.button('檢舉').props.onClick();
    h.button('封鎖').props.onClick();
    const form = find(h.render(), (el) => el.type === 'form' && !!find(el.props.children, (child) => child.type === 'h3'))!;
    await form.props.onSubmit({ preventDefault() {} });
    const posted = h.fetch.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.stringify(h.render())).toContain('檢舉已送交幹部；無法儲存本機設定');
    expect(posted?.[0]).toBe('/api/board/comments/reports');
    expect(JSON.parse((posted?.[1] as any).body)).toMatchObject({ comment_id: comment.id, reporter_id: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    h.listeners.get('storage')!({ key: null }); // Failed storage must not erase this page's block.
    expect(find(h.render(), (el) => el.type === 'button' && el.props.children?.[0] === '已封鎖（')?.props.children[1]).toBe(1);
    expect(h.button('檢舉')).toBeUndefined();
    // Unblocking the author must still retain the independently reported local hide.
    find(h.render(), (el) => el.type === 'button' && el.props.children?.[0] === '已封鎖（')!.props.onClick();
    h.button('解除封鎖').props.onClick();
    expect(h.button('檢舉')).toBeUndefined();
    // Same content on another device remains public.
    const other = harness('components/Comments.tsx', { postId: 'post', initialComments: [comment], canModerate: false });
    expect(other.button('檢舉')).toBeDefined();
    expect(comment.status).toBe('visible');
  });
}
test('API 檢舉失敗不誤報送達、不隱藏留言', async () => {
  const h = harness('components/Comments.tsx', { postId: 'post', initialComments: [comment], canModerate: false });
  await new Promise<void>((resolve) => setImmediate(resolve));
  h.fetch.mockImplementationOnce(async () => ({ ok: false, json: async () => ({ error: '檢舉未送達' }) } as any));
  h.button('檢舉').props.onClick();
  await find(h.render(), (el) => el.type === 'form' && !!find(el.props.children, (child) => child.type === 'h3'))!.props.onSubmit({ preventDefault() {} });
  expect(JSON.stringify(h.render())).toContain('檢舉未送達');
  expect(h.button('檢舉')).toBeDefined();
});
for (const [label, method] of [['駁回（結案）', 'PATCH'], ['刪除留言', 'DELETE']]) {
  test(`${label} 成功移除同留言多筆檢舉，保留其他留言`, async () => {
    const reports = ['one', 'two', 'three'].map((id) => ({ id, reason: 'spam', details: '', created_at: '2026-10-03', comments: { ...comment, id: id === 'three' ? 'another' : comment.id, posts: { id: 'post', title: '公告', department_id: 'academic' } } }));
    const h = harness('components/CommentReports.tsx', { reports });
    await h.button(label).props.onClick();
    expect(h.fetch).toHaveBeenCalledWith(`/api/board/comments/${comment.id}`, { method });
    expect(h.refresh).toHaveBeenCalledOnce();
    expect(JSON.stringify(h.render())).not.toContain(comment.id);
    expect(find(h.render(), (el) => el.type === 'article')).toBeDefined();
    h.setProps({ reports: [{ ...reports[0], id: 'new-report' }] });
    expect(h.button(label)).toBeDefined(); // New unresolved report on the same comment stays actionable.
  });
}
test('延遲公開 GET 不可覆蓋本頁已成功刪除的留言', async () => {
  const h = harness('components/Comments.tsx', { postId: 'post', initialComments: [comment], canModerate: true });
  await new Promise<void>((resolve) => setImmediate(resolve));
  let finish: (value: any) => void = () => {};
  h.fetch.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const refreshing = h.listeners.get('focus')!();
  await h.button('刪除').props.onClick();
  expect(h.button('檢舉')).toBeUndefined();
  finish({ ok: true, json: async () => ({ comments: [comment] }) });
  await refreshing;
  expect(h.button('檢舉')).toBeUndefined();
});
test('延遲公開 GET 不可抹除本頁剛成功送出的留言', async () => {
  const h = harness('components/Comments.tsx', { postId: 'post', initialComments: [], canModerate: false });
  await new Promise<void>((resolve) => setImmediate(resolve));
  let finish: (value: any) => void = () => {};
  h.fetch.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const refreshing = h.listeners.get('focus')!();
  const added = { ...comment, id: 'new-comment', content: '新留言測試' };
  h.fetch.mockImplementationOnce(async () => ({ ok: true, json: async () => ({ comment: added }) } as any));
  find(h.render(), (el) => el.type === 'textarea')!.props.onChange({ target: { value: added.content } });
  await find(h.render(), (el) => el.type === 'form')!.props.onSubmit({ preventDefault() {} });
  expect(JSON.stringify(h.render())).toContain(added.content);
  finish({ ok: true, json: async () => ({ comments: [comment] }) });
  await refreshing;
  expect(JSON.stringify(h.render())).toContain(added.content);
});
test('後台清單只查有部門權限的未結案檢舉', async () => {
  const query: Record<string, any> = {};
  for (const method of ['select', 'in', 'eq', 'is', 'order']) query[method] = vi.fn(() => query);
  query.range = vi.fn(async () => ({ data: [], error: null }));
  const exports: Record<string, any> = {};
  const modules: Record<string, any> = {
    'next/navigation': { redirect: vi.fn(() => { throw new Error('redirect'); }) },
    '@/lib/auth/session': { readSession: async () => ({ role: 'dept', home_dept_id: 'academic' }), manageableDepts: () => [{ id: 'academic' }] },
    '@/lib/supabase/server': { getServerClient: () => ({ from: () => query }) },
    '@/components/CommentReports': { default: () => null },
    'react/jsx-runtime': { jsx: () => null, jsxs: () => null },
  };
  runInNewContext(ts.transpileModule(readFileSync('app/board/admin/reports/page.tsx', 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, require: (name: string) => modules[name] });
  await exports.default({ searchParams: Promise.resolve({}) });
  expect(query.in).toHaveBeenCalledWith('comments.posts.department_id', ['academic']);
  expect(query.is).toHaveBeenCalledWith('resolved_at', null);
  expect(query.in).toHaveBeenCalledWith('posts.department_id', ['academic']);
  expect(query.eq).toHaveBeenCalledWith('status', 'pending_review');
  expect(query.is).toHaveBeenCalledWith('deleted_at', null);
});

test.each(['放行留言', '刪除留言'])('待審核留言可操作且成功後才移除：%s', async (label) => {
  const pending = [{ ...comment, status: 'pending_review', posts: { id: 'post', title: '公告', department_id: 'academic' } }];
  const h = harness('components/CommentReports.tsx', { reports: [], pending });
  h.fetch.mockImplementationOnce(async () => ({ ok: false, json: async () => ({ error: '處理失敗' }) } as any));
  await h.button(label).props.onClick();
  expect(h.button(label)).toBeDefined();
  expect(h.refresh).not.toHaveBeenCalled();
  await h.button(label).props.onClick();
  expect(h.fetch).toHaveBeenLastCalledWith(`/api/board/comments/${comment.id}${label === '放行留言' ? '?action=approve' : ''}`, { method: label === '放行留言' ? 'PATCH' : 'DELETE' });
  expect(h.button(label)).toBeUndefined();
  expect(h.refresh).toHaveBeenCalledOnce();
});

test('放行不會隱藏同留言未結案檢舉', async () => {
  const c = { ...comment, status: 'pending_review', posts: { id: 'post', title: '公告', department_id: 'academic' } };
  const h = harness('components/CommentReports.tsx', { pending: [c], reports: [{ id: 'report', comments: c, reason: 'spam', created_at: comment.created_at, details: '' }] });
  await h.button('放行留言').props.onClick();
  expect(h.button('駁回（結案）')).toBeDefined();
});

test('留言者看到待審核提示，不把待審核內容插入公開清單', async () => {
  const h = harness('components/Comments.tsx', { postId: 'post', initialComments: [], canModerate: false });
  await new Promise<void>((resolve) => setImmediate(resolve));
  h.fetch.mockImplementationOnce(async () => ({ ok: true, json: async () => ({ comment: null, pending: true, message: '留言已送出，待幹部審核後顯示' }) } as any));
  find(h.render(), (el) => el.type === 'textarea')!.props.onChange({ target: { value: '你是白痴' } });
  await find(h.render(), (el) => el.type === 'form')!.props.onSubmit({ preventDefault() {} });
  expect(JSON.stringify(h.render())).toContain('留言已送出，待幹部審核後顯示');
  expect(JSON.stringify(h.render())).not.toContain('你是白痴');
});

const reportForm = (h: ReturnType<typeof harness>) => find(h.render(), (el) => el.type === 'form' && !!find(el.props.children, (child) => child.type === 'h3'))!;
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
async function pendingReport() {
  const h = harness('components/Comments.tsx', { postId: 'post', initialComments: [comment], canModerate: false });
  await flush();
  let finish!: (value: any) => void;
  h.fetch.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  h.button('檢舉').props.onClick();
  const pending = reportForm(h).props.onSubmit({ preventDefault() {} });
  const signal = (h.fetch.mock.calls.at(-1)![1] as any).signal as AbortSignal;
  return { h, pending, signal, finish };
}

test('檢舉 pending 仍可封鎖／解除封鎖及取消；取消中止 signal', async () => {
  const { h, signal, pending, finish } = await pendingReport();
  expect(h.button('封鎖').props.disabled).not.toBe(true);
  expect(h.button('取消').props.disabled).not.toBe(true);
  h.button('封鎖').props.onClick();
  find(h.render(), (el) => el.type === 'button' && el.props.children?.[0] === '已封鎖（')!.props.onClick();
  expect(h.button('解除封鎖').props.disabled).not.toBe(true);
  h.button('解除封鎖').props.onClick();
  expect(h.button('檢舉')).toBeDefined();
  h.button('取消').props.onClick();
  expect(signal.aborted).toBe(true);
  finish({ ok: true, json: async () => ({ ok: true }) });
  await pending;
  expect(h.button('檢舉').props.disabled).not.toBe(true);
  expect(JSON.stringify(h.render())).not.toContain('檢舉已送交幹部');
});

test('10 秒逾時解鎖重試，即使 fetch 無視 abort 也不被晚到回覆覆寫', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  try {
    const { h, signal, pending, finish } = await pendingReport();
    await vi.advanceTimersByTimeAsync(9999);
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(signal.aborted).toBe(true);
    expect(h.button('送出檢舉').props.disabled).toBe(false);
    expect(JSON.stringify(h.render())).toContain('逾時');
    let finishRetry!: (value: any) => void;
    h.fetch.mockImplementationOnce(() => new Promise((resolve) => { finishRetry = resolve; }));
    const retry = reportForm(h).props.onSubmit({ preventDefault() {} });
    finish({ ok: true, json: async () => ({ ok: true }) });
    await pending;
    expect(h.button('送出中…').props.disabled).toBe(true);
    expect(h.button('檢舉')).toBeDefined();
    finishRetry({ ok: true, json: async () => ({ ok: true }) });
    await retry;
    expect(h.button('檢舉')).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  } finally { vi.useRealTimers(); }
});

test('取消後新檢舉不受舊請求失敗影響', async () => {
  const { h, pending, finish } = await pendingReport();
  h.button('取消').props.onClick();
  h.button('檢舉').props.onClick();
  finish({ ok: false, json: async () => ({ error: '舊錯誤' }) });
  await pending;
  expect(JSON.stringify(h.render())).not.toContain('舊錯誤');
  await reportForm(h).props.onSubmit({ preventDefault() {} });
  expect(h.button('檢舉')).toBeUndefined();
});

test('離開留言元件時中止檢舉，晚到成功不修改本機設定', async () => {
  const { h, pending, signal, finish } = await pendingReport();
  h.unmount();
  expect(signal.aborted).toBe(true);
  finish({ ok: true, json: async () => ({ ok: true }) });
  await pending;
  expect(h.button('檢舉')).toBeDefined();
});

test.each(['none', 'write', 'getter'] as const)('檢舉 404 隱藏已刪留言；storage %s 不影響本頁隱藏', async (failure) => {
  const h = harness('components/Comments.tsx', { postId: 'post', initialComments: [comment], canModerate: false }, failure);
  await flush();
  h.fetch.mockImplementationOnce(async () => ({ ok: false, status: 404, json: async () => { throw new Error('invalid body'); } }) as any);
  h.button('檢舉').props.onClick();
  await reportForm(h).props.onSubmit({ preventDefault() {} });
  expect(h.button('檢舉')).toBeUndefined();
  expect(JSON.stringify(h.render())).toContain('留言已不存在');
  expect(JSON.stringify(h.render())).not.toContain('檢舉已送交幹部');
  await h.listeners.get('focus')!(); // stale GET cannot undo persisted/local hide
  expect(h.button('檢舉')).toBeUndefined();
});

test('收到 response 但 JSON body 持續 pending 也會在 10 秒中止', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  try {
    const h = harness('components/Comments.tsx', { postId: 'post', initialComments: [comment], canModerate: false });
    await flush();
    let finishBody!: (value: any) => void;
    h.fetch.mockImplementationOnce(async () => ({ ok: true, json: () => new Promise((resolve) => { finishBody = resolve; }) }) as any);
    h.button('檢舉').props.onClick();
    const pending = reportForm(h).props.onSubmit({ preventDefault() {} });
    await flush();
    await vi.advanceTimersByTimeAsync(10000);
    expect(h.button('送出檢舉').props.disabled).toBe(false);
    expect((h.fetch.mock.calls.at(-1)![1] as any).signal.aborted).toBe(true);
    finishBody({ ok: true });
    await pending;
    expect(h.button('檢舉')).toBeDefined();
    expect(JSON.stringify(h.render())).toContain('逾時');
    expect(vi.getTimerCount()).toBe(0);
  } finally { vi.useRealTimers(); }
});
