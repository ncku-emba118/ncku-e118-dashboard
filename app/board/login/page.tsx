'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { safeNext } from '@/lib/auth/safe-next';
import Breadcrumb from '@/components/Breadcrumb';

const ACCOUNTS: Array<{ value: string; label: string; role: 'super' | 'dept' }> = [
  { value: '班代',   label: '班代（super · 全部部門）',   role: 'super' },
  { value: '副班代', label: '副班代（super · 全部部門）', role: 'super' },
  { value: '秘書',   label: '秘書（super · 秘書部 + 全部）', role: 'super' },
  { value: '學務',   label: '學務（dept · 僅學務部）',     role: 'dept' },
  { value: '活動',   label: '活動（dept · 僅活動部）',     role: 'dept' },
  { value: '公關',   label: '公關（dept · 僅公關部）',     role: 'dept' },
  { value: '財務',   label: '財務（dept · 僅財務部）',     role: 'dept' },
  { value: '文宣',   label: '文宣（dept · 僅文宣部）',     role: 'dept' },
  { value: '醫務',   label: '醫務（dept · 僅醫務部）',     role: 'dept' },
];

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get('next'));

  const [username, setUsername] = useState<string>('班代');
  const [password, setPassword] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length !== 4) {
      setError('密碼必須是 4 位數');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/board/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '登入失敗');
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setError('網路錯誤，請稍後再試');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
    <Breadcrumb items={[{ label: '班級面板', href: '/' }, { label: '班級公告欄', href: '/board' }, { label: '幹部登入' }]} />
    <main
      style={{
        minHeight: '100vh',
        background:
          'linear-gradient(180deg, #FAF7F2 0%, #F4EFE6 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
        fontFamily:
          "-apple-system, BlinkMacSystemFont, system-ui, 'PingFang TC', sans-serif",
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
        <a
          href="/board"
          style={{
            color: '#8A7F73',
            textDecoration: 'none',
            fontSize: 12,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: 24,
            display: 'inline-block',
          }}
        >
          ← 回公告欄
        </a>

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
          Sign in
        </h1>
        <p
          style={{
            fontFamily: "'Noto Serif TC', 'PingFang TC', serif",
            fontSize: 18,
            color: '#4A413A',
            margin: '0 0 28px',
          }}
        >
          幹部登入 · 經費簽核與公告管理
        </p>

        <form onSubmit={handleSubmit}>
          <label
            style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 500,
              color: '#4A413A',
              marginBottom: 6,
              letterSpacing: '0.05em',
            }}
          >
            選擇部門
          </label>
          <select
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setError(null);
            }}
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px 14px',
              fontSize: 14,
              border: '1px solid #D9CDB8',
              borderRadius: 4,
              background: '#FAF7F2',
              marginBottom: 16,
              fontFamily: 'inherit',
            }}
          >
            {ACCOUNTS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>

          <label
            style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 500,
              color: '#4A413A',
              marginBottom: 6,
              letterSpacing: '0.05em',
            }}
          >
            4 位數密碼
          </label>
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]{4}"
            maxLength={4}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value.replace(/[^0-9]/g, ''));
              setError(null);
            }}
            disabled={loading}
            placeholder="••••"
            autoComplete="off"
            style={{
              width: '100%',
              padding: '12px 14px',
              fontSize: 18,
              letterSpacing: '0.5em',
              textAlign: 'center',
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
            密碼由負責人發放 · 同帳號錯 10 次將鎖 24 小時
          </div>

          {error && (
            <div
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
            disabled={loading || password.length !== 4}
            style={{
              width: '100%',
              padding: '12px 20px',
              fontSize: 15,
              fontWeight: 600,
              background: loading || password.length !== 4 ? '#A84453' : '#8B1F2F',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: loading || password.length !== 4 ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s',
              fontFamily: 'inherit',
              letterSpacing: '0.05em',
            }}
          >
            {loading ? '登入中…' : '登入'}
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
          密碼遺失 → 私訊負責人 reset<br />
          本系統無自助改密碼頁面
        </p>
      </div>
    </main>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
