'use client';

/**
 * PostForm — 公告寫作/編輯共用 form
 *
 * Modes:
 *   create: POST /api/board/posts，含 client_request_id 防雙擊
 *   edit:   PATCH /api/board/posts/[id]，含 version optimistic lock
 *
 * 抽取自原 NewPostForm，加 edit 支援。
 */

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { parseGdriveUrl, type GdriveAttachment } from '@/lib/gdrive';

type Dept = { id: string; name: string; color: string };

export type PostFormInitial = {
  department_id: string;
  title: string;
  content: string;
  pinned: boolean;
  attachments: GdriveAttachment[];
  version: number;
};

export default function PostForm({
  mode,
  depts,
  isSuper,
  username,
  postId,
  initial,
}: {
  mode: 'create' | 'edit';
  depts: Dept[];
  isSuper: boolean;
  username: string;
  postId?: string;
  initial?: PostFormInitial;
}) {
  const router = useRouter();
  const isEdit = mode === 'edit';

  // 一次性 idempotency key (只 create mode 需要)
  const clientRequestId = useMemo(() => crypto.randomUUID(), []);

  const [departmentId, setDepartmentId] = useState(
    initial?.department_id ?? depts[0]?.id ?? '',
  );
  const [title, setTitle] = useState(initial?.title ?? '');
  const [content, setContent] = useState(initial?.content ?? '');
  const [pinned, setPinned] = useState(initial?.pinned ?? false);
  const [attachments, setAttachments] = useState<GdriveAttachment[]>(
    initial?.attachments ?? [],
  );
  const [attUrl, setAttUrl] = useState('');
  const [attName, setAttName] = useState('');
  const [attError, setAttError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addAttachment() {
    setAttError(null);
    if (!attUrl.trim()) {
      setAttError('請填 Google Drive 網址');
      return;
    }
    if (attachments.length >= 10) {
      setAttError('每篇公告最多 10 個附件');
      return;
    }
    const parsed = parseGdriveUrl(attUrl);
    if (!parsed) {
      setAttError('不是有效的 Google Drive / Docs / Sheets / Slides 網址');
      return;
    }
    const name = attName.trim() || `${parsed.type}-${attachments.length + 1}`;
    setAttachments([
      ...attachments,
      { name, gdrive_id: parsed.gdrive_id, type: parsed.type },
    ]);
    setAttUrl('');
    setAttName('');
  }

  function removeAttachment(i: number) {
    setAttachments(attachments.filter((_, idx) => idx !== i));
  }

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
      const url = isEdit ? `/api/board/posts/${postId}` : '/api/board/posts';
      const method = isEdit ? 'PATCH' : 'POST';
      const body = isEdit
        ? {
            version: initial!.version,
            title: title.trim(),
            content,
            attachments,
            pinned: isSuper ? pinned : undefined,
          }
        : {
            department_id: departmentId,
            client_request_id: clientRequestId,
            title: title.trim(),
            content,
            pinned: isSuper ? pinned : false,
            attachments,
          };
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409) {
          setError(
            data.error ||
              '公告已被其他人改過，請重新整理取最新版本後再編輯',
          );
        } else {
          setError(data.error || `${isEdit ? '更新' : '發布'}失敗（HTTP ${res.status}）`);
        }
        return;
      }
      const targetId = isEdit ? postId! : data.post_id;
      router.push(`/board/post/${targetId}`);
      router.refresh();
    } catch {
      setError('網路錯誤，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  }

  const titleLen = title.length;
  const contentLen = content.length;
  const ctaLabel = isEdit ? '儲存變更' : '發布公告';

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
          <a
            href="/board/admin"
            style={{ color: '#8A7F73', textDecoration: 'none' }}
          >
            後台
          </a>
          <span style={{ margin: '0 8px' }}>›</span>
          <span style={{ color: '#8B1F2F' }}>
            {isEdit ? '編輯公告' : '寫新公告'}
          </span>
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
          {isEdit ? 'Edit Post' : 'New Post'}
        </h1>
        <p
          style={{
            fontSize: 13,
            color: '#8A7F73',
            margin: '0 0 24px',
            fontFamily: 'ui-monospace, Menlo, monospace',
          }}
        >
          {isEdit ? '編輯者' : '發布者'}：{username} ·{' '}
          {isSuper ? 'SUPER' : 'DEPT'}
          {isEdit && initial && ` · version ${initial.version}`}
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
            部門 {isEdit && '（編輯模式鎖定）'}
          </label>
          <select
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            disabled={submitting || depts.length === 1 || isEdit}
            style={{
              width: '100%',
              padding: '10px 14px',
              fontSize: 14,
              border: '1px solid #D9CDB8',
              borderRadius: 4,
              background: isEdit ? '#EDE6D6' : '#FAF7F2',
              marginBottom: 18,
              fontFamily: 'inherit',
              color: isEdit ? '#8A7F73' : 'inherit',
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
              '可直接換行寫公告內容\n\n# 大標題\n## 小標題\n- 列表項\n[連結](https://...)'
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

          {/* Attachments */}
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
            📎 Google Drive 附件（選填 · 最多 10 個）
          </label>
          <div
            style={{
              padding: '12px 14px',
              background: '#FAF7F2',
              border: '1px solid #D9CDB8',
              borderRadius: 4,
              marginBottom: 18,
            }}
          >
            {attachments.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                {attachments.map((att, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 10px',
                      background: '#fff',
                      border: '1px solid #D9CDB8',
                      borderRadius: 4,
                      marginBottom: 6,
                      fontSize: 12,
                    }}
                  >
                    <span
                      style={{
                        color: '#8A7F73',
                        fontFamily: 'ui-monospace, Menlo, monospace',
                        minWidth: 70,
                      }}
                    >
                      [{att.type}]
                    </span>
                    <span
                      style={{
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {att.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeAttachment(i)}
                      disabled={submitting}
                      style={{
                        background: 'transparent',
                        border: '1px solid #D9CDB8',
                        color: '#8B1F2F',
                        cursor: submitting ? 'not-allowed' : 'pointer',
                        padding: '2px 8px',
                        borderRadius: 3,
                        fontSize: 11,
                      }}
                    >
                      移除
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div
              style={{
                display: 'flex',
                gap: 6,
                alignItems: 'stretch',
                flexWrap: 'wrap',
              }}
            >
              <input
                type="text"
                value={attName}
                onChange={(e) => setAttName(e.target.value)}
                disabled={submitting}
                placeholder="附件名（選填）"
                maxLength={120}
                style={{
                  flex: '0 0 140px',
                  padding: '8px 10px',
                  fontSize: 13,
                  border: '1px solid #D9CDB8',
                  borderRadius: 3,
                  background: '#fff',
                  fontFamily: 'inherit',
                }}
              />
              <input
                type="url"
                value={attUrl}
                onChange={(e) => setAttUrl(e.target.value)}
                disabled={submitting}
                placeholder="https://drive.google.com/... 或 https://docs.google.com/..."
                style={{
                  flex: 1,
                  minWidth: 200,
                  padding: '8px 10px',
                  fontSize: 13,
                  border: '1px solid #D9CDB8',
                  borderRadius: 3,
                  background: '#fff',
                  fontFamily: 'inherit',
                }}
              />
              <button
                type="button"
                onClick={addAttachment}
                disabled={
                  submitting || !attUrl.trim() || attachments.length >= 10
                }
                style={{
                  padding: '8px 14px',
                  fontSize: 12,
                  background: '#fff',
                  border: '1px solid #8B1F2F',
                  color: '#8B1F2F',
                  borderRadius: 3,
                  cursor:
                    submitting || !attUrl.trim() || attachments.length >= 10
                      ? 'not-allowed'
                      : 'pointer',
                  fontWeight: 600,
                }}
              >
                + 加附件
              </button>
            </div>

            {attError && (
              <div
                style={{
                  marginTop: 8,
                  padding: '6px 10px',
                  background: 'rgba(139, 31, 47, 0.08)',
                  color: '#8B1F2F',
                  fontSize: 11,
                  borderRadius: 3,
                }}
              >
                {attError}
              </div>
            )}
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

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              alignItems: 'center',
            }}
          >
            <a
              href={isEdit ? `/board/post/${postId}` : '/board/admin'}
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
              {submitting
                ? isEdit
                  ? '儲存中…'
                  : '發布中…'
                : ctaLabel}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
