/**
 * GET /api/board/signoff/magic/[token] — LINE 卡片單鍵免帳密換發 session（規格 §1-2 / §4）。
 *
 * 流程：格式白名單早退 → 以 sha256 反查 assignment → 驗未過期 → 以簽核者身分簽發
 * 正式 session cookie（完全比照 app/api/board/login/route.ts:247-280 的 signSession
 * 流程，含 session_version）→ 302 至 /finance/signoff/[docId]。
 *
 * 安全：
 *   • token 只在 URL、庫內只存 sha256；非法格式在做任何 DB 查詢前就早退
 *   • 任何失敗（格式錯／查無／過期／帳號異常）一律 302 /board/login?from=magic，
 *     不回顯原因、不區分 case（防列舉存在性）
 *   • 全程 Cache-Control: no-store（token 不進任何快取／中繼）
 *   • 換發之 session 與密碼登入同權（規格拍板：核准寫入永遠走網頁 session）
 *
 * middleware 已把本路徑放進 GET_PUBLIC_PATTERNS（regex 錨定），route 自驗為 source of truth。
 */
import { NextResponse, type NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { signSession, COOKIE_NAME } from '@/lib/auth/jwt';
import { MAGIC_TOKEN_RE, MAGIC_TOKEN_TTL_MS } from '@/lib/signoff/constants';
import { getAssignmentByMagicTokenHash } from '@/lib/signoff/dal';
import { canRedeemAssignment } from '@/lib/signoff/redeem';

/**
 * magic 換發的 session 有效期＝連結有效期（14 天）。
 *
 * ⚠ 只作用在 magic 這條路徑：密碼登入仍走 env.SESSION_TTL_SECONDS（8h，不變）。
 * 語意上「登入有效期＝連結有效期」最一致，故直接取 MAGIC_TOKEN_TTL_MS（連結 14 天 TTL）
 * 換算成秒。JWT exp 與 cookie maxAge 都用這個值 → 兩者對齊，不會一先一後過期。
 */
const MAGIC_SESSION_TTL_SECONDS = Math.floor(MAGIC_TOKEN_TTL_MS / 1000);

/** 比照 login route：secure 判斷涵蓋 reverse-proxy + prod env（__Host- 前綴需 Secure）。 */
function isHttpsContext(req: NextRequest): boolean {
  return (
    req.nextUrl.protocol === 'https:' ||
    req.headers.get('x-forwarded-proto') === 'https' ||
    process.env.NODE_ENV === 'production'
  );
}

/** 統一失敗出口：302 login、no-store、不帶原因（Codex #6：明確指定 302，
 *  不依賴 NextResponse.redirect 的 307 預設）。 */
function redirectToLogin(req: NextRequest): NextResponse {
  const res = NextResponse.redirect(new URL('/board/login?from=magic', req.url), 302);
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  // ① 格式白名單：任何非 64-hex 一律早退，不觸 DB（規格 §4「非法格式早退」）
  if (!MAGIC_TOKEN_RE.test(token)) return redirectToLogin(req);

  // ② 以 sha256 反查（庫內只存 hash）
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const { data, error } = await getAssignmentByMagicTokenHash(tokenHash);
  if (error || !data) return redirectToLogin(req);

  // ③ 驗未過期（缺到期時間視同無效）
  if (!data.expiresAt || new Date(data.expiresAt).getTime() < Date.now()) {
    return redirectToLogin(req);
  }

  // ④ 換發前驗「單據狀態可否簽核」（Codex #1）：唯有指派仍 pending 且單仍 routing 才放行。
  //    已簽 / 已退回 / 已核准 / 已作廢的舊連結一律失效（即使 token 尚未過期）。
  if (!canRedeemAssignment(data.assignmentStatus, data.docStatus)) {
    return redirectToLogin(req);
  }

  // ⑤ 簽發正式 session（比照 login route:247-280，含 session_version）
  let cookieValue: string;
  try {
    cookieValue = await signSession({
      sub: data.account.id,
      role: data.account.role,
      home_dept_id: data.account.home_dept_id,
      session_version: data.account.session_version,
    }, MAGIC_SESSION_TTL_SECONDS);
  } catch (e) {
    console.error('[signoff.magic.sign_failed]', { e: (e as Error).message });
    return redirectToLogin(req);
  }

  const res = NextResponse.redirect(
    new URL(`/finance/signoff/${data.documentId}`, req.url),
  );
  res.headers.set('Cache-Control', 'no-store');
  // Codex #7：一次性 token 在 URL 上，換發成功導向明細頁時明確斷開 Referer，
  // 避免 token 經 Referer 洩漏給明細頁載入的任何子資源 / 後續導覽。
  res.headers.set('Referrer-Policy', 'no-referrer');
  res.cookies.set({
    name: COOKIE_NAME,
    value: cookieValue,
    httpOnly: true,
    secure: isHttpsContext(req),
    sameSite: 'lax',
    path: '/',
    maxAge: MAGIC_SESSION_TTL_SECONDS,
  });
  return res;
}
