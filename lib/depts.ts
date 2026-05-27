/**
 * Department constants — pure data, no server-only / no DB
 * 可以被 client component 安全 import
 *
 * 對應 ARCHITECTURE.md v3 第 2 章「7 個部門板」+ 第 16 章配色方案 A
 */

import type { SessionPayload } from './auth/jwt';

export const ALL_DEPTS = [
  { id: 'secretary', name: '秘書', color: '#8B1F2F' },
  { id: 'academic', name: '學務', color: '#1F3F5C' },
  { id: 'activity', name: '活動', color: '#C9742E' },
  { id: 'pr', name: '公關', color: '#8B2F4F' },
  { id: 'finance', name: '財務', color: '#2D5F4E' },
  { id: 'media', name: '文宣', color: '#7A5A2B' },
  { id: 'medical', name: '醫務', color: '#3F5C6E' },
] as const;

export type DeptInfo = {
  id: string;
  name: string;
  color: string;
};

export function deptInfo(id: string | null | undefined): DeptInfo {
  if (!id) return { id: '', name: '—', color: '#8A7F73' };
  return (
    ALL_DEPTS.find((d) => d.id === id) ?? { id, name: id, color: '#8A7F73' }
  );
}

/** Pure permission check — 不碰 DB / 不碰 cookie */
export function canManageDept(
  session: Pick<SessionPayload, 'role' | 'home_dept_id'>,
  deptId: string,
): boolean {
  if (session.role === 'super') return true;
  return session.home_dept_id === deptId;
}

export function manageableDepts(
  session: Pick<SessionPayload, 'role' | 'home_dept_id'>,
): DeptInfo[] {
  if (session.role === 'super') return [...ALL_DEPTS];
  return ALL_DEPTS.filter((d) => d.id === session.home_dept_id);
}
