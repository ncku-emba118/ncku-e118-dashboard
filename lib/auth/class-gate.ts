/**
 * 班級共用密碼閘門（外層）— cookie 簽章/驗證 + 路徑規則。edge-safe（middleware 會 import）。
 *
 * 兩層互相獨立（設計前提，不可混用）：
 *   • 外層（本檔）：班級共用密碼。只證明「這個瀏覽器輸入過正確的班級密碼」，
 *     token 不含任何身分資訊，保護原本「免登入可看」的班級內容。
 *   • 內層（lib/auth/jwt.ts + session.ts）：幹部個人帳密。可歸責性（誰核准）
 *     是財務安全核心，本檔完全不碰；班級 token 不可能被當成幹部 session：
 *       - cookie 名稱不同（__Host-class-sid vs __Host-sid）
 *       - 格式不同（本檔自訂 v1.<exp>.<sig>，不是 JWT）
 *       - 簽章金鑰不同（CLASS_GATE_SECRET vs SESSION_SECRET）
 *
 * Token 格式：`v1.<exp 秒>.<base64url(HMAC-SHA256(secret, "e118-class-gate|v1|<exp>"))>`
 *   payload 固定、只有過期時間；HMAC 驗章用 crypto.subtle.verify（常數時間）。
 *
 * ⚠ CLASS_GATE_SECRET 刻意不放進 lib/env.ts 的 zod schema：那支 getEnv() 是
 *   所有幹部登入 / LINE Bot API 共用的，schema 多一個必填欄位，漏設時會連
 *   內層一起炸掉。這裡直接讀 process.env，漏設只影響外層（fail-closed：被閘
 *   住的頁面一律導去 /class-login、登入 API 回 503），內層照常運作。
 *
 * ⚠ 撤銷：換班級密碼「不會」讓已發出的 cookie 失效（middleware 不查 DB）。
 *   緊急撤銷所有人 → 換 CLASS_GATE_SECRET 環境變數並重新部署。
 */
import { CLASS_LOGIN_PATH } from './class-safe-next';

export { CLASS_LOGIN_PATH };

/**
 * prod 用 `__Host-` 前綴（比照 jwt.ts P0-9）：強制 Secure + Path=/ + 無 Domain，
 * 防子網域偽造。dev（http://localhost）無法用 __Host-，改用 `class-sid`。
 */
export const CLASS_COOKIE_NAME =
  process.env.NODE_ENV === 'production' ? '__Host-class-sid' : 'class-sid';

/** 90 天：包成 App 後同學不用每次打開都重輸密碼 */
export const CLASS_SESSION_TTL_SECONDS = 90 * 24 * 60 * 60;

const TOKEN_VERSION = 'v1';
const SIGN_CONTEXT = 'e118-class-gate';
const MIN_SECRET_LENGTH = 32;

function getSecret(): string | null {
  const s = process.env.CLASS_GATE_SECRET;
  if (!s || s.length < MIN_SECRET_LENGTH) return null;
  return s;
}

/** 讓登入 API 在發 cookie 前先確認設定齊全（沒 secret → 503，不發無法驗證的 cookie） */
export function isClassGateConfigured(): boolean {
  return getSecret() !== null;
}

function signingInput(exp: number) {
  return new TextEncoder().encode(`${SIGN_CONTEXT}|${TOKEN_VERSION}|${exp}`);
}

async function importKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return null;
  try {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
    const bin = atob(b64);
    const out = new Uint8Array(new ArrayBuffer(bin.length));
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** 簽一枚班級 token。沒設定 secret → throw（呼叫端應先 isClassGateConfigured()）。 */
export async function signClassToken(nowMs: number = Date.now()): Promise<string> {
  const secret = getSecret();
  if (!secret) throw new Error('[class-gate] CLASS_GATE_SECRET 未設定或太短');
  const exp = Math.floor(nowMs / 1000) + CLASS_SESSION_TTL_SECONDS;
  const key = await importKey(secret);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, signingInput(exp)));
  return `${TOKEN_VERSION}.${exp}.${toBase64Url(sig)}`;
}

/**
 * 驗班級 token：格式 → 過期 → HMAC。任何一步不符回 false（fail-closed）。
 * 沒設定 secret → 一律 false。
 */
export async function verifyClassToken(
  token: string | undefined | null,
  nowMs: number = Date.now(),
): Promise<boolean> {
  if (!token || token.length > 200) return false;
  const secret = getSecret();
  if (!secret) return false;

  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [ver, expStr, sigStr] = parts;
  if (ver !== TOKEN_VERSION) return false;
  if (!/^\d{1,12}$/.test(expStr)) return false;
  const exp = Number(expStr);
  const nowSec = Math.floor(nowMs / 1000);
  if (exp <= nowSec) return false;
  // 簽章正確的 token 不可能超過 TTL；超過代表 secret 外洩被亂簽，直接拒絕
  if (exp > nowSec + CLASS_SESSION_TTL_SECONDS + 300) return false;

  const sig = fromBase64Url(sigStr);
  if (!sig || sig.length !== 32) return false;
  // base64 最後一個字元有 2 個 padding bit，不檢查的話同一枚簽章會有多種寫法；
  // 要求標準編碼，讓 token 字串與簽章一對一。
  if (toBase64Url(sig) !== sigStr) return false;
  try {
    const key = await importKey(secret);
    return await crypto.subtle.verify('HMAC', key, sig, signingInput(exp));
  } catch {
    return false;
  }
}

