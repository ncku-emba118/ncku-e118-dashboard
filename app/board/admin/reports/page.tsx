import { redirect } from 'next/navigation';
import { readSession, manageableDepts } from '@/lib/auth/session';
import { getServerClient } from '@/lib/supabase/server';
import CommentReports, { type ReportRow, type PendingRow } from '@/components/CommentReports';

export const dynamic = 'force-dynamic';

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ page?: string; reviewPage?: string }> }) {
  const session = await readSession();
  if (!session) redirect('/board/login');
  if (session.role !== 'super' && session.role !== 'dept') redirect('/board/login');
  const params = await searchParams;
  const rawPage = Number(params.page || 1);
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 10000) : 1;
  const rawReviewPage = Number(params.reviewPage || 1);
  const reviewPage = Number.isSafeInteger(rawReviewPage) && rawReviewPage > 0 ? Math.min(rawReviewPage, 10000) : 1;
  const depts = manageableDepts(session).map((dept) => dept.id);
  const { data: pending, error: pendingError } = await getServerClient().from('comments')
    .select('id, content, author_name, status, created_at, posts!inner(id, title, department_id)')
    .in('posts.department_id', depts).eq('status', 'pending_review').is('deleted_at', null)
    .order('created_at', { ascending: true }).order('id', { ascending: true })
    .range((reviewPage - 1) * 50, reviewPage * 50 - 1);
  const { data, error } = await getServerClient().from('comment_reports')
    .select('id, reason, details, created_at, comments!inner(id, content, author_name, status, posts!inner(id, title, department_id))')
    .in('comments.posts.department_id', depts)
    .is('resolved_at', null)
    .order('created_at', { ascending: false }).order('id', { ascending: false })
    .range((page - 1) * 50, page * 50 - 1);
  return <main style={{ maxWidth: 800, margin: 'auto', padding: '32px 20px 80px' }}>
    <a href="/board/admin">← 幹部後台</a>
    <h1>留言審核／檢舉管理</h1>
    <p>僅顯示可管理部門的待審核留言與未處理檢舉，請儘速查看。放行後留言才會公開；駁回只結清檢舉，不改變留言狀態；刪除則移除留言並結案。</p>
    {pendingError && <p role="alert">無法載入待審核留言，請稍後重試。</p>}
    {error && <p role="alert">無法載入檢舉，請確認 migration 已套用並稍後重試。</p>}
    {!pendingError && !error && <CommentReports reports={(data || []) as unknown as ReportRow[]} pending={(pending || []) as unknown as PendingRow[]} />}
    <nav aria-label="待審核留言分頁" style={{ display: 'flex', gap: 20, marginTop: 24 }}>
      {reviewPage > 1 && <a href={`?page=${page}&reviewPage=${reviewPage - 1}`}>待審核上一頁</a>}
      <span>待審核第 {reviewPage} 頁</span>
      {pending?.length === 50 && <a href={`?page=${page}&reviewPage=${reviewPage + 1}`}>待審核下一頁</a>}
    </nav>
    <nav aria-label="檢舉清單分頁" style={{ display: 'flex', gap: 20, marginTop: 24 }}>
      {page > 1 && <a href={`?page=${page - 1}&reviewPage=${reviewPage}`}>上一頁</a>}
      <span>第 {page} 頁</span>
      {data?.length === 50 && <a href={`?page=${page + 1}&reviewPage=${reviewPage}`}>下一頁</a>}
    </nav>
  </main>;
}
