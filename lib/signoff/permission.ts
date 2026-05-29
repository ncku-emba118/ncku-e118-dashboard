/**
 * 簽核權限閘口 — SIGNOFF-ARCHITECTURE.md §7 + Codex #1 finding 1-1 / 1-2。
 *
 * 純函式：吃 actor（session 子集）+ action + context（doc + 指派名單），回 boolean。
 * route 端取得 doc / 指派資料後呼叫；service-role 寫入前的統一閘口。
 *
 *   view/download : super 全部；dept 限 created_by 自己 / owner_dept 自部門 / 被指派者
 *   sign/reject   : 必須是 pending 被指派者（即使 super 也要被指派才能簽）
 *   nudge         : super 或 document creator
 *   void          : 僅 super
 */
export type SignoffActor = {
  sub: string;
  role: 'super' | 'dept';
  home_dept_id: string | null;
};

export type SignoffAction = 'view' | 'sign' | 'reject' | 'nudge' | 'void';

export type SignoffAccessContext = {
  doc: { created_by: string; owner_dept_id: string };
  pendingAssigneeIds: string[];
  allAssigneeIds: string[];
};

export function canAccessSignoff(
  actor: SignoffActor,
  action: SignoffAction,
  ctx: SignoffAccessContext,
): boolean {
  const isSuper = actor.role === 'super';
  const isCreator = ctx.doc.created_by === actor.sub;
  const isOwnerDept =
    actor.home_dept_id != null && actor.home_dept_id === ctx.doc.owner_dept_id;
  const isAssignee = ctx.allAssigneeIds.includes(actor.sub);
  const isPendingAssignee = ctx.pendingAssigneeIds.includes(actor.sub);

  switch (action) {
    case 'view':
      return isSuper || isCreator || isOwnerDept || isAssignee;
    case 'sign':
    case 'reject':
      // 必須是「還沒處理」的被指派者；身分不在指派名單一律拒
      return isPendingAssignee;
    case 'nudge':
      return isSuper || isCreator;
    case 'void':
      return isSuper;
    default:
      return false;
  }
}
