'use client';

import { useRef, useState } from 'react';
import { ATTACHMENT_LABELS, MAX_SUPPLEMENT_ATTACHMENTS } from '@/lib/signoff/constants';

/**
 * 補充資料表單。
 *
 * 補充只追加、不改動既有附件，故已簽名者無須重簽——這點在表單上要
 * 明講，否則使用者不敢按。上傳沿用建立流程的三段式（signed URL → PUT →
 * 送出時 server 端重新驗位元組與 sha256）。
 */

const WINE = '#8B1F2F';
const MUTE = '#8A7F73';
const LINE = '#D9CDB8';

type Pick = { file: File; label: string; caption: string };

export default function SupplementForm({
  documentId,
  signedCount,
  onDone,
}: {
  documentId: string;
  signedCount: number;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [picks, setPicks] = useState<Pick[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  // 同一次送出固定不變，網路重試時 server 端才認得出是同一筆
  const reqIdRef = useRef<string>('');

  function addFiles(list: FileList | null) {
    if (!list) return;
    // 選檔當下就擋上限：若等到送出才被 API 拒絕，先前已 PUT 上去的檔案
    // 會變成沒有人認領的 storage 孤兒。
    setPicks((prev) => {
      const merged = [
        ...prev,
        ...Array.from(list).map((file) => ({ file, label: '', caption: '' })),
      ];
      if (merged.length > MAX_SUPPLEMENT_ATTACHMENTS) {
        setMsg(`一次最多補充 ${MAX_SUPPLEMENT_ATTACHMENTS} 個檔案，超過的已略過`);
        return merged.slice(0, MAX_SUPPLEMENT_ATTACHMENTS);
      }
      return merged;
    });
  }

  async function submit() {
    setMsg('');
    if (picks.length === 0 && !note.trim()) {
      setMsg('請至少填寫補充說明或選擇檔案');
      return;
    }
    setBusy(true);
    if (!reqIdRef.current) reqIdRef.current = crypto.randomUUID();
    try {
      const sources: { object_path: string; mime: string; name: string; label?: string; caption?: string }[] = [];
      for (const p of picks) {
        const upRes = await fetch('/api/board/signoff/upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mime: p.file.type, size: p.file.size }),
        });
        const up = await upRes.json().catch(() => ({}));
        if (!upRes.ok) {
          setMsg(`「${p.file.name}」${up.error || '取得上傳網址失敗'}`);
          setBusy(false);
          return;
        }
        const put = await fetch(up.signed_url, {
          method: 'PUT',
          headers: { 'Content-Type': p.file.type, 'x-upsert': 'false' },
          body: p.file,
        });
        if (!put.ok) {
          setMsg(`「${p.file.name}」上傳失敗（HTTP ${put.status}）`);
          setBusy(false);
          return;
        }
        sources.push({
          object_path: up.object_path,
          mime: up.mime,
          name: p.file.name,
          ...(p.label ? { label: p.label } : {}),
          ...(p.caption.trim() ? { caption: p.caption.trim() } : {}),
        });
      }

      const res = await fetch(`/api/board/signoff/${documentId}/supplement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_request_id: reqIdRef.current, note: note.trim() || null, sources }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(body.error || '補充失敗');
        setBusy(false);
        return;
      }
      reqIdRef.current = '';
      setNote('');
      setPicks([]);
      setOpen(false);
      setBusy(false);
      onDone();
    } catch {
      setMsg('網路異常，請稍後再試');
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          background: 'none',
          color: WINE,
          border: `1px solid ${WINE}`,
          borderRadius: 4,
          padding: '8px 14px',
          fontSize: 13.5,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        ＋ 補充資料
      </button>
    );
  }

  return (
    <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 6, padding: 14 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>補充資料</div>
      <p style={{ fontSize: 12, color: MUTE, lineHeight: 1.7, margin: '0 0 10px' }}>
        補充只會追加內容，不會更動已送出的原始資料
        {signedCount > 0 && `，已簽核的 ${signedCount} 位不需要重簽`}。
        補充紀錄會標示時間與補充者。
      </p>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="補充說明（例：補附廠商報價單與請款單）"
        rows={3}
        style={{ width: '100%', padding: '9px 10px', border: `1px solid ${LINE}`, borderRadius: 4, fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit' }}
      />

      <input
        type="file"
        multiple
        accept="application/pdf,image/jpeg,image/png"
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = '';
        }}
        style={{ display: 'block', marginTop: 10, fontSize: 13 }}
      />

      {picks.map((p, i) => (
        <div key={i} style={{ marginTop: 10, padding: 10, background: '#FAF7F2', borderRadius: 4, border: `1px solid ${LINE}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12.5, wordBreak: 'break-all' }}>{p.file.name}</span>
            <button
              onClick={() => setPicks((prev) => prev.filter((_, j) => j !== i))}
              style={{ background: 'none', border: 'none', color: '#b00', cursor: 'pointer', fontSize: 13, flexShrink: 0 }}
            >
              移除
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 7, flexWrap: 'wrap' }}>
            <select
              value={p.label}
              onChange={(e) =>
                setPicks((prev) => prev.map((q, j) => (j === i ? { ...q, label: e.target.value } : q)))
              }
              style={{ padding: '6px 8px', border: `1px solid ${LINE}`, borderRadius: 4, fontSize: 13 }}
            >
              <option value="">類型（選填）</option>
              {ATTACHMENT_LABELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <input
              value={p.caption}
              onChange={(e) =>
                setPicks((prev) => prev.map((q, j) => (j === i ? { ...q, caption: e.target.value } : q)))
              }
              placeholder="說明（選填）"
              style={{ flex: 1, minWidth: 140, padding: '6px 8px', border: `1px solid ${LINE}`, borderRadius: 4, fontSize: 13 }}
            />
          </div>
        </div>
      ))}

      {msg && <div style={{ marginTop: 10, fontSize: 13, color: '#b00' }}>{msg}</div>}

      <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
        <button
          onClick={submit}
          disabled={busy}
          style={{ flex: 1, background: busy ? MUTE : WINE, color: '#fff', border: 'none', borderRadius: 4, padding: 10, fontSize: 14.5, fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}
        >
          {busy ? '上傳中…' : '送出補充'}
        </button>
        <button
          onClick={() => { setOpen(false); setMsg(''); }}
          disabled={busy}
          style={{ background: 'none', color: MUTE, border: `1px solid ${LINE}`, borderRadius: 4, padding: '10px 16px', fontSize: 14, cursor: 'pointer' }}
        >
          取消
        </button>
      </div>
    </div>
  );
}
