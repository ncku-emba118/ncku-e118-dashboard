'use client';

/**
 * PostForm — 公告寫作/編輯共用 form
 *
 * Modes:
 *   create: POST /api/board/posts，含 client_request_id 防雙擊
 *   edit:   PATCH /api/board/posts/[id]，含 version optimistic lock
 *
 * 附件雙源（2026-05-27 加 Supabase Storage 直傳）：
 *   • 主要：📁 從電腦選檔上傳（直傳 /api/board/upload → Supabase Storage）
 *   • 次要：🔗 貼 Google Drive 網址（舊流程、給已熟悉 GDrive 工作流的 user）
 *
 * 錯誤提示加大、加色塊、放在輸入區下方明顯位置。
 */

import { useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { parseGdriveUrl } from '@/lib/gdrive';
import type { Attachment } from '@/lib/attachment';
import { attachmentEmoji, formatSize } from '@/lib/attachment';

type Dept = { id: string; name: string; color: string };

export type PostFormInitial = {
  department_id: string;
  title: string;
  content: string;
  pinned: boolean;
  attachments: Attachment[];
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
  const clientRequestId = useMemo(() => crypto.randomUUID(), []);

  const [departmentId, setDepartmentId] = useState(
    initial?.department_id ?? depts[0]?.id ?? '',
  );
  const [title, setTitle] = useState(initial?.title ?? '');
  const [content, setContent] = useState(initial?.content ?? '');
  const [pinned, setPinned] = useState(initial?.pinned ?? false);
  const [attachments, setAttachments] = useState<Attachment[]>(
    initial?.attachments ?? [],
  );
  const [attError, setAttError] = useState<string | null>(null);

  // ── File upload state ──
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  // ── URL paste state ──
  const [showUrlPaste, setShowUrlPaste] = useState(false);
  const [attUrl, setAttUrl] = useState('');
  const [attName, setAttName] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openFilePicker() {
    setAttError(null);
    if (attachments.length >= 10) {
      setAttError('每篇公告最多 10 個附件');
      return;
    }
    fileInputRef.current?.click();
  }

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;

    if (attachments.length >= 10) {
      setAttError('每篇公告最多 10 個附件');
      return;
    }
    setAttError(null);
    setUploading(true);
    setUploadProgress(
      `1/2 取得上傳網址：${file.name}（${formatSize(file.size)}）…`,
    );

    try {
      // Step 1: 跟 API 要 signed upload URL（檔案 bytes 不送 Netlify Function、避開 6 MB 限制）
      const metaRes = await fetch('/api/board/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          mime: file.type,
          size: file.size,
        }),
      });
      const metaData = await metaRes.json().catch(() => ({}));
      if (!metaRes.ok) {
        setAttError(metaData.error || `取上傳網址失敗（HTTP ${metaRes.status}）`);
        return;
      }

      // Step 2: 把檔案直接 PUT 到 Supabase Storage signed URL
      setUploadProgress(
        `2/2 上傳檔案到 Storage：${formatSize(file.size)}…`,
      );
      const putRes = await fetch(metaData.signed_url, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type,
          // signed upload URL 不需 Authorization header（signed URL 內含 token）
          'x-upsert': 'false',
        },
        body: file,
      });
      if (!putRes.ok) {
        const errText = await putRes.text().catch(() => '');
        setAttError(
          `Storage 上傳失敗 (HTTP ${putRes.status})${
            errText ? `：${errText.slice(0, 200)}` : ''
          }`,
        );
        return;
      }

      // Step 3: 把 server 給的 attachment_template 加進 form state
      setAttachments([
        ...attachments,
        metaData.attachment_template as Attachment,
      ]);
      setUploadProgress(null);
    } catch (err) {
      setAttError(
        `上傳時錯誤：${(err as Error).message || '網路問題'}`,
      );
    } finally {
      setUploading(false);
    }
  }

  function addGdriveAttachment() {
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
      setAttError(
        '不是有效的 Google Drive / Docs / Sheets / Slides 網址。請從 Drive 點分享 → 複製連結，格式如 https://drive.google.com/file/d/XXXX/view',
      );
      return;
    }
    const name =
      attName.trim() || `${parsed.type}-${attachments.length + 1}`;
    setAttachments([
      ...attachments,
      {
        source: 'gdrive',
        name,
        gdrive_id: parsed.gdrive_id,
        type: parsed.type,
      },
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
          setError(
            data.error ||
              `${isEdit ? '更新' : '發布'}失敗（HTTP ${res.status}）`,
          );
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
  const reachedLimit = attachments.length >= 10;

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
            📎 附件（選填 · 最多 10 個 · 每檔 ≤ 25 MB）
          </label>

          <div
            style={{
              padding: '14px 16px',
              background: '#FAF7F2',
              border: '1px solid #D9CDB8',
              borderRadius: 4,
              marginBottom: 18,
            }}
          >
            {/* Existing attachments list */}
            {attachments.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                {attachments.map((att, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 10px',
                      background: '#fff',
                      border: '1px solid #D9CDB8',
                      borderRadius: 4,
                      marginBottom: 6,
                      fontSize: 13,
                    }}
                  >
                    <span style={{ fontSize: 16 }}>
                      {attachmentEmoji(att)}
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
                    <span
                      style={{
                        fontSize: 11,
                        color: '#8A7F73',
                        fontFamily: 'ui-monospace, Menlo, monospace',
                      }}
                    >
                      {att.source === 'supabase'
                        ? formatSize(att.size)
                        : att.source}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeAttachment(i)}
                      disabled={submitting || uploading}
                      style={{
                        background: 'transparent',
                        border: '1px solid #D9CDB8',
                        color: '#8B1F2F',
                        cursor:
                          submitting || uploading ? 'not-allowed' : 'pointer',
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

            {/* ── Primary: file upload ── */}
            <input
              ref={fileInputRef}
              type="file"
              onChange={onFileSelected}
              disabled={submitting || uploading || reachedLimit}
              style={{ display: 'none' }}
              // MIME allowlist hint (browser filter — server 還會強制驗)
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
            />
            <button
              type="button"
              onClick={openFilePicker}
              disabled={submitting || uploading || reachedLimit}
              style={{
                width: '100%',
                padding: '14px 18px',
                fontSize: 14,
                fontWeight: 600,
                background:
                  submitting || uploading || reachedLimit
                    ? '#A84453'
                    : '#8B1F2F',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                cursor:
                  submitting || uploading || reachedLimit
                    ? 'not-allowed'
                    : 'pointer',
                fontFamily: 'inherit',
                letterSpacing: '0.05em',
                marginBottom: 8,
              }}
            >
              {uploading
                ? '📤 上傳中…'
                : reachedLimit
                  ? '已達 10 個附件上限'
                  : '📁 從電腦選檔上傳'}
            </button>

            {uploadProgress && (
              <div
                style={{
                  marginBottom: 8,
                  padding: '8px 12px',
                  background: 'rgba(45, 95, 78, 0.10)',
                  border: '1px solid rgba(45, 95, 78, 0.3)',
                  color: '#2D5F4E',
                  fontSize: 12,
                  borderRadius: 3,
                  fontFamily: 'ui-monospace, Menlo, monospace',
                }}
              >
                {uploadProgress}
              </div>
            )}

            <p
              style={{
                fontSize: 11,
                color: '#8A7F73',
                marginTop: 4,
                marginBottom: 0,
                fontFamily: 'ui-monospace, Menlo, monospace',
              }}
            >
              支援：圖片 / PDF / Word / Excel / PPT / 純文字 / CSV
            </p>

            {/* ── Secondary: GDrive URL paste (collapsible) ── */}
            <details
              open={showUrlPaste}
              onToggle={(e) =>
                setShowUrlPaste((e.target as HTMLDetailsElement).open)
              }
              style={{ marginTop: 14 }}
            >
              <summary
                style={{
                  cursor: 'pointer',
                  fontSize: 12,
                  color: '#8B1F2F',
                  fontWeight: 500,
                  padding: '6px 0',
                  userSelect: 'none',
                }}
              >
                🔗 或：貼 Google Drive 網址（進階）
              </summary>
              <div
                style={{
                  display: 'flex',
                  gap: 6,
                  alignItems: 'stretch',
                  flexWrap: 'wrap',
                  marginTop: 8,
                }}
              >
                <input
                  type="text"
                  value={attName}
                  onChange={(e) => setAttName(e.target.value)}
                  disabled={submitting || uploading}
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
                  disabled={submitting || uploading}
                  placeholder="https://drive.google.com/file/d/.../view"
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
                  onClick={addGdriveAttachment}
                  disabled={
                    submitting ||
                    uploading ||
                    !attUrl.trim() ||
                    reachedLimit
                  }
                  style={{
                    padding: '8px 14px',
                    fontSize: 12,
                    background: '#fff',
                    border: '1px solid #8B1F2F',
                    color: '#8B1F2F',
                    borderRadius: 3,
                    cursor:
                      submitting ||
                      uploading ||
                      !attUrl.trim() ||
                      reachedLimit
                        ? 'not-allowed'
                        : 'pointer',
                    fontWeight: 600,
                  }}
                >
                  + 加 URL
                </button>
              </div>
            </details>

            {/* Prominent error message */}
            {attError && (
              <div
                style={{
                  marginTop: 12,
                  padding: '10px 14px',
                  background: 'rgba(139, 31, 47, 0.10)',
                  border: '2px solid rgba(139, 31, 47, 0.45)',
                  color: '#8B1F2F',
                  fontSize: 13,
                  borderRadius: 4,
                  fontWeight: 500,
                  lineHeight: 1.5,
                }}
                role="alert"
              >
                ⚠ {attError}
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
              disabled={
                submitting ||
                uploading ||
                !title.trim() ||
                !content.trim()
              }
              style={{
                padding: '11px 22px',
                fontSize: 14,
                fontWeight: 600,
                background:
                  submitting ||
                  uploading ||
                  !title.trim() ||
                  !content.trim()
                    ? '#A84453'
                    : '#8B1F2F',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                cursor:
                  submitting ||
                  uploading ||
                  !title.trim() ||
                  !content.trim()
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
