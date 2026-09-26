'use client';

/**
 * 月報上傳表單（/finance 頁「月報下載」區塊）。
 * 只在 session 存在時渲染（由 page.tsx server component 判斷後決定要不要掛載，
 * 見 app/finance/page.tsx canUpload）——未登入者完全看不到這塊，不用額外請求試探。
 * 送出後用 window.location.reload() 讓 server component 重新讀 listFinanceReports()，
 * 不另外维护本地 state，跟頁面其餘部份（server-rendered）保持同一份真相。
 */
import { useState } from 'react';

const WINE = '#8B1F2F';
const MUTE = '#8A7F73';
const LINE = '#E5DCCB';

export default function ReportUploadForm() {
  const [periodLabel, setPeriodLabel] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!file) { setErr('請選擇檔案'); return; }
    if (!periodLabel.trim()) { setErr('請填期別名稱，例如「9 月收支月報」'); return; }
    setSubmitting(true);
    const form = new FormData();
    form.set('period_label', periodLabel.trim());
    form.set('file', file);
    const res = await fetch('/api/board/finance/reports', { method: 'POST', body: form });
    const data = await res.json().catch(() => ({}));
    setSubmitting(false);
    if (!res.ok) { setErr(data.error || '上傳失敗'); return; }
    window.location.reload();
  }

  return (
    <form
      onSubmit={submit}
      style={{
        display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
        background: '#fff', border: `1px dashed ${LINE}`, borderRadius: 8,
        padding: '13px 14px', marginBottom: 9,
      }}
    >
      <input
        type="text"
        value={periodLabel}
        onChange={(e) => setPeriodLabel(e.target.value)}
        placeholder="期別名稱，例如「9 月收支月報」"
        style={{ flex: '1 1 200px', fontSize: 13, padding: '7px 9px', border: `1px solid ${LINE}`, borderRadius: 6 }}
      />
      <input
        type="file"
        accept=".pdf,.xls,.xlsx"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        style={{ fontSize: 12.5, flex: '1 1 180px' }}
      />
      <button
        type="submit"
        disabled={submitting}
        style={{
          fontSize: 13, fontWeight: 600, color: '#fff', background: WINE,
          border: 'none', borderRadius: 6, padding: '8px 16px', cursor: 'pointer',
          opacity: submitting ? 0.6 : 1,
        }}
      >
        {submitting ? '上傳中…' : '⬆ 上傳財務長 Excel 檔案'}
      </button>
      {err && <div style={{ width: '100%', fontSize: 12, color: WINE }}>{err}</div>}
      <div style={{ width: '100%', fontSize: 11, color: MUTE }}>
        接受 PDF / Excel（.xls .xlsx），15MB 以內。上傳的原始檔案不對外公開，全班只會看到整理過的收支報表。
      </div>
    </form>
  );
}
