/**
 * Next.js middleware — guard /board/admin/* + /api/board/* 未登入 reject。
 *
 * 對應 ARCHITECTURE.md v3 第 6 章 + Codex #2 修正：
 *   • Sec F6 fix: matcher 加 /api/board/:path* 防未來 API 裸奔
 *   • 只驗 JWT 簽名 + exp + iss + aud + payload schema（無 DB query, edge-compatible）
 *   • session_version 比對由下游 admin server page / API route 做（需 DB）
 *   • PUBLIC_PATHS 白名單 /api/board/login 等不需登入即可訪問的 endpoint
 *   • API request → JSON 401；Page request → redirect /board/login?next=
 *
 * ── 2026-09 新增：班級共用密碼（外層閘門）──
 * 請求一進來先「分流」，兩條路互不交錯：
 *   1. 內層（幹部個人帳密）路徑 = 舊 matcher 那五組
 *      （/board/admin /api/board /finance /budget /staff）
 *      → 原封不動交給 legacyAuthMiddleware()（即改動前的 middleware 本體，
 *        一行未改），完全不看班級 cookie。所以：
 *        • LINE Bot / cron 的 PUBLIC_API_PATHS 等白名單行為不變（不需要班級密碼）
 *        • 班級 cookie 不可能繞過個人帳密：這條路根本不讀它
 *      只認「原始（未解碼）path」直接命中；%xx 編碼變體（decode 後才命中，
 *      例如 /board/%61dmin）一律 404，見 classifyAuthPath()。
 *   2. 其他所有路徑（原本 middleware 不會執行、等於完全公開）
 *      → classGate()：有效班級 cookie 才放行，否則頁面導去 /class-login?next=、
 *        API 回 JSON 401。豁免清單見 lib/auth/class-gate.ts（班級登入頁本身、
 *        幹部登入頁、PWA 靜態檔、秘書通知工具、跨網域 feed、資源書院網域）。
 *   採 deny-by-default：新增的頁面預設就在班級密碼後面，不用記得登記。
 */
import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_NAME, verifySession } from './lib/auth/jwt';
import { isMagicScopeAllowed } from './lib/auth/magic-allowlist';
import {
  CLASS_COOKIE_NAME,
  CLASS_LOGIN_PATH,
  isClassGateExempt,
  verifyClassToken,
} from './lib/auth/class-gate';

/**
 * 白名單：這些 path 不需登入即可訪問（所有 method）。
 *
 * ⚠ Codex Round-3 fix: `/api/board/push/dispatch` 加白名單。
 *   原本 middleware 一律 401，但 dispatch route 自己已實作雙路徑驗證
 *   (Bearer CRON_SECRET || super session)。middleware 攔截會讓 Netlify cron
 *   永遠進不到 route → cron 失效。route 端為 source of truth。
 */
const PUBLIC_API_PATHS = new Set<string>([
  '/api/board/login',
  '/api/board/push/dispatch',
  // L1: LINE Bot 對帳收款連動。route 自己用 timing-safe Bearer BOT_SYNC_SECRET 把關
  // （同 push/dispatch 模式：機器對機器，無 session cookie，middleware 放行、route 為 source of truth）
  '/api/board/finance/income/sync',
  // 群組對話記錄：LINE Bot 上報群組發言（route 用 timing-safe Bearer BOT_SYNC_SECRET 把關，機器對機器）
  '/api/board/group-log',
  // L4: Bot 私訊聊天端點（route 用 timing-safe Bearer BOT_SYNC_SECRET 把關，機器對機器）
  '/api/board/bot/chat',
  // L4: Bot 對話清理 cron（route 用 timing-safe Bearer CRON_SECRET 把關，daily 跑）
  '/api/board/bot/cleanup',
]);

/**
 * POST-only 公開 path：anon user 可以 POST，但 PATCH/DELETE 仍需登入。
 */
const POST_PUBLIC_PATHS = new Set<string>([
  '/api/board/comments',   // 留言（半實名、IP HMAC 防 spam）
  '/api/board/subscribe',  // PWA push 訂閱（management_token 自驗 + endpoint allowlist）
]);

/**
 * GET-only 公開 pattern：這些 path 對 GET 公開（依 RLS 過濾資料），
 * 但 POST/PATCH/DELETE 仍需登入。Route handler 自己再驗 session。
 */
const GET_PUBLIC_PATTERNS: RegExp[] = [
  /^\/api\/board\/posts$/,                                              // GET 列表
  /^\/api\/board\/posts\/[a-fA-F0-9-]{36}$/,                            // GET 單篇（UUID）
  // 已核准單據公開摘要：只放行「單一文件詳情」GET（route 端只在 status==='approved' 回摘要）。
  // $ 錨定 + 只 36 字元 UUID，故 /sign /challenge /reject /void /delete /nudge /finalize
  // 等子路徑一律不匹配；且僅 GET 走此白名單，POST 到同 path 仍需登入。
  /^\/api\/board\/signoff\/[a-fA-F0-9-]{36}$/,                          // GET 單一簽核詳情（UUID）
  // LINE 卡片一次性 magic link：免帳密換發 session（規格 §1-2）。
  // 錨定 + 只 64 位小寫 hex（token 格式），route 端再驗 sha/過期並自簽 session。
  // 僅此 GET 放行；同 path 無其他 method。
  /^\/api\/board\/signoff\/magic\/[a-f0-9]{64}$/,                       // GET magic 換發 session
];

