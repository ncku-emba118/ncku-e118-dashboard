'use client';

import { useEffect, useState, useMemo } from 'react';
import { getBrowserClient } from '@/lib/supabase/browser';

export type Comment = {
  id: string;
  post_id: string;
  author_name: string | null;
  content: string;
  created_at: string;
  status?: string;
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day} ${hh}:${mm}`;
}

export default function Comments({
  postId,
  initialComments,
  canModerate,
}: {
  postId: string;
  initialComments: Comment[];
  canModerate: boolean;
}) {
  const [comments, setComments] = useState<Comment[]>(initialComments);
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // ── Realtime subscription ──
  useEffect(() => {
    const supabase = getBrowserClient();
    const channel = supabase
      .channel(`comments:post:${postId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'comments',
          filter: `post_id=eq.${postId}`,
        },
        (payload) => {
          const c = payload.new as Comment;
          // anon RLS already filters by visible + not deleted；保險再 check
          if (c.status && c.status !== 'visible') return;
          setComments((prev) => {
            if (prev.some((x) => x.id === c.id)) return prev;
            return [...prev, c].sort(
              (a, b) =>
                new Date(a.created_at).getTime() -
                new Date(b.created_at).getTime(),
            );
          });
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'comments',
          filter: `post_id=eq.${postId}`,
        },
        (payload) => {
          const c = payload.new as Comment;
          if (c.status === 'deleted') {
            setComments((prev) => prev.filter((x) => x.id !== c.id));
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [postId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (content.trim().length < 2) {
      setError('留言至少 2 字');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/board/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post_id: postId,
          author_name: name.trim() || null,
          content: content.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || '留言失敗');
        return;
      }
      // Optimistic update — Realtime 也會推但 race 可能後到
      if (data.comment && !comments.some((x) => x.id === data.comment.id)) {
        setComments((prev) => [...prev, data.comment]);
      }
      if (data.pending) {
        setInfo(data.message || '留言已送出、含網址需審核後才公開');
      }
      setContent('');
    } catch {
      setError('網路錯誤');
    } finally {
      setSubmitting(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm('確定要刪除這則留言？')) return;
    try {
      const res = await fetch(`/api/board/comments/${id}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || '刪除失敗');
        return;
      }
      setComments((prev) => prev.filter((c) => c.id !== id));
    } catch {
      alert('網路錯誤');
    }
  }

  const sorted = useMemo(
    () =>
      [...comments].sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      ),
    [comments],
  );

  return (
    <section style={{ marginTop: 24 }}>
      <h2
        style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontSize: 24,
          fontWeight: 400,
          color: '#1A1612',
          margin: '0 0 4px',
        }}
      >
        Comments
      </h2>
      <p
        style={{
          fontSize: 13,
          color: '#8A7F73',
          margin: '0 0 16px',
          fontFamily: 'ui-monospace, Menlo, monospace',
        }}
      >
        💬 留言互動 · {sorted.length} 則 · 即時更新
      </p>

      {/* Existing comments */}
      {sorted.length === 0 ? (
        <div
          style={{
            padding: '24px 20px',
            background: '#fff',
            border: '1px dashed #D9CDB8',
            borderRadius: 6,
            color: '#8A7F73',
            textAlign: 'center',
            fontSize: 13,
            marginBottom: 20,
          }}
        >
          還沒有留言，下方留下第一個
        </div>
      ) : (
        <div
          style={{
            background: '#fff',
            border: '1px solid #D9CDB8',
            borderRadius: 6,
            overflow: 'hidden',
            marginBottom: 20,
          }}
        >
          {sorted.map((c, i) => {
            const isAnon = !c.author_name;
            return (
              <div
                key={c.id}
                style={{
                  padding: '14px 18px',
                  borderBottom:
                    i < sorted.length - 1
                      ? '1px solid rgba(26,22,18,0.08)'
                      : 'none',
                  display: 'flex',
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: isAnon ? '#EDE6D6' : '#F4EFE6',
                    color: isAnon ? '#8A7F73' : '#8B1F2F',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: "'Noto Serif TC', serif",
                    fontWeight: 600,
                    fontSize: 13,
                    flexShrink: 0,
                  }}
                >
                  {isAnon ? '?' : c.author_name![0]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 4,
                      flexWrap: 'wrap',
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "'Noto Serif TC', serif",
                        fontWeight: 600,
                        fontSize: 13,
                        color: isAnon ? '#8A7F73' : '#1A1612',
                        fontStyle: isAnon ? 'italic' : 'normal',
                      }}
                    >
                      {isAnon ? '匿名同學' : c.author_name}
                    </span>
                    <span
                      style={{
                        fontFamily: 'ui-monospace, Menlo, monospace',
                        fontSize: 11,
                        color: '#8A7F73',
                      }}
                    >
                      {formatDate(c.created_at)}
                    </span>
                    {canModerate && (
                      <button
                        type="button"
                        onClick={() => onDelete(c.id)}
                        style={{
                          background: 'transparent',
                          border: '1px solid rgba(139,31,47,0.25)',
                          color: '#8B1F2F',
                          padding: '1px 8px',
                          borderRadius: 3,
                          cursor: 'pointer',
                          fontSize: 10,
                          marginLeft: 'auto',
                        }}
                      >
                        刪除
                      </button>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      lineHeight: 1.7,
                      color: '#4A413A',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {c.content}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Comment form */}
      <form
        onSubmit={onSubmit}
        style={{
          background: '#fff',
          border: '1px solid #D9CDB8',
          borderRadius: 6,
          padding: '18px 20px',
        }}
      >
        <label
          style={{
            display: 'block',
            fontSize: 12,
            color: '#4A413A',
            marginBottom: 4,
            letterSpacing: '0.05em',
          }}
        >
          作者名稱（可留空）
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={submitting}
          maxLength={40}
          placeholder="留空將顯示為「匿名同學」"
          style={{
            width: '100%',
            padding: '8px 12px',
            fontSize: 13,
            border: '1px solid #D9CDB8',
            borderRadius: 4,
            background: '#FAF7F2',
            marginBottom: 12,
            fontFamily: 'inherit',
          }}
        />
        <label
          style={{
            display: 'block',
            fontSize: 12,
            color: '#4A413A',
            marginBottom: 4,
            letterSpacing: '0.05em',
          }}
        >
          留言內容（2-1000 字）
        </label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          disabled={submitting}
          rows={3}
          maxLength={1000}
          placeholder="想留言給活動長嗎？"
          style={{
            width: '100%',
            padding: '10px 12px',
            fontSize: 14,
            lineHeight: 1.65,
            border: '1px solid #D9CDB8',
            borderRadius: 4,
            background: '#FAF7F2',
            marginBottom: 6,
            fontFamily: 'inherit',
            resize: 'vertical',
          }}
        />
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 6,
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: '#8A7F73',
              fontFamily: 'ui-monospace, Menlo, monospace',
            }}
          >
            30 秒/則 · 含網址會進審核
          </div>
          <button
            type="submit"
            disabled={submitting || content.trim().length < 2}
            style={{
              padding: '8px 18px',
              fontSize: 13,
              fontWeight: 600,
              background:
                submitting || content.trim().length < 2
                  ? '#A84453'
                  : '#8B1F2F',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor:
                submitting || content.trim().length < 2
                  ? 'not-allowed'
                  : 'pointer',
              fontFamily: 'inherit',
              letterSpacing: '0.05em',
            }}
          >
            {submitting ? '送出中…' : '送出留言'}
          </button>
        </div>

        {error && (
          <div
            style={{
              marginTop: 10,
              padding: '8px 12px',
              background: 'rgba(139, 31, 47, 0.08)',
              color: '#8B1F2F',
              fontSize: 12,
              borderRadius: 3,
            }}
          >
            {error}
          </div>
        )}
        {info && (
          <div
            style={{
              marginTop: 10,
              padding: '8px 12px',
              background: 'rgba(201, 169, 97, 0.15)',
              color: '#6B1622',
              fontSize: 12,
              borderRadius: 3,
            }}
          >
            ⏳ {info}
          </div>
        )}
      </form>
    </section>
  );
}
