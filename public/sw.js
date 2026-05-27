/**
 * E118 Dashboard Service Worker — PWA + Web Push 接收
 *
 * 對應 ARCHITECTURE.md v3 第 1 章「共用 PWA + Service Worker」+ 第 7 章 Web Push
 *
 * 沒做 cache（公告內容會變、靜態網頁很小、ISR 30s 已夠）
 * 純粹處理：
 *   • push 事件（顯示通知）
 *   • notificationclick（跳轉到對應公告詳情頁）
 */

self.addEventListener('install', (event) => {
  // Skip waiting — 新版 SW 立刻 active，不等舊 tab 關閉
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // 接管所有 client tab
  event.waitUntil(self.clients.claim());
});

// ── Push event ──
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    // Payload 不是 JSON — 顯示 generic 通知
    data = { short_title: '新公告', short_excerpt: '', post_id: '' };
  }

  const title = data.short_title || '新公告';
  const body = data.short_excerpt || '點開看完整公告';
  const url = data.post_id ? `/board/post/${data.post_id}` : '/board';
  const tag = `post-${data.post_id || 'general'}`;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/assets/pwa-icon-192.png',
      badge: '/assets/pwa-icon-192.png',
      data: { url },
      tag,                          // 同 post 重複 push 蓋掉舊通知
      requireInteraction: false,    // 自動消失
      vibrate: [80, 30, 80],
    }),
  );
});

// ── Notification click ──
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/board';

  event.waitUntil(
    (async () => {
      // 如果已有 tab 開著、focus 它；否則開新 tab
      const all = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of all) {
        if (client.url.endsWith(url) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })(),
  );
});
