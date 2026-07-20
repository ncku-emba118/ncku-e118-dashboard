'use client';

import { useEffect, useRef, useState } from 'react';
import { ATTACHMENT_LABELS, MAX_SUPPLEMENT_ATTACHMENTS } from '@/lib/signoff/constants';
import { normalizeImageOrientation } from '@/lib/signoff/normalize-image';

/**
 * 補充資料表單。
 *
 * 補充只追加、不改動既有附件，故已簽名者無須重簽——這點在表單上要
 * 明講，否則使用者不敢按。
 *
 * 影像方向：手機拍的照片多半帶 EXIF orientation。瀏覽器 <img> 會自動套用，
 * 但 pdf-lib 合成最終 PDF 時不會 —— 網頁上看是正的、印出來卻是倒的。
 * 因此所有影像一律先經 canvas 以 imageOrientation:'from-image' 重繪，
 * 把方向烙進像素本身（並套用使用者手動旋轉），確保上傳的就是所見的樣子。
 */

const WINE = '#8B1F2F';
const MUTE = '#8A7F73';
const LINE = '#D9CDB8';
const PAPER = '#FAF7F2';

type Pick = { file: File; label: string; caption: string; rotate: number; previewUrl: string };

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
  const [progress, setProgress] = useState('');
  const [msg, setMsg] = useState('');
  // 同一次送出固定不變，網路重試時 server 端才認得出是同一筆
  const reqIdRef = useRef<string>('');

  // 元件卸載時釋放 objectURL
  const picksRef = useRef<Pick[]>([]);
  picksRef.current = picks;
  useEffect(() => () => picksRef.current.forEach((p) => URL.revokeObjectURL(p.previewUrl)), []);

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const incoming = Array.from(list).map((file) => ({
      file,
      label: '',
      caption: '',
      rotate: 0,
      previewUrl: URL.createObjectURL(file),
    }));
    // 上限判斷刻意放在 updater 外面：setPicks 的 updater 必須是純函式，
    // 在裡面呼叫 setMsg 會在 StrictMode 下被執行兩次。
    const room = Math.max(0, MAX_SUPPLEMENT_ATTACHMENTS - picks.length);
    if (incoming.length > room) {
      incoming.slice(room).forEach((p) => URL.revokeObjectURL(p.previewUrl));
      setMsg(`一次最多 ${MAX_SUPPLEMENT_ATTACHMENTS} 個檔案，超過的已略過`);
    } else {
      setMsg('');
    }
    setPicks((prev) => [...prev, ...incoming.slice(0, room)]);
  }

  function removeAt(i: number) {
    setPicks((prev) => {
      const target = prev[i];
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, j) => j !== i);
    });
  }

  function update(i: number, patch: Partial<Pick>) {
    setPicks((prev) => prev.map((p, j) => (j === i ? { ...p, ...patch } : p)));
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
      for (const [i, p] of picks.entries()) {
        setProgress(`上傳中 ${i + 1} / ${picks.length}：${p.file.name}`);
        // 方向正規化後再上傳，確保最終 PDF 與畫面一致
        const file = await normalizeImageOrientation(p.file, p.rotate);

        const upRes = await fetch('/api/board/signoff/upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mime: file.type, size: file.size }),
        });
        const up = await upRes.json().catch(() => ({}));
        if (!upRes.ok) {
          setMsg(`「${p.file.name}」${up.error || '取得上傳網址失敗'}`);
          setBusy(false);
          setProgress('');
          return;
        }
        const put = await fetch(up.signed_url, {
          method: 'PUT',
          headers: { 'Content-Type': file.type, 'x-upsert': 'false' },
          body: file,
        });
        if (!put.ok) {
          setMsg(`「${p.file.name}」上傳失敗（HTTP ${put.status}）`);
          setBusy(false);
          setProgress('');
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

      setProgress('儲存中…');
      const res = await fetch(`/api/board/signoff/${documentId}/supplement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_request_id: reqIdRef.current, note: note.trim() || null, sources }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(body.error || '補充失敗');
        setBusy(false);
        setProgress('');
        return;
      }
      reqIdRef.current = '';
      picks.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      setNote('');
      setPicks([]);
      setOpen(false);
      setBusy(false);
      setProgress('');
      onDone();
    } catch {
      setMsg('網路異常，請稍後再試');
      setBusy(false);
      setProgress('');
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          background: WINE,
          color: '#fff',
          border: 'none',
          borderRadius: 5,
          padding: '11px 18px',
          fontSize: 14.5,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        ＋ 補充資料（報價單 / 請款單…）
      </button>
    );
  }

  return (
    <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 6, padding: 16 }}>
      <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 15 }}>補充資料</div>
      <p style={{ fontSize: 12.5, color: MUTE, lineHeight: 1.7, margin: '0 0 12px' }}>
        補充只會追加內容，不會更動已送出的原始資料
        {signedCount > 0 && `，已簽核的 ${signedCount} 位不需要重簽`}。
      </p>

      <label style={{ display: 'block', fontSize: 13.5, fontWeight: 600, marginBottom: 5 }}>補充說明</label>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={'例：補附廠商報價單與請款單。\n單價與原報價一致，件數因師長人數調整而增加。'}
        rows={7}
        style={{
          width: '100%',
          minHeight: 150,
          padding: '12px 13px',
          border: `1px solid ${LINE}`,
          borderRadius: 5,
          fontSize: 15,
          lineHeight: 1.8,
          boxSizing: 'border-box',
          fontFamily: 'inherit',
          resize: 'vertical',
        }}
      />

      <label style={{ display: 'block', fontSize: 13.5, fontWeight: 600, margin: '14px 0 5px' }}>
        附件（選填，最多 {MAX_SUPPLEMENT_ATTACHMENTS} 個）
      </label>
      <input
        type="file"
        multiple
        accept="application/pdf,image/jpeg,image/png"
        disabled={busy}
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = '';
        }}
        style={{ display: 'block', fontSize: 13 }}
      />

      {picks.length > 0 && (
        <div style={{ marginTop: 10, padding: '9px 12px', background: '#FFF8E7', border: '1px solid #E8D9A8', borderRadius: 4, fontSize: 12.5, color: '#7a5c00', lineHeight: 1.7 }}>
          已選擇 {picks.length} 個檔案，<strong>尚未送出</strong> —— 要按下方「送出補充」才會真正上傳。
        </div>
      )}

      {picks.map((p, i) => {
        const isImage = p.file.type.startsWith('image/');
        return (
          <div key={i} style={{ marginTop: 10, padding: 11, background: PAPER, borderRadius: 5, border: `1px solid ${LINE}` }}>
            <div style={{ display: 'flex', gap: 11 }}>
              {isImage ? (
                // eslint-disable-next-line @next/next/no-img-element -- 本機 objectURL 預覽
                <img
                  src={p.previewUrl}
                  alt={p.file.name}
                  style={{
                    width: 88,
                    height: 88,
                    objectFit: 'contain',
                    background: '#fff',
                    border: `1px solid ${LINE}`,
                    borderRadius: 4,
                    transform: `rotate(${p.rotate}deg)`,
                    flexShrink: 0,
                  }}
                />
              ) : (
                <div style={{ width: 88, height: 88, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', border: `1px solid ${LINE}`, borderRadius: 4, fontSize: 28, flexShrink: 0 }}>
                  📄
                </div>
              )}

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 12.5, wordBreak: 'break-all' }}>
                    {p.file.name}
                    <span style={{ color: MUTE }}>（{(p.file.size / 1024 / 1024).toFixed(2)} MB）</span>
                  </span>
                  <button
                    onClick={() => removeAt(i)}
                    disabled={busy}
                    style={{ background: 'none', border: 'none', color: '#b00', cursor: 'pointer', fontSize: 13, flexShrink: 0 }}
                  >
                    移除
                  </button>
                </div>

                {isImage && (
                  <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={() => update(i, { rotate: (p.rotate + 270) % 360 })} disabled={busy} style={rotateBtn}>
                      ↺ 左轉
                    </button>
                    <button onClick={() => update(i, { rotate: (p.rotate + 90) % 360 })} disabled={busy} style={rotateBtn}>
                      ↻ 右轉
                    </button>
                    {p.rotate !== 0 && <span style={{ fontSize: 11.5, color: MUTE }}>已旋轉 {p.rotate}°</span>}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, marginTop: 7, flexWrap: 'wrap' }}>
                  <select
                    value={p.label}
                    onChange={(e) => update(i, { label: e.target.value })}
                    disabled={busy}
                    style={{ padding: '7px 8px', border: `1px solid ${LINE}`, borderRadius: 4, fontSize: 13 }}
                  >
                    <option value="">類型（選填）</option>
                    {ATTACHMENT_LABELS.map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                  <input
                    value={p.caption}
                    onChange={(e) => update(i, { caption: e.target.value })}
                    disabled={busy}
                    placeholder="這張是什麼（選填）"
                    style={{ flex: 1, minWidth: 130, padding: '7px 9px', border: `1px solid ${LINE}`, borderRadius: 4, fontSize: 13 }}
                  />
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {busy && progress && (
        <div style={{ marginTop: 12, fontSize: 13, color: WINE, fontWeight: 600 }}>{progress}</div>
      )}
      {msg && <div style={{ marginTop: 12, fontSize: 13.5, color: '#b00' }}>{msg}</div>}

      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <button
          onClick={submit}
          disabled={busy}
          style={{ flex: 1, background: busy ? MUTE : WINE, color: '#fff', border: 'none', borderRadius: 5, padding: 12, fontSize: 15, fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}
        >
          {busy ? '處理中…' : picks.length > 0 ? `送出補充（含 ${picks.length} 個附件）` : '送出補充'}
        </button>
        <button
          onClick={() => { setOpen(false); setMsg(''); }}
          disabled={busy}
          style={{ background: 'none', color: MUTE, border: `1px solid ${LINE}`, borderRadius: 5, padding: '12px 18px', fontSize: 14, cursor: 'pointer' }}
        >
          取消
        </button>
      </div>
    </div>
  );
}

const rotateBtn: React.CSSProperties = {
  background: '#fff',
  border: `1px solid ${LINE}`,
  borderRadius: 4,
  padding: '4px 10px',
  fontSize: 12,
  cursor: 'pointer',
  color: '#4A413A',
};
