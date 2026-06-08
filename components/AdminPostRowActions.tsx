'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminPostRowActions({
  postId,
  title,
  published,
}: {
  postId: string;
  title: string;
  published: boolean;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [resending, setResending] = useState(false);

  async function onDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`確定要刪除「${title}」？\n\n刪除後連帶清掉所有留言、推播紀錄，無法復原。`)) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/board/posts/${postId}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || `刪除失敗（HTTP ${res.status}）`);
        setDeleting(false);
        return;
      }
      router.refresh();
    } catch {
      alert('網路錯誤');
      setDeleting(false);
    }
  }

  async function onResend(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`確定要重新推播「${title}」給所有訂閱裝置？\n\n（適用：同學說沒收到、或第一次推播 delivery 不理想）`)) {
      return;
    }
    setResending(true);
    try {
      const res = await fetch(`/api/board/posts/${postId}/resend-push`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || `重發失敗（HTTP ${res.status}）`);
      } else {
        alert(data.message || '已重新排入推播');
        router.refresh();
      }
    } catch {
      alert('網路錯誤');
    } finally {
      setResending(false);
    }
  }

  const btnBase: React.CSSProperties = {
    padding: '4px 10px',
    fontSize: 11,
    background: '#fff',
    borderRadius: 3,
    fontWeight: 500,
    fontFamily: 'inherit',
    cursor: 'pointer',
  };

  return (
    <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 8, flexWrap: 'wrap' }} onClick={(e) => e.stopPropagation()}>
      {published && (
        <button
          type="button"
          onClick={onResend}
          disabled={resending}
          title="重新對所有訂閱裝置發送推播"
          style={{
            ...btnBase,
            color: resending ? '#8A7F73' : '#1F3F5C',
            border: '1px solid rgba(31,63,92,0.4)',
            cursor: resending ? 'not-allowed' : 'pointer',
          }}
        >
          {resending ? '排入中…' : '🔔 重發'}
        </button>
      )}
      <a
        href={`/board/admin/edit/${postId}`}
        onClick={(e) => e.stopPropagation()}
        style={{ ...btnBase, color: '#8B1F2F', border: '1px solid #D9CDB8', textDecoration: 'none' }}
      >
        編輯
      </a>
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        style={{ ...btnBase, color: deleting ? '#8A7F73' : '#8B1F2F', border: '1px solid rgba(139,31,47,0.4)', cursor: deleting ? 'not-allowed' : 'pointer' }}
      >
        {deleting ? '刪除中…' : '刪除'}
      </button>
    </div>
  );
}
