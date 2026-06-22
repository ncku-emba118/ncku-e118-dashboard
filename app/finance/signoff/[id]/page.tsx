'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import SignaturePad from 'signature_pad';
import Breadcrumb from '@/components/Breadcrumb';

const WINE = '#8B1F2F';
const CREAM = '#FAF7F2';
const INK = '#1A1612';
const MUTE = '#8A7F73';

type Assignment = {
  id: string;
  signer_account_id: string;
  signer_username: string | null;
  role_label: string;
  status: string;
  reject_reason: string | null;
  acted_at: string | null;
};
type Detail = {
  doc: {
    id: string; title: string; amount: string | null; currency: string;
    purpose: string | null; applicant: string | null; status: string;
    created_at: string; final_pdf_sha256: string | null;
  };
  assignments: Assignment[];
  urls: { sheet: string | null; final: string | null };
  attachments: { name: string; url: string | null }[];
  my_pending_assignment_id: string | null;
  can_delete: boolean;
};

const DOC_STATUS: Record<string, string> = {
  routing: '簽核中', approved: '✅ 已核准', rejected: '已退回', voided: '已作廢',
};
const A_STATUS: Record<string, string> = { pending: '待簽', signed: '✅ 已簽', rejected: '已退回' };

export default function SignoffDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);

  async function load() {
    const res = await fetch(`/api/board/signoff/${id}`);
    if (res.status === 401) { setNeedLogin(true); return; }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(data.error || '載入失敗'); return; }
    setD(data);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  // signature pad（只在有待簽項時掛載）
  useEffect(() => {
    if (!d?.my_pending_assignment_id || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext('2d')?.scale(ratio, ratio);
    padRef.current = new SignaturePad(canvas, { penColor: INK, backgroundColor: 'rgba(0,0,0,0)' });
    return () => { padRef.current?.off(); padRef.current = null; };
  }, [d?.my_pending_assignment_id]);

  async function doSign() {
    setMsg(null);
    if (!padRef.current || padRef.current.isEmpty()) { setMsg('請先在框內手寫簽名'); return; }
    const dataUrl = padRef.current.toDataURL('image/png');
    setBusy(true);
    try {
      const cRes = await fetch(`/api/board/signoff/${id}/challenge`, { method: 'POST' });
      const c = await cRes.json().catch(() => ({}));
      if (!cRes.ok) { setMsg(c.error || '無法開始簽署'); setBusy(false); return; }
      const sRes = await fetch(`/api/board/signoff/${id}/sign`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nonce: c.nonce, comment: comment.trim() || undefined, signature_data_url: dataUrl }),
      });
      const s = await sRes.json().catch(() => ({}));
      if (!sRes.ok) { setMsg(s.error || '簽署失敗'); setBusy(false); return; }
      window.location.reload();
    } catch (e) { setMsg(`錯誤：${(e as Error).message}`); setBusy(false); }
  }

  async function doReject() {
    const reason = window.prompt('退回原因？');
    if (!reason) return;
    setBusy(true);
    const res = await fetch(`/api/board/signoff/${id}/reject`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }),
    });
    const r = await res.json().catch(() => ({}));
    if (!res.ok) { setMsg(r.error || '退回失敗'); setBusy(false); return; }
    window.location.reload();
  }

  async function doNudge() {
    const res = await fetch(`/api/board/signoff/${id}/nudge`, { method: 'POST' });
    const r = await res.json().catch(() => ({}));
    if (!res.ok) { setMsg(r.error || '催簽失敗'); return; }
    setMsg(r.pending?.length ? `尚未簽核：${r.pending.join('、')}` : '全部已簽核');
  }

  async function doVoid() {
    if (!window.confirm('確定作廢這份簽核？此動作會保留紀錄但文件不再可簽。')) return;
    setBusy(true);
    const res = await fetch(`/api/board/signoff/${id}/void`, { method: 'POST' });
    const r = await res.json().catch(() => ({}));
    if (!res.ok) { setMsg(r.error || '作廢失敗'); setBusy(false); return; }
    window.location.reload();
  }

  async function doDelete() {
    if (!window.confirm('確定「刪除」整張簽核單？會連同憑證 / 簽名 / 最終 PDF 一起永久刪除（系統會保留一筆刪除紀錄）。')) return;
    setBusy(true);
    const res = await fetch(`/api/board/signoff/${id}/delete`, { method: 'POST' });
    const r = await res.json().catch(() => ({}));
    if (!res.ok) { setMsg(r.error || '刪除失敗'); setBusy(false); return; }
    window.location.href = '/finance/signoff';
  }

  if (needLogin) {
    return <main style={{ minHeight: '100vh', background: CREAM, padding: 24 }}>
      <p>請先<a href={`/board/login?next=/finance/signoff/${id}`} style={{ color: WINE }}>登入幹部帳號</a>。</p>
    </main>;
  }
  if (err) return <main style={{ minHeight: '100vh', background: CREAM, padding: 24 }}><p style={{ color: '#b00' }}>{err}</p></main>;
  if (!d) return <main style={{ minHeight: '100vh', background: CREAM, padding: 24 }}><p style={{ color: MUTE }}>載入中…</p></main>;

  return (
    <>
    <Breadcrumb items={[{ label: '班級面板', href: '/' }, { label: '班級經費中心', href: '/finance' }, { label: '簽核', href: '/finance/signoff' }, { label: '明細' }]} />
    <main style={{ minHeight: '100vh', background: CREAM, color: INK, padding: '24px 16px' }}>
      <div style={{ maxWidth: 620, margin: '0 auto' }}>
        <h1 style={{ fontSize: 20, color: WINE, marginBottom: 4 }}>{d.doc.title}</h1>
        <p style={{ color: MUTE, fontSize: 14, marginTop: 0 }}>
          {DOC_STATUS[d.doc.status] ?? d.doc.status}
          {d.doc.amount ? ` · ${d.doc.currency} ${d.doc.amount}` : ''}
          {d.doc.applicant ? ` · 申請人：${d.doc.applicant}` : ''}
        </p>
        {d.doc.purpose && <p style={{ fontSize: 14 }}>用途：{d.doc.purpose}</p>}

        {/* 簽核表 */}
        {d.urls.sheet && (
          <iframe
            src={d.urls.sheet}
            style={{ width: '100%', height: 420, border: '1px solid #E5DCCB', borderRadius: 4, background: '#fff', marginTop: 8 }}
            title="簽核表"
          />
        )}
        <div style={{ fontSize: 13, marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 14 }}>
          {d.attachments.map((a, i) =>
            a.url ? (
              <a key={i} href={a.url} target="_blank" rel="noreferrer" style={{ color: WINE }}>📎 {a.name}</a>
            ) : null,
          )}
          {d.urls.final && <a href={d.urls.final} target="_blank" rel="noreferrer" style={{ color: WINE, fontWeight: 600 }}>⬇ 下載最終 PDF</a>}
        </div>

        {/* 簽核狀態 */}
        <h2 style={{ fontSize: 15, color: MUTE, borderBottom: '1px solid #E5DCCB', paddingBottom: 6, marginTop: 22 }}>簽核進度</h2>
        {d.assignments.map((a) => (
          <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F0E9DC', fontSize: 14 }}>
            <span>{a.role_label}：{a.signer_username ?? '—'}</span>
            <span style={{ color: a.status === 'signed' ? '#2D5F4E' : a.status === 'rejected' ? '#b00' : MUTE }}>
              {A_STATUS[a.status] ?? a.status}{a.reject_reason ? `（${a.reject_reason}）` : ''}
            </span>
          </div>
        ))}

        {/* 我要簽 */}
        {d.my_pending_assignment_id && d.doc.status === 'routing' && (
          <div style={{ marginTop: 22, padding: 14, background: '#fff', border: `1px solid ${WINE}`, borderRadius: 6 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>在下方框內手寫你的簽名</div>
            <canvas
              ref={canvasRef}
              style={{ width: '100%', height: 160, border: '1px dashed #C9A961', borderRadius: 4, touchAction: 'none', background: '#FFFDF8' }}
            />
            <div style={{ marginTop: 6 }}>
              <button onClick={() => padRef.current?.clear()} style={{ fontSize: 13, color: MUTE, background: 'none', border: 'none', cursor: 'pointer' }}>清除重簽</button>
            </div>
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="簽核意見（選填，如：同意）"
              style={{ width: '100%', padding: '9px 10px', border: '1px solid #D9CDB8', borderRadius: 4, fontSize: 14, marginTop: 8, boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button onClick={doSign} disabled={busy} style={{ flex: 1, background: busy ? MUTE : WINE, color: '#fff', border: 'none', borderRadius: 4, padding: 11, fontSize: 15, fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}>
                {busy ? '處理中…' : '送出簽核'}
              </button>
              <button onClick={doReject} disabled={busy} style={{ background: 'none', color: '#b00', border: '1px solid #e0b4b4', borderRadius: 4, padding: '11px 16px', fontSize: 14, cursor: 'pointer' }}>
                退回
              </button>
            </div>
            <p style={{ fontSize: 11, color: MUTE, marginTop: 10, marginBottom: 0 }}>本簽署適用班級內部事務，不作為對外法律文件用途。</p>
          </div>
        )}

        {/* 管理動作 */}
        <div style={{ marginTop: 18, display: 'flex', gap: 14 }}>
          <button onClick={doNudge} style={{ fontSize: 13, color: WINE, background: 'none', border: '1px solid #D9CDB8', borderRadius: 4, padding: '7px 12px', cursor: 'pointer' }}>催簽 / 看誰沒簽</button>
          <button onClick={doVoid} style={{ fontSize: 13, color: MUTE, background: 'none', border: '1px solid #E5DCCB', borderRadius: 4, padding: '7px 12px', cursor: 'pointer' }}>作廢（限班代）</button>
          {d.can_delete && (
            <button onClick={doDelete} disabled={busy} style={{ fontSize: 13, color: '#fff', background: '#b00', border: 'none', borderRadius: 4, padding: '7px 12px', cursor: busy ? 'default' : 'pointer' }}>刪除</button>
          )}
        </div>

        {msg && <p style={{ marginTop: 14, color: INK, background: '#FBF3D9', border: '1px solid #E8D89A', borderRadius: 4, padding: '8px 10px', fontSize: 14 }}>{msg}</p>}

        <p style={{ marginTop: 24 }}><a href="/finance/signoff" style={{ color: MUTE, fontSize: 13 }}>← 回簽核清單</a></p>
      </div>
    </main>
    </>
  );
}
