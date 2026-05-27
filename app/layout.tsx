import type { Metadata, Viewport } from 'next';
import './globals.css';
import PWARegister from '../components/PWARegister';

export const metadata: Metadata = {
  title: 'E118 Dashboard',
  description: '成大 EMBA 第 118 班 — 班級系統入口',
  manifest: '/manifest.json',
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
