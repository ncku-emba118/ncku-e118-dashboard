/**
 * GET /api/board/signoff/magic/[token] — LINE 卡片單鍵免帳密換發 session（規格 §1-2 / §4）。
 *
 * 流程：格式白名單早退 → IP rate limit → 以 sha256 反查 assignment → 驗未過期 →
 * 以簽核者身分簽發正式 session cookie（完全比照 app/api/board/login/route.ts:247-280
 * 的 signSession 流程，含 session_version）→ 302 至 /finance/signoff/[docId]。
 *
 * 兩種 token 共用這一支端點（見 dal.ts 檔頭說明）：
 *   • assignment 版（幹部簽核用）：pending 才可換發、14 天 TTL、換發的 session
 *     與密碼登入完全同權（規格拍板：核准寫入永遠走網頁 session）。
 *   • finance 版（財務長下載連結，敵對審查修正1定案）：不設 TTL、可重複使用，
 *     只能靠 /api/board/signoff/[id]/finance-link 手動作廢重發；換發出的是
 *     scope 收斂過的唯讀 session（30 分鐘短 TTL + magic_scope claim，敵對審查
 *     修正2）——因為連結永久有效，這個 scope 收斂是唯一防線，見 lib/signoff/access.ts。
 *
 * 安全：
 *   • token 只在 URL、庫內只存 sha256；非法格式在做任何 DB 查詢前就早退
 *   • 任何失敗（格式錯／查無／過期／帳號異常）一律 302 /board/login?from=magic，
 *     不回顯原因、不區分 case（防列舉存在性）
 *   • 全程 Cache-Control: no-store（token 不進任何快取／中繼）
 *   • IP rate limit（敵對審查修正5）：token 熵值 256-bit 暴力破解不可行，但既然
 *     這條路同時服務可重複使用的財務長連結，比照 sign/finalize route 補上限速
 *
 * middleware 已把本路徑放進 GET_PUBLIC_PATTERNS（regex 錨定），route 自驗為 source of truth。
 */