/**
 * 只有這些前綴原本就需要登入（沿用 P0-1 起的既有行為）。matcher 為了讓下面
 * 的 magic_scope 收斂管得到 /finance /budget /staff（見檔頭 §），額外把這三
 * 條加進 matcher，但它們原本「免登入可看」的行為不可變——所以「要不要求
 * 登入」這件事仍只看這個前綴清單，不是看 matcher 有沒有命中。
 */
const REQUIRES_LOGIN_PREFIXES = ['/board/admin', '/api/board'];

/**
 * 內層（幹部個人帳密）路徑 = 改動前 config.matcher 的五組，語意比照 Next
 * matcher 的 `/x/:path*`：`/x` 本身或 `/x/...`（`/x-evil` 不算）。
 * 命中的請求走 legacyAuthMiddleware()，行為與加班級密碼之前完全一致。
 */
const LEGACY_MATCHER_BASES = ['/board/admin', '/api/board', '/finance', '/budget', '/staff'];

function matchesLegacyBase(path: string): boolean {
  return LEGACY_MATCHER_BASES.some((base) => path === base || path.startsWith(`${base}/`));
}

/**
 * 分流判斷（看的是 request.nextUrl.pathname 的「原始、未解碼」字串）：
 *   • 'legacy'         原始字串直接命中內層五組 → 交給 legacyAuthMiddleware()
 *                      （含合法中文 slug，例如 /finance/%E4%B8%AD：原始字串就以
 *                      /finance/ 開頭，行為與改動前完全一致）
 *   • 'encoded_legacy' 原始字串沒命中、但 decode 後（不分大小寫）命中 → 編碼變體
 *                      （/board/%61dmin、/api/board%2Fposts、/fin%61nce…）。
 *                      ⚠ 不能交給 legacyAuthMiddleware()：它內部用「未解碼」字串
 *                      比對 REQUIRES_LOGIN_PREFIXES，比不到就直接放行 → 兩層都
 *                      沒擋。也不能交給外層（班級 cookie 不該開得了內層頁面）。
 *                      → middleware() 直接回 404。
 *   • 'class_gate'     其他（含 decode 失敗的 malformed 編碼）→ 外層，deny-by-default
 */
export type AuthRoute = 'legacy' | 'encoded_legacy' | 'class_gate';

export function classifyAuthPath(path: string): AuthRoute {
  if (matchesLegacyBase(path)) return 'legacy';
  if (!path.includes('%')) return 'class_gate';
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return 'class_gate';
  }
  return matchesLegacyBase(decoded.toLowerCase()) ? 'encoded_legacy' : 'class_gate';
}

/** 只有「原始 path 直接命中內層」才算內層（編碼變體不算，見 classifyAuthPath）。 */
export function isLegacyAuthPath(path: string): boolean {
  return classifyAuthPath(path) === 'legacy';
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const route = classifyAuthPath(path);
  if (route === 'legacy') {
    return legacyAuthMiddleware(request);
  }
  if (route === 'encoded_legacy') {
    return encodedLegacyPathDeny(path);
  }
  return classGate(request, path);
}

/**
 * 內層路徑的 %xx 編碼變體：一律 404（比照 magicScopeDeny 風格——不 redirect、
 * 不帶 Set-Cookie、no-store，不洩漏「這其實是受保護路徑」的訊號）。
 * 正常瀏覽器 / LINE Bot 不會送出這種編碼，擋掉不影響任何合法使用。
 */
