'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminPostRowActions({
  postId,
  title,
}: {
  postId: string;
  title: string;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function onDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`確定要刪除「${title}」？\n\n刪除後連帶清掉所有留言、推播紀錄，無法復原。`)) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/board/posts/${postId}`, {
        method: 'DELETE',
      });
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

  return (
    <div
      style={{
        display: 'flex',
        gap: 6,
        flexShrink: 0,
        marginLeft: 8,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <a
        href={`/board/admin/edit/${postId}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          padding: '4px 10px',
          fontSize: 11,
          color: '#8B1F2F',
          background: '#fff',
          border: '1px solid #D9CDB8',
          borderRadius: 3,
          textDecoration: 'none',
          fontWeight: 500,
        }}
      >
        編輯
      </a>
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        style={{
          padding: '4px 10px',
          fontSize: 11,
          color: deleting ? '#8A7F73' : '#8B1F2F',
          background: '#fff',
          border: '1px solid rgba(139,31,47,0.4)',
          borderRadius: 3,
          cursor: deleting ? 'not-allowed' : 'pointer',
          fontWeight: 500,
          fontFamily: 'inherit',
        }}
      >
        {deleting ? '刪除中…' : '刪除'}
      </button>
    </div>
  );
}
