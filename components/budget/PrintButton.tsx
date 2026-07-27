'use client';

/**
 * 結算單下載 PDF 按鈕。
 *
 * 走瀏覽器列印（與 /budget/signoff 的下載鈕同一個做法），列印樣式定義在
 * app/budget/layout.tsx 的 @media print；不另外在 Netlify 上架 server 端 PDF 引擎。
 */
export default function PrintButton({ label = '⬇ 下載 PDF' }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="no-print" style={style}>
      {label}
    </button>
  );
}

const style: React.CSSProperties = {
  appearance: 'none',
  border: '1px solid #8B1F2F',
  background: '#8B1F2F',
  color: '#fff',
  borderRadius: 4,
  padding: '9px 20px',
  fontSize: 13.5,
  fontWeight: 600,
  fontFamily: "'Noto Serif TC', 'PingFang TC', 'Songti TC', serif",
  cursor: 'pointer',
  letterSpacing: 0.5,
};
