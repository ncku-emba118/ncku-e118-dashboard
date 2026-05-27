/**
 * /board/admin — 管理後台首頁
 *
 * 顯示「我能管理的公告列表」+「+ 寫新公告」按鈕。
 * super 看全部 7 部門公告；dept 只看自己部門公告。
 */
import { redirect } from 'next/navigation';
import { readSession, deptInfo } from '@/lib/auth/session';
import { getServerClient } from '@/lib/supabase/server';

type AdminPost = {
  id: string;
  department_id: string;
  title: string;
  pinned: boolean;
  published: boolean;
  created_at: string;
  accounts: { username: string } | null;
};

async function loadManageablePosts(
  role: 'super' | 'dept',
  homeDeptId: string | null,
): Promise<AdminPost[]> {
  const supabase = getServerClient();
  let query = supabase
    .from('posts')
    .select(
      'id, department_id, title, pinned, published, created_at, accounts(username)',
    )
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(100);

  if (role === 'dept' && homeDeptId) {
    query = query.eq('department_id', homeDeptId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[admin.posts.list.failed]', { error: error.message });
    return [];
  }
  return (data || []) as unknown as AdminPost[];
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day} ${hh}:${mm}`;
}

export default async function AdminHome() {
  const session = await readSession();
  if (!session) redirect('/board/login?next=/board/admin');

  const posts = await loadManageablePosts(session.role, session.home_dept_id);
  const isSuper = session.role === 'super';
  const deptLabel = isSuper
    ? '全部 7 部門'
    : deptInfo(session.home_dept_id).name;

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
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        {/* Top bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            paddingBottom: 16,
            borderBottom: '1px solid rgba(26, 22, 18, 0.10)',
            marginBottom: 24,
            flexWrap: 'wrap',
            gap: 12,
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
              — board admin
            </p>
            <h1
              style={{
                fontFamily: "'Cormorant Garamond', Georgia, serif",
                fontSize: 36,
                fontWeight: 300,
                color: '#1A1612',
                margin: 0,
              }}
            >
              Administration
            </h1>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <a
              href="/board"
              style={{
                color: '#8A7F73',
                fontSize: 12,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                textDecoration: 'none',
              }}
            >
              ← 回公告欄
            </a>
            <a
              href="/board/admin/new"
              style={{
                padding: '8px 16px',
                background: '#8B1F2F',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: '0.05em',
                borderRadius: 4,
                textDecoration: 'none',
              }}
            >
              + 寫新公告
            </a>
          </div>
        </div>

        {/* User info card */}
        <div
          style={{
            background: '#fff',
            border: '1px solid #D9CDB8',
            borderRadius: 6,
            padding: '18px 22px',
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              padding: '2px 10px',
              background: isSuper
                ? 'rgba(139, 31, 47, 0.12)'
                : 'rgba(45, 95, 78, 0.12)',
              color: isSuper ? '#8B1F2F' : '#2D5F4E',
              fontWeight: 600,
              fontSize: 11,
              letterSpacing: '0.1em',
              borderRadius: 3,
            }}
          >
            {isSuper ? 'SUPER' : 'DEPT'}
          </span>
          <span
            style={{ fontFamily: "'Noto Serif TC', serif", fontSize: 16 }}
          >
            {session.username}
          </span>
          <span style={{ fontSize: 13, color: '#8A7F73' }}>
            · 可管 {deptLabel}
          </span>
        </div>

        {/* Posts list */}
        <h2
          style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: 22,
            fontWeight: 400,
            color: '#1A1612',
            margin: '24px 0 12px',
          }}
        >
          Posts ({posts.length})
        </h2>

        {posts.length === 0 ? (
          <div
            style={{
              padding: '48px 32px',
              textAlign: 'center',
              background: '#fff',
              border: '1px dashed #D9CDB8',
              borderRadius: 8,
              color: '#8A7F73',
            }}
          >
            <p style={{ marginBottom: 14, fontSize: 15 }}>
              還沒有公告
            </p>
            <a
              href="/board/admin/new"
              style={{
                color: '#8B1F2F',
                fontSize: 14,
                textDecoration: 'none',
              }}
            >
              ✍ 寫第一則公告 →
            </a>
          </div>
        ) : (
          <div
            style={{
              background: '#fff',
              border: '1px solid #D9CDB8',
              borderRadius: 6,
              overflow: 'hidden',
            }}
          >
            {posts.map((p, i) => {
              const dept = deptInfo(p.department_id);
              return (
                <a
                  key={p.id}
                  href={`/board/post/${p.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    padding: '14px 18px',
                    borderBottom:
                      i < posts.length - 1
                        ? '1px solid rgba(26,22,18,0.08)'
                        : 'none',
                    textDecoration: 'none',
                    color: 'inherit',
                  }}
                >
                  <span
                    style={{
                      padding: '2px 8px',
                      background: `${dept.color}1F`,
                      color: dept.color,
                      fontFamily: "'Noto Serif TC', serif",
                      fontWeight: 500,
                      fontSize: 11,
                      borderRadius: 3,
                      minWidth: 44,
                      textAlign: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {dept.name}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: "'Noto Serif TC', serif",
                        fontWeight: 600,
                        fontSize: 15,
                        color: '#1A1612',
                        marginBottom: 2,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {p.pinned && (
                        <span
                          style={{
                            color: '#C9A961',
                            marginRight: 6,
                            fontSize: 11,
                          }}
                        >
                          📌
                        </span>
                      )}
                      {p.title}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: '#8A7F73',
                        fontFamily: 'ui-monospace, Menlo, monospace',
                      }}
                    >
                      {formatDate(p.created_at)} · 👤 {p.accounts?.username ?? '—'}
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
