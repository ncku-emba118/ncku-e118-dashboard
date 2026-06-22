import type { Metadata } from 'next';
import Link from 'next/link';
import { CHANGELOG, META } from '@/lib/budget/data';

export const metadata: Metadata = {
  title: '版本歷史｜E118 南班班費預算說明書',
  description: 'E118 南班班費預算說明書的歷次修訂記錄，作為班務討論的依據。',
};

const WINE = '#8B1F2F';
const WINE_DEEP = '#6B1622';
const GOLD = '#C9A961';
const PAPER = '#F4EFE6';
const INK = '#1A1612';
const MUTE = '#8A7F73';
const LINE = '#E8DFD0';
const OK = '#2D5F4E';
const TC = "'Noto Serif TC', 'PingFang TC', 'Songti TC', serif";
const DISPLAY = "'Cormorant Garamond', Georgia, serif";

const TYPE_LABEL: Record<string, { label: string; color: string; bg: string; symbol: string }> = {
  new: { label: '新增', color: '#1F5C3E', bg: '#E0EFE3', symbol: '＋' },
  change: { label: '變更', color: '#7A5C00', bg: '#FFF1C5', symbol: '↻' },
  fix: { label: '修正', color: '#6B1622', bg: '#FCE4E4', symbol: '✓' },
  remove: { label: '移除', color: '#666', bg: '#EEE', symbol: '−' },
};

const GH_REPO = 'https://github.com/ncku-emba118/ncku-e118-dashboard';

