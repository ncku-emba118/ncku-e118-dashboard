/**
 * /board — 公開公告 timeline
 * Server component, fetched via Supabase service_role from server
 * RLS 也會限制 anon 只能讀 published — 雙保險
 */
import { getServerClient } from '@/lib/supabase/server';
import { deptInfo, ALL_DEPTS } from '@/lib/auth/session';

// ISR-ish: revalidate 公開 timeline 每 30 秒，避免每個訪客都打 DB
export const revalidate = 30;

type Post = {
  id: string;
  department_id: string;
  title: string;
  content: string;
  pinned: boolean;
  created_at: string;
  accounts: { username: string } | null;
};

async function loadPosts(): Promise<Post[]> {
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from('posts')
    .select(
      'id, department_id, title, content, pinned, created_at, accounts(username)',
    )
    .eq('published', true)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('[board.timeline.failed]', { error: error.message });
    return [];
  }
  return (data || []) as unknown as Post[];
}

function excerpt(content: string, max = 140): string {
  const t = content.trim().replace(/\s+/g, ' ');
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

export default async function BoardHome() {
  const posts = await loadPosts();

  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #FAF7F2 0%, #F4EFE6 100%)',
        padding: '40px 24px 80px',
        fontFamily:
          "-apple-system, BlinkMacSystemFont, system-ui, 'PingFang TC', sans-serif",
      }}
    >
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        {/* Header */}
        <header style={{ marginBottom: 32 }}>
          <a
            href="/"
            style={{
              color: '#8A7F73',
              fontSize: 12,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              textDecoration: 'none',
              marginBottom: 24,
              display: 'inline-block',
            }}
          >
            ← emba.aqualux.dev / 回主 dashboard
          </a>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              flexWrap: 'wrap',
              gap: 16,
            }}
          >
            <div>
              <p
                style={{
                  fontSize: 11,
                  letterSpacing: '0.24em',
                  textTransform: 'uppercase',
                  color: '#8B1F2F',
                  margin: '0 0 6px',
                }}
              >
                📢 board · 班級公告欄
              </p>
              <h1
                style={{
                  fontFamily: "'Cormorant Garamond', Georgia, serif",
                  fontSize: 44,
                  fontWeight: 300,
                  color: '#1A1612',
                  margin: 0,
                }}
              >
                Announcements
              </h1>
            </div>
            <a
              href="/board/admin"
              style={{
                color: '#8B1F2F',
                fontSize: 13,
                letterSpacing: '0.05em',
                textDecoration: 'none',
                padding: '8px 14px',
                border: '1px solid #D9CDB8',
                borderRadius: 4,
              }}
            >
              部門登入 →
            </a>
          </div>
        </header>

        {/* Empty state */}
        {posts.length === 0 && (
          <div
            style={{
              padding: '64px 32px',
              textAlign: 'center',
              background: '#fff',
              border: '1px dashed #D9CDB8',
              borderRadius: 8,
              color: '#8A7F73',
            }}
          >
            <p style={{ fontSize: 18, marginBottom: 8 }}>還沒有公告</p>
            <p style={{ fontSize: 13 }}>
              7 個部門負責同學發第一則公告後會出現在這裡
            </p>
          </div>
        )}

        {/* Timeline */}
        {posts.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {posts.map((post) => {
              const dept = deptInfo(post.department_id);
              return (
                <a
                  key={post.id}
                  href={`/board/post/${post.id}`}
                  style={{
                    display: 'block',
                    background: '#fff',
                    border: '1px solid #D9CDB8',
                    borderLeft: `4px solid ${dept.color}`,
                    borderRadius: 6,
                    padding: '20px 24px',
                    textDecoration: 'none',
                    color: '#1A1612',
                    transition: 'box-shadow .2s, transform .2s',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      gap: 12,
                      alignItems: 'center',
                      marginBottom: 8,
                      fontSize: 11,
                      letterSpacing: '0.05em',
                      color: '#8A7F73',
                    }}
                  >
                    {post.pinned && (
                      <span
                        style={{
                          color: '#C9A961',
                          fontWeight: 700,
                          letterSpacing: '0.12em',
                        }}
                      >
                        📌 PINNED
                      </span>
                    )}
                    <span
                      style={{
                        padding: '3px 10px',
                        background: `${dept.color}1F`,
                        color: dept.color,
                        fontFamily: "'Noto Serif TC', serif",
                        fontWeight: 500,
                        fontSize: 11,
                        borderRadius: 3,
                      }}
                    >
                      {dept.name}
                    </span>
                    <span
                      style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}
                    >
                      {formatDate(post.created_at)}
                    </span>
                  </div>
                  <h2
                    style={{
                      fontFamily: "'Noto Serif TC', serif",
                      fontSize: 18,
                      fontWeight: 600,
                      color: '#6B1622',
                      margin: '0 0 6px',
                    }}
                  >
                    {post.title}
                  </h2>
                  <p
                    style={{
                      fontSize: 14,
                      lineHeight: 1.6,
                      color: '#4A413A',
                      margin: '0 0 10px',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {excerpt(post.content)}
                  </p>
                  <div
                    style={{
                      fontSize: 12,
                      color: '#8A7F73',
                      fontFamily: 'ui-monospace, Menlo, monospace',
                    }}
                  >
                    👤 {post.accounts?.username ?? '—'}
                  </div>
                </a>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <p
          style={{
            marginTop: 56,
            textAlign: 'center',
            fontSize: 11,
            color: '#8A7F73',
            fontFamily: 'ui-monospace, Menlo, monospace',
            letterSpacing: '0.05em',
          }}
        >
          emba.aqualux.dev/board · {posts.length} posts · 共 {ALL_DEPTS.length} 部門
        </p>
      </div>
    </main>
  );
}
