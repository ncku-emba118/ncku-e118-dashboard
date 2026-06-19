import type { Metadata, Viewport } from 'next';
import './globals.css';
import PWARegister from '../components/PWARegister';

export const metadata: Metadata = {
  title: 'E118 Dashboard',
  description: '成大 EMBA 第 118 班 — 班級系統入口',
  manifest: '/manifest.json',
  // browser tab favicon + apple touch icon
  // 之前 manifest 有設 icon 但 layout 沒設 → Chrome / Safari 分頁標退回預設地球
  icons: {
    icon: [
      { url: '/assets/pwa-icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/assets/pwa-icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/assets/pwa-icon-180.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'E118',
  },
};

export const viewport: Viewport = {
  themeColor: '#8B1F2F',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-Hant">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500;600&family=Noto+Serif+TC:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {/* PWARegister: SW register + Local dev href override +
            sw-navigate postMessage 接收（推播點擊 fallback 導航） */}
        <PWARegister />
        {children}
      </body>
    </html>
  );
}
