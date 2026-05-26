/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  trailingSlash: false,
  // 既有 dashboard 頁面用 Next.js 預設 SSG（build 後產生純靜態 HTML）
  // /board/* 後續加 SSR + API routes
  // 部署用 @netlify/plugin-nextjs（Netlify 自動偵測 Next.js）
};

export default nextConfig;
