/**
 * Placeholder — 既有 index.html 內容會在下個 commit migrate 過來。
 * scaffold 階段這頁只用來驗證 Next.js build + routing 通。
 */
export default function Home() {
  return (
    <main
      style={{
        padding: '80px 40px',
        maxWidth: '760px',
        margin: '0 auto',
        fontFamily:
          "-apple-system, BlinkMacSystemFont, system-ui, 'PingFang TC', sans-serif",
      }}
    >
      <p
        style={{
          fontSize: '11px',
          letterSpacing: '0.24em',
          textTransform: 'uppercase',
          color: '#8B1F2F',
          marginBottom: '16px',
        }}
      >
        — nextjs-migration · scaffold
      </p>
      <h1
        style={{
          fontSize: '48px',
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontWeight: 300,
          color: '#1A1612',
          marginBottom: '12px',
        }}
      >
        E118 Dashboard
      </h1>
      <p
        style={{
          fontFamily: "'Noto Serif TC', 'PingFang TC', serif",
          fontSize: '18px',
          color: '#4A413A',
          marginBottom: '24px',
        }}
      >
        Next.js scaffold placeholder · 既有 8 卡 dashboard 內容將在後續 commit migrate 過來。
      </p>
      <ul style={{ listStyle: 'none', padding: 0, marginTop: '32px' }}>
        <li style={{ padding: '8px 0' }}>
          <a
            href="/board"
            style={{ color: '#8B1F2F', textDecoration: 'none', fontSize: '15px' }}
          >
            📢 班級公告欄（建構中） →
          </a>
        </li>
      </ul>
    </main>
  );
}
