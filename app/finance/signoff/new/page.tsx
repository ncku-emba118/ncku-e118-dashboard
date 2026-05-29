'use client';

import { useEffect, useState } from 'react';

const WINE = '#8B1F2F';
const CREAM = '#FAF7F2';
const INK = '#1A1612';
const MUTE = '#8A7F73';

type Account = { id: string; username: string; role: string; home_dept_id: string | null };
type Pick = { id: string; username: string; selected: boolean; role: string };

const label: React.CSSProperties = { display: 'block', fontSize: 13, color: MUTE, marginTop: 14, marginBottom: 4 };
const input: React.CSSProperties = {
  width: '100%', padding: '9px 10px', border: '1px solid #D9CDB8', borderRadius: 4, fontSize: 15, boxSizing: 'border-box', background: '#fff', color: INK,
};

export default function SignoffNewPage() {
  const [accounts, setAccounts] = useState<Pick[]>([]);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [currency] = useState('TWD');
  const [purpose, setPurpose] = useState('');
  const [applicant, setApplicant] = useState('');
  const [category, setCategory] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/board/signoff/accounts');
      if (res.status === 401) { setNeedLogin(true); return; }
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setAccounts(
          (data.accounts as Account[]).map((a) => ({ id: a.id, username: a.username, selected: false, role: '審核' })),
        );
      }
    })();
  }, []);

  function toggle(id: string) {
    setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, selected: !a.selected } : a)));
  }
  function setRole(id: string, role: string) {
    setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, role } : a)));
  }

  async function submit() {
    setMsg(null);
    const picks = accounts.filter((a) => a.selected);
    if (!title.trim()) return setMsg('請填標題');
    if (files.length === 0) return setMsg('請至少上傳一個憑證（發票/明細，可多檔）');
    if (picks.length === 0) return setMsg('請至少指派一位簽核人');
    if (picks.some((p) => !p.role.trim())) return setMsg('每位簽核人都要填角色（如 審核/核准）');

    setBusy(true);
    try {
      // 1. 逐檔上傳到 Storage，收集 sources
      const sources: { object_path: string; mime: string; name: string }[] = [];
      for (const f of files) {
        const upRes = await fetch('/api/board/signoff/upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mime: f.type, size: f.size }),
        });
        const up = await upRes.json().catch(() => ({}));
        if (!upRes.ok) { setMsg(`「${f.name}」${up.error || '取得上傳網址失敗'}`); setBusy(false); return; }
        const put = await fetch(up.signed_url, {
          method: 'PUT',
          headers: { 'Content-Type': f.type, 'x-upsert': 'false' },
          body: f,
        });
        if (!put.ok) { setMsg(`「${f.name}」上傳失敗（HTTP ${put.status}）`); setBusy(false); return; }
        sources.push({ object_path: up.object_path, mime: up.mime, name: f.name });
      }

      // 2. 建立簽核
      const createRes = await fetch('/api/board/signoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_request_id: crypto.randomUUID(),
          title: title.trim(),
          amount: amount.trim() || null,
          currency,
          purpose: purpose.trim() || null,
          applicant: applicant.trim() || null,
          category: category || null,
          sources,
          assignees: picks.map((p) => ({ account_id: p.id, role_label: p.role.trim() })),
        }),
      });
      const created = await createRes.json().catch(() => ({}));
      if (!createRes.ok) { setMsg(created.error || '建立失敗'); setBusy(false); return; }

      window.location.href = `/finance/signoff/${created.document_id}`;
    } catch (e) {
      setMsg(`發生錯誤：${(e as Error).message}`);
      setBusy(false);
    }
  }

  if (needLogin) {
    return (
      <main style={{ minHeight: '100vh', background: CREAM, padding: 24 }}>
        <p>請先<a href="/board/login?next=/finance/signoff/new" style={{ color: WINE }}>登入幹部帳號</a>。</p>
      </main>
    );
  }

  return (
    <main style={{ minHeight: '100vh', background: CREAM, color: INK, padding: '24px 16px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <h1 style={{ fontSize: 20, color: WINE }}>發起經費簽核</h1>

        <label style={label}>標題 *</label>
        <input style={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例：1 月迎新茶會點心" />

        <label style={label}>金額（選填）</label>
        <input style={input} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="例：3200 或 3200.00" inputMode="decimal" />

        <label style={label}>用途（選填）</label>
        <input style={input} value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="例：茶會點心採購" />

        <label style={label}>申請人（選填）</label>
        <input style={input} value={applicant} onChange={(e) => setApplicant(e.target.value)} placeholder="例：活動長 王小明" />

        <label style={label}>支出分類（選填，用於透明報表統計）</label>
        <select style={input} value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">— 不分類 —</option>
          <option>班服</option><option>班遊</option><option>餐敘</option>
          <option>迎新</option><option>班聚</option><option>文具雜支</option><option>其他</option>
        </select>

        <label style={label}>憑證 *（發票 / 明細 / 收據，可一次選多個）</label>
        <input type="file" multiple accept="image/png,image/jpeg,application/pdf" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} style={{ ...input, padding: 8 }} />
        {files.length > 0 && (
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13, color: MUTE }}>
            {files.map((f, i) => (
              <li key={i}>{f.name}（{(f.size / 1024 / 1024).toFixed(2)} MB）</li>
            ))}
          </ul>
        )}

        <label style={label}>指派簽核人 *（勾選 + 填角色）</label>
        <div style={{ border: '1px solid #E5DCCB', borderRadius: 4, background: '#fff' }}>
          {accounts.map((a) => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid #F0E9DC' }}>
              <input type="checkbox" checked={a.selected} onChange={() => toggle(a.id)} />
              <span style={{ width: 90 }}>{a.username}</span>
              <input
                style={{ ...input, width: 140, padding: '5px 8px', fontSize: 13 }}
                value={a.role}
                disabled={!a.selected}
                onChange={(e) => setRole(a.id, e.target.value)}
                placeholder="角色"
              />
            </div>
          ))}
        </div>

        {msg && <p style={{ color: '#b00', marginTop: 14 }}>{msg}</p>}

        <button
          onClick={submit}
          disabled={busy}
          style={{ marginTop: 18, width: '100%', background: busy ? MUTE : WINE, color: '#fff', border: 'none', borderRadius: 4, padding: '12px', fontSize: 15, fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}
        >
          {busy ? '處理中…' : '建立並送出簽核'}
        </button>
        <p style={{ marginTop: 16 }}>
          <a href="/finance/signoff" style={{ color: MUTE, fontSize: 13 }}>← 取消</a>
        </p>
      </div>
    </main>
  );
}
