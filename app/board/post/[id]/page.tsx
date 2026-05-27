/**
 * /board/post/[id] — 公告詳情（公開）
 * Server component；UUID validation；404 → notFound()
 *
 * MVP：純文字 content（whiteSpace: pre-wrap 保留換行）
 * 下個 commit 加 markdown 渲染（rehype-sanitize 防 XSS）+ 留言區
 */
import { notFound } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { deptInfo } from '@/lib/auth/session';

const UUID_RE = /^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/;

type Post = {
  id: string;
  department_id: string;
  title: string;
  content: string;
  attachments: Array<{ name: string; gdrive_id: string; type: string }>;
  pinned: boolean;
  created_at: string;
  accounts: { username: string } | null;
};

async function loadPost(id: string): Promise<Post | null> {
  if (!UUID_RE.test(id)) return null;
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from('posts')
    .select(
      'id, department_id, title, content, attachments, pinned, created_at, accounts(username)',
    )
    .eq('id', id)
    .eq('published', true)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as Post;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export default async function PostDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const post = await loadPost(id);
  if (!post) notFound();

  const dept = deptInfo(post.department_id);

  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #FAF7F2 0%, #F4EFE6 100%)',
        padding: '32px 24px 80px',
        fontFamily:
          "-apple-system, BlinkMacSystemFont, system-ui, 'PingFang TC', sans-serif",
      }}
    >
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        {/* Breadcrumb */}
        <nav
          style={{
            fontSize: 11,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: '#8A7F73',
            marginBottom: 24,
          }}
        >
          <a href="/" style={{ color: '#8A7F73', textDecoration: 'none' }}>
            主 dashboard
          </a>
          <span style={{ margin: '0 8px' }}>›</span>
          <a href="/board" style={{ color: '#8A7F73', textDecoration: 'none' }}>
            公告欄
          </a>
          <span style={{ margin: '0 8px' }}>›</span>
          <span style={{ color: dept.color }}>{dept.name}</span>
        </nav>

        {/* Post hero */}
        <header
          style={{
            paddingBottom: 24,
            borderBottom: '4px double rgba(201, 169, 97, 0.5)',
            marginBottom: 24,
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: 12,
              alignItems: 'center',
              marginBottom: 14,
            }}
          >
            <span
              style={{
                padding: '4px 12px',
                background: `${dept.color}1F`,
                color: dept.color,
                fontFamily: "'Noto Serif TC', serif",
                fontWeight: 600,
                fontSize: 12,
                borderRadius: 3,
              }}
            >
              {dept.name}
            </span>
            {post.pinned && (
              <span
                style={{
                  color: '#C9A961',
                  fontWeight: 700,
                  fontSize: 11,
                  letterSpacing: '0.12em',
                  fontFamily: 'ui-monospace, Menlo, monospace',
                }}
              >
                📌 PINNED
              </span>
            )}
          </div>
          <h1
            style={{
              fontFamily: "'Noto Serif TC', serif",
              fontSize: 28,
              fontWeight: 600,
              lineHeight: 1.4,
              color: '#1A1612',
              margin: '0 0 16px',
            }}
          >
            {post.title}
          </h1>
          <div
            style={{
              display: 'flex',
              gap: 18,
              flexWrap: 'wrap',
              fontSize: 13,
              color: '#8A7F73',
              fontFamily: 'ui-monospace, Menlo, monospace',
            }}
          >
            <span>👤 {post.accounts?.username ?? '—'}</span>
            <span>📅 {formatDate(post.created_at)}</span>
          </div>
        </header>

        {/* Content (pre-wrap，preserve user line breaks，無 HTML 注入風險) */}
        <article
          style={{
            fontSize: 16,
            lineHeight: 1.8,
            color: '#1A1612',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            marginBottom: 32,
          }}
        >
          {post.content}
        </article>

        {/* Attachments — 暫不嵌入 GDrive iframe，先列連結（下個 commit 加 embed） */}
        {post.attachments && post.attachments.length > 0 && (
          <section
            style={{
              padding: '20px 24px',
              background: '#fff',
              border: '1px solid #D9CDB8',
              borderRadius: 6,
              marginBottom: 32,
            }}
          >
            <p
              style={{
                fontSize: 11,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                color: '#8A7F73',
                margin: '0 0 12px',
              }}
            >
              📎 附件 · {post.attachments.length} 個
            </p>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {post.attachments.map((att, i) => (
                <li
                  key={i}
                  style={{
                    padding: '8px 0',
                    borderBottom:
                      i < post.attachments.length - 1
                        ? '1px dashed rgba(26,22,18,0.08)'
                        : 'none',
                  }}
                >
                  <a
                    href={`https://drive.google.com/file/d/${att.gdrive_id}/view`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: '#8B1F2F',
                      fontSize: 14,
                      textDecoration: 'none',
                    }}
                  >
                    {att.name} ↗
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Comments placeholder（下個 commit 開做） */}
        <div
          style={{
            padding: '20px 24px',
            background: '#fff',
            border: '1px dashed #D9CDB8',
            borderRadius: 6,
            color: '#8A7F73',
            fontSize: 13,
            textAlign: 'center',
          }}
        >
          💬 留言區建構中
        </div>

        <p
          style={{
            marginTop: 32,
            textAlign: 'center',
            fontSize: 11,
            color: '#8A7F73',
            fontFamily: 'ui-monospace, Menlo, monospace',
          }}
        >
          <a href="/board" style={{ color: '#8B1F2F' }}>
            ← 回公告欄
          </a>
        </p>
      </div>
    </main>
  );
}
