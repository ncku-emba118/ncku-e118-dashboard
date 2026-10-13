/**
 * 原生推播 payload 組裝（純函式，無網路）— FCM HTTP v1「對主題發送」。
 * FCM data 值必須全是 string。點擊導向 url 一律是站內相對路徑（以 / 開頭、非 //），前端收到後再驗一次。
 */
import { ANDROID_CHANNEL_ID, TOPIC_ALL, type NativeContent } from './types';

const UUID_RE = /^[0-9a-fA-F-]{36}$/;
const TOPIC_RE = /^[a-zA-Z0-9-_.~%]+$/;

export function nativeTargetUrl(content: Pick<NativeContent, 'post_id'>): string {
  return UUID_RE.test(content.post_id) ? `/board/post/${content.post_id}` : '/board';
}

export function buildTopicMessage(content: NativeContent, topic: string = TOPIC_ALL): Record<string, unknown> {
  // topic 不可加 /topics/ 前綴；格式不符直接丟錯，避免送到非預期對象
  if (!TOPIC_RE.test(topic)) throw new Error(`invalid FCM topic: ${topic}`);
  return {
    message: {
      topic,
      notification: { title: content.short_title, body: content.short_excerpt },
      data: { url: nativeTargetUrl(content), post_id: content.post_id },
      android: {
        priority: 'HIGH',
        ttl: '86400s',
        notification: { channel_id: ANDROID_CHANNEL_ID, tag: `post-${content.post_id || 'general'}` },
      },
      apns: {
        headers: { 'apns-priority': '10' },
        payload: { aps: { sound: 'default', 'thread-id': 'e118-board' } },
      },
    },
  };
}
