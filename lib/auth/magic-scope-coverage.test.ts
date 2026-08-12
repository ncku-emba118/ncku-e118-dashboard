import { describe, expect, test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { MAGIC_SCOPE_ALLOWLIST, isMagicScopeAllowed } from './magic-allowlist';

/**
 * 結構性回歸測試（財務長 magic_scope 安全強化，見 magic-allowlist.ts 檔頭）。
 *
 * 目的：未來任何人新增一支 app/api/** route 或 app/** page，如果忘記處理
 * magic session，這支測試要自動失敗——不是靠人記得去補測試，而是靠這裡
 * 每次跑測試都重新掃一次整個 app/ 目錄。
 *
 * 做法：
 *   1. 枚舉 app/api/** 下所有 route.ts（抓出每支各自 export 了哪些 HTTP
 *      method）+ app/** 下所有 page.tsx（一律視為 GET 導覽）。
 *   2. 對每一個 (method, url) 組合：檢查該檔案原始碼是不是有明確
 *      `allowMagicScope: true`（＝這支 route「自己宣稱」知道怎麼處理磁力
 *      session）。如果有，它的 (method, url) 就必須命中 MAGIC_SCOPE_ALLOWLIST
 *      ——沒命中代表「opt-in 了但沒被 middleware 放行」，兩邊不一致，要求
 *      改的人同時把這裡的 allowlist 更新過（有意識的動作）。
 *   3. 額外斷言：目前整個專案「只有恰好一個檔案」opt-in。新增第二個（不管
 *      是有意加的還是複製貼上不小心加的）都會讓這條測試炸開，逼人明確
 *      決定要不要把新路徑加進 allowlist。
 *   4. 反向 sanity check：allowlist 裡的每一條，都要真的對應到 app/ 底下
 *      存在的 route/page，不是編出來的死路徑。
 *
 * 這支測試不驗證「沒 opt-in 的 route 一定安全」——那件事由
 * lib/auth/session.test.ts（readSession 預設對 magic_scope 回 null）與
 * lib/auth/magic-allowlist.test.ts（middleware 這層的 allow/deny 矩陣）
 * 一起保證：只要沒有明確 `allowMagicScope: true`，任何呼叫 readSession()
 * 的地方拿到的都是 null，跟未登入一樣。
 */

const ROOT = path.resolve(__dirname, '../..');
const APP_DIR = path.join(ROOT, 'app');
const FAKE_ID = '99999999-9999-4999-8999-999999999999';
const HTTP_METHOD_RE = /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b/g;
const OPT_IN_RE = /allowMagicScope\s*:\s*true/;

function walk(dir: string, matchBasename: (name: string) => boolean, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, matchBasename, acc);
    } else if (matchBasename(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

/** app/api/board/signoff/[id]/route.ts → /api/board/signoff/{FAKE_ID} */
function toUrlPath(absFile: string): string {
  const rel = path.relative(APP_DIR, absFile);
  const segments = rel.split(path.sep).slice(0, -1); // 去掉 route.ts / page.tsx 本身
  const urlSegments = segments.map((s) => (/^\[.+\]$/.test(s) ? FAKE_ID : s));
  return '/' + urlSegments.join('/');
}

const routeFiles = walk(path.join(APP_DIR, 'api'), (name) => name === 'route.ts');
const pageFiles = walk(APP_DIR, (name) => name === 'page.tsx');

type Case = { file: string; relFile: string; url: string; method: string };

const routeCases: Case[] = routeFiles.flatMap((file) => {
  const src = fs.readFileSync(file, 'utf8');
  const methods = [...src.matchAll(HTTP_METHOD_RE)].map((m) => m[1]);
  const url = toUrlPath(file);
  const relFile = path.relative(ROOT, file);
  return methods.map((method) => ({ file, relFile, url, method }));
});

const pageCases: Case[] = pageFiles.map((file) => ({
  file,
  relFile: path.relative(ROOT, file),
  url: toUrlPath(file),
  method: 'GET',
}));

const allCases: Case[] = [...routeCases, ...pageCases];

describe('magic-scope-coverage — 枚舉是否正常運作（防呆：別讓 walk 悄悄變成 0 測試）', () => {
  test('至少枚舉到預期數量的 route 與 page', () => {
    expect(routeFiles.length).toBeGreaterThanOrEqual(30);
    expect(pageFiles.length).toBeGreaterThanOrEqual(15);
    expect(routeCases.length).toBeGreaterThanOrEqual(routeFiles.length);
  });

  test('已知的財務長 API 路由確實有被枚舉到（sanity check 轉換邏輯本身沒壞）', () => {
    const urls = routeCases.map((c) => `${c.method} ${c.url}`);
    expect(urls).toContain(`GET /api/board/signoff/${FAKE_ID}`);
    expect(urls).toContain(`POST /api/board/signoff/${FAKE_ID}/finance-link`);
  });
});

describe('magic-scope-coverage — 逐一枚舉所有 route + page', () => {
  test.each(allCases)(
    '$method $url（$relFile）— 若原始碼 opt-in allowMagicScope:true，必須已在 allowlist 內',
    ({ file, url, method }) => {
      const src = fs.readFileSync(file, 'utf8');
      const optedIn = OPT_IN_RE.test(src);
      if (optedIn) {
        expect(
          isMagicScopeAllowed(method, url, FAKE_ID),
          `${file} 呼叫 readSession({ allowMagicScope: true }) 但 (${method} ${url}) 沒有命中 ` +
            `MAGIC_SCOPE_ALLOWLIST —— 新增 opt-in 呼叫端時必須同步更新 lib/auth/magic-allowlist.ts`,
        ).toBe(true);
      }
    },
  );
});

describe('magic-scope-coverage — opt-in 呼叫端清單必須是「有意識的動作」', () => {
  test('目前整個 app/ 底下只有恰好一個檔案 opt-in allowMagicScope: true', () => {
    const optedInFiles = allCases
      .filter((c) => OPT_IN_RE.test(fs.readFileSync(c.file, 'utf8')))
      .map((c) => c.relFile);
    const unique = [...new Set(optedInFiles)];
    expect(
      unique,
      '新增或刪除 allowMagicScope:true 的呼叫端時，請同步檢視這份清單（並視需要更新 ' +
        'lib/auth/magic-allowlist.ts 的 MAGIC_SCOPE_ALLOWLIST）——這個斷言就是要逼這件事變成有意識的動作。',
    ).toEqual([path.join('app', 'api', 'board', 'signoff', '[id]', 'route.ts')]);
  });
});

describe('magic-scope-coverage — allowlist 反向 sanity check（不是編出來的死路徑）', () => {
  test.each(MAGIC_SCOPE_ALLOWLIST)('$describe：對應到至少一個實際存在的 route/page', (entry) => {
    const matched = allCases.some((c) => c.method === entry.method && entry.pattern.test(c.url));
    expect(matched).toBe(true);
  });
});
