// Execute the actual component handlers with isolated hooks; no DOM, network or env file.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as ts from 'typescript';
import { expect, test } from 'vitest';

type Element = { type: unknown; props?: { children?: unknown; onClick?: () => Promise<void> } };
function find(node: unknown, predicate: (el: Element) => boolean): Element | undefined {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) return node.map((child) => find(child, predicate)).find(Boolean);
  const el = node as Element;
  return predicate(el) ? el : find(el.props?.children, predicate);
}

function harness(file: string, native: boolean) {
  const states: unknown[] = [];
  const effects: Array<() => void> = [];
  let cursor = 0;
  let permissionCalls = 0;
  const notice = () => null;
  const jsx = (type: unknown, props: Element['props']) => ({ type, props });
  const sandbox = {
    process: { env: { NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'test-only-key' } },
    window: { PushManager: function () {}, Capacitor: { isNativePlatform: () => native } },
    navigator: { userAgent: 'test browser', serviceWorker: {} },
    Notification: { async requestPermission() { permissionCalls++; return 'denied'; } },
    Set, Uint8Array,
  };
  const modules: Record<string, unknown> = {
    react: {
      useState(value: unknown) {
        const i = cursor++;
        if (!(i in states)) states[i] = value;
        return [states[i], (next: unknown) => { states[i] = typeof next === 'function' ? next(states[i]) : next; }];
      },
      useEffect(fn: () => void) { effects.push(fn); },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    '@/components/Loading': { LoadingLabel: () => null },
    '@/components/NativeNotificationNotice': { default: notice },
  };
  function load(path: string) {
    const exports: Record<string, unknown> = {};
    const source = ts.transpileModule(readFileSync(path, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    runInNewContext(source, { ...sandbox, exports, require(name: string) {
      if (name in modules) return modules[name];
      throw new Error(`Unexpected import: ${name}`);
    } });
    return exports;
  }
  modules['@/lib/native-app'] = load('lib/native-app.ts');
  const Component = load(file).default as (props: { depts: Array<{ id: string; name: string }> }) => unknown;
  function render() { cursor = 0; return Component({ depts: [{ id: 'test-dept', name: 'Test' }] }); }
  render();
  effects.splice(0).forEach((fn) => fn());
  return { render, notice, setNative(value: boolean) { native = value; }, calls: () => permissionCalls };
}

for (const file of ['components/SubscribeButton.tsx', 'components/AdminCommentSubscribeButton.tsx']) {
  test(`${file}: native 不顯示按鈕也不請求權限`, () => {
    const h = harness(file, true);
    expect(find(h.render(), (el) => el.type === 'button')).toBeUndefined();
    expect(find(h.render(), (el) => el.type === h.notice)).toBeDefined();
    expect(h.calls()).toBe(0);
  });
  test(`${file}: browser 仍可訂閱`, async () => {
    const h = harness(file, false);
    const button = find(h.render(), (el) => el.type === 'button');
    expect(button).toBeDefined();
    await button!.props!.onClick!();
    expect(h.calls()).toBe(1);
  });
  test(`${file}: handler 再檢查 native`, async () => {
    const h = harness(file, false);
    const button = find(h.render(), (el) => el.type === 'button');
    h.setNative(true);
    await button!.props!.onClick!();
    expect(h.calls()).toBe(0);
  });
}
