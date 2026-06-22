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

/**
 * Timeline 卡片內文預覽：清掉 Markdown 符號、但**保留換行**當分隔。
 * 視覺截斷交給 CSS line-clamp（固定 3 行），這裡只清符號 + 安全上限 240 字。
 *
 * 之前的問題：把 \n 壓成空格 + 保留 # ## ** - 符號 → timeline 變一坨亂碼。
 */
function excerpt(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, '')            // 程式碼區塊整段移除
    .replace(/^#{1,6}\s*/gm, '')               // 標題符號 # ## ### → 只留文字
    .replace(/\*\*([^*]+)\*\*/g, '$1')         // 粗體
    .replace(/\*([^*]+)\*/g, '$1')             // 斜體
    .replace(/~~([^~]+)~~/g, '$1')             // 刪除線
    .replace(/`([^`]+)`/g, '$1')               // inline code
    .replace(/^\s*[-*+]\s+/gm, '')             // 項目符號 - * +
    .replace(/^\s*\d+\.\s+/gm, '')             // 數字列表 1. 2.
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // 連結 / 圖片 → 只留文字
    .replace(/^>\s*/gm, '')                    // 引用 >
    .replace(/[ \t]+/g, ' ')                   // 同行多空白壓一個（換行保留）
    .replace(/\n{2,}/g, '\n')                  // 多個空行壓成單一換行
    .trim()
    .slice(0, 240);                            // 安全上限、避免 DOM 塞超長字串
}

import { formatDateTW as formatDate } from '@/lib/format';
import Breadcrumb from '@/components/Breadcrumb';

export default async function BoardHome() {
  const posts = await loadPosts();

  return (
    <>
    <Breadcrumb items={[{ label: '班級面板', href: '/' }, { label: '班級公告欄' }]} />
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
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              {/* 主要 CTA: 訂閱推播（99% 同學要的） */}
              <a
                href="/board/subscribe"
                style={{
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 600,
                  letterSpacing: '0.05em',
                  textDecoration: 'none',
                  padding: '9px 16px',
                  background: '#8B1F2F',
                  borderRadius: 4,
                  whiteSpace: 'nowrap',
                }}
              >
                📢 訂閱推播
              </a>
              {/* 次要：部門登入（只給 9 個幹部） */}
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
                  whiteSpace: 'nowrap',
                }}
              >
                部門登入 →
              </a>
            </div>
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
            <p style={{ fontSize: 13, marginBottom: 20 }}>
              7 個部門負責同學發第一則公告後會出現在這裡
            </p>
            <a
              href="/board/subscribe"
              style={{
                display: 'inline-block',
                color: '#8B1F2F',
                fontSize: 13,
                fontWeight: 600,
                textDecoration: 'none',
                padding: '10px 18px',
                border: '1px solid #8B1F2F',
                borderRadius: 4,
                letterSpacing: '0.05em',
              }}
            >
              📢 先訂閱推播 — 有新公告手機馬上收到
            </a>
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
                      lineHeight: 1.65,
                      color: '#4A413A',
                      margin: '0 0 10px',
                      // 固定 3 行高度、保留換行當分隔、超過自動 … 截斷
                      whiteSpace: 'pre-line',
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
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
    </>
  );
}
