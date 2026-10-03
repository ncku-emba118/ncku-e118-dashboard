'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { emptyPreferences, isCommentVisible, readPreferences, reporterId, updatePreferences, PREFERENCES_KEY, type Preferences } from '@/lib/comments/preferences';
import { REPORT_REASONS } from '@/lib/comments/reasons';
import { COMMENT_CONTACT_EMAIL } from '@/lib/comments/contact';

export type Comment = {
  id: string;
  author_key: string;
  post_id: string;
  author_name: string | null;
  content: string;
  created_at: string;
  status?: string;
};

import { formatDateTW } from '@/lib/format';
import { LoadingLabel } from '@/components/Loading';
const formatDate = formatDateTW;

export default function Comments({
  postId,
  initialComments,
  canModerate,
  deptName,
}: {
  postId: string;
  initialComments: Comment[];
  canModerate: boolean;
  deptName?: string;
}) {
  const [comments, setComments] = useState<Comment[]>(initialComments);
  const mutationRevision = useRef(0);
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [prefs, setPrefs] = useState<Preferences>(emptyPreferences);
  const prefsRef = useRef(prefs);
  const unsavedPrefs = useRef(false);
  const [ready, setReady] = useState(false);
  const [manageBlocks, setManageBlocks] = useState(false);
  const [reportTarget, setReportTarget] = useState<string | null>(null);
  const [reason, setReason] = useState<keyof typeof REPORT_REASONS>('inappropriate');
  const [details, setDetails] = useState('');
  const [reporting, setReporting] = useState(false);
  const reportRequest = useRef<{ controller: AbortController; timer: number } | null>(null);
  const [safetyMessage, setSafetyMessage] = useState('');

  useEffect(() => {
    function restore() {
      if (unsavedPrefs.current) return; // Keep in-page blocks after quota/write failure.
      try { const restored = readPreferences(localStorage); prefsRef.current = restored; setPrefs(restored); }
      catch { setSafetyMessage('無法讀取本機設定；封鎖及隱藏可能只在本頁有效。'); }
      setReady(true);
    }
    restore();
    const onStorage = (event: StorageEvent) => {
      if (event.key === PREFERENCES_KEY || event.key === null) restore();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  function savePreferences(update: (current: Preferences) => Preferences) {
    let result;
    try { result = updatePreferences(localStorage, prefsRef.current, update, !unsavedPrefs.current); }
    catch { result = { value: update(prefsRef.current), saved: false }; }
    prefsRef.current = result.value;
    unsavedPrefs.current = !result.saved;
    setPrefs(result.value);
    if (!result.saved) setSafetyMessage('無法儲存本機設定；封鎖及隱藏只在本頁有效。');
    return result.saved;
  }

  // Refresh on entry/return for new comments and officer deletions; no polling.
  useEffect(() => {
    let disposed = false;
    let inFlight = false;
    let controller: AbortController | null = null;
    async function refresh() {
      if (document.hidden || inFlight) return;
      inFlight = true;
      controller = new AbortController();
      const revision = mutationRevision.current;
      const timeout = window.setTimeout(() => controller?.abort(), 8000);
      try {
        const res = await fetch(`/api/board/comments?post_id=${postId}`, { cache: 'no-store', signal: controller.signal });
        if (!res.ok) throw new Error('refresh');
        const data = await res.json();
        if (!disposed && revision === mutationRevision.current && Array.isArray(data.comments)) setComments(data.comments);
      } catch { /* keep current list on transient failure */ }
      finally { window.clearTimeout(timeout); inFlight = false; }
    }
    void refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      disposed = true;
      controller?.abort();
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [postId]);

  function abortReport() {
    const request = reportRequest.current;
    reportRequest.current = null; // Invalidate before abort: late replies cannot affect a new form.
    if (request) { window.clearTimeout(request.timer); request.controller.abort(); }
  }
  useEffect(() => () => abortReport(), []);

  function cancelReport() {
    const wasPending = reportRequest.current !== null;
    abortReport();
    setReporting(false);
    setReportTarget(null);
    if (wasPending) setSafetyMessage('已取消等候；檢舉可能已送達，可稍後重試確認。');
  }

  async function onReport(e: React.FormEvent) {
    e.preventDefault();
    if (!reportTarget || reportRequest.current) return;
    const target = reportTarget;
    const controller = new AbortController();
    const request = { controller, timer: 0 };
    reportRequest.current = request;
    request.timer = window.setTimeout(() => {
      if (reportRequest.current !== request) return;
      abortReport();
      setReporting(false);
      setSafetyMessage('檢舉請求逾時，送達狀態待確認，請重試；仍可封鎖留言者。');
    }, 10000);
    setReporting(true);
    setSafetyMessage('');
    try {
      const res = await fetch('/api/board/comments/reports', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ comment_id: target, reporter_id: reporterId(), reason, details }),
      });
      const gone = res.status === 404;
      const data = gone ? {} : await res.json().catch(() => ({}));
      if (reportRequest.current !== request) return;
      if (!res.ok && !gone) throw new Error(data.error || '檢舉未送達，請重試');
      const saved = savePreferences((current) => ({ ...current, hidden: [...new Set([...current.hidden, target])] }));
      setSafetyMessage(gone
        ? (saved ? '留言已不存在，已在本機隱藏。' : '留言已不存在；無法儲存本機設定，只在本頁隱藏。')
        : (saved ? '檢舉已送交幹部，這則留言已在本機隱藏。' : '檢舉已送交幹部；無法儲存本機設定，這則留言只在本頁隱藏。'));
      setReportTarget(null);
      setDetails('');
    } catch (err) {
      if (reportRequest.current === request) setSafetyMessage(err instanceof Error ? err.message : '檢舉未送達，請重試');
    } finally {
      window.clearTimeout(request.timer);
      if (reportRequest.current === request) {
        reportRequest.current = null;
        setReporting(false);
      }
    }
  }

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
      // 送出回應與背景刷新可能交錯，使用 functional setter 去重。
      // ⚠ 不能用 `comments.some(...)` (stale closure) 檢查；要在 functional setter
      //   內用 fresh `prev` 比對，避免刷新已加入的同筆重複。
      if (data.comment) {
        mutationRevision.current++;
        setComments((prev) =>
          prev.some((x) => x.id === data.comment.id)
            ? prev
            : [...prev, data.comment],
        );
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
      mutationRevision.current++;
      setComments((prev) => prev.filter((c) => c.id !== id));
    } catch {
      alert('網路錯誤');
    }
  }

  const sorted = useMemo(
    () =>
      [...comments].filter((c) => isCommentVisible(c, prefs)).sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      ),
    [comments, prefs],
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
        💬 留言互動 · {sorted.length} 則 · 最新 200 則
      </p>
      <p style={{ fontSize: 13 }}>檢舉或意見聯絡：{COMMENT_CONTACT_EMAIL
        ? <a href={`mailto:${COMMENT_CONTACT_EMAIL}`}>{COMMENT_CONTACT_EMAIL}</a>
        : '請透過班級 LINE 群組聯絡秘書處。'}</p>

      <button type="button" onClick={() => setManageBlocks(!manageBlocks)} aria-expanded={manageBlocks}>
        已封鎖（{prefs.blocked.length}）
      </button>
      {canModerate && <a href="/board/admin/reports" style={{ marginLeft: 16 }}>檢舉管理</a>}
      {manageBlocks && <div style={{ padding: 12, background: '#F4EFE6', marginTop: 8 }}>
        <p>封鎖只儲存在此裝置的此網站；清除資料、換瀏覽器或 App 不會同步。匿名識別依網路來源，共用網路可能連帶封鎖，換網路或系統更新識別碼可能失效。</p>
        {prefs.blocked.length === 0 && <p>目前沒有封鎖留言者。</p>}
        {prefs.blocked.map((entry) => <div key={entry.key} style={{ margin: '8px 0' }}>
          {entry.name} <button type="button" onClick={() => savePreferences((current) => ({ ...current, blocked: current.blocked.filter((x) => x.key !== entry.key) }))}>解除封鎖</button>
        </div>)}
      </div>}
      {safetyMessage && <p role="status">{safetyMessage}</p>}
      {reportTarget && <form onSubmit={onReport} style={{ padding: 16, margin: '16px 0', background: '#F4EFE6' }}>
        <h3>檢舉留言</h3>
        <label>原因 <select value={reason} onChange={(e) => setReason(e.target.value as keyof typeof REPORT_REASONS)} disabled={reporting}>
          {Object.entries(REPORT_REASONS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select></label>
        <label style={{ display: 'block', marginTop: 12 }}>補充說明（選填，最多 500 字）
          <textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={500} rows={3} disabled={reporting} style={{ display: 'block', width: '100%' }} />
        </label>
        <button type="submit" disabled={reporting}>{reporting ? '送出中…' : '送出檢舉'}</button>{' '}
        <button type="button" onClick={cancelReport}>取消</button>
      </form>}

      {/* Wait for local preferences to avoid flashing blocked content. */}
      {!ready ? <p>讀取留言設定…</p> : <>
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
                    <button type="button" disabled={reporting} onClick={() => { setReportTarget(c.id); setReason('inappropriate'); setDetails(''); setSafetyMessage(''); }}>檢舉</button>
                    <button type="button" onClick={() => {
                      if (!confirm('封鎖此匿名識別的留言者？共用網路的其他留言也可能隱藏，可從「已封鎖」解除。')) return;
                      savePreferences((current) => current.blocked.some((x) => x.key === c.author_key) ? current : ({ ...current, blocked: [...current.blocked, { key: c.author_key, name: c.author_name || '匿名同學' }] }));
                    }}>封鎖</button>
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

      </>}
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
        <p style={{ fontSize: 13, lineHeight: 1.6 }}>社群守則：不得張貼不當內容、垃圾訊息或騷擾他人；違規留言將被移除。送出即表示同意遵守。</p>
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
          placeholder={deptName ? `想留言給${deptName}長嗎？` : '想留言給負責部門嗎？'}
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
            {submitting ? <LoadingLabel text="送出中…" /> : '送出留言'}
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
            {info}
          </div>
        )}
      </form>
    </section>
  );
}
