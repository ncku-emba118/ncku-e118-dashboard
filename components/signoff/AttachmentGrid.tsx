'use client';

/**
 * 簽核附件呈現。
 *
 * 原本只有一行 `📎 檔名` 連結，要簽名的人得另開分頁才看得到內容。
 * 改為圖片直接縮圖預覽（點擊開原圖），PDF 維持連結但給明顯圖示，
 * 並顯示類型標籤與單張說明，讓簽核者在同一畫面把憑證看完再簽。
 */

const WINE = '#8B1F2F';
const WINE_DEEP = '#6B1622';
const MUTE = '#8A7F73';
const LINE = '#E5DCCB';

export type ViewAttachment = {
  name: string;
  url: string | null;
  mime?: string | null;
  label?: string | null;
  caption?: string | null;
};

export default function AttachmentGrid({ items }: { items: ViewAttachment[] }) {
  if (!items || items.length === 0) {
    return <div style={{ fontSize: 13, color: MUTE }}>（無附件）</div>;
  }
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
        gap: 12,
      }}
    >
      {items.map((a, i) => {
        const isImage = (a.mime ?? '').startsWith('image/');
        return (
          <figure
            key={i}
            style={{
              margin: 0,
              border: `1px solid ${LINE}`,
              borderRadius: 6,
              overflow: 'hidden',
              background: '#fff',
            }}
          >
            {a.url ? (
              <a href={a.url} target="_blank" rel="noreferrer" style={{ display: 'block', textDecoration: 'none' }}>
                {isImage ? (
                  // eslint-disable-next-line @next/next/no-img-element -- Supabase 短效 signed URL，非固定網域資產
                  <img
                    src={a.url}
                    alt={a.caption || a.name}
                    style={{ width: '100%', height: 130, objectFit: 'cover', display: 'block', background: '#F4EFE6' }}
                  />
                ) : (
                  <div
                    style={{
                      height: 130,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: '#F4EFE6',
                      color: WINE,
                      fontSize: 30,
                    }}
                  >
                    📄
                  </div>
                )}
              </a>
            ) : (
              <div style={{ height: 130, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F4EFE6', color: MUTE, fontSize: 12 }}>
                連結失效
              </div>
            )}

            <figcaption style={{ padding: '7px 9px' }}>
              {a.label && (
                <span
                  style={{
                    display: 'inline-block',
                    padding: '1px 7px',
                    borderRadius: 10,
                    background: '#E8E0D0',
                    color: WINE_DEEP,
                    fontSize: 10.5,
                    fontWeight: 600,
                    marginBottom: 4,
                  }}
                >
                  {a.label}
                </span>
              )}
              {a.caption && (
                <div style={{ fontSize: 12, color: '#4A413A', lineHeight: 1.5, marginBottom: 3 }}>{a.caption}</div>
              )}
              <div style={{ fontSize: 11, color: MUTE, wordBreak: 'break-all' }}>{a.name}</div>
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}
