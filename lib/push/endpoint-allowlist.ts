/**
 * Push endpoint host allowlist — 防 SSRF / 防註冊到任意 server
 *
 * 對應 Codex Sec F4「push subscription endpoint hijack」防護：
 *   • POST /api/board/subscribe 必驗 endpoint host 在白名單
 *   • 攻擊者不能把 endpoint 設為自己 server（即使有合法 management_token）
 */

const ALLOWED_HOSTS_EXACT = new Set<string>([
  'fcm.googleapis.com',                       // Chrome / Edge / Brave
  'updates.push.services.mozilla.com',        // Firefox
  'web.push.apple.com',                       // Safari macOS (16.4+)
]);

/** Apple iOS 用 *.push.apple.com、可能含子網域 */
function isAppleSubdomain(host: string): boolean {
  return host === 'push.apple.com' || host.endsWith('.push.apple.com');
}

export function isAllowedPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:') return false;
    if (ALLOWED_HOSTS_EXACT.has(url.hostname)) return true;
    if (isAppleSubdomain(url.hostname)) return true;
    return false;
  } catch {
    return false;
  }
}
