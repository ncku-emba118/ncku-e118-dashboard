'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';

type Dept = { id: string; name: string; color: string };

export default function NewPostForm({
  depts,
  isSuper,
  username,
}: {
  depts: Dept[];
  isSuper: boolean;
  username: string;
}) {
  const router = useRouter();

  // 一次性 idempotency key — 整個 form lifetime 共用一個 UUID，防雙擊重複建公告
  const clientRequestId = useMemo(() => crypto.randomUUID(), []);

  const [departmentId, setDepartmentId] = useState(depts[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [pinned, setPinned] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('請填標題');
      return;
    }
    if (!content.trim()) {
      setError('請填內容');
      return;
    }
    if (content.length > 20480) {
      setError('內容超過 20 KB 上限');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/board/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          department_id: departmentId,
          client_request_id: clientRequestId,
          title: title.trim(),
          content,
          pinned: isSuper ? pinned : false,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || `發布失敗（HTTP ${res.status}）`);
        return;
      }
      router.push(`/board/post/${data.post_id}`);
      router.refresh();
    } catch (err) {
      setError('網路錯誤，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  }

  const titleLen = title.length;
  const contentLen = content.length;

  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #FAF7F2 0%, #F4EFE6 100%)',
        padding: '32px 24px 80px',
        fontFamily:
          "-apple-system, BlinkMacSystemFont, system-ui, 'PingFang TC', sans-serif",
      }}
    >
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <nav
          style={{
            fontSize: 11,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: '#8A7F73',
            marginBottom: 20,
          }}
        >
          <a href="/board/admin" style={{ color: '#8A7F73', textDecoration: 'none' }}>
            後台
          </a>
          <span style={{ margin: '0 8px' }}>›</span>
          <span style={{ color: '#8B1F2F' }}>寫新公告</span>
        </nav>

        <h1
          style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: 32,
            fontWeight: 300,
            color: '#1A1612',
            margin: '0 0 4px',
          }}
        >
          New Post
        </h1>
        <p
          style={{
            fontSize: 13,
            color: '#8A7F73',
            margin: '0 0 24px',
            fontFamily: 'ui-monospace, Menlo, monospace',
          }}
        >
          發布者：{username} · {isSuper ? 'SUPER 可選任意部門' : '僅可發自己部門'}
        </p>

        <form
          onSubmit={onSubmit}
          style={{
            background: '#fff',
            border: '1px solid #D9CDB8',
            borderRadius: 8,
            padding: '28px 28px 22px',
          }}
        >
          {/* Department */}
          <label
            style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 500,
              color: '#4A413A',
              marginBottom: 6,
              letterSpacing: '0.05em',
            }}
          >
            部門
          </label>
          <select
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            disabled={submitting || depts.length === 1}
            style={{
              width: '100%',
              padding: '10px 14px',
              fontSize: 14,
              border: '1px solid #D9CDB8',
              borderRadius: 4,
              background: '#FAF7F2',
              marginBottom: 18,
              fontFamily: 'inherit',
            }}
          >
            {depts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}（{d.id}）
              </option>
            ))}
          </select>

          {/* Title */}
          <label
            style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 500,
              color: '#4A413A',
              marginBottom: 6,
              letterSpacing: '0.05em',
            }}
          >
            標題（≤ 120 字）
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={submitting}
            maxLength={120}
            placeholder="例：期末聚餐 · 6/15 (六) 慶城海鮮餐廳"
            style={{
              width: '100%',
              padding: '10px 14px',
              fontSize: 16,
              border: '1px solid #D9CDB8',
              borderRadius: 4,
              background: '#FAF7F2',
              marginBottom: 6,
              fontFamily: 'inherit',
            }}
          />
          <div
            style={{
              fontSize: 11,
              color: titleLen > 100 ? '#C9742E' : '#8A7F73',
              marginBottom: 18,
              fontFamily: 'ui-monospace, Menlo, monospace',
              textAlign: 'right',
            }}
          >
            {titleLen} / 120
          </div>

          {/* Content */}
          <label
            style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 500,
              color: '#4A413A',
              marginBottom: 6,
              letterSpacing: '0.05em',
            }}
          >
            內容（≤ 20 KB · 支援 markdown：**粗體** *斜體* # 標題 - 列表 [連結](https://...) ```code```）
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={submitting}
            rows={12}
            placeholder={
              '可直接換行寫公告內容\n\n下個版本會加 markdown + GDrive 附件嵌入'
            }
            style={{
              width: '100%',
              padding: '12px 14px',
              fontSize: 15,
              lineHeight: 1.7,
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
              fontSize: 11,
              color: contentLen > 18000 ? '#C9742E' : '#8A7F73',
              marginBottom: 18,
              fontFamily: 'ui-monospace, Menlo, monospace',
              textAlign: 'right',
            }}
          >
            {(contentLen / 1024).toFixed(1)} KB / 20 KB
          </div>

          {/* Pinned (only super) */}
          {isSuper && (
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 18,
                fontSize: 13,
                color: '#4A413A',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={pinned}
                onChange={(e) => setPinned(e.target.checked)}
                disabled={submitting}
              />
              📌 置頂（只有 super 帳號可勾）
            </label>
          )}

          {/* Error */}
          {error && (
            <div
              style={{
                padding: '10px 14px',
                background: 'rgba(139, 31, 47, 0.08)',
                border: '1px solid rgba(139, 31, 47, 0.25)',
                borderRadius: 4,
                color: '#8B1F2F',
                fontSize: 13,
                marginBottom: 16,
              }}
            >
              {error}
            </div>
          )}

          {/* Actions */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              alignItems: 'center',
            }}
          >
            <a
              href="/board/admin"
              style={{
                color: '#8A7F73',
                fontSize: 13,
                textDecoration: 'none',
              }}
            >
              取消
            </a>
            <button
              type="submit"
              disabled={submitting || !title.trim() || !content.trim()}
              style={{
                padding: '11px 22px',
                fontSize: 14,
                fontWeight: 600,
                background:
                  submitting || !title.trim() || !content.trim()
                    ? '#A84453'
                    : '#8B1F2F',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                cursor:
                  submitting || !title.trim() || !content.trim()
                    ? 'not-allowed'
                    : 'pointer',
                fontFamily: 'inherit',
                letterSpacing: '0.05em',
              }}
            >
              {submitting ? '發布中…' : '發布公告'}
            </button>
          </div>
        </form>

        <p
          style={{
            marginTop: 16,
            fontSize: 11,
            color: '#8A7F73',
            fontFamily: 'ui-monospace, Menlo, monospace',
            letterSpacing: '0.03em',
            textAlign: 'center',
          }}
        >
          雙擊「發布」會自動去重（idempotency key {clientRequestId.slice(0, 8)}…）
        </p>
      </div>
    </main>
  );
}
