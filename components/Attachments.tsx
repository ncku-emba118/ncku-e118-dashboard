/**
 * 附件 server component — 渲染 GDrive iframe + Supabase Storage 檔案
 *
 * 雙源支援：
 *   • source='gdrive': iframe embed (drive.google.com / docs.google.com)
 *     對應 ARCHITECTURE.md v3 第 9 章 + Codex Sec F8（sandbox 不含 allow-same-origin）
 *   • source='supabase': public URL — 圖片 inline、PDF iframe、其他下載連結
 *     對應 2026-05-27 加上的 /api/board/upload 直傳路徑
 */
import {
  type Attachment,
  attachmentTypeLabel,
  attachmentEmoji,
  formatSize,
  isImage,
  isPdf,
} from '@/lib/attachment';
import { embedUrl, viewUrl, isEmbeddable } from '@/lib/gdrive';

export default function Attachments({ items }: { items: Attachment[] }) {
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
        📎 附件 · {items.length} 個
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {items.map((att, i) => (
          <AttachmentCard key={i} att={att} index={i} />
        ))}
      </div>
    </section>
  );
}

function AttachmentCard({ att, index }: { att: Attachment; index: number }) {
  const typeLabel = attachmentTypeLabel(att);
  const emoji = attachmentEmoji(att);

  return (
    <div
      key={index}
      style={{
        border: '1px solid rgba(26,22,18,0.08)',
        borderRadius: 4,
        overflow: 'hidden',
      }}
    >
      <Header att={att} typeLabel={typeLabel} emoji={emoji} />
      <Preview att={att} />
    </div>
  );
}

function Header({
  att,
  typeLabel,
  emoji,
}: {
  att: Attachment;
  typeLabel: string;
  emoji: string;
}) {
  const openHref =
    att.source === 'gdrive' ? viewUrl(att) : att.public_url;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 14px',
        background: '#FAF7F2',
        borderBottom: '1px solid rgba(26,22,18,0.08)',
        gap: 12,
        flexWrap: 'wrap',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          minWidth: 0,
        }}
      >
        <span style={{ fontSize: 18 }}>{emoji}</span>
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
            {typeLabel}
            {att.source === 'supabase' && att.size ? (
              <> · {formatSize(att.size)}</>
            ) : null}
          </div>
        </div>
      </div>
      <a
        href={openHref}
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
        {att.source === 'gdrive' ? '在 Drive 開啟 ↗' : '開啟 / 下載 ↗'}
      </a>
    </div>
  );
}

function Preview({ att }: { att: Attachment }) {
  // GDrive iframe path
  if (att.source === 'gdrive') {
    if (!isEmbeddable(att.type)) return null;
    return (
      <iframe
        src={embedUrl(att)}
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
    );
  }

  // Supabase Storage rendering — 依 MIME 不同走不同分支
  // 圖片：inline <img> max-width 100%
  if (isImage(att)) {
    return (
      <img
        src={att.public_url}
        alt={att.name}
        loading="lazy"
        referrerPolicy="no-referrer"
        style={{
          display: 'block',
          width: '100%',
          height: 'auto',
          maxHeight: 700,
          objectFit: 'contain',
          background: '#FAF7F2',
        }}
      />
    );
  }

  // PDF: iframe 預覽（瀏覽器內建 PDF viewer）
  if (isPdf(att)) {
    return (
      <iframe
        src={att.public_url}
        sandbox="allow-scripts allow-popups allow-forms allow-downloads"
        loading="lazy"
        title={att.name}
        style={{
          display: 'block',
          border: 0,
          width: '100%',
          height: 600,
          background: '#fff',
        }}
      />
    );
  }

  // Office docs / 純文字 / CSV — 沒辦法 inline 預覽，給下載提示
  return (
    <div
      style={{
        padding: '16px 18px',
        fontSize: 13,
        color: '#4A413A',
        background: '#fff',
        textAlign: 'center',
      }}
    >
      此檔案類型無法直接預覽，請點上方「開啟 / 下載」按鈕。
    </div>
  );
}
