'use client';

import { Fragment, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useParams } from 'next/navigation';
import SignaturePad from 'signature_pad';
import Breadcrumb from '@/components/Breadcrumb';
import { deptInfo } from '@/lib/depts';
import AttachmentGrid, { type ViewAttachment } from '@/components/signoff/AttachmentGrid';
import SupplementForm from '@/components/signoff/SupplementForm';

const WINE = '#8B1F2F';
const WINE_DEEP = '#6B1622';
const GOLD = '#C9A961';
const CREAM = '#FAF7F2';
const INK = '#1A1612';
const MUTE = '#8A7F73';
const GREEN = '#2D5F4E';
const LINE = '#E5DCCB';

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
  has_stored_signature?: boolean;
  can_delete?: boolean;
  can_supplement?: boolean;
  can_undo_reject?: boolean;
};

const DOC_STATUS: Record<string, string> = {
  routing: '簽核中', approved: '✅ 已核准', rejected: '已退回', voided: '已作廢',
};
const A_STATUS: Record<string, string> = { pending: '待簽', signed: '✅ 已簽', rejected: '已退回' };

// 狀態徽章：色點 + 短標，取代舊的一行純文字，讓狀態一眼可辨（UI-only）
const STATUS_BADGE: Record<string, { label: string; bg: string; fg: string; dot: string }> = {
  routing: { label: '簽核中', bg: '#FBF3D9', fg: '#7A5C00', dot: '#C9852E' },
  approved: { label: '已核准', bg: '#E7F1EC', fg: '#1F5140', dot: GREEN },
  rejected: { label: '已退回', bg: '#FDECEC', fg: '#9B1B1B', dot: '#B00020' },
  voided: { label: '已作廢', bg: '#EFECE7', fg: '#6B6258', dot: MUTE },
};

// 全域樣式（bottom sheet 進場動畫 + 減動偏好）
const SHEET_KEYFRAMES = `
@keyframes e118SheetUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
@keyframes e118Fade{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion: reduce){
  [data-e118-sheet],[data-e118-backdrop]{animation:none !important}
}
`;

