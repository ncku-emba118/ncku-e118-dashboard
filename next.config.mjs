/** @type {import('next').NextConfig} */
//
// P0-7 修正：補 CSP + 安全 HTTP headers
// 對應 ARCHITECTURE.md v3 第 17 章「內容渲染安全規格」。
//
// ⚠ Codex Round-3 fix: script-src env-aware
//   • prod: 拿掉 'unsafe-eval' — Next.js prod build 不需要 eval
//   • dev: 保留 'unsafe-eval' 給 Next.js hot reload 用
//   • 'unsafe-inline' 暫保留：Next.js hydration 用 inline script，未來改用 nonce middleware
//     即可徹底拿掉（subscribed in TODO P1-nonce）
//   • frame-src 含 GDrive / docs.google.com 給附件 iframe
//   • connect-src 含 *.supabase.co + wss:// 給 Realtime
//
const IS_DEV = process.env.NODE_ENV !== 'production';
const SCRIPT_SRC = IS_DEV
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  : "script-src 'self' 'unsafe-inline'";

const CSP_DIRECTIVES = [
  "default-src 'self'",
  SCRIPT_SRC,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https://drive.google.com https://*.googleusercontent.com",
  "frame-src https://drive.google.com https://docs.google.com",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "font-src 'self' https://fonts.gstatic.com data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: CSP_DIRECTIVES },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig = {
  reactStrictMode: true,
  trailingSlash: false,
  // 既有 dashboard 頁面用 Next.js 預設 SSG（build 後產生純靜態 HTML）
  // /board/* 後續加 SSR + API routes
  // 部署用 @netlify/plugin-nextjs（Netlify 自動偵測 Next.js）
  async headers() {
    return [
      {
        source: '/:path*',
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
