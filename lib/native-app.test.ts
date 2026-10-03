import { afterEach, expect, test, vi } from 'vitest';
import { isNativeApp } from './native-app';
afterEach(() => vi.unstubAllGlobals());
test('SSR / 普通瀏覽器不視為原生', () => {
  expect(isNativeApp()).toBe(false);
  vi.stubGlobal('window', { Capacitor: { getPlatform: () => 'web', isNativePlatform: () => false } });
  vi.stubGlobal('navigator', { userAgent: 'Safari' });
  expect(isNativeApp()).toBe(false);
});
test.each(['ios', 'android'])('Capacitor %s bridge', (platform) => {
  vi.stubGlobal('window', { Capacitor: { getPlatform: () => platform } });
  vi.stubGlobal('navigator', { userAgent: 'Safari' });
  expect(isNativeApp()).toBe(true);
});
test('遠端殼 UA 即使 bridge 未就緒也辨識', () => {
  vi.stubGlobal('window', {});
  vi.stubGlobal('navigator', { userAgent: 'Safari NCKU-E118-App/1.0' });
  expect(isNativeApp()).toBe(true);
});
