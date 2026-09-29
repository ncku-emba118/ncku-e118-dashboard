'use client';

/** /board/admin/class-password 的表單：輸入兩次新密碼 → POST /api/board/class-password */
import { useState } from 'react';
import { LoadingLabel } from '@/components/Loading';

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '12px 14px',
  fontSize: 16,
  border: '1px solid #D9CDB8',
  borderRadius: 4,
  background: '#FAF7F2',
  marginBottom: 14,
  fontFamily: 'inherit',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 500,
  color: '#4A413A',
  marginBottom: 6,
  letterSpacing: '0.05em',
};

export default function ClassPasswordForm() {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (pw !== pw2) {
      setError('兩次輸入的密碼不一樣');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/board/class-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || '儲存失敗');
        return;
      }
      setDone(true);
      setPw('');
      setPw2('');
    } catch {
      setError('網路錯誤，請稍後再試');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="new-class-pw" style={labelStyle}>新密碼（6–64 字）</label>
      <input
        id="new-class-pw"
        type="password"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        disabled={loading}
        autoComplete="new-password"
        maxLength={64}
        style={inputStyle}
      />
      <label htmlFor="new-class-pw2" style={labelStyle}>再輸入一次</label>
      <input
        id="new-class-pw2"
        type="password"
        value={pw2}
        onChange={(e) => setPw2(e.target.value)}
        disabled={loading}
        autoComplete="new-password"
        maxLength={64}
        style={inputStyle}
      />
      {error && (
        <div role="alert" style={{ color: '#8B1F2F', fontSize: 13, marginBottom: 12 }}>
          {error}
        </div>
      )}
      {done && (
        <div role="status" style={{ color: '#2D5F4E', fontSize: 13, marginBottom: 12 }}>
          ✓ 已更新班級密碼
        </div>
      )}
      <button
        type="submit"
        disabled={loading || !pw || !pw2}
        style={{
          width: '100%',
          padding: '12px 20px',
          fontSize: 15,
          fontWeight: 600,
          background: loading || !pw || !pw2 ? '#A84453' : '#8B1F2F',
          color: '#fff',
          border: 'none',
          borderRadius: 4,
          cursor: loading || !pw || !pw2 ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
        }}
      >
        {loading ? <LoadingLabel text="儲存中…" /> : '更新密碼'}
      </button>
    </form>
  );
}
