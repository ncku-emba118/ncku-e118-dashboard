'use client';

import { useEffect, useState } from 'react';
import { INCOME_CATEGORIES } from '@/lib/finance/income';
import Breadcrumb from '@/components/Breadcrumb';

const WINE = '#8B1F2F';
const CREAM = '#FAF7F2';
const INK = '#1A1612';
const MUTE = '#8A7F73';
const LINE = '#E5DCCB';
const OK = '#2D5F4E';

type IncomeRow = {
  id: string;
  occurred_on: string;
  category: string;
  amount: string;
  note: string | null;
  created_at: string;
};

const fmt = (n: number) => n.toLocaleString('en-US');
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });

export default function IncomeManagePage() {
  const [loading, setLoading] = useState(true);
  const [needLogin, setNeedLogin] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<IncomeRow[]>([]);

  // form
  const [date, setDate] = useState(today());
  const [category, setCategory] = useState<string>(INCOME_CATEGORIES[0]);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  async function load() {
    const res = await fetch('/api/board/finance/income');
    if (res.status === 401) { setNeedLogin(true); setLoading(false); return; }
    if (res.status === 403) { setForbidden(true); setLoading(false); return; }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(data.error || '載入失敗'); setLoading(false); return; }
    setRows(data.income || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const total = rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setFormErr(null);
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) { setFormErr('金額需大於 0'); return; }
    setSubmitting(true);
    const res = await fetch('/api/board/finance/income', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ occurred_on: date, category, amount: amt, note }),
    });
    const data = await res.json().catch(() => ({}));
    setSubmitting(false);
    if (!res.ok) { setFormErr(data.error || '新增失敗'); return; }
    setAmount(''); setNote('');
    await load();
  }

  async function del(id: string) {
    if (!confirm('確定刪除這筆收入？')) return;
    const res = await fetch(`/api/board/finance/income/${id}/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || '刪除失敗');
      return;
    }
    await load();
  }

  return (
    <>
    <Breadcrumb items={[{ label: '班級面板', href: '/' }, { label: '班級經費中心', href: '/finance' }, { label: '收入記錄' }]} />
    <main style={{ minHeight: '100vh', background: CREAM, color: INK, padding: '24px 16px', fontFamily: '"Noto Sans TC",sans-serif' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h1 style={{ fontSize: 22, color: WINE, margin: 0 }}>💰 收入管理</h1>
          <a href="/finance/signoff" style={{ color: MUTE, fontSize: 13, textDecoration: 'none' }}>經費簽核 →</a>
        </div>

        {loading && <p style={{ color: MUTE }}>載入中…</p>}
        {needLogin && (
          <p>請先<a href="/board/login?next=/finance/income" style={{ color: WINE }}>登入幹部帳號</a>（限財務長 / 班代）。</p>
        )}
        {forbidden && <p style={{ color: '#b00' }}>此頁僅限財務長 / 班代 / 副班代 / 秘書。</p>}
        {err && <p style={{ color: '#b00' }}>{err}</p>}

        {!loading && !needLogin && !forbidden && !err && (
          <>
            {/* 新增表單 */}
            <form onSubmit={add} style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 8, padding: 16, marginBottom: 22 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: WINE }}>＋ 記一筆收入</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <label style={lbl}>日期
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required style={inp} />
                </label>
                <label style={lbl}>項目
                  <select value={category} onChange={(e) => setCategory(e.target.value)} style={inp}>
                    {INCOME_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label style={lbl}>金額（NT$）
                  <input type="number" min="1" step="1" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="例：303000" required style={inp} />
                </label>
                <label style={lbl}>備註（選填）
                  <input type="text" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="例：每人 3000 × 101 人" style={inp} />
                </label>
              </div>
              {formErr && <p style={{ color: '#b00', fontSize: 13, margin: '10px 0 0' }}>{formErr}</p>}
              <button type="submit" disabled={submitting} style={{ marginTop: 12, background: WINE, color: '#fff', border: 0, borderRadius: 4, padding: '9px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: submitting ? 0.6 : 1 }}>
                {submitting ? '新增中…' : '新增收入'}
              </button>
            </form>

            {/* 收入總額 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', background: '#fff', border: `1px solid ${LINE}`, borderLeft: `4px solid ${OK}`, borderRadius: 8, padding: '13px 16px', marginBottom: 16 }}>
              <span style={{ fontSize: 14, color: MUTE }}>目前收入總額（{rows.length} 筆）</span>
              <span style={{ fontFamily: 'serif', fontWeight: 700, fontSize: 20, color: OK }}>NT$ {fmt(Math.round(total))}</span>
            </div>

            {/* 明細列表 */}
            {rows.length === 0 && <p style={{ color: MUTE, fontSize: 14 }}>目前沒有收入紀錄。班費收齊後在上方記第一筆。</p>}
            {rows.map((r) => (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', border: `1px solid ${LINE}`, borderRadius: 6, padding: '11px 14px', marginBottom: 8 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {r.category}
                    <span style={{ fontFamily: 'serif', fontWeight: 700, marginLeft: 10 }}>+{fmt(Math.round(parseFloat(r.amount) || 0))}</span>
                  </div>
                  <div style={{ fontSize: 12, color: MUTE, marginTop: 3 }}>
                    {r.occurred_on}{r.note ? ` · ${r.note}` : ''}
                  </div>
                </div>
                <button onClick={() => del(r.id)} style={{ background: 'transparent', border: `1px solid ${LINE}`, color: MUTE, borderRadius: 4, padding: '5px 10px', fontSize: 12, cursor: 'pointer' }}>刪除</button>
              </div>
            ))}
          </>
        )}

        <p style={{ marginTop: 32 }}>
          <a href="/finance" style={{ color: MUTE, fontSize: 13 }}>← 回經費中心</a>
        </p>
      </div>
    </main>
    </>
  );
}

const lbl: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, color: MUTE };
const inp: React.CSSProperties = { border: `1px solid ${LINE}`, borderRadius: 4, padding: '8px 10px', fontSize: 14, color: INK, background: '#fff' };
