/**
 * 原生推播（Capacitor App）共用型別 — FCM 主題訂閱版。
 * 不存任何裝置識別碼：App 同意後自行訂閱主題，後端只對主題廣播。
 */

/** 全班公告主題。擴充方式（本次未實作）：e118_dept_<代碼>，須符合 FCM 主題名稱規則 [a-zA-Z0-9-_.~%]+ */
export const TOPIC_ALL = 'e118_all';

/** Android 通知頻道 ID：須與 App 的 AndroidManifest default_notification_channel_id、網頁端 createChannel 一致 */
export const ANDROID_CHANNEL_ID = 'e118_announcements';

export type NativeSendResult = {
  ok: boolean;
  /** 通道未設定（缺 FCM_PROJECT_ID／服務帳號）：不算失敗、也不發送 */
  skipped?: 'not_configured';
  statusCode?: number;
  reason?: string;
  durationMs: number;
};

/** 與 Web Push 同一個內容物件（lib/push/payload.ts 的 PushPayload） */
export type NativeContent = {
  post_id: string;
  short_title: string;
  short_excerpt: string;
};
