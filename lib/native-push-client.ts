/**
 * 殼內（Capacitor App）原生推播 — 前端輔助（FCM 主題訂閱版，純函式，無 React）。
 *
 * 架構：App 殼是遠端網站（server.url），沒有本地 JS 打包，無法 import npm 外掛。
 * Capacitor 原生層會把每個已註冊的原生外掛注入成 window.Capacitor.Plugins.<jsName>
 * （查證來源：@capacitor/ios 8.5.2 JSExport.swift exportJS、@capacitor/android 8.5.2 JSExport.getPluginJS；
 *  @capacitor-firebase/messaging 8.5.2 的 jsName／@CapacitorPlugin name 皆為 "FirebaseMessaging"）。
 * 所以本檔以「window.Capacitor.Plugins.FirebaseMessaging 存在且方法齊全」才啟用——
 * 舊版 App（尚未內建該外掛）與一般瀏覽器都會自動退回原本行為（LINE 群組說明）。
 *
 * 隱私設計：不存任何裝置識別碼。使用者同意後才 getToken()（啟動 FCM，回傳值丟棄）並訂閱主題；
 * 本地只存「已開啟／暫時不要」兩個旗標。
 */
import { ANDROID_CHANNEL_ID, TOPIC_ALL } from '@/lib/push/native/types';

export { ANDROID_CHANNEL_ID, TOPIC_ALL };

export type PermState = 'prompt' | 'prompt-with-rationale' | 'granted' | 'denied';

export type MessagingPluginLike = {
  checkPermissions(): Promise<{ receive: PermState }>;
  requestPermissions(): Promise<{ receive: PermState }>;
  getToken(): Promise<{ token?: string }>;
  deleteToken(): Promise<void>;
  subscribeToTopic(opts: { topic: string }): Promise<void>;
  unsubscribeFromTopic(opts: { topic: string }): Promise<void>;
  createChannel?(opts: { id: string; name: string; description?: string; importance?: number }): Promise<void>;
  addListener(
    event: string,
    cb: (data: never) => void,
  ): Promise<{ remove(): Promise<void> }> | { remove(): Promise<void> };
};

type CapacitorLike = {
  getPlatform?: () => string;
  Plugins?: { FirebaseMessaging?: MessagingPluginLike };
};

export function getMessagingPlugin(win: unknown): MessagingPluginLike | null {
  const cap = (win as { Capacitor?: CapacitorLike } | undefined)?.Capacitor;
  const p = cap?.Plugins?.FirebaseMessaging;
  const ok =
    !!p &&
    typeof p.checkPermissions === 'function' &&
    typeof p.requestPermissions === 'function' &&
    typeof p.getToken === 'function' &&
    typeof p.deleteToken === 'function' &&
    typeof p.subscribeToTopic === 'function' &&
    typeof p.unsubscribeFromTopic === 'function' &&
    typeof p.addListener === 'function';
  return ok ? p : null;
}

export function getNativePlatform(win: unknown): 'ios' | 'android' | null {
  const p = (win as { Capacitor?: CapacitorLike } | undefined)?.Capacitor?.getPlatform?.();
  return p === 'ios' || p === 'android' ? p : null;
}

/** 通知點擊導向：只允許站內相對路徑，擋 //evil.com、/\evil.com、javascript: 等開放轉址 */
export function safeInternalPath(url: unknown): string | null {
  if (typeof url !== 'string' || url.length === 0 || url.length > 300) return null;
  if (!url.startsWith('/') || url.startsWith('//') || url.startsWith('/\\')) return null;
  if (/[\u0000-\u001f\\]/.test(url)) return null;
  return url;
}

export const DECLINED_KEY = 'e118.native.push.declined';
export const ENABLED_KEY = 'e118.native.push.enabled';

export type EnableResult = 'ok' | 'denied' | 'error';

/**
 * 使用者已在站內說明頁按「同意並開啟」後呼叫：
 * 系統授權（只在尚未決定時才彈；已拒絕不重複彈）→（Android）建立通知頻道 → getToken() 啟動 FCM → 訂閱主題。
 */
export async function enableNativePush(
  plugin: MessagingPluginLike,
  platform: 'ios' | 'android' | null,
): Promise<EnableResult> {
  try {
    let { receive } = await plugin.checkPermissions();
    if (receive === 'prompt' || receive === 'prompt-with-rationale') receive = (await plugin.requestPermissions()).receive;
    if (receive !== 'granted') return 'denied';
    if (platform === 'android' && plugin.createChannel) {
      await plugin
        .createChannel({ id: ANDROID_CHANNEL_ID, name: '班級公告', description: '班級新公告通知', importance: 4 })
        .catch(() => undefined); // 頻道已存在時略過
    }
    const { token } = await plugin.getToken(); // 關閉自動初始化後，同意才在此啟動 FCM；回傳值不保存、不外送
    if (!token) return 'error'; // 沒取得識別碼就不可宣稱已開啟
    await plugin.subscribeToTopic({ topic: TOPIC_ALL });
    return 'ok';
  } catch {
    // 常見原因：App 尚未放入 Firebase 設定檔，或舊版殼
    return 'error';
  }
}

/** 關閉通知＝取消訂閱主題＋刪除裝置上的 FCM 識別碼（deleteToken 盡力而為）。 */
export async function disableNativePush(plugin: MessagingPluginLike): Promise<boolean> {
  try {
    await plugin.unsubscribeFromTopic({ topic: TOPIC_ALL });
  } catch {
    return false;
  }
  await plugin.deleteToken().catch(() => undefined);
  return true;
}
