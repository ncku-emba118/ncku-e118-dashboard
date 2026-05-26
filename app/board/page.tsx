import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'E118 班級公告欄',
  description: 'E118 班級公告 / 留言 / 推播訂閱',
};

/**
 * /board placeholder
 * 完整功能（公告 timeline + 部門 filter + 推播訂閱）在後續 commit 實作。
 * 對應 mockup：~/Documents/成大EMBA/e118-board/mockup/home.html
 */
export default function BoardHome() {
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
        — board · placeholder
      </p>
      <h1
        style={{
          fontSize: '40px',
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontWeight: 300,
          color: '#1A1612',
          marginBottom: '8px',
        }}
      >
        Announcements
      </h1>
      <p
        style={{
          fontFamily: "'Noto Serif TC', 'PingFang TC', serif",
          fontSize: '20px',
          color: '#4A413A',
          marginBottom: '24px',
        }}
      >
        📢 班級公告欄
      </p>
      <p style={{ color: '#8A7F73', marginBottom: '24px' }}>
        建構中 · 公告 CRUD / 留言 / Web Push 推播訂閱即將上線。
        <br />
        架構文件：
        <code style={{ background: '#F4EFE6', padding: '2px 8px', borderRadius: '3px' }}>
          ~/Documents/成大EMBA/e118-board/ARCHITECTURE.md
        </code>
      </p>
      <a
        href="/"
        style={{ color: '#8B1F2F', textDecoration: 'none', fontSize: '14px' }}
      >
        ← 回主 dashboard
      </a>
    </main>
  );
}
