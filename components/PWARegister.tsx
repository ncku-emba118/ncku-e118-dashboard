'use client';

import { useEffect } from 'react';

/**
 * 客戶端副作用：
 * 1. Local dev (localhost / 127.0.0.1) 把 [data-local-href] 蓋到 href 上，本地預覽用
 * 2. 註冊 PWA service worker（可選）
 */
export default function PWARegister() {
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

    // PWA Service Worker (optional)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // SW optional — silently ignore if missing
      });
    }
  }, []);

  return null;
}
