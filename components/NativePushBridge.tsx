'use client';

/**
 * NativePushBridge — 全站掛一次（app/layout.tsx）：App 殼內處理「點通知 → 導向公告」。
 * 只在 Capacitor 殼且外掛存在時才動作；不彈任何權限視窗（權限流程在 NativePushOptIn，需使用者同意）。
 * 導向只允許站內相對路徑（safeInternalPath）。
 */
import { useEffect } from 'react';
import { getPushPlugin, safeInternalPath } from '@/lib/native-push-client';

export default function NativePushBridge() {
  useEffect(() => {
    const plugin = getPushPlugin(window);
    if (!plugin) return;
    const w = window as Window & { __e118PushNav?: boolean };
    if (w.__e118PushNav) return;
    w.__e118PushNav = true;
    void plugin.addListener('pushNotificationActionPerformed', ((a: {
      notification?: { data?: { url?: unknown } };
    }) => {
      const path = safeInternalPath(a?.notification?.data?.url);
      if (path) window.location.href = path;
    }) as never);
  }, []);
  return null;
}
