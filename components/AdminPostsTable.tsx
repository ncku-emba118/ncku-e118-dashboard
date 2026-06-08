'use client';

/**
 * Admin 公告列表（client component）
 *
 * 從 admin/page.tsx 抽出來、為了支援：
 * 1. 即時搜尋（filter by title / dept name）
 * 2. 手機 responsive layout（< 640 把 actions 換行）
 *
 * Posts 由 server-side fetch 後 props 傳入；本元件只做純前端 filter + render。
 */

import { useMemo, useState } from 'react';
import { deptInfo } from '@/lib/depts';
import { formatDateTW as formatDate } from '@/lib/format';
import AdminPostRowActions from './AdminPostRowActions';

type AdminPost = {
  id: string;
  department_id: string;
  title: string;
  pinned: boolean;
  published: boolean;
  created_at: string;
  accounts: { username: string } | null;
};

export default function AdminPostsTable({
  posts,
  viewCounts = {},
}: {
  posts: AdminPost[];
  viewCounts?: Record<string, number>;
}) {
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return posts;
    return posts.filter((p) => {
      const dept = deptInfo(p.department_id).name.toLowerCase();
      const title = p.title.toLowerCase();
      const author = (p.accounts?.username ?? '').toLowerCase();
      return title.includes(term) || dept.includes(term) || author.includes(term);
    });
  }, [posts, q]);

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 12,
          flexWrap: 'wrap',
          margin: '24px 0 12px',
        }}
      >
        <h2
          style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: 22,
            fontWeight: 400,
            color: '#1A1612',
            margin: 0,
          }}
        >
          Posts ({filtered.length}{q ? ` / ${posts.length}` : ''})
        </h2>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="🔍 搜尋標題 / 部門 / 發布者"
          style={{
            flex: '1 1 240px',
            maxWidth: 360,
            padding: '8px 12px',
            fontSize: 13,
            border: '1px solid #D9CDB8',
            borderRadius: 4,
            background: '#fff',
            fontFamily: 'inherit',
            outline: 'none',
          }}
        />
      </div>

      {filtered.length === 0 ? (
        <div
          style={{
            padding: '48px 32px',
            textAlign: 'center',
            background: '#fff',
            border: '1px dashed #D9CDB8',
            borderRadius: 8,
            color: '#8A7F73',
          }}
        >
          {posts.length === 0 ? (
            <>
              <p style={{ marginBottom: 14, fontSize: 15 }}>還沒有公告</p>
              <a
                href="/board/admin/new"
                style={{ color: '#8B1F2F', fontSize: 14, textDecoration: 'none' }}
              >
                ✍ 寫第一則公告 →
              </a>
            </>
          ) : (
            <p style={{ fontSize: 14 }}>找不到符合「{q}」的公告</p>
          )}
        </div>
      ) : (
        <div
          style={{
            background: '#fff',
            border: '1px solid #D9CDB8',
            borderRadius: 6,
            overflow: 'hidden',
          }}
        >
          {filtered.map((p, i) => {
            const dept = deptInfo(p.department_id);
            return (
              <div
                key={p.id}
                className="admin-post-row"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '14px 18px',
                  borderBottom:
                    i < filtered.length - 1
                      ? '1px solid rgba(26,22,18,0.08)'
                      : 'none',
                  flexWrap: 'wrap',
                }}
              >
                <span
                  style={{
                    padding: '2px 8px',
                    background: `${dept.color}1F`,
                    color: dept.color,
                    fontFamily: "'Noto Serif TC', serif",
                    fontWeight: 500,
                    fontSize: 11,
                    borderRadius: 3,
                    minWidth: 44,
                    textAlign: 'center',
                    flexShrink: 0,
                  }}
                >
                  {dept.name}
                </span>
                <a
                  href={`/board/post/${p.id}`}
                  className="admin-post-row__title"
                  style={{
                    flex: '1 1 280px',
                    minWidth: 0,
                    color: 'inherit',
                    textDecoration: 'none',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      alignItems: 'baseline',
                      flexWrap: 'wrap',
                    }}
                  >
                    {p.pinned && (
                      <span
                        title="置頂"
                        style={{
                          fontSize: 11,
                          color: '#8B1F2F',
                        }}
                      >
                        📌
                      </span>
                    )}
                    <span
                      style={{
                        fontFamily: "'Noto Serif TC', serif",
                        fontSize: 14,
                        fontWeight: 600,
                        color: '#1A1612',
                      }}
                    >
                      {p.title}
                    </span>
                    {!p.published && (
                      <span
                        style={{
                          fontSize: 10,
                          padding: '1px 6px',
                          background: '#F4EFE6',
                          color: '#8A7F73',
                          borderRadius: 3,
                          letterSpacing: '0.05em',
                          fontWeight: 600,
                        }}
                      >
                        DRAFT
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: '#8A7F73',
                      fontFamily: 'ui-monospace, Menlo, monospace',
                      marginTop: 2,
                    }}
                  >
                    {formatDate(p.created_at)} · 👤 {p.accounts?.username ?? '—'}
                    {p.published && (
                      <span style={{ marginLeft: 8 }} title="累積閱讀數（同 visitor 同天 = 1）">
                        · 👁 {viewCounts[p.id] ?? 0}
                      </span>
                    )}
                  </div>
                </a>
                <AdminPostRowActions postId={p.id} title={p.title} published={p.published} />
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
