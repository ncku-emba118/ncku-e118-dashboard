'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { REPORT_REASONS } from '@/lib/comments/reasons';
import { formatDateTW } from '@/lib/format';

export type ReportRow = {
  id: string; reason: keyof typeof REPORT_REASONS; details: string; created_at: string;
  comments: { id: string; content: string; author_name: string | null; status: string;
    posts: { id: string; title: string; department_id: string } };
};
export type PendingRow = ReportRow['comments'] & { created_at: string };

export default function CommentReports({ reports, pending = [] }: { reports: ReportRow[]; pending?: PendingRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [resolved, setResolved] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [reviewed, setReviewed] = useState<string[]>([]);
  async function resolve(id: string, action: 'dismiss' | 'delete' | 'approve') {
    if (!confirm(action === 'approve' ? '確認放行，讓所有同學看到這則留言？' : action === 'dismiss' ? '駁回此留言的所有未處理檢舉並結案？留言狀態不變。' : '確定刪除這則留言並結案？')) return;
    setBusy(id);
    setMessage('');
    try {
      const res = await fetch(`/api/board/comments/${id}${action === 'approve' ? '?action=approve' : ''}`, { method: action === 'delete' ? 'DELETE' : 'PATCH' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '處理失敗');
      // Only hide reports in this response's view, never future reports on the same comment.
      if (action !== 'approve') setResolved((prev) => [...prev, ...reports.filter((report) => report.comments.id === id).map((report) => report.id)]);
      if (action !== 'dismiss') setReviewed((prev) => [...prev, id]);
      router.refresh();
    } catch (err) { setMessage(err instanceof Error ? err.message : '處理失敗'); }
    finally { setBusy(null); }
  }
  return <>
    {message && <p role="alert">{message}</p>}
    <h2>待審核留言</h2>
    {pending.every((c) => reviewed.includes(c.id)) && <p>目前沒有待審核留言。</p>}
    {pending.filter((c) => !reviewed.includes(c.id)).map((c) => <article key={c.id} style={{ padding: 16, marginTop: 16, background: '#fff', border: '1px solid #D9CDB8', borderRadius: 6, overflowWrap: 'anywhere' }}>
      <a href={`/board/post/${c.posts.id}`}>{c.posts.title}</a>
      <p>{formatDateTW(c.created_at)} · 待幹部審核</p>
      <blockquote style={{ whiteSpace: 'pre-wrap' }}>{c.author_name || '匿名同學'}：{c.content}</blockquote>
      <button type="button" disabled={busy !== null} onClick={() => resolve(c.id, 'approve')}>放行留言</button>{' '}
      <button type="button" disabled={busy !== null} onClick={() => resolve(c.id, 'delete')}>刪除留言</button>
    </article>)}
    <h2>未處理檢舉</h2>
    {reports.every((report) => resolved.includes(report.id)) && <p>目前沒有待處理檢舉。</p>}
    {reports.filter((report) => !resolved.includes(report.id)).map((report) => {
      const c = report.comments;
      const removed = c.status === 'deleted';
      return <article key={report.id} style={{ padding: 16, marginTop: 16, background: '#fff', border: '1px solid #D9CDB8', borderRadius: 6, overflowWrap: 'anywhere' }}>
        <a href={`/board/post/${c.posts.id}`}>{c.posts.title}</a>
        <p>{formatDateTW(report.created_at)} · {REPORT_REASONS[report.reason]}</p>
        {report.details && <p style={{ whiteSpace: 'pre-wrap' }}>說明：{report.details}</p>}
        <blockquote style={{ whiteSpace: 'pre-wrap' }}>{c.author_name || '匿名同學'}：{c.content}</blockquote>
        <p>狀態：{removed ? '已刪除' : c.status === 'pending_review' ? '已隱藏／待審核' : '公開'}</p>
        {!removed && <button type="button" disabled={busy !== null} onClick={() => resolve(c.id, 'dismiss')}>駁回（結案）</button>}{' '}
        <button type="button" disabled={busy !== null} onClick={() => resolve(c.id, 'delete')}>{busy === c.id ? '處理中…' : removed ? '完成刪除結案' : '刪除留言'}</button>
      </article>;
    })}
  </>;
}
