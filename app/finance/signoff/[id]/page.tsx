'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import SignaturePad from 'signature_pad';
import Breadcrumb from '@/components/Breadcrumb';
import { deptInfo } from '@/lib/depts';
import AttachmentGrid, { type ViewAttachment } from '@/components/signoff/AttachmentGrid';
import SupplementForm from '@/components/signoff/SupplementForm';

const WINE = '#8B1F2F';
const CREAM = '#FAF7F2';
const INK = '#1A1612';
const MUTE = '#8A7F73';

type Assignment = {
  id?: string;
  signer_account_id?: string;
  signer_username: string | null;
  role_label: string;
  status: string;
  reject_reason?: string | null;
  acted_at?: string | null;
};
type Detail = {
  // 訪客（免登入）模式：API 回 public:true 的公開摘要（無 urls / attachments / 簽名框）
  public?: boolean;
  doc: {
    id: string; title: string; amount: string | null; currency: string;
    purpose: string | null; applicant?: string | null; status: string;
    created_at: string; completed_at?: string | null; owner_dept_id?: string;
    final_pdf_sha256?: string | null;
  };
  assignments: Assignment[];
  urls?: { sheet: string | null; final: string | null };
  attachments?: ViewAttachment[];
  supplements?: {
    id: string;
    note: string | null;
    added_by_name: string | null;
    doc_status_at_add: 'routing' | 'approved';
    signed_count_at_add: number;
    created_at: string;
    attachments: ViewAttachment[];
  }[];
  my_pending_assignment_id?: string | null;
  can_delete?: boolean;
  can_supplement?: boolean;
  can_undo_reject?: boolean;
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
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
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
    // 退回會讓整份單停止簽核、已簽者需重簽，且目前無法重編重送（需作廢重開）。
    // 這種代價的動作不該只用 window.prompt —— 實際發生過簽核人誤觸、
    // 理由欄填「滑到」，兩位已簽者的簽名等於白簽。改為頁內明確確認。
    const reason = rejectReason.trim();
    if (reason.length < 4) {
      setMsg('請填寫至少 4 個字的退回原因');
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/board/signoff/${id}/reject`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }),
    });
    const r = await res.json().catch(() => ({}));
    if (!res.ok) { setMsg(r.error || '退回失敗'); setBusy(false); return; }
    setRejectOpen(false);
    window.location.reload();
  }

  async function doUndoReject() {
    setBusy(true);
    setMsg('');
    const res = await fetch(`/api/board/signoff/${id}/undo-reject`, { method: 'POST' });
    const r = await res.json().catch(() => ({}));
    if (!res.ok) { setMsg(r.error || '撤銷失敗'); setBusy(false); return; }
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

  const breadcrumb = (
    <Breadcrumb items={[
      { label: '班級面板', href: '/' },
      { label: '班級經費中心', href: '/finance' },
      { label: '簽核', href: '/finance/signoff' },
      { label: '明細' },
    ]} />
  );

  if (needLogin) {
    return <>{breadcrumb}<main style={{ minHeight: '100vh', background: CREAM, padding: 24 }}>
      <p>請先<a href={`/board/login?next=/finance/signoff/${id}`} style={{ color: WINE }}>登入幹部帳號</a>。</p>
    </main></>;
  }
  if (err) return <>{breadcrumb}<main style={{ minHeight: '100vh', background: CREAM, padding: 24 }}><p style={{ color: '#b00' }}>{err}</p></main></>;
  if (!d) return <>{breadcrumb}<main style={{ minHeight: '100vh', background: CREAM, padding: 24 }}><p style={{ color: MUTE }}>載入中…</p></main></>;

  const isPublic = d.public === true;
  const signedCount = d.assignments.filter((a) => a.status === 'signed').length;

  return (
    <>
    {breadcrumb}
    <main style={{ minHeight: '100vh', background: CREAM, color: INK, padding: '24px 16px' }}>
      <div style={{ maxWidth: 620, margin: '0 auto' }}>
        <h1 style={{ fontSize: 20, color: WINE, marginBottom: 4 }}>{d.doc.title}</h1>
        <p style={{ color: MUTE, fontSize: 14, marginTop: 0 }}>
          {DOC_STATUS[d.doc.status] ?? d.doc.status}
          {d.doc.amount ? ` · ${d.doc.currency} ${d.doc.amount}` : ''}
          {d.doc.applicant ? ` · 申請人：${d.doc.applicant}` : ''}
        </p>
        {d.doc.purpose && <p style={{ fontSize: 14 }}>用途：{d.doc.purpose}</p>}

        {/* 訪客公開摘要：部門 + 建立/核准完成時間 */}
        {isPublic && (
          <p style={{ color: MUTE, fontSize: 13, marginTop: 0 }}>
            {d.doc.owner_dept_id ? `部門：${deptInfo(d.doc.owner_dept_id).name}　` : ''}
            建立：{d.doc.created_at.slice(0, 10)}
            {d.doc.completed_at ? `　核准完成：${d.doc.completed_at.slice(0, 10)}` : ''}
          </p>
        )}

        {/* 已退回：橫幅置頂，並提供誤觸復原。退回時其他人的簽名未被更動，
            所以撤銷只需把狀態轉回去，不必重建文件、不必重簽。 */}
        {!isPublic && d.doc.status === 'rejected' && (() => {
          const rej = d.assignments.find((a) => a.status === 'rejected');
          return (
            <div style={{ marginTop: 14, padding: '13px 15px', background: '#FDF3F3', border: '1px solid #e0b4b4', borderLeft: '5px solid #b00', borderRadius: 6 }}>
              <div style={{ fontWeight: 600, color: '#b00', marginBottom: 5 }}>這張單已被退回，簽核已停止</div>
              <div style={{ fontSize: 13, color: '#4A413A', lineHeight: 1.8 }}>
                {rej ? `${rej.signer_username ?? '（未知）'}（${rej.role_label}）` : '某位簽核人'}
                {rej?.acted_at ? ` 於 ${rej.acted_at.slice(0, 16).replace('T', ' ')}` : ''} 退回
                {rej?.reject_reason ? `，理由：${rej.reject_reason}` : ''}。
              </div>
              {d.can_undo_reject && (
                <>
                  <div style={{ fontSize: 12.5, color: MUTE, marginTop: 8, lineHeight: 1.7 }}>
                    如果是誤觸，可以直接撤銷：文件回到簽核中、退回者回到待簽，
                    {signedCount > 0 && `其他已簽的 ${signedCount} 位不受影響、不需要重簽。`}
                  </div>
                  <button
                    onClick={doUndoReject}
                    disabled={busy}
                    style={{ marginTop: 10, background: busy ? MUTE : WINE, color: '#fff', border: 'none', borderRadius: 5, padding: '10px 16px', fontSize: 14, fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}
                  >
                    {busy ? '處理中…' : '撤銷退回，恢復簽核'}
                  </button>
                </>
              )}
              {!d.can_undo_reject && (
                <div style={{ fontSize: 12.5, color: MUTE, marginTop: 8, lineHeight: 1.7 }}>
                  若是誤觸，請退回者本人或班代撤銷。
                </div>
              )}
            </div>
          );
        })()}

        {/* 頂部快捷列：簽核表預覽有 420px 高，補充入口若只放在下方會被推出視線外 */}
        {!isPublic && d.can_supplement && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
              marginTop: 14,
              padding: '11px 14px',
              background: '#FFF8E7',
              border: '1px solid #E8D9A8',
              borderRadius: 6,
            }}
          >
            <span style={{ fontSize: 13, color: '#7a5c00', lineHeight: 1.6 }}>
              要補報價單、請款單或說明嗎？補充不會更動已送出的內容，已簽核的人不需重簽。
            </span>
            <a
              href="#supplements"
              style={{
                background: WINE,
                color: '#fff',
                textDecoration: 'none',
                borderRadius: 5,
                padding: '9px 16px',
                fontSize: 14,
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              ＋ 補充資料
            </a>
          </div>
        )}

        {/* 原件（簽核表 / 附件 / 最終 PDF）僅登入幹部可見 */}
        {isPublic ? (
          <p style={{ fontSize: 13, color: MUTE, background: '#F6F0E4', border: '1px solid #E8DFD0', borderRadius: 6, padding: '10px 12px', marginTop: 12 }}>
            原始簽核表與附件僅限幹部登入檢視。
            <a href={`/board/login?next=/finance/signoff/${id}`} style={{ color: WINE, fontWeight: 600, marginLeft: 6 }}>幹部登入 →</a>
          </p>
        ) : (
          <>
            {/* 內嵌框優先顯示「最終 PDF（含簽名）」；尚未產生（簽核中／極少數合成失敗）才退回空白簽核表 */}
            {(d.urls?.final || d.urls?.sheet) && (
              <>
                <p style={{ fontSize: 12, color: MUTE, margin: '10px 0 4px' }}>
                  {d.urls?.final ? '簽核表（含各幹部簽名）' : '簽核表（尚未完成簽核，未含簽名）'}
                </p>
                <iframe
                  src={d.urls?.final || d.urls?.sheet || ''}
                  style={{ width: '100%', height: 420, border: '1px solid #E5DCCB', borderRadius: 4, background: '#fff' }}
                  title={d.urls?.final ? '簽核表（含簽名）' : '簽核表'}
                />
              </>
            )}
            <h2 style={{ fontSize: 15, color: MUTE, borderBottom: '1px solid #E5DCCB', paddingBottom: 6, marginTop: 22 }}>
              原始附件{d.attachments?.length ? `（${d.attachments.length}）` : ''}
            </h2>
            <div style={{ marginTop: 10 }}>
              <AttachmentGrid items={d.attachments ?? []} />
            </div>
            {d.urls?.final && (
              <div style={{ fontSize: 13, marginTop: 10 }}>
                <a href={d.urls.final} target="_blank" rel="noreferrer" style={{ color: WINE, fontWeight: 600 }}>⬇ 下載最終 PDF（含簽名）</a>
              </div>
            )}
          </>
        )}

        {/* 補充資料（0019）：append-only，不動原始附件，故已簽者無須重簽 */}
        {!d.public && (d.supplements?.length || d.can_supplement) ? (
          <div id="supplements" style={{ scrollMarginTop: 16 }}>
            <h2 style={{ fontSize: 15, color: MUTE, borderBottom: '1px solid #E5DCCB', paddingBottom: 6, marginTop: 22 }}>
              補充資料{d.supplements?.length ? `（${d.supplements.length}）` : ''}
            </h2>

            {d.supplements?.map((sup) => (
              <div key={sup.id} style={{ marginTop: 12, padding: 12, background: '#fff', border: '1px solid #E5DCCB', borderLeft: `3px solid ${WINE}`, borderRadius: 4 }}>
                <div style={{ fontSize: 12, color: MUTE, marginBottom: 6 }}>
                  {sup.added_by_name ?? '（未知）'} 於 {sup.created_at.slice(0, 16).replace('T', ' ')} 補充
                  {sup.doc_status_at_add === 'approved'
                    ? '（核准後補充）'
                    : sup.signed_count_at_add > 0
                      ? `（已有 ${sup.signed_count_at_add} 人簽核後補充）`
                      : ''}
                </div>
                {sup.note && (
                  <div style={{ fontSize: 14, color: INK, lineHeight: 1.8, marginBottom: sup.attachments.length ? 10 : 0, whiteSpace: 'pre-wrap' }}>
                    {sup.note}
                  </div>
                )}
                {sup.attachments.length > 0 && <AttachmentGrid items={sup.attachments} />}
              </div>
            ))}

            {d.can_supplement && (
              <div style={{ marginTop: 12 }}>
                <SupplementForm
                  documentId={d.doc.id}
                  signedCount={signedCount}
                  onDone={load}
                />
              </div>
            )}
          </div>
        ) : null}

        {/* 簽核狀態 */}
        <h2 style={{ fontSize: 15, color: MUTE, borderBottom: '1px solid #E5DCCB', paddingBottom: 6, marginTop: 22 }}>簽核進度</h2>
        {d.assignments.map((a, i) => (
          <div key={a.id ?? `${a.role_label}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F0E9DC', fontSize: 14 }}>
            <span>{a.role_label}：{a.signer_username ?? '—'}</span>
            <span style={{ color: a.status === 'signed' ? '#2D5F4E' : a.status === 'rejected' ? '#b00' : MUTE }}>
              {A_STATUS[a.status] ?? a.status}{a.reject_reason ? `（${a.reject_reason}）` : ''}
              {a.acted_at ? ` · ${a.acted_at.slice(0, 10)}` : ''}
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
              <button onClick={() => { setRejectOpen(true); setMsg(''); }} disabled={busy} style={{ background: 'none', color: '#b00', border: '1px solid #e0b4b4', borderRadius: 4, padding: '11px 16px', fontSize: 14, cursor: 'pointer' }}>
                退回
              </button>
            </div>

            {/* 退回確認：代價高（整份停簽、已簽者需重簽、目前無法重編重送），需明確確認 */}
            {rejectOpen && (
              <div style={{ marginTop: 12, padding: 14, background: '#FDF3F3', border: '1px solid #e0b4b4', borderRadius: 6 }}>
                <div style={{ fontWeight: 600, color: '#b00', marginBottom: 6 }}>確定要退回這張單嗎？</div>
                <ul style={{ margin: '0 0 10px', paddingLeft: 20, fontSize: 12.5, color: '#4A413A', lineHeight: 1.9 }}>
                  <li>整份單會立刻停止簽核，其他人不能再簽</li>
                  {signedCount > 0 && <li>已簽核的 {signedCount} 位，簽名會失效、需要重簽</li>}
                  <li>目前退回後<strong>無法重新編輯送出</strong>，要重跑須請班代作廢後整張重開</li>
                </ul>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="退回原因（至少 4 個字，會顯示給發起人與其他簽核人）"
                  rows={3}
                  style={{ width: '100%', padding: '9px 10px', border: '1px solid #e0b4b4', borderRadius: 4, fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.7 }}
                />
                <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                  <button
                    onClick={doReject}
                    disabled={busy || rejectReason.trim().length < 4}
                    style={{ background: busy || rejectReason.trim().length < 4 ? '#c99' : '#b00', color: '#fff', border: 'none', borderRadius: 4, padding: '10px 16px', fontSize: 14, fontWeight: 600, cursor: busy || rejectReason.trim().length < 4 ? 'default' : 'pointer' }}
                  >
                    {busy ? '處理中…' : '確認退回'}
                  </button>
                  <button
                    onClick={() => { setRejectOpen(false); setRejectReason(''); setMsg(''); }}
                    disabled={busy}
                    style={{ background: 'none', color: MUTE, border: '1px solid #D9CDB8', borderRadius: 4, padding: '10px 16px', fontSize: 14, cursor: 'pointer' }}
                  >
                    取消，我要繼續簽
                  </button>
                </div>
              </div>
            )}
            <p style={{ fontSize: 11, color: MUTE, marginTop: 10, marginBottom: 0 }}>本簽署適用班級內部事務，不作為對外法律文件用途。</p>
          </div>
        )}

        {/* 管理動作（僅登入幹部；訪客公開摘要不顯示） */}
        {!isPublic && (
          <div style={{ marginTop: 18, display: 'flex', gap: 14 }}>
            <button onClick={doNudge} style={{ fontSize: 13, color: WINE, background: 'none', border: '1px solid #D9CDB8', borderRadius: 4, padding: '7px 12px', cursor: 'pointer' }}>催簽 / 看誰沒簽</button>
            <button onClick={doVoid} style={{ fontSize: 13, color: MUTE, background: 'none', border: '1px solid #E5DCCB', borderRadius: 4, padding: '7px 12px', cursor: 'pointer' }}>作廢（限班代）</button>
            {d.can_delete && (
              <button onClick={doDelete} disabled={busy} style={{ fontSize: 13, color: '#fff', background: '#b00', border: 'none', borderRadius: 4, padding: '7px 12px', cursor: busy ? 'default' : 'pointer' }}>刪除</button>
            )}
          </div>
        )}

        {msg && <p style={{ marginTop: 14, color: INK, background: '#FBF3D9', border: '1px solid #E8D89A', borderRadius: 4, padding: '8px 10px', fontSize: 14 }}>{msg}</p>}

        <p style={{ marginTop: 24 }}><a href={isPublic ? '/finance' : '/finance/signoff'} style={{ color: MUTE, fontSize: 13 }}>{isPublic ? '← 回經費中心' : '← 回簽核清單'}</a></p>
      </div>
    </main>
    </>
  );
}
