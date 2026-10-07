import { expect, test } from 'vitest';
import { getNativePlatform, getPushPlugin, parseShellVersion, safeInternalPath } from './native-push-client';

test('safeInternalPath：只允許站內相對路徑', () => {
  expect(safeInternalPath('/board/post/abc')).toBe('/board/post/abc');
  for (const bad of ['//evil.com', '/\\evil.com', 'https://evil.com', 'javascript:alert(1)', '', null, 42, '/a\nb']) {
    expect(safeInternalPath(bad)).toBeNull();
  }
});
test('parseShellVersion', () => {
  expect(parseShellVersion('Mozilla NCKU-E118-App/1.0')).toBe('1.0');
  expect(parseShellVersion('Safari')).toBeUndefined();
});
test('舊版 App（無外掛）與一般瀏覽器 → null，退回原行為', () => {
  expect(getPushPlugin({})).toBeNull();
  expect(getPushPlugin({ Capacitor: { Plugins: {} } })).toBeNull();
  const plugin = { register() {}, checkPermissions() {}, requestPermissions() {}, addListener() {} };
  expect(getPushPlugin({ Capacitor: { Plugins: { PushNotifications: plugin } } })).toBe(plugin);
  expect(getNativePlatform({ Capacitor: { getPlatform: () => 'web' } })).toBeNull();
  expect(getNativePlatform({ Capacitor: { getPlatform: () => 'ios' } })).toBe('ios');
});
