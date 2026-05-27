/**
 * E118 Dashboard Service Worker — PWA + Web Push 接收
 *
 * 對應 ARCHITECTURE.md v3 第 1 章「共用 PWA + Service Worker」+ 第 7 章 Web Push
 *
 * 沒做 cache（公告內容會變、靜態網頁很小、ISR 30s 已夠）
 * 純粹處理：
 *   • push 事件（顯示通知）
 *   • notificationclick（跳轉到對應公告詳情頁）
 *
 * notificationclick 跳轉策略（2026-05-27 修正 iOS PWA 不導航 bug）：
 *   1. 找停在目標公告頁的 tab → focus
 *   2. 找任一同 origin tab → 嘗試 client.navigate(url) + focus；
 *      navigate 失敗 → postMessage 給 client，由前端 router 接手 push
 *   3. 沒任何 tab → openWindow(url)
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
      tag,
      requireInteraction: false,
      vibrate: [80, 30, 80],
    }),
  );
});

// ── Notification click ──
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/board';
  const fullUrl = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      // 1) 完全 match 已停在那個公告頁的 tab → focus
      for (const client of all) {
        if (client.url === fullUrl && 'focus' in client) {
          return client.focus();
        }
      }

      // 2) 同 origin 已有 tab → 嘗試 navigate + focus
      const sameOrigin = all.filter((c) => {
        try {
          return new URL(c.url).origin === self.location.origin;
        } catch {
          return false;
        }
      });

      for (const client of sameOrigin) {
        // 2a. 試 client.navigate（標準 API、Chrome / iOS 16.4+ 都支援）
        if ('navigate' in client) {
          try {
            const navigated = await client.navigate(fullUrl);
            if (navigated && 'focus' in navigated) {
              return navigated.focus();
            }
            return client.focus();
          } catch {
            // 跨 origin / iframe / PWA scope 限制 → fallback 走 postMessage
          }
        }

        // 2b. postMessage fallback — client 端 ServiceWorkerListener 接到
        //     會用 next/navigation router.push(targetUrl)
        try {
          client.postMessage({ type: 'sw-navigate', url: targetUrl });
          return client.focus();
        } catch {
          // 繼續試下一個 client
        }
      }

      // 3) 完全沒 tab → 開新的
      if (self.clients.openWindow) {
        return self.clients.openWindow(fullUrl);
      }
    })(),
  );
});
