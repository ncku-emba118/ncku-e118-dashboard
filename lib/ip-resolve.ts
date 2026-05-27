/**
 * resolveClientIp — 跨 hosting 兼容的 client IP 提取
 *
 * P0-3 修正：原本各 route 各寫一份，在非 Netlify 環境（local preview / Vercel / 自架）
 * 直接落 'unknown'，導致全班共用一個 rate-limit bucket、攻擊者可塞 unknown DoS 整桶。
 *
 * 優先序：
 *   1. x-nf-client-connection-ip (Netlify edge 設定，不可由 client 偽造)
 *   2. cf-connecting-ip          (Cloudflare 設定，不可偽造)
 *   3. x-real-ip                  (一般 reverse proxy)
 *   4. x-forwarded-for[0]         (XFF chain 第一筆；prod 也接受，因為 Netlify/CF/Vercel
 *                                  都會自己覆寫覆寫過、清掉 client 端注入的偽造值)
 *
 * 若以上全部抓不到 → 回 null。Caller 應該 reject 503（不可歸到共用 bucket）。
 */
export function resolveClientIp(req: {
  headers: { get(name: string): string | null };
}): string | null {
  const nf = req.headers.get('x-nf-client-connection-ip')?.trim();
  if (nf) return nf;

  const cf = req.headers.get('cf-connecting-ip')?.trim();
  if (cf) return cf;

  const real = req.headers.get('x-real-ip')?.trim();
  if (real) return real;

  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }

  return null;
}
