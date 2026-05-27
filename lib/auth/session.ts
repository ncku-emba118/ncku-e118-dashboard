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

/** 判斷此 session 是否能管理該部門的公告 / 留言 */
export function canManageDept(
  session: Pick<SessionPayload, 'role' | 'home_dept_id'>,
  deptId: string,
): boolean {
  if (session.role === 'super') return true;
  return session.home_dept_id === deptId;
}

/** 取得此 session 能管理的部門 ID 清單 */
export const ALL_DEPTS = [
  { id: 'secretary', name: '秘書', color: '#8B1F2F' },
  { id: 'academic', name: '學務', color: '#1F3F5C' },
  { id: 'activity', name: '活動', color: '#C9742E' },
  { id: 'pr', name: '公關', color: '#8B2F4F' },
  { id: 'finance', name: '財務', color: '#2D5F4E' },
  { id: 'media', name: '文宣', color: '#7A5A2B' },
  { id: 'medical', name: '醫務', color: '#3F5C6E' },
] as const;

export function manageableDepts(
  session: Pick<SessionPayload, 'role' | 'home_dept_id'>,
) {
  if (session.role === 'super') return [...ALL_DEPTS];
  return ALL_DEPTS.filter((d) => d.id === session.home_dept_id);
}

export function deptInfo(id: string | null | undefined) {
  if (!id) return { id: '', name: '—', color: '#8A7F73' };
  return ALL_DEPTS.find((d) => d.id === id) ?? { id, name: id, color: '#8A7F73' };
}