const cardStyle: CSSProperties = {
  background: '#fff',
  border: `1px solid ${LINE}`,
  borderRadius: 14,
  padding: '18px 18px 20px',
  boxShadow: '0 1px 2px rgba(26,22,18,0.04)',
};
const sectionH2: CSSProperties = {
  fontSize: 13.5,
  fontWeight: 700,
  letterSpacing: '.05em',
  color: MUTE,
  borderBottom: `1px solid ${LINE}`,
  paddingBottom: 8,
  margin: 0,
};

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
  // 一鍵蓋章 vs 手寫：有預存簽名時預設收合手寫、只露一鍵蓋章鍵（§1-6）
  const [handwriteOpen, setHandwriteOpen] = useState(false);
  // 手寫流程「存為預存簽名」勾選，預設勾選（§1-6）
  const [saveAsStored, setSaveAsStored] = useState(true);
  // UI：簽核動作改「主按鈕 → 底部彈框」，簽名/退回都在 sheet 內完成
  const [sheetOpen, setSheetOpen] = useState(false);
  // UI：簽核表 PDF 大框改為可收合，預設收起，不擠壓主流程
  const [pdfOpen, setPdfOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  async function load() {
    const res = await fetch(`/api/board/signoff/${id}`);
    if (res.status === 401) { setNeedLogin(true); return; }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(data.error || '載入失敗'); return; }
    setD(data);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  // signature pad：canvas 現在只在 sheet 開啟且進入手寫時才存在，
  // 故把 sheetOpen / rejectOpen 一併納入 deps，canvas 現身時才初始化 signature_pad。
  useEffect(() => {
    if (!d?.my_pending_assignment_id || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext('2d')?.scale(ratio, ratio);
    padRef.current = new SignaturePad(canvas, { penColor: INK, backgroundColor: 'rgba(0,0,0,0)' });
    return () => { padRef.current?.off(); padRef.current = null; };
  }, [d?.my_pending_assignment_id, d?.has_stored_signature, handwriteOpen, rejectOpen, sheetOpen]);

  // sheet 開啟時鎖背景捲動 + 支援 Esc 關閉（iOS bottom sheet 質感）
  useEffect(() => {
    if (!sheetOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sheetRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setSheetOpen(false); setRejectOpen(false); setHandwriteOpen(false); setMsg(''); }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [sheetOpen]);

  function openSheet() { setSheetOpen(true); setMsg(''); }
  function closeSheet() { setSheetOpen(false); setRejectOpen(false); setHandwriteOpen(false); setMsg(''); }

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
        body: JSON.stringify({ nonce: c.nonce, comment: comment.trim() || undefined, signature_data_url: dataUrl, save_as_stored: saveAsStored }),
      });
      const s = await sRes.json().catch(() => ({}));
      if (!sRes.ok) { setMsg(s.error || '簽署失敗'); setBusy(false); return; }
      window.location.reload();
    } catch (e) { setMsg(`錯誤：${(e as Error).message}`); setBusy(false); }
  }

  // 一鍵蓋預存簽名（§1-4）：不需手寫、直接以預存簽名完成本單
  async function doSignStamp() {
    setMsg(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/board/signoff/${id}/sign-stamp`, { method: 'POST' });
      const r = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(r.error || '一鍵簽核失敗'); setBusy(false); return; }
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
  const attaches = d.attachments ?? [];
  const badge = STATUS_BADGE[d.doc.status];
  // 輪到我簽且單據仍在 routing → 顯示 sticky 主按鈕 / sheet
  const canSignNow = !isPublic && !!d.my_pending_assignment_id && d.doc.status === 'routing';
  // 有預存簽名 → sheet 內先露「一鍵蓋章」選單；點「改用手寫」才展開 canvas
  const canStamp = canSignNow && !!d.has_stored_signature;
  const sheetShowReject = rejectOpen;
  const sheetShowMenu = canStamp && !handwriteOpen && !rejectOpen;
  const sheetShowCanvas = !rejectOpen && (!canStamp || handwriteOpen);

  // 摘要卡的資訊列（只列有值的欄位）
  const infoRows: { label: string; value: string }[] = [];
  if (d.doc.purpose) infoRows.push({ label: '用途', value: d.doc.purpose });
  if (d.doc.applicant) infoRows.push({ label: '申請人', value: d.doc.applicant });
  if (d.doc.owner_dept_id) infoRows.push({ label: '部門', value: deptInfo(d.doc.owner_dept_id).name });
  infoRows.push({ label: '建立', value: d.doc.created_at.slice(0, 10) });
  if (isPublic && d.doc.completed_at) infoRows.push({ label: '核准完成', value: d.doc.completed_at.slice(0, 10) });

  return (
    <>
    <style>{SHEET_KEYFRAMES}</style>
    {breadcrumb}
    <main style={{ minHeight: '100vh', background: CREAM, color: INK, padding: '20px 16px 8px' }}>
      <div style={{ maxWidth: 620, margin: '0 auto' }}>

        {/* ── 單據摘要（置頂）：金額醒目、標題/用途/申請人/部門一眼看完 ── */}
        <section style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: badge?.bg ?? '#EFECE7', color: badge?.fg ?? MUTE,
              fontSize: 12.5, fontWeight: 700, padding: '4px 11px', borderRadius: 999,
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: badge?.dot ?? MUTE }} />
              {badge?.label ?? DOC_STATUS[d.doc.status] ?? d.doc.status}
            </span>
            {d.doc.owner_dept_id && (
              <span style={{ fontSize: 12.5, color: MUTE }}>{deptInfo(d.doc.owner_dept_id).name}板</span>
            )}
          </div>

          <h1 style={{ fontSize: 20, lineHeight: 1.35, color: WINE, margin: 0, fontWeight: 700 }}>{d.doc.title}</h1>

          {d.doc.amount && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12.5, color: MUTE, letterSpacing: '.04em', marginBottom: 3 }}>金額</div>
              <div style={{ fontSize: 27, fontWeight: 800, color: INK, lineHeight: 1.05, letterSpacing: '-.01em' }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: MUTE, marginRight: 6 }}>{d.doc.currency}</span>
                {d.doc.amount}
              </div>
            </div>
          )}

          {infoRows.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '10px 16px', marginTop: 18, fontSize: 16, lineHeight: 1.55 }}>
              {infoRows.map((r) => (
                <Fragment key={r.label}>
                  <span style={{ color: MUTE, fontSize: 13.5, paddingTop: 2 }}>{r.label}</span>
                  <span style={{ color: INK, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{r.value}</span>
                </Fragment>
              ))}
            </div>
          )}

          {/* 附件縮圖：讓簽核者一進來就知道有哪些憑證，點一下捲到完整附件區 */}
          {!isPublic && attaches.length > 0 && (
            <a href="#attachments" style={{
              display: 'flex', alignItems: 'center', gap: 10, marginTop: 18, paddingTop: 16,
              borderTop: `1px solid ${LINE}`, textDecoration: 'none',
            }}>
              <div style={{ display: 'flex', gap: 6 }}>
                {attaches.slice(0, 4).map((a, i) => {
                  const isImg = (a.mime ?? '').startsWith('image/');
                  return isImg && a.url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- Supabase 短效 signed URL
                    <img key={i} src={a.url} alt="" style={{ width: 46, height: 46, objectFit: 'cover', borderRadius: 8, border: `1px solid ${LINE}`, background: '#F4EFE6', display: 'block' }} />
                  ) : (
                    <div key={i} style={{ width: 46, height: 46, borderRadius: 8, border: `1px solid ${LINE}`, background: '#F4EFE6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>📄</div>
                  );
                })}
              </div>
              <span style={{ fontSize: 14, color: WINE, fontWeight: 600 }}>
                {attaches.length} 份附件{attaches.length > 4 ? `（另 ${attaches.length - 4}）` : ''} ›
              </span>
            </a>
          )}
        </section>

        {/* 已退回：橫幅置頂，並提供誤觸復原。退回時其他人的簽名未被更動，
            所以撤銷只需把狀態轉回去，不必重建文件、不必重簽。 */}
        {!isPublic && d.doc.status === 'rejected' && (() => {
          const rej = d.assignments.find((a) => a.status === 'rejected');
          return (
            <div style={{ marginTop: 14, padding: '14px 16px', background: '#FDF3F3', border: '1px solid #e0b4b4', borderLeft: '5px solid #b00', borderRadius: 8 }}>
              <div style={{ fontWeight: 700, color: '#b00', marginBottom: 5, fontSize: 15 }}>這張單已被退回，簽核已停止</div>
              <div style={{ fontSize: 13.5, color: '#4A413A', lineHeight: 1.8 }}>
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
                    style={{ marginTop: 12, minHeight: 44, background: busy ? MUTE : WINE, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 15, fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}
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

        {/* 頂部快捷列：補充入口 */}
        {!isPublic && d.can_supplement && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            flexWrap: 'wrap', marginTop: 14, padding: '12px 15px',
            background: '#FFF8E7', border: '1px solid #E8D9A8', borderRadius: 8,
          }}>
            <span style={{ fontSize: 13, color: '#7a5c00', lineHeight: 1.6, flex: '1 1 200px' }}>
              要補報價單、請款單或說明嗎？補充不會更動已送出的內容，已簽核的人不需重簽。
            </span>
            <a href="#supplements" style={{
              background: WINE, color: '#fff', textDecoration: 'none', borderRadius: 8,
              padding: '10px 16px', fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', minHeight: 44,
              display: 'inline-flex', alignItems: 'center',
            }}>
              ＋ 補充資料
            </a>
          </div>
        )}

        {/* 原件（簽核表 / 附件 / 最終 PDF）僅登入幹部可見 */}
        {isPublic ? (
          <p style={{ fontSize: 13.5, color: MUTE, background: '#F6F0E4', border: '1px solid #E8DFD0', borderRadius: 8, padding: '12px 14px', marginTop: 14, lineHeight: 1.7 }}>
            原始簽核表與附件僅限幹部登入檢視。
            <a href={`/board/login?next=/finance/signoff/${id}`} style={{ color: WINE, fontWeight: 600, marginLeft: 6 }}>幹部登入 →</a>
          </p>
        ) : (
          <>
            {/* 原始附件：簽核者真正要看的憑證，擺在 PDF 之前 */}
            <section id="attachments" style={{ scrollMarginTop: 16, marginTop: 24 }}>
              <h2 style={sectionH2}>原始附件{attaches.length ? `（${attaches.length}）` : ''}</h2>
              <div style={{ marginTop: 12 }}>
                <AttachmentGrid items={attaches} />
              </div>
            </section>

            {/* 簽核表 PDF：改為可收合，預設收起，不再用 420px 大白框擠壓主流程 */}
            {(d.urls?.final || d.urls?.sheet) && (
              <section style={{ marginTop: 18 }}>
                <button
                  type="button"
                  onClick={() => setPdfOpen((v) => !v)}
                  aria-expanded={pdfOpen}
                  style={{
                    width: '100%', minHeight: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 10, padding: '12px 15px', background: '#fff', border: `1px solid ${LINE}`,
                    borderRadius: pdfOpen ? '10px 10px 0 0' : 10, cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                    <span style={{ fontSize: 17 }}>📄</span>
                    <span style={{ fontSize: 14.5, fontWeight: 600, color: INK }}>
                      {d.urls?.final ? '簽核表（含各幹部簽名）' : '簽核表（尚未完成簽核，未含簽名）'}
                    </span>
                  </span>
                  <span style={{ fontSize: 13, color: WINE, fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {pdfOpen ? '收合 ▲' : '展開查看 ▼'}
                  </span>
                </button>
                {pdfOpen && (
                  <iframe
                    src={d.urls?.final || d.urls?.sheet || ''}
                    style={{ width: '100%', height: 460, border: `1px solid ${LINE}`, borderTop: 'none', borderRadius: '0 0 10px 10px', background: '#fff', display: 'block' }}
                    title={d.urls?.final ? '簽核表（含簽名）' : '簽核表'}
                  />
                )}
              </section>
            )}

            {d.urls?.final && (
              <div style={{ fontSize: 14, marginTop: 12 }}>
                <a href={d.urls.final} target="_blank" rel="noreferrer" style={{ color: WINE, fontWeight: 600 }}>⬇ 下載最終 PDF（含簽名）</a>
              </div>
            )}
          </>
        )}

        {/* 補充資料（0019）：append-only，不動原始附件，故已簽者無須重簽 */}
        {!d.public && (d.supplements?.length || d.can_supplement) ? (
          <div id="supplements" style={{ scrollMarginTop: 16 }}>
            <h2 style={{ ...sectionH2, marginTop: 24 }}>
              補充資料{d.supplements?.length ? `（${d.supplements.length}）` : ''}
            </h2>

            {d.supplements?.map((sup) => (
              <div key={sup.id} style={{ marginTop: 12, padding: 13, background: '#fff', border: `1px solid ${LINE}`, borderLeft: `3px solid ${WINE}`, borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: MUTE, marginBottom: 6 }}>
                  {sup.added_by_name ?? '（未知）'} 於 {sup.created_at.slice(0, 16).replace('T', ' ')} 補充
                  {sup.doc_status_at_add === 'approved'
                    ? '（核准後補充）'
                    : sup.signed_count_at_add > 0
                      ? `（已有 ${sup.signed_count_at_add} 人簽核後補充）`
                      : ''}
                </div>
                {sup.note && (
                  <div style={{ fontSize: 15, color: INK, lineHeight: 1.8, marginBottom: sup.attachments.length ? 10 : 0, whiteSpace: 'pre-wrap' }}>
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

        {/* 簽核進度 */}
        <section style={{ marginTop: 24 }}>
          <h2 style={sectionH2}>簽核進度</h2>
          <div style={{ marginTop: 4 }}>
            {d.assignments.map((a, i) => (
              <div key={a.id ?? `${a.role_label}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '11px 0', borderBottom: '1px solid #F0E9DC', fontSize: 15 }}>
                <span>{a.role_label}：{a.signer_username ?? '—'}</span>
                <span style={{ textAlign: 'right', color: a.status === 'signed' ? GREEN : a.status === 'rejected' ? '#b00' : MUTE }}>
                  {A_STATUS[a.status] ?? a.status}{a.reject_reason ? `（${a.reject_reason}）` : ''}
                  {a.acted_at ? ` · ${a.acted_at.slice(0, 10)}` : ''}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* 管理動作（僅登入幹部；訪客公開摘要不顯示） */}
        {!isPublic && (
          <div style={{ marginTop: 20, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={doNudge} style={{ minHeight: 40, fontSize: 13.5, color: WINE, background: 'none', border: '1px solid #D9CDB8', borderRadius: 8, padding: '8px 14px', cursor: 'pointer' }}>催簽 / 看誰沒簽</button>
            <button onClick={doVoid} style={{ minHeight: 40, fontSize: 13.5, color: MUTE, background: 'none', border: `1px solid ${LINE}`, borderRadius: 8, padding: '8px 14px', cursor: 'pointer' }}>作廢（限班代）</button>
            {d.can_delete && (
              <button onClick={doDelete} disabled={busy} style={{ minHeight: 40, fontSize: 13.5, color: '#fff', background: '#b00', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: busy ? 'default' : 'pointer' }}>刪除</button>
            )}
          </div>
        )}

        {/* 頁面層訊息（sheet 關閉時；催簽 / 作廢等回饋） */}
        {msg && !sheetOpen && (
          <p style={{ marginTop: 14, color: INK, background: '#FBF3D9', border: '1px solid #E8D89A', borderRadius: 8, padding: '10px 12px', fontSize: 14 }}>{msg}</p>
        )}

        <p style={{ marginTop: 24 }}><a href={isPublic ? '/finance' : '/finance/signoff'} style={{ color: MUTE, fontSize: 13.5 }}>{isPublic ? '← 回經費中心' : '← 回簽核清單'}</a></p>

        {/* ── sticky 主按鈕：只在「輪到我簽 + routing」時出現，點開底部彈框 ── */}
        {canSignNow && (
          <div style={{
            position: 'sticky', bottom: 0, zIndex: 20, margin: '20px -16px 0',
            padding: '12px 16px', paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
            background: 'rgba(250,247,242,0.86)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
            borderTop: `1px solid ${LINE}`,
          }}>
            <button
              onClick={openSheet}
              style={{
                width: '100%', minHeight: 54, background: WINE, color: '#fff', border: 'none',
                borderRadius: 12, fontSize: 18, fontWeight: 700, cursor: 'pointer',
                boxShadow: '0 6px 18px rgba(139,31,47,0.30)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              簽核這張單
            </button>
            <div style={{ textAlign: 'center', fontSize: 12, color: MUTE, marginTop: 7 }}>
              {canStamp ? '可一鍵蓋預存簽名，或改手寫' : '手寫簽名，或退回'}
            </div>
          </div>
        )}
      </div>
    </main>

    {/* ── 底部彈框（bottom sheet）：簽名 / 退回都在這裡完成 ── */}
    {sheetOpen && canSignNow && (
      <div
        data-e118-backdrop
        onClick={closeSheet}
        style={{
          position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(20,15,12,0.45)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center', animation: 'e118Fade .2s ease',
        }}
      >
        <div
          ref={sheetRef}
          data-e118-sheet
          role="dialog"
          aria-modal="true"
          aria-label={sheetShowReject ? '退回這張單' : '簽核這張單'}
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%', maxWidth: 620, background: CREAM, borderRadius: '18px 18px 0 0',
            maxHeight: '90vh', overflowY: 'auto', padding: '0 18px',
            paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
            boxShadow: '0 -8px 40px rgba(0,0,0,0.25)', outline: 'none',
            animation: 'e118SheetUp .3s cubic-bezier(.32,.72,0,1)',
          }}
        >
          {/* sticky 頂欄：抓握條 + 標題 + 關閉 */}
          <div style={{ position: 'sticky', top: 0, background: CREAM, paddingTop: 10, zIndex: 1 }}>
            <div style={{ width: 40, height: 5, borderRadius: 3, background: '#D9CDB8', margin: '0 auto 12px' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottom: `1px solid ${LINE}` }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: INK }}>{sheetShowReject ? '退回這張單' : '簽核這張單'}</span>
              <button onClick={closeSheet} aria-label="關閉" style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: '#EFE9DF', color: MUTE, fontSize: 17, cursor: 'pointer', flexShrink: 0 }}>✕</button>
            </div>
          </div>

          <div style={{ paddingTop: 18 }}>
            {/* 摘要提示，讓人在彈框裡也記得在簽什麼 */}
            <div style={{ fontSize: 14, color: MUTE, lineHeight: 1.6, marginBottom: 16 }}>
              <span style={{ color: INK, fontWeight: 600 }}>{d.doc.title}</span>
              {d.doc.amount ? ` · ${d.doc.currency} ${d.doc.amount}` : ''}
            </div>

            {/* ① 選單：有預存簽名 → 一鍵蓋章為主，其餘為次選 */}
            {sheetShowMenu && (
              <>
                <button onClick={doSignStamp} disabled={busy} style={{ width: '100%', minHeight: 54, background: busy ? MUTE : GREEN, color: '#fff', border: 'none', borderRadius: 12, padding: 14, fontSize: 18, fontWeight: 700, cursor: busy ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  {busy ? '處理中…' : '同意．蓋我的簽名'}
                </button>
                <p style={{ fontSize: 12.5, color: MUTE, textAlign: 'center', margin: '8px 0 0', lineHeight: 1.6 }}>
                  會用你先前存下的預存簽名完成這張單
                </p>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0' }}>
                  <span style={{ flex: 1, height: 1, background: LINE }} />
                  <span style={{ fontSize: 12.5, color: MUTE }}>或</span>
                  <span style={{ flex: 1, height: 1, background: LINE }} />
                </div>

                <button onClick={() => { setHandwriteOpen(true); setMsg(''); }} disabled={busy} style={{ width: '100%', minHeight: 48, background: '#fff', color: WINE, border: `1px solid ${WINE}`, borderRadius: 10, padding: 12, fontSize: 15.5, fontWeight: 600, cursor: 'pointer', marginBottom: 10 }}>
                  改用手寫簽名
                </button>
                <button onClick={() => { setRejectOpen(true); setMsg(''); }} disabled={busy} style={{ width: '100%', minHeight: 48, background: 'none', color: '#b00', border: '1px solid #e0b4b4', borderRadius: 10, padding: 12, fontSize: 15.5, fontWeight: 600, cursor: 'pointer' }}>
                  退回這張單
                </button>
              </>
            )}

            {/* ② 手寫簽名：無預存簽名時直接顯示；有預存簽名時點「改用手寫」才展開 */}
            {sheetShowCanvas && (
              <>
                {canStamp && (
                  <button onClick={() => { setHandwriteOpen(false); setMsg(''); }} style={{ background: 'none', border: 'none', color: WINE, fontSize: 14, cursor: 'pointer', padding: '2px 0', marginBottom: 10 }}>
                    ‹ 回上一步（改用一鍵蓋章）
                  </button>
                )}
                <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 15.5 }}>在下方框內手寫你的簽名</div>
                <canvas
                  ref={canvasRef}
                  style={{ width: '100%', height: 180, border: '1px dashed #C9A961', borderRadius: 10, touchAction: 'none', background: '#FFFDF8', display: 'block' }}
                />
                <div style={{ marginTop: 8 }}>
                  <button onClick={() => padRef.current?.clear()} style={{ minHeight: 40, fontSize: 13.5, color: MUTE, background: 'none', border: 'none', cursor: 'pointer', padding: '6px 2px' }}>清除重簽</button>
                </div>
                <input
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="簽核意見（選填，如：同意）"
                  style={{ width: '100%', padding: '12px 12px', border: '1px solid #D9CDB8', borderRadius: 10, fontSize: 16, marginTop: 6, boxSizing: 'border-box' }}
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, fontSize: 14, color: '#4A413A', cursor: 'pointer', minHeight: 44 }}>
                  <input type="checkbox" checked={saveAsStored} onChange={(e) => setSaveAsStored(e.target.checked)} style={{ width: 20, height: 20, flexShrink: 0 }} />
                  存為我的預存簽名（日後可一鍵簽核）
                </label>
                <button onClick={doSign} disabled={busy} style={{ width: '100%', minHeight: 54, marginTop: 16, background: busy ? MUTE : WINE, color: '#fff', border: 'none', borderRadius: 12, padding: 14, fontSize: 18, fontWeight: 700, cursor: busy ? 'default' : 'pointer' }}>
                  {busy ? '處理中…' : '送出簽核'}
                </button>
                <button onClick={() => { setRejectOpen(true); setMsg(''); }} disabled={busy} style={{ width: '100%', minHeight: 48, marginTop: 10, background: 'none', color: '#b00', border: '1px solid #e0b4b4', borderRadius: 10, padding: 12, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
                  改為退回
                </button>
              </>
            )}

            {/* ③ 退回：代價高（整份停簽、已簽者需重簽、目前無法重編重送），理由必填 */}
            {sheetShowReject && (
              <>
                <button onClick={() => { setRejectOpen(false); setRejectReason(''); setMsg(''); }} disabled={busy} style={{ background: 'none', border: 'none', color: WINE, fontSize: 14, cursor: 'pointer', padding: '2px 0', marginBottom: 12 }}>
                  ‹ 我要繼續簽，不退回
                </button>
                <div style={{ fontWeight: 700, color: '#b00', marginBottom: 8, fontSize: 15.5 }}>退回前請確認</div>
                <ul style={{ margin: '0 0 12px', paddingLeft: 20, fontSize: 13, color: '#4A413A', lineHeight: 1.9 }}>
                  <li>整份單會立刻停止簽核，其他人不能再簽</li>
                  {signedCount > 0 && <li>已簽核的 {signedCount} 位，簽名會失效、需要重簽</li>}
                  <li>目前退回後<strong>無法重新編輯送出</strong>，要重跑須請班代作廢後整張重開</li>
                </ul>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="退回原因（至少 4 個字，會顯示給發起人與其他簽核人）"
                  rows={3}
                  style={{ width: '100%', padding: '12px 12px', border: '1px solid #e0b4b4', borderRadius: 10, fontSize: 16, boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.7 }}
                />
                <button
                  onClick={doReject}
                  disabled={busy || rejectReason.trim().length < 4}
                  style={{ width: '100%', minHeight: 54, marginTop: 12, background: busy || rejectReason.trim().length < 4 ? '#c99' : '#b00', color: '#fff', border: 'none', borderRadius: 12, padding: 14, fontSize: 17, fontWeight: 700, cursor: busy || rejectReason.trim().length < 4 ? 'default' : 'pointer' }}
                >
                  {busy ? '處理中…' : '確認退回'}
                </button>
              </>
            )}

            {/* sheet 內訊息（簽署 / 退回錯誤就地顯示，不必捲到頁尾找） */}
            {msg && (
              <p style={{ marginTop: 14, color: INK, background: '#FBF3D9', border: '1px solid #E8D89A', borderRadius: 8, padding: '10px 12px', fontSize: 14 }}>{msg}</p>
            )}

            <p style={{ fontSize: 11.5, color: MUTE, marginTop: 16, marginBottom: 4, textAlign: 'center', lineHeight: 1.6 }}>本簽署適用班級內部事務，不作為對外法律文件用途。</p>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
