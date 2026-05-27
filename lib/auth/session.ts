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

/** Return null if not authenticated / session invalid / session_version mismatch */
export async function readSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const sessionFromToken = await verifySession(token);
  if (!sessionFromToken) return null;

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
