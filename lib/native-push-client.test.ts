import { describe, expect, test, vi } from 'vitest';
import {
  ANDROID_CHANNEL_ID,
  disableNativePush,
  enableNativePush,
  getMessagingPlugin,
  getNativePlatform,
  safeInternalPath,
  TOPIC_ALL,
  type MessagingPluginLike,
} from './native-push-client';

function fakePlugin(receive: string, over: Partial<Record<keyof MessagingPluginLike, unknown>> = {}) {
  const calls: string[] = [];
  const p = {
    checkPermissions: vi.fn(async () => ({ receive })),
    requestPermissions: vi.fn(async () => {
      calls.push('request');
      return { receive: 'granted' };
    }),
    getToken: vi.fn(async () => {
      calls.push('getToken');
      return { token: 'x' };
    }),
    deleteToken: vi.fn(async () => {
      calls.push('deleteToken');
    }),
    subscribeToTopic: vi.fn(async () => {
      calls.push('subscribe');
    }),
    unsubscribeFromTopic: vi.fn(async () => {
      calls.push('unsubscribe');
    }),
    createChannel: vi.fn(async () => {
      calls.push('channel');
    }),
    addListener: vi.fn(),
    ...over,
  } as unknown as MessagingPluginLike;
  return { p, calls };
}

test('safeInternalPath：只允許站內相對路徑', () => {
  expect(safeInternalPath('/board/post/abc')).toBe('/board/post/abc');
  for (const bad of ['//evil.com', '/\\evil.com', 'https://evil.com', 'javascript:alert(1)', '', null, 42, '/a\nb']) {
    expect(safeInternalPath(bad)).toBeNull();
  }
});

test('舊版 App（無外掛）與一般瀏覽器 → null，退回原行為', () => {
  expect(getMessagingPlugin({})).toBeNull();
  expect(getMessagingPlugin({ Capacitor: { Plugins: {} } })).toBeNull();
  // 舊版外掛 PushNotifications 不算
  expect(getMessagingPlugin({ Capacitor: { Plugins: { PushNotifications: { register() {} } } } })).toBeNull();
  const { p } = fakePlugin('prompt');
  expect(getMessagingPlugin({ Capacitor: { Plugins: { FirebaseMessaging: p } } })).toBe(p);
  // 方法不齊全也視為不可用
  expect(getMessagingPlugin({ Capacitor: { Plugins: { FirebaseMessaging: { checkPermissions() {} } } } })).toBeNull();
  expect(getNativePlatform({ Capacitor: { getPlatform: () => 'web' } })).toBeNull();
  expect(getNativePlatform({ Capacitor: { getPlatform: () => 'ios' } })).toBe('ios');
});

describe('enableNativePush', () => {
  test('尚未決定：授權 → 建頻道(Android) → getToken → 訂閱 e118_all，順序正確', async () => {
    const { p, calls } = fakePlugin('prompt');
    expect(await enableNativePush(p, 'android')).toBe('ok');
    expect(calls).toEqual(['request', 'channel', 'getToken', 'subscribe']);
    expect(p.subscribeToTopic).toHaveBeenCalledWith({ topic: TOPIC_ALL });
    expect(p.createChannel).toHaveBeenCalledWith(expect.objectContaining({ id: ANDROID_CHANNEL_ID }));
  });
  test('已授權：不再彈系統授權；iOS 不建頻道', async () => {
    const { p, calls } = fakePlugin('granted');
    expect(await enableNativePush(p, 'ios')).toBe('ok');
    expect(calls).toEqual(['getToken', 'subscribe']);
  });
  test('已拒絕：不呼叫 requestPermissions、不取得識別碼、不訂閱', async () => {
    const { p, calls } = fakePlugin('denied');
    expect(await enableNativePush(p, 'ios')).toBe('denied');
    expect(calls).toEqual([]);
    expect(p.requestPermissions).not.toHaveBeenCalled();
  });
  test('授權時使用者拒絕 → denied，且不取得識別碼', async () => {
    const { p, calls } = fakePlugin('prompt', { requestPermissions: vi.fn(async () => ({ receive: 'denied' })) });
    expect(await enableNativePush(p, 'android')).toBe('denied');
    expect(calls).toEqual([]);
  });
  test('外掛丟錯（例如缺 Firebase 設定檔）→ error，不拋出', async () => {
    const { p } = fakePlugin('granted', { getToken: vi.fn(async () => { throw new Error('no firebase'); }) });
    expect(await enableNativePush(p, 'ios')).toBe('error');
  });
  test('頻道已存在（createChannel 拒絕）不影響訂閱', async () => {
    const { p } = fakePlugin('granted', { createChannel: vi.fn(async () => { throw new Error('exists'); }) });
    expect(await enableNativePush(p, 'android')).toBe('ok');
  });
});

describe('disableNativePush', () => {
  test('取消訂閱 → 刪除識別碼', async () => {
    const { p, calls } = fakePlugin('granted');
    expect(await disableNativePush(p)).toBe(true);
    expect(calls).toEqual(['unsubscribe', 'deleteToken']);
    expect(p.unsubscribeFromTopic).toHaveBeenCalledWith({ topic: TOPIC_ALL });
  });
  test('取消訂閱失敗 → false（讓使用者重試）；deleteToken 失敗不影響結果', async () => {
    const bad = fakePlugin('granted', { unsubscribeFromTopic: vi.fn(async () => { throw new Error('x'); }) });
    expect(await disableNativePush(bad.p)).toBe(false);
    const ok = fakePlugin('granted', { deleteToken: vi.fn(async () => { throw new Error('x'); }) });
    expect(await disableNativePush(ok.p)).toBe(true);
  });
});
