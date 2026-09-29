'use client';

/**
 * 班級共用密碼輸入表單（/class-login）。UI 比照 app/board/login/page.tsx。
 *
 * 成功後用 window.location.replace 整頁導向（不用 router.push）：
 *   • /clubs、/annual 是 public/ 靜態 HTML，不是 Next route，client router 進不去
 *   • 整頁載入保證 middleware 用新 cookie 重跑一次
 *   • replace → 返回鍵不會回到密碼頁
 */
import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { safeClassNext } from '@/lib/auth/class-safe-next';
import { LoadingLabel } from '@/components/Loading';

function Form() {
  const searchParams = useSearchParams();
  const next = safeClassNext(searchParams.get('next'));

  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) {
      setError('請輸入班級密碼');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/class-gate/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || '驗證失敗');
        setLoading(false);
        return;
      }
      window.location.replace(next);
    } catch {
      setError('網路錯誤，請稍後再試');
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #FAF7F2 0%, #F4EFE6 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
        fontFamily: "-apple-system, BlinkMacSystemFont, system-ui, 'PingFang TC', sans-serif",
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          background: '#fff',
          border: '1px solid #D9CDB8',
          borderRadius: 8,
          padding: '40px 32px 32px',
          boxShadow: '0 12px 32px rgba(26, 22, 18, 0.06)',
        }}
      >
        <img
          src="/assets/ncku-emba-logo.png"
          alt="成大 EMBA"
          style={{ height: 40, width: 'auto', display: 'block', marginBottom: 24 }}
        />
        <h1
          style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: 36,
            fontWeight: 300,
            color: '#1A1612',
            margin: '0 0 6px',
            letterSpacing: '-0.01em',
          }}
        >
          Welcome
        </h1>
        <p
          style={{
            fontFamily: "'Noto Serif TC', 'PingFang TC', serif",
            fontSize: 18,
            color: '#4A413A',
            margin: '0 0 28px',
          }}
        >
          E118 班級面板 · 請輸入班級密碼
        </p>

        <form onSubmit={handleSubmit}>
          <label
            htmlFor="class-password"
            style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 500,
              color: '#4A413A',
              marginBottom: 6,
              letterSpacing: '0.05em',
            }}
          >
            班級密碼
          </label>
          <input
            id="class-password"
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
            disabled={loading}
            maxLength={128}
            autoComplete="current-password"
            autoFocus
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '12px 14px',
              fontSize: 16,
              border: '1px solid #D9CDB8',
              borderRadius: 4,
              background: '#FAF7F2',
              marginBottom: 6,
              fontFamily: 'inherit',
            }}
          />
          <div
            style={{
              fontSize: 11,
              color: '#8A7F73',
              marginBottom: 20,
              fontFamily: 'ui-monospace, Menlo, monospace',
              letterSpacing: '0.05em',
            }}
          >
            密碼請洽班級幹部 · 輸入一次可記住 90 天
          </div>

          {error && (
            <div
              role="alert"
              style={{
                padding: '10px 14px',
                background: 'rgba(139, 31, 47, 0.08)',
                border: '1px solid rgba(139, 31, 47, 0.25)',
                borderRadius: 4,
                color: '#8B1F2F',
                fontSize: 13,
                marginBottom: 16,
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            style={{
              width: '100%',
              padding: '12px 20px',
              fontSize: 15,
              fontWeight: 600,
              background: loading || !password ? '#A84453' : '#8B1F2F',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: loading || !password ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s',
              fontFamily: 'inherit',
              letterSpacing: '0.05em',
            }}
          >
            {loading ? <LoadingLabel text="驗證中…" /> : '進入'}
          </button>
        </form>

        <p
          style={{
            marginTop: 24,
            fontSize: 11,
            color: '#8A7F73',
            lineHeight: 1.7,
            fontFamily: 'ui-monospace, Menlo, monospace',
            letterSpacing: '0.03em',
          }}
        >
          幹部請另走 <a href="/board/login" style={{ color: '#8B1F2F' }}>幹部登入</a>
        </p>
      </div>
    </main>
  );
}

export default function ClassLoginForm() {
  return (
    <Suspense fallback={null}>
      <Form />
    </Suspense>
  );
}
