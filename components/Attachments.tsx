/**
 * 附件 server component — 渲染 GDrive iframe / 連結
 *
 * 對應 ARCHITECTURE.md v3 第 9 章「Google Drive 附件嵌入」+ Codex Sec F8 + P0-1 修正：
 *   • iframe sandbox="allow-scripts allow-popups allow-forms"
 *     ⚠ P0-1: 拿掉 allow-same-origin — allow-scripts + allow-same-origin 並存是 well-known
 *     sandbox escape，embedded 頁面可改 sandbox attr 完全跳出沙箱。GDrive preview 在僅
 *     allow-scripts 下仍能正常顯示文件。
 *   • referrerpolicy="no-referrer"
 *   • loading="lazy" 不阻塞 first paint
 *   • host 由 lib/gdrive.ts 嚴格白名單
 */
import {
  type GdriveAttachment,
  embedUrl,
  viewUrl,
  isEmbeddable,
  typeLabel,
  typeEmoji,
} from '@/lib/gdrive';

export default function Attachments({
  items,
}: {
  items: GdriveAttachment[];
}) {
  if (!items?.length) return null;

  return (
    <section
      style={{
        background: '#fff',
        border: '1px solid #D9CDB8',
        borderRadius: 6,
        padding: '20px 24px',
        marginBottom: 32,
      }}
    >
      <p
        style={{
          fontSize: 11,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          color: '#8A7F73',
          margin: '0 0 16px',
          fontFamily: 'ui-monospace, Menlo, monospace',
        }}
      >
        📎 附件 · {items.length} 個（Google Drive）
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {items.map((att, i) => {
          const embed = isEmbeddable(att.type) ? embedUrl(att) : '';
          const view = viewUrl(att);
          return (
            <div
              key={`${att.gdrive_id}-${i}`}
              style={{
                border: '1px solid rgba(26,22,18,0.08)',
                borderRadius: 4,
                overflow: 'hidden',
              }}
            >
              {/* Header bar with name + open link */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  background: '#FAF7F2',
                  borderBottom: embed ? '1px solid rgba(26,22,18,0.08)' : 'none',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <span style={{ fontSize: 18 }}>{typeEmoji(att.type)}</span>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: "'Noto Serif TC', serif",
                        fontWeight: 600,
                        fontSize: 14,
                        color: '#1A1612',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {att.name}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: '#8A7F73',
                        fontFamily: 'ui-monospace, Menlo, monospace',
                        letterSpacing: '0.05em',
                      }}
                    >
                      {typeLabel(att.type)}
                    </div>
                  </div>
                </div>
                <a
                  href={view}
                  target="_blank"
                  rel="noopener noreferrer"
                  referrerPolicy="no-referrer"
                  style={{
                    color: '#8B1F2F',
                    fontSize: 12,
                    textDecoration: 'none',
                    padding: '4px 10px',
                    border: '1px solid #D9CDB8',
                    borderRadius: 3,
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                  }}
                >
                  在 Drive 開啟 ↗
                </a>
              </div>

              {/* Embed iframe — folder 不嵌入 */}
              {embed && (
                <iframe
                  src={embed}
                  // ⚠ P0-1: 不可加 allow-same-origin（與 allow-scripts 並存可逃逸 sandbox）
                  sandbox="allow-scripts allow-popups allow-forms"
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  title={att.name}
                  style={{
                    display: 'block',
                    border: 0,
                    width: '100%',
                    height: 480,
                    background: '#fff',
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