import { NextResponse, type NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { signSession, COOKIE_NAME, type MagicScope } from '@/lib/auth/jwt';
import { resolveClientIp } from '@/lib/ip-resolve';
import { rateLimit } from '@/lib/signoff/rate-limit';
import { MAGIC_TOKEN_RE, MAGIC_TOKEN_TTL_MS, FINANCE_MAGIC_SESSION_TTL_SECONDS } from '@/lib/signoff/constants';
import { getAssignmentByMagicTokenHash, getDocumentByFinanceMagicTokenHash } from '@/lib/signoff/dal';
import {
  canRedeemAssignment,
  canRedeemFinanceDocument,
  isFinanceMagicTokenExpired,
  isFinanceMagicAccountStillValid,
} from '@/lib/signoff/redeem';

/**
 * assignment 版 magic 換發的 session 有效期＝連結有效期（14 天）。
 *
 * ⚠ 只作用在 assignment 這條路徑：密碼登入仍走 env.SESSION_TTL_SECONDS（8h，
 * 不變）；財務版另走 FINANCE_MAGIC_SESSION_TTL_SECONDS（30 分鐘，見下方）。
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

  // ①.5 IP rate limit（敵對審查修正5）：ip 抓不到時退化成共用 bucket，
  //     一律走同一個「失敗就導回登入」出口，不額外洩漏訊號。
  const ip = resolveClientIp(req) ?? 'unknown';
  if (!rateLimit(`signoff:magic:${ip}`, 30, 60_000)) {
    return redirectToLogin(req);
  }

  // ② 以 sha256 反查（庫內只存 hash）。先試指派層級 token（幹部簽核用），
  //    查無才試文件層級 token（0025，財務長下載連結用——不要求持有者是指派人）。
  //    兩者共用同一格式（64-hex）與同一支端點，只是掛的資料表不同。
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const assignmentLookup = await getAssignmentByMagicTokenHash(tokenHash);
  if (assignmentLookup.error) return redirectToLogin(req);

  let documentId: string;
  let account: { id: string; role: 'super' | 'dept'; home_dept_id: string | null; session_version: number };
  let sessionTtlSeconds = MAGIC_SESSION_TTL_SECONDS;
  let magicScope: MagicScope | undefined;

  if (assignmentLookup.data) {
    const data = assignmentLookup.data;
    // ③ 驗未過期（缺到期時間視同無效——assignment 版語意不變）
    if (!data.expiresAt || new Date(data.expiresAt).getTime() < Date.now()) {
      return redirectToLogin(req);
    }
    // ④ 換發前驗「單據狀態可否簽核」（Codex #1）：唯有指派仍 pending 且單仍 routing 才放行。
    //    已簽 / 已退回 / 已核准 / 已作廢的舊連結一律失效（即使 token 尚未過期）。
    if (!canRedeemAssignment(data.assignmentStatus, data.docStatus)) {
      return redirectToLogin(req);
    }
    documentId = data.documentId;
    account = data.account;
    // assignment 版換發的是與密碼登入同權的完整 session（規格拍板：核准寫入永遠
    // 走網頁 session），sessionTtlSeconds / magicScope 維持預設（不縮短、不收斂）。
  } else {
    const financeLookup = await getDocumentByFinanceMagicTokenHash(tokenHash);
    if (financeLookup.error || !financeLookup.data) return redirectToLogin(req);
    const data = financeLookup.data;
    // ③ 財務版連結不設 TTL（敵對審查修正1定案）：null 視為永不過期，只有真的
    //    寫了非 null 值才判斷是否已過期（與 assignment 版「缺到期時間視同無效」
    //    刻意不同語意，見 redeem.ts isFinanceMagicTokenExpired 檔頭）。
    if (isFinanceMagicTokenExpired(data.expiresAt)) {
      return redirectToLogin(req);
    }
    // ④ 文件仍 approved 才放行（唯讀存取，見 redeem.ts canRedeemFinanceDocument 註解）。
    if (!canRedeemFinanceDocument(data.docStatus)) {
      return redirectToLogin(req);
    }
    // ⑤ 連結永久有效 → 帳號仍須「現在」還是財務長，且 session_version 與核發
    //    當下的快照一致（職務輪替 / 密碼重設會讓這裡不一致，逼舊連結失效，
    //    不留永久後門）。見 redeem.ts isFinanceMagicAccountStillValid 檔頭。
    if (
      !isFinanceMagicAccountStillValid({
        homeDeptId: data.account.home_dept_id,
        issuedSessionVersion: data.issuedSessionVersion,
        currentSessionVersion: data.account.session_version,
      })
    ) {
      return redirectToLogin(req);
    }
    documentId = data.documentId;
    account = data.account;
    // 敵對審查修正2：財務版換發的是 scope 收斂過的唯讀 session——因為連結
    // 永久有效，這是唯一防線。短 TTL（30 分鐘）+ magic_scope claim 雙重收斂，
    // 下游判斷見 lib/signoff/access.ts isAllowedUnderMagicScope。
    sessionTtlSeconds = FINANCE_MAGIC_SESSION_TTL_SECONDS;
    magicScope = { kind: 'finance_readonly', document_id: documentId };
    // ⚠ 敵對審查修正1目前拍板「連結可重複使用、只靠手動作廢」，故這裡刻意
    // 不呼叫 clearDocumentFinanceMagicToken——換發成功不消費 token。手動作廢
    // 走 /api/board/signoff/[id]/finance-link（重新產生下載連結）。
  }

  // ⑥ 簽發 session（比照 login route:247-280，含 session_version；財務版另帶
  //    magic_scope claim + 短 TTL，見上）
  let cookieValue: string;
  try {
    cookieValue = await signSession(
      {
        sub: account.id,
        role: account.role,
        home_dept_id: account.home_dept_id,
        session_version: account.session_version,
        ...(magicScope ? { magic_scope: magicScope } : {}),
      },
      sessionTtlSeconds,
    );
  } catch (e) {
    console.error('[signoff.magic.sign_failed]', { e: (e as Error).message });
    return redirectToLogin(req);
  }

  const res = NextResponse.redirect(
    new URL(`/finance/signoff/${documentId}`, req.url),
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
    maxAge: sessionTtlSeconds,
  });
  return res;
}
