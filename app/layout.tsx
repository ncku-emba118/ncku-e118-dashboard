import type { Metadata, Viewport } from 'next';
import './globals.css';
import PWARegister from '../components/PWARegister';

export const metadata: Metadata = {
  metadataBase: new URL('https://emba.aqualux.dev'),
  title: 'E118 第 118 班｜成大 EMBA',
  description: '國立成功大學 EMBA 第 118 班 — 班級資訊系統入口',
  manifest: '/manifest.json',
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
  openGraph: {
    title: 'E118 第 118 班｜成大 EMBA',
    description: '國立成功大學 EMBA 第 118 班 — 班級資訊系統入口',
    url: 'https://emba.aqualux.dev',
    siteName: '成大 EMBA E118',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: '成大 EMBA 第 118 班 班級資訊系統',
      },
    ],
    locale: 'zh_TW',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'E118 第 118 班｜成大 EMBA',
    description: '國立成功大學 EMBA 第 118 班 — 班級資訊系統入口',
    images: ['/og-image.png'],
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
