/**
 * 原生推播 payload 組裝（純函式，無網路）。
 *   APNs：Capacitor 外掛把 aps 以外的自訂 key 放進 notification.data
 *   FCM ：data 值必須全是 string
 * 點擊導向 url 一律是站內相對路徑（以 / 開頭、非 //），前端收到後再驗一次。
 */
import type { NativeContent } from './types';

const UUID_RE = /^[0-9a-fA-F-]{36}$/;

export function nativeTargetUrl(content: Pick<NativeContent, 'post_id'>): string {
  return UUID_RE.test(content.post_id) ? `/board/post/${content.post_id}` : '/board';
}

export function buildApnsBody(content: NativeContent): Record<string, unknown> {
  return {
    aps: {
      alert: { title: content.short_title, body: content.short_excerpt },
      sound: 'default',
      'thread-id': 'e118-board',
    },
    url: nativeTargetUrl(content),
    post_id: content.post_id,
  };
}

export function buildFcmMessage(token: string, content: NativeContent): Record<string, unknown> {
  return {
    message: {
      token,
      notification: { title: content.short_title, body: content.short_excerpt },
      data: { url: nativeTargetUrl(content), post_id: content.post_id },
      android: {
        priority: 'HIGH',
        ttl: '86400s',
        notification: {
          tag: `post-${content.post_id || 'general'}`,
          // default_notification_icon 已在 AndroidManifest 設定（ic_stat_notify）
        },
      },
    },
  };
}
