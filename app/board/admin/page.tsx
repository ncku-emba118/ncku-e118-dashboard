/**
 * /board/admin — 管理後台首頁（server component）
 *
 * Middleware 已擋掉沒 cookie / JWT 過期的請求。
 * 這頁額外做 session_version 對 DB 比對（middleware 不能 DB query）。
 * Mismatch → 密碼已被 reset / 職務輪替已撤銷 → redirect /board/login
 *
 * 對應 ARCHITECTURE.md v3 第 6 章「每次請求驗證」末段 session_version 比對。
 */
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { COOKIE_NAME, verifySession } from '@/lib/auth/jwt';
import { getServerClient } from '@/lib/supabase/server';

async function loadCurrentAccount() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) redirect('/board/login');

  const session = await verifySession(token);
  if (!session) redirect('/board/login');

  // 比對 DB session_version — 不等代表密碼 reset / 職務輪替已撤銷
  const supabase = getServerClient();
  const { data: account } = await supabase
    .from('accounts')
    .select('id, username, role, home_dept_id, session_version, last_login_at')
    .eq('id', session.sub)
    .maybeSingle();

  if (!account || account.session_version !== session.session_version) {
    redirect('/board/login');
  }

  return account;
}

export default async function AdminHome() {
  const account = await loadCurrentAccount();

  const isSuper = account.role === 'super';
  const deptLabel = account.home_dept_id || '—';

  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #FAF7F2 0%, #F4EFE6 100%)',
        padding: '40px 32px',
        fontFamily:
          "-apple-system, BlinkMacSystemFont, system-ui, 'PingFang TC', sans-serif",
      }}
    >
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            paddingBottom: 16,
            borderBottom: '1px solid rgba(26, 22, 18, 0.10)',
            marginBottom: 28,
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
        </div>

        <div
          style={{
            background: '#fff',
            border: '1px solid #D9CDB8',
            borderRadius: 6,
            padding: '24px 28px',
            marginBottom: 24,
          }}
        >
          <div
            style={{
              fontSize: 11,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: '#8A7F73',
              marginBottom: 8,
            }}
          >
            已登入
          </div>
          <div
            style={{
              fontSize: 24,
              fontFamily: "'Noto Serif TC', serif",
              color: '#1A1612',
              marginBottom: 4,
            }}
          >
            {account.username}
          </div>
          <div style={{ fontSize: 13, color: '#4A413A' }}>
            <span
              style={{
                display: 'inline-block',
                padding: '2px 8px',
                background: isSuper ? 'rgba(139, 31, 47, 0.12)' : 'rgba(45, 95, 78, 0.12)',
                color: isSuper ? '#8B1F2F' : '#2D5F4E',
                fontWeight: 600,
                fontSize: 11,
                letterSpacing: '0.1em',
                borderRadius: 3,
                marginRight: 10,
              }}
            >
              {isSuper ? 'SUPER' : 'DEPT'}
            </span>
            預設部門：{deptLabel} ·{' '}
            {isSuper ? '可管全部 7 部門公告' : `只能管自己部門公告`}
          </div>
        </div>

        <div
          style={{
            background: '#fff',
            border: '1px solid #D9CDB8',
            borderRadius: 6,
            padding: '24px 28px',
            color: '#4A413A',
            lineHeight: 1.7,
            fontSize: 14,
          }}
        >
          <strong style={{ color: '#8B1F2F' }}>📝 建構中</strong> · 下個 commit 將加入：
          <ul style={{ margin: '12px 0 0 20px', padding: 0 }}>
            <li>公告 CRUD（寫新公告 / 編輯 / 刪除 / 置頂）</li>
            <li>留言審核（按部門 filter）</li>
            <li>推播訂閱統計</li>
            <li>登出按鈕</li>
          </ul>
        </div>

        <p
          style={{
            marginTop: 32,
            fontSize: 11,
            color: '#8A7F73',
            fontFamily: 'ui-monospace, Menlo, monospace',
            letterSpacing: '0.03em',
            textAlign: 'center',
          }}
        >
          ARCHITECTURE.md v3 · Week 1 · login + middleware ✓ · 公告 CRUD 進行中
        </p>
      </div>
    </main>
  );
}
