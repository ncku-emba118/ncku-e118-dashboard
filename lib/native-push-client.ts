/**
 * 殼內（Capacitor App）原生推播 — 前端輔助（純函式，無 React）。
 *
 * 架構：App 殼是遠端網站（server.url），沒有本地 JS 打包；Capacitor 只對 server.url 的 origin
 * 注入 window.Capacitor，外掛由原生端註冊後掛在 window.Capacitor.Plugins.<Name>。
 * 所以這份程式碼放在 e118 網站（本專案），並以「window.Capacitor 與 PushNotifications 外掛都存在」
 * 才啟用——舊版 App（尚未內建 @capacitor/push-notifications）與一般瀏覽器都會自動退回原本行為。
 */
export const NATIVE_APP_ID = 'com.aqualux.e118emba';

export type PermState = 'prompt' | 'prompt-with-rationale' | 'granted' | 'denied';

export type PushPluginLike = {
  checkPermissions(): Promise<{ receive: PermState }>;
  requestPermissions(): Promise<{ receive: PermState }>;
  register(): Promise<void>;
  addListener(
    event: string,
    cb: (data: never) => void,
  ): Promise<{ remove(): Promise<void> }> | { remove(): Promise<void> };
};

type CapacitorLike = {
  getPlatform?: () => string;
  Plugins?: { PushNotifications?: PushPluginLike };
};

export function getPushPlugin(win: unknown): PushPluginLike | null {
  const cap = (win as { Capacitor?: CapacitorLike } | undefined)?.Capacitor;
  const p = cap?.Plugins?.PushNotifications;
  return p && typeof p.register === 'function' && typeof p.checkPermissions === 'function' ? p : null;
}

export function getNativePlatform(win: unknown): 'ios' | 'android' | null {
  const p = (win as { Capacitor?: CapacitorLike } | undefined)?.Capacitor?.getPlatform?.();
  return p === 'ios' || p === 'android' ? p : null;
}

/** 殼 UA 形如 "NCKU-E118-App/1.0"（capacitor.config appendUserAgent）→ 回 "1.0"，抓不到回 undefined */
export function parseShellVersion(ua: string): string | undefined {
  const m = /NCKU-E118-App\/([0-9A-Za-z._\-+]{1,32})/.exec(ua);
  return m?.[1];
}

/** 通知點擊導向：只允許站內相對路徑，擋 //evil.com、/\evil.com、javascript: 等開放轉址 */
export function safeInternalPath(url: unknown): string | null {
  if (typeof url !== 'string' || url.length === 0 || url.length > 300) return null;
  if (!url.startsWith('/') || url.startsWith('//') || url.startsWith('/\\')) return null;
  if (/[\u0000-\u001f\\]/.test(url)) return null;
  return url;
}

export const MGMT_TOKEN_KEY = 'e118.board.push.management_token';
export const DECLINED_KEY = 'e118.native.push.declined';

export function ensureManagementToken(storage: Pick<Storage, 'getItem' | 'setItem'>): string {
  let t = storage.getItem(MGMT_TOKEN_KEY);
  if (!t || t.length < 32) {
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    t = Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
    storage.setItem(MGMT_TOKEN_KEY, t);
  }
  return t;
}

export async function postRegistration(opts: {
  fetchImpl?: typeof fetch;
  action: 'register' | 'disable';
  platform: 'ios' | 'android';
  token: string;
  appVersion?: string;
  managementToken: string;
}): Promise<{ ok: boolean; status: number }> {
  const f = opts.fetchImpl ?? fetch;
  const res = await f('/api/native-push-register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: opts.action,
      app: NATIVE_APP_ID,
      platform: opts.platform,
      token: opts.token,
      app_version: opts.appVersion,
      management_token: opts.managementToken,
    }),
  });
  return { ok: res.ok, status: res.status };
}