function encodedLegacyPathDeny(path: string) {
  const res = path.startsWith('/api/')
    ? NextResponse.json({ error: 'Not Found' }, { status: 404 })
    : new NextResponse('Not Found', { status: 404 });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

/**
 * 外層：班級共用密碼。只處理「非內層」路徑（見檔頭）。
 * 不讀、不驗、不改幹部 session cookie。
 */
async function classGate(request: NextRequest, path: string) {
  const host = request.headers.get('host') ?? request.nextUrl.host;
  if (isClassGateExempt(path, host)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(CLASS_COOKIE_NAME)?.value;
  if (await verifyClassToken(token)) {
    return NextResponse.next();
  }

  // API（非 /api/board，那條走內層）→ JSON 401；頁面 GET/HEAD → 導去班級登入頁
  if (path.startsWith('/api/')) {
    const res = NextResponse.json({ error: '請先輸入班級密碼' }, { status: 401 });
    res.headers.set('Cache-Control', 'no-store');
    return res;
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const res = new NextResponse('請先輸入班級密碼', { status: 401 });
    res.headers.set('Cache-Control', 'no-store');
    return res;
  }
  const url = request.nextUrl.clone();
  url.pathname = CLASS_LOGIN_PATH;
  url.search = '';
  url.searchParams.set('next', `${path}${request.nextUrl.search}`);
  const res = NextResponse.redirect(url);
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

/**
 * 內層：改動前的 middleware 本體，內容一字未改（只改了函式名稱）。
 */
async function legacyAuthMiddleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const token = request.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;

  // ── 第一層：magic_scope deny-by-default（財務長唯讀連結安全強化）──
  // 只要 session 帶 magic_scope，不管 path 是不是 /board /api/board 這些原本
  // 就管制的範圍，一律先過這個 allowlist；沒命中就當「找不到」擋掉，完全
  // 不落到下面沿用舊行為的分支（否則 /finance /staff /budget 這些「原本免
  // 登入可看」的路徑會被誤判成「已登入放行」）。
  // 第二層防線在 lib/auth/session.ts::readSession()（即使有路徑繞過這支
  // middleware，例如 RSC / server action，也不會把 magic session 誤當完整
  // 帳號 session）；第三層在 lib/signoff/access.ts::requireSignoffAccess。
  if (session?.magic_scope) {
    if (!isMagicScopeAllowed(request.method, path, session.magic_scope.document_id)) {
      return magicScopeDeny(path);
    }
    return NextResponse.next();
  }

  // ── 以下沿用既有邏輯（P0-1 / Codex #2 / Round-3），行為與加上面那層之前
  // 完全一致：只有 REQUIRES_LOGIN_PREFIXES 這兩個前綴才會走到「沒 token /
  // 沒 session 就 reject」的判斷。──
  if (!REQUIRES_LOGIN_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return NextResponse.next();
  }

  if (PUBLIC_API_PATHS.has(path)) {
    return NextResponse.next();
  }

  if (request.method === 'POST' && POST_PUBLIC_PATHS.has(path)) {
    return NextResponse.next();
  }

  if (
    request.method === 'GET' &&
    GET_PUBLIC_PATTERNS.some((p) => p.test(path))
  ) {
    return NextResponse.next();
  }

  if (!session) {
    return reject(request, path);
  }

  return NextResponse.next();
}

function reject(request: NextRequest, originalPath: string) {
  // API request：回 JSON 401，不 redirect（client fetch 端要處理）
  if (originalPath.startsWith('/api/')) {
    return NextResponse.json({ error: '未登入或 session 過期' }, { status: 401 });
  }
  // Page request：redirect 到 login 並帶 next 參數
  const url = request.nextUrl.clone();
  url.pathname = '/board/login';
  url.searchParams.set('next', originalPath);
  return NextResponse.redirect(url);
}

/**
 * magic_scope 收斂被拒絕的統一出口。比照 lib/signoff/access.ts 的既有慣例
 * （權限不足一律回 404，不用 403/401 跟「不存在」區分開來，避免帶著有效
 * session 的人拿這個當 oracle 探測其他文件是否存在）。API 與 page 請求都
 * 回 404、都不带 Set-Cookie／不额外洩漏訊號；不像一般未登入那樣 redirect
 * 去 /board/login——那樣反而會多洩漏一個「你其實是有效 session、只是被
 * 這條規則擋下」的訊號差異。
 */
function magicScopeDeny(originalPath: string) {
  const res = originalPath.startsWith('/api/')
    ? NextResponse.json({ error: '找不到該簽核文件' }, { status: 404 })
    : new NextResponse('Not Found', { status: 404 });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

export const config = {
  matcher: [
    '/board/admin/:path*',
    '/api/board/:path*',
    // 這三條原本不在 matcher 裡（頁面本身免登入可看，見各頁檔頭註解），
    // 純粹是為了讓上面的 magic_scope 收斂管得到——app/staff/page.tsx、
    // app/budget/settlement/[slug]/page.tsx 都直接呼叫 readSession()，
    // 若不擴大 matcher，帶 magic_scope 的 session 打這些路徑時 middleware
    // 根本不會執行，只能靠 readSession() 那層防線（見檔頭 §2）。
    '/finance/:path*',
    '/budget/:path*',
    '/staff/:path*',
    // 班級共用密碼（外層）：deny-by-default，其餘所有路徑都要經過 middleware。
    // 只排除 Next 的建置產物（/_next/static：JS/CSS chunk，不含班級資料）
    // 與 dev HMR。/_next/image 刻意不排除（可被拿來代抓 /assets 圖片）。
    // 上面五條仍保留、語意不變：它們在 middleware() 內會先被分流到既有邏輯。
    '/((?!_next/static|_next/webpack-hmr).*)',
  ],
};