/**
 * 班級密碼閘門「不管」的路徑（未帶班級 cookie 也放行）。
 *
 * 注意：幹部個人帳密那組路徑（/board/admin /api/board /finance /budget /staff）
 * 根本不會走到這裡——middleware 先分流給既有邏輯，見 middleware.ts。
 * 這裡只列「非內層、但必須對未輸入班級密碼的人開放」的東西：
 */
const EXEMPT_EXACT = new Set<string>([
  CLASS_LOGIN_PATH,              // 班級密碼輸入頁本身
  '/api/class-gate/login',       // 班級密碼驗證 API
  '/board/login',                // 幹部個人登入頁：不可被班級密碼擋（兩層獨立）
  '/admin/notify',               // 秘書手動通知工具：自己有 PIN session 把關，刻意與班網脫鉤
  '/api/public/dashboard-feed',  // 跨網域 CORS feed（slc 共學群看板），瀏覽器跨域不會帶 cookie
  // PWA / 分享預覽 / 登入頁需要的靜態檔（不含班級內容）
  '/manifest.json',
  '/sw.js',
  '/favicon.ico',
  '/og-image.png',
  '/og-thumb.png',
  '/og-thumb-v2.png',
  '/assets/ncku-emba-logo.png',
  '/assets/ncku-emba-logo-en.png',
]);

const EXEMPT_PREFIXES = [
  '/api/notify/',                // 同 /admin/notify，各 route 自己驗 PIN session
];

/** PWA icon（manifest / apple-touch-icon / 推播通知 icon 都會引用） */
const EXEMPT_PATTERNS: RegExp[] = [/^\/assets\/pwa-icon-[a-z0-9-]+\.png$/];

/**
 * EXEMPT_EXACT 容忍「單一」結尾斜線（/class-login/、/api/class-gate/login/…）：
 * 舊書籤 / LINE 連結常帶斜線，Next（trailingSlash:false）之後會自己 308 到無斜線版。
 * 只放寬 EXACT；'/'、'//'、'/x//' 不算（PREFIXES / PATTERNS 不受影響）。
 */
function isExactExempt(path: string): boolean {
  if (EXEMPT_EXACT.has(path)) return true;
  if (path.length > 1 && path.endsWith('/') && !path.endsWith('//')) {
    return EXEMPT_EXACT.has(path.slice(0, -1));
  }
  return false;
}

function isPathExempt(path: string): boolean {
  if (isExactExempt(path)) return true;
  if (EXEMPT_PREFIXES.some((p) => path.startsWith(p))) return true;
  return EXEMPT_PATTERNS.some((re) => re.test(path));
}

function safeDecode(path: string): string | null {
  try {
    return decodeURIComponent(path);
  } catch {
    return null;
  }
}

/**
 * 這個路徑是否不需要班級密碼（只在 isClassGatedHost() 為 true 的 host 上才有意義）。
 * 保守比對：原始路徑與 decode 後的路徑「都」要命中豁免清單才放行，
 * 避免 %xx 編碼讓兩邊解讀不一致而繞過。
 */
export function isClassGateExempt(path: string): boolean {
  const decoded = safeDecode(path);
  if (decoded === null) return false;
  return isPathExempt(path) && isPathExempt(decoded);
}

/**
 * 2026-09-29 拍板：班級密碼只套在 App 專用網址（同一個 Netlify site 的 domain alias）。
 * 主站 emba.aqualux.dev、資源書院 emba-resources.aqualux.dev、ncku-e118.netlify.app、
 * 沒有 Host / 未知 host → 不套（維持改動前的公開行為）。
 *
 * ⚠ 這是依 Host header 分流：同一份內容在主站本來就公開，所以偽造 Host 不構成繞過
 *   （換到主站 host 看到的就是公開版）。閘門的目的是 App 網址的使用體驗，不是保密。
 */
export const APP_HOST = 'ncku-emba-e118.aqualux.dev';
const DEPLOY_PREVIEW_HOST = /^deploy-preview-\d+--ncku-e118\.netlify\.app$/;
const LOCAL_DEV_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * Host header → 比對用的主機名（小寫）：
 *   • IPv6 方括號形式 `[::1]` / `[::1]:3000` → `::1`（格式不對 → null）
 *   • 其他去掉 `:port`
 *   • 去掉「單一」結尾點（FQDN 寫法 `ncku-emba-e118.aqualux.dev.`）；`..` 不去
 */
function normalizeHostname(host: string): string | null {
  const h = host.toLowerCase();
  if (h.startsWith('[')) {
    const m = /^\[([0-9a-f:.]+)\](?::\d*)?$/.exec(h);
    return m ? m[1] : null;
  }
  const name = h.split(':')[0];
  return name.endsWith('.') && !name.endsWith('..') ? name.slice(0, -1) : name;
}

export function isClassGatedHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const name = normalizeHostname(host);
  if (!name) return false;
  if (name === APP_HOST) return true;
  if (DEPLOY_PREVIEW_HOST.test(name)) return true;
  return LOCAL_DEV_HOSTS.has(name);
}
