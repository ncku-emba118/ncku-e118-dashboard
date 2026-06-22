import Link from 'next/link';

type Item = { label: string; href?: string };

/**
 * 通用面包屑元件 — 跨頁面回班級面板
 * 第一筆預設為「← 班級面板」並帶 href="/"；最後一筆為當前頁、不帶 href。
 *
 * 樣式沿用 budget 站既有設計（深紅金色窄條），跟其他頁面風格區隔，
 * 強調這是「navigation chrome」而非頁面內容。
 *
 * 使用範例：
 *   <Breadcrumb items={[{ label: '班級面板', href: '/' }, { label: '班級公告欄' }]} />
 *   <Breadcrumb items={[
 *     { label: '班級面板', href: '/' },
 *     { label: '班級經費中心', href: '/finance' },
 *     { label: '預算說明書' },
 *   ]} />
 */
export default function Breadcrumb({ items }: { items: Item[] }) {
  return (
    <div
      style={{
        background: '#2C0A10',
        color: '#C9A961',
        padding: '6px 0',
        fontSize: 12.5,
        borderBottom: '1px solid #4B1119',
        fontFamily: 'system-ui, -apple-system, "PingFang TC", "Noto Sans TC", sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: 1100,
          margin: '0 auto',
          padding: '0 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        {items.map((it, i) => {
          const isLast = i === items.length - 1;
          const isFirst = i === 0;
          return (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              {it.href && !isLast ? (
                <Link
                  href={it.href}
                  style={{
                    color: '#C9A961',
                    textDecoration: 'none',
                    padding: '2px 6px',
                    borderRadius: 3,
                  }}
                  aria-label={isFirst ? `回到${it.label}` : it.label}
                >
                  {isFirst ? `← ${it.label}` : it.label}
                </Link>
              ) : (
                <span style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>{it.label}</span>
              )}
              {!isLast && <span style={{ color: 'rgba(201,169,97,0.5)' }}>/</span>}
            </span>
          );
        })}
      </div>
    </div>
  );
}
