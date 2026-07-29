'use client';

/**
 * 結算單頁「憑證」區塊——四位幹部（班代／執行副班代／秘書長／財務長）
 * 登入後可點按鈕下載該結算單對應簽核單的原始附件（發票／收據）。
 *
 * 只在 server component（app/budget/settlement/[slug]/page.tsx）已經判斷
 * session 存在且 canDownloadSettlementProof(session) 為真時才會被渲染；
 * 但這裡仍完整走 GET /api/board/settlement/[slug]/attachments，該 route
 * 會再驗一次權限，不能只靠「這顆按鈕有沒有出現」把關。
 *
 * signed URL 走「點擊當下才 fetch」——SIGNED_READ_URL_TTL_S 只有 5 分鐘，
 * 不能在頁面渲染時就先產生連結。
 */
import { useState } from 'react';
import AttachmentGrid, { type ViewAttachment } from '@/components/signoff/AttachmentGrid';

const WINE = '#8B1F2F';
const WINE_DEEP = '#6B1622';
const MUTE = '#8A7F73';
const LINE = '#E8DFD0';
const TC = "'Noto Serif TC', 'PingFang TC', 'Songti TC', serif";

type FetchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; attachments: ViewAttachment[] };

export default function SettlementProofPanel({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<FetchState>({ status: 'idle' });

  async function handleToggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (state.status === 'ready') return; // 已抓過，直接顯示（重新整理頁面才會重抓新的 signed URL）
    setState({ status: 'loading' });
    try {
      const res = await fetch(`/api/board/settlement/${slug}/attachments`, {
        method: 'GET',
        credentials: 'same-origin',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setState({ status: 'error', message: body?.error || `讀取失敗（${res.status}）` });
        return;
      }
      const body = (await res.json()) as { attachments: ViewAttachment[] };
      setState({ status: 'ready', attachments: body.attachments ?? [] });
    } catch {
      setState({ status: 'error', message: '網路錯誤，請稍後再試' });
    }
  }

  return (
    <div className="no-print" style={{ marginTop: 18 }}>
      <button type="button" onClick={handleToggle} style={btnStyle}>
        {open ? '收起憑證' : '📎 顯示憑證'}
      </button>

      {open && (
        <div style={{ marginTop: 12, padding: 14, border: `1px solid ${LINE}`, borderRadius: 6, background: '#FBF8F2' }}>
          <div style={{ fontFamily: TC, fontSize: 14, color: WINE_DEEP, fontWeight: 600, marginBottom: 10 }}>
            結算單原始憑證
          </div>
          {state.status === 'loading' && <div style={{ fontSize: 13, color: MUTE }}>讀取中…</div>}
          {state.status === 'error' && <div style={{ fontSize: 13, color: WINE }}>{state.message}</div>}
          {state.status === 'ready' && state.attachments.length === 0 && (
            <div style={{ fontSize: 13, color: MUTE }}>此結算單尚無憑證</div>
          )}
          {state.status === 'ready' && state.attachments.length > 0 && (
            <AttachmentGrid items={state.attachments} />
          )}
        </div>
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  appearance: 'none',
  border: `1px solid ${WINE}`,
  background: '#fff',
  color: WINE,
  borderRadius: 4,
  padding: '9px 20px',
  fontSize: 13.5,
  fontWeight: 600,
  fontFamily: TC,
  cursor: 'pointer',
  letterSpacing: 0.5,
};