export default function ChangelogPage() {
  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <Link href="/budget" style={{ fontSize: 13, color: MUTE, textDecoration: 'none' }}>← 回總覽</Link>
        <h1 style={{ fontFamily: TC, fontSize: 28, color: WINE_DEEP, fontWeight: 600, margin: '12px 0 6px' }}>版本歷史</h1>
        <p style={{ fontSize: 14, color: '#4A413A', lineHeight: 1.8, maxWidth: 800 }}>
          班費預算說明書的歷次修訂記錄。每次重大調整都會在此列出「變更了什麼」與「對數字的影響」，
          作為班務討論的依據與決議的留底。
          要查看任一版本的完整原始檔，可至 GitHub 的 commit 歷史回溯。
        </p>
        <div style={{ marginTop: 12, fontSize: 12, color: MUTE }}>
          目前最新版：<strong style={{ color: WINE, fontFamily: DISPLAY, fontSize: 14 }}>{META.version}</strong>　·　最後更新 {META.updatedAt}
        </div>
      </div>

      {CHANGELOG.map((entry, i) => (
        <article
          key={entry.version}
          style={{
            background: '#fff',
            border: `1px solid ${LINE}`,
            borderLeft: `5px solid ${i === 0 ? GOLD : WINE}`,
            borderRadius: 8,
            padding: '22px 26px',
            marginBottom: 22,
            position: 'relative',
          }}
        >
          {i === 0 && (
            <span
              style={{
                position: 'absolute',
                top: 16,
                right: 22,
                background: GOLD,
                color: '#fff',
                fontSize: 11,
                fontWeight: 600,
                padding: '3px 10px',
                borderRadius: 12,
                letterSpacing: 1,
              }}
            >
              CURRENT
            </span>
          )}

          {/* Header */}
          <header style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap', marginBottom: 6 }}>
              <span style={{ fontFamily: DISPLAY, fontSize: 32, fontWeight: 600, color: WINE_DEEP, letterSpacing: 1 }}>
                {entry.version}
              </span>
              <span style={{ fontSize: 13, color: MUTE }}>{entry.date}</span>
              <span style={{ fontFamily: TC, fontSize: 18, color: WINE_DEEP, fontWeight: 600 }}>
                {entry.title}
              </span>
            </div>
            <p style={{ fontSize: 14, color: '#4A413A', lineHeight: 1.9, margin: 0 }}>{entry.summary}</p>
          </header>

          {/* 變更清單 */}
          <section style={{ marginTop: 16 }}>
            <h3 style={{ fontFamily: TC, fontSize: 14, color: WINE_DEEP, fontWeight: 600, margin: '0 0 10px', borderBottom: `1px dashed ${LINE}`, paddingBottom: 6 }}>
              變更內容（{entry.changes.length} 項）
            </h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {entry.changes.map((c, j) => {
                const t = TYPE_LABEL[c.type];
                return (
                  <li
                    key={j}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                      padding: '8px 0',
                      borderBottom: j === entry.changes.length - 1 ? 'none' : `1px dashed ${PAPER}`,
                      fontSize: 13.5,
                      color: '#4A413A',
                      lineHeight: 1.8,
                    }}
                  >
                    <span
                      style={{
                        flexShrink: 0,
                        background: t.bg,
                        color: t.color,
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: 10,
                        minWidth: 44,
                        textAlign: 'center',
                      }}
                    >
                      {t.symbol} {t.label}
                    </span>
                    <span>{c.text}</span>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* 數字影響 */}
          {entry.numbers && entry.numbers.length > 0 && (
            <section style={{ marginTop: 18 }}>
              <h3 style={{ fontFamily: TC, fontSize: 14, color: WINE_DEEP, fontWeight: 600, margin: '0 0 10px', borderBottom: `1px dashed ${LINE}`, paddingBottom: 6 }}>
                數字影響
              </h3>
              <div className="bdg-table-wrap">
                <table className="bdg-table">
                  <caption>{entry.version} 預算數字變化（單位：新台幣元）</caption>
                  <thead>
                    <tr>
                      <th scope="col">項目</th>
                      <th scope="col" className="num">前一版</th>
                      <th scope="col" className="num">本版</th>
                      <th scope="col" className="num">變化</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entry.numbers.map((n, k) => (
                      <tr key={k}>
                        <td data-label="項目" className="strong">{n.label}</td>
                        <td className="num" data-label="前一版">{n.before}</td>
                        <td className="num strong" data-label="本版">{n.after}</td>
                        <td
                          className="num strong"
                          data-label="變化"
                          style={{ color: n.delta.startsWith('+') ? WINE : n.delta.startsWith('−') ? OK : MUTE }}
                        >
                          {n.delta}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* GitHub 連結 */}
          <footer
            style={{
              marginTop: 18,
              paddingTop: 12,
              borderTop: `1px solid ${LINE}`,
              fontSize: 12,
              color: MUTE,
              display: 'flex',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <span>
              {i === 0 ? '當前線上版本' : `已被 ${CHANGELOG[i - 1].version} 取代`}
            </span>
            <a
              href={`${GH_REPO}/commits/main/lib/budget/data.ts`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: WINE, textDecoration: 'none', fontWeight: 500 }}
            >
              查看 GitHub commit 歷史 ↗
            </a>
          </footer>
        </article>
      ))}

      {/* 說明區 */}
      <section
        style={{
          marginTop: 28,
          background: PAPER,
          border: `1px solid ${LINE}`,
          borderLeft: `4px solid ${GOLD}`,
          padding: '16px 20px',
          borderRadius: 6,
          fontSize: 13.5,
          color: '#4A413A',
          lineHeight: 1.9,
        }}
      >
        <strong style={{ color: WINE_DEEP, fontSize: 14, display: 'block', marginBottom: 6 }}>關於版本管理</strong>
        <ul style={{ paddingLeft: 22, margin: 0 }}>
          <li>每次重大調整（活動新增 / 預算項目變動 / 結構變更）會在此頁新增一筆版本記錄</li>
          <li>當前線上的預算說明書頁面（總覽、活動明細、預備金等）一律顯示「最新版」內容</li>
          <li>若需查看舊版完整原始檔，可至 <a href={GH_REPO} target="_blank" rel="noopener noreferrer" style={{ color: WINE }}>GitHub repository</a> 查看 commit 歷史；或在班務群組請秘書處協助匯出</li>
          <li>每場活動結束後的「實際結算」會更新到對應活動頁，不另開新版（屬於資料更新、非預算修訂）</li>
        </ul>
      </section>
    </>
  );
}
