'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * 客戶端副作用：
 * 1. Local dev (localhost / 127.0.0.1) 把 [data-local-href] 蓋到 href 上，本地預覽用
 * 2. 註冊 PWA service worker
 * 3. 接 Service Worker postMessage `sw-navigate` → router.push（推播點擊 fallback）
 *
 * 放在 root layout，所有頁面（含 /board/*）都會載入這個 listener。
 */
export default function PWARegister() {
  const router = useRouter();

  useEffect(() => {
    // Local dev href override
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      document
        .querySelectorAll<HTMLAnchorElement>('[data-local-href]')
        .forEach((el) => {
          const local = el.dataset.localHref;
          if (local) el.href = local;
        });
    }

    if (!('serviceWorker' in navigator)) return;

    // PWA Service Worker register
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // SW optional — silently ignore if missing
    });

    // 接 SW postMessage（推播點擊時、SW navigate() 失敗 fallback）
    const onMessage = (event: MessageEvent) => {
      const data = event.data;
      if (
        data &&
        typeof data === 'object' &&
        data.type === 'sw-navigate' &&
        typeof data.url === 'string' &&
        data.url.startsWith('/') // 只接受相對路徑、防 open redirect
      ) {
        router.push(data.url);
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);

    return () => {
      navigator.serviceWorker.removeEventListener('message', onMessage);
    };
  }, [router]);

  return null;
}
