import { NextResponse, type NextRequest } from 'next/server';

/** 統一回應：帶 x-trace-id header（對齊既有 board route 慣例）。 */
export function jsonResp(body: object, status: number, traceId: string) {
  return NextResponse.json(body, {
    status,
    headers: { 'x-trace-id': traceId },
  });
}

/**
 * 同源檢查（Codex P0：CSRF）。
 * 所有 state-changing route 都要過：跨站 POST 的 Origin/Referer host 不等於本站 host → 擋。
 * 比 double-submit token 輕、不需改 client；瀏覽器對同源 fetch 一定帶 Origin。
 * 與環境無關（local localhost:port 自比、prod emba.aqualux.dev 自比）。
 */
export function isSameOrigin(req: NextRequest): boolean {
  const host = req.headers.get('host');
  if (!host) return false;
  const origin = req.headers.get('origin');
  const source = origin ?? req.headers.get('referer');
  if (!source) return false; // mutation 一律要求可驗來源
  try {
    return new URL(source).host === host;
  } catch {
    return false;
  }
}
