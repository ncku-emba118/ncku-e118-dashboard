/**
 * 原生推播（Capacitor App）共用型別。
 * 平台/通道：iOS → APNs（直送，token-based）；Android → FCM HTTP v1。
 */
export type NativeApp = 'e118emba' | 'e118slc';
export type NativePlatform = 'ios' | 'android';
export type ApnsEnv = 'production' | 'sandbox';

/** app 識別 → bundle id / package name（APNs apns-topic 用）。與 capacitor.config 的 appId 一致。 */
export const APP_BUNDLE_IDS: Record<NativeApp, string> = {
  e118emba: 'com.aqualux.e118emba',
  e118slc: 'com.aqualux.e118slc',
};

export type NativeTarget = {
  id: string;
  app: NativeApp;
  platform: NativePlatform;
  token: string;
  apns_env: ApnsEnv | null;
  failure_count: number;
};

export type NativeSendResult = {
  ok: boolean;
  /** token 已永久失效（APNs 410 / BadDeviceToken 兩環境皆失敗 / FCM UNREGISTERED）→ 標 disabled_at */
  gone: boolean;
  /** 暫時性失敗（429 / 5xx / timeout）→ failure_count+1 */
  retryable: boolean;
  /** 通道未設定／超過時間預算：不算 token 的錯，不動 token 狀態 */
  skipped?: 'not_configured' | 'deadline';
  statusCode?: number;
  reason?: string;
  /** iOS：實際成功的環境，供回寫 apns_env */
  apnsEnvUsed?: ApnsEnv;
  durationMs: number;
};

/** 與 Web Push 同一個內容物件（lib/push/payload.ts 的 PushPayload） */
export type NativeContent = {
  post_id: string;
  short_title: string;
  short_excerpt: string;
};
