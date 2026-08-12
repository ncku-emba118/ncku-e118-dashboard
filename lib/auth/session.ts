/**
 * Server-only session helpers — read cookie + verify JWT + check session_version against DB.
 *
 * Used by:
 *   • Server components (/board/admin/*) — get current user
 *   • API routes — require authenticated session before mutation
 *
 * 對應 ARCHITECTURE.md v3 第 6 章「每次請求驗證」末段 session_version 比對：
 * 密碼 reset / 職務輪替時 accounts.session_version +1，這裡會 reject 舊 token。
 */
import 'server-only';
import { cookies } from 'next/headers';
import { COOKIE_NAME, verifySession, type SessionPayload } from './jwt';
import { getServerClient } from '../supabase/server';

// Re-export 純資料 + 純函數給 backward compat（client 端應直接 import lib/depts）
export {
  ALL_DEPTS,
  deptInfo,
  manageableDepts,
  canManageDept,
} from '../depts';

export type Session = SessionPayload & {
  username: string;
};

export type ReadSessionOptions = {
  /**
   * 明確 opt-in：這個呼叫端知道、且會自己正確處理 magic_scope（財務長唯讀
   * 連結）session，可以拿到它。預設 false。
   *
   * 這是「敵對審查判定不可上線」之後補上的第二層防線（見
   * lib/auth/magic-allowlist.ts 檔頭）：原本任何沒呼叫
   * lib/signoff/access.ts::requireSignoffAccess 的 route/page，只要呼叫了
   * readSession()，就會把磁力連結換出的 session 當成該財務長帳號的完整
   * 正常 session（因為 role/home_dept_id 都是從 DB 撈真實帳號資料回來
   * 的）——income route、signoff 列表/accounts/delete、upload-url、
   * /staff、/budget/settlement/[slug] 都是這樣被繞過的。
   *
   * 修正後：預設情況下，只要 JWT payload 帶 magic_scope，readSession()
   * 直接回 null（當成「未登入」），完全不查 DB、不把帳號資料吐出去。只有
   * 明確傳 `{ allowMagicScope: true }` 的呼叫端才拿得到——目前唯一合法的
   * 呼叫端是 app/api/board/signoff/[id]/route.ts（財務長頁面殼掛載時打的
   * 那支 API），拿到之後仍要過 requireSignoffAccess（第三層）才真的放行
   * 動作。structural coverage test（lib/auth/magic-scope-coverage.test.ts）
   * 會枚舉所有呼叫 readSession() 的地方，新增 `allowMagicScope: true` 必須
   * 是有意識的動作。
   *
   * ⚠ 無 magic_scope 的 session（密碼登入 / assignment magic link）完全不
   * 受這個參數影響——這個分支只在 payload 真的帶 magic_scope 時才會進去，
   * 相容性鐵律零 regression。
   */
  allowMagicScope?: boolean;
};

/** Return null if not authenticated / session invalid / session_version mismatch */
export async function readSession(
  options: ReadSessionOptions = {},
): Promise<Session | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const sessionFromToken = await verifySession(token);
  if (!sessionFromToken) return null;

  // 第二層 deny-by-default：見上面 ReadSessionOptions.allowMagicScope 檔頭。
  if (sessionFromToken.magic_scope && !options.allowMagicScope) {
    return null;
  }

  const supabase = getServerClient();
  const { data: account, error } = await supabase
    .from('accounts')
    .select('username, session_version, role, home_dept_id')
    .eq('id', sessionFromToken.sub)
    .maybeSingle();

  if (error || !account) return null;

  // ⚠ session_version 比對：DB 是 source of truth
  if (account.session_version !== sessionFromToken.session_version) return null;

  return {
    ...sessionFromToken,
    username: account.username as string,
    // role / home_dept_id 也以 DB 為準（防 token 跟 DB 不同步的邊角 case）
    role: account.role as 'super' | 'dept',
    home_dept_id: account.home_dept_id as string | null,
  };
}
