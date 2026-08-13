'use client';

import { useEffect, useState } from 'react';
import Breadcrumb from '@/components/Breadcrumb';
import { ATTACHMENT_LABELS } from '@/lib/signoff/constants';
import { normalizeImageOrientation } from '@/lib/signoff/normalize-image';

const WINE = '#8B1F2F';
const CREAM = '#FAF7F2';
const INK = '#1A1612';
const MUTE = '#8A7F73';

type Account = { id: string; username: string; role: string; home_dept_id: string | null };
type Pick = { id: string; username: string; selected: boolean; role: string; isFinance: boolean };

const label: React.CSSProperties = { display: 'block', fontSize: 13, color: MUTE, marginTop: 14, marginBottom: 4 };
const input: React.CSSProperties = {
  width: '100%', padding: '9px 10px', border: '1px solid #D9CDB8', borderRadius: 4, fontSize: 15, boxSizing: 'border-box', background: '#fff', color: INK,
};

/** 金額正規化：全形數字→半形、去掉千分位逗號與空白。使用者習慣打「14,400」。 */
function normalizeAmount(v: string): string {
  return v
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[．]/g, '.')
    .replace(/[,，\s]/g, '');
}

export default function SignoffNewPage() {
  const [accounts, setAccounts] = useState<Pick[]>([]);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [currency] = useState('TWD');
  const [purpose, setPurpose] = useState('');
  const [applicant, setApplicant] = useState('');
  const [category, setCategory] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  // 每檔的類型標籤與說明，索引對齊 files
  const [meta, setMeta] = useState<{ label: string; caption: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  // 收款帳號（0027）：選填，預設展開（有些單據不需匯款，使用者可以直接不填）。
  const [paymentBank, setPaymentBank] = useState('');
  const [paymentBranch, setPaymentBranch] = useState('');
  const [paymentAccountName, setPaymentAccountName] = useState('');
  const [paymentAccountNumber, setPaymentAccountNumber] = useState('');
  const [paymentProofFile, setPaymentProofFile] = useState<File | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/board/signoff/accounts');
      if (res.status === 401) { setNeedLogin(true); return; }
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setAccounts(
          (data.accounts as Account[]).map((a) => {
            const isFinance = a.home_dept_id === 'finance';
            // 財務長一律自動成為簽核人、且不可取消（後端 route 會強制補上/重排到最後
            // 一關，這裡預先勾選只是讓畫面跟後端行為一致，真正權威判斷在後端）。
            return { id: a.id, username: a.username, selected: isFinance, role: isFinance ? '財務長核准' : '審核', isFinance };
          }),
        );
      }
    })();
  }, []);

  const financeCount = accounts.filter((a) => a.isFinance).length;

  function toggle(id: string) {
    setAccounts((prev) => prev.map((a) => (a.id === id && !a.isFinance ? { ...a, selected: !a.selected } : a)));
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
      type Source = { object_path: string; mime: string; name: string; label?: string; caption?: string };
      // 沿用既有附件上傳機制（/api/board/signoff/upload-url）逐檔上傳，回傳
      // 一個 source 物件；收款帳號照片與一般憑證共用這支函式，只差在 label。
      async function uploadOne(file0: File, extra: { label?: string; caption?: string } = {}): Promise<Source> {
        // 影像先正規化 EXIF 方向，否則合成的最終 PDF 會倒向
        const f = await normalizeImageOrientation(file0);
        const upRes = await fetch('/api/board/signoff/upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mime: f.type, size: f.size }),
        });
        const up = await upRes.json().catch(() => ({}));
        if (!upRes.ok) throw new Error(`「${f.name}」${up.error || '取得上傳網址失敗'}`);
        const put = await fetch(up.signed_url, {
          method: 'PUT',
          headers: { 'Content-Type': f.type, 'x-upsert': 'false' },
          body: f,
        });
        if (!put.ok) throw new Error(`「${file0.name}」上傳失敗（HTTP ${put.status}）`);
        return {
          object_path: up.object_path,
          mime: up.mime,
          name: f.name,
          ...(extra.label ? { label: extra.label } : {}),
          ...(extra.caption?.trim() ? { caption: extra.caption.trim() } : {}),
        };
      }

      // 1. 逐檔上傳到 Storage，收集 sources
      const sources: Source[] = [];
      for (const [fi, f0] of files.entries()) {
        sources.push(await uploadOne(f0, meta[fi]));
      }
      // 1b. 收款帳號證明照片（0027，選填）：同一支 upload-url + 同一個 sources
      // 陣列送出，只用 label='收款帳號證明' 區分用途，不另開儲存路徑。
      if (paymentProofFile) {
        sources.push(await uploadOne(paymentProofFile, { label: '收款帳號證明' }));
      }

      const paymentAccountFilled =
        paymentBank.trim() || paymentBranch.trim() || paymentAccountName.trim() || paymentAccountNumber.trim();

      // 2. 建立簽核
      const createRes = await fetch('/api/board/signoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_request_id: crypto.randomUUID(),
          title: title.trim(),
          // 千分位逗號 / 全形數字先在前端就正規化（後端也會再做一次，兩邊都不擋人）
          amount: normalizeAmount(amount) || null,
          currency,
          purpose: purpose.trim() || null,
          applicant: applicant.trim() || null,
          category: category || null,
          sources,
          assignees: picks.map((p) => ({ account_id: p.id, role_label: p.role.trim() })),
          payment_account: paymentAccountFilled
            ? {
                bank: paymentBank.trim() || undefined,
                branch: paymentBranch.trim() || undefined,
                account_name: paymentAccountName.trim() || undefined,
                account_number: paymentAccountNumber.trim() || undefined,
              }
            : null,
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

  const breadcrumb = (
    <Breadcrumb items={[
      { label: '班級面板', href: '/' },
      { label: '班級經費中心', href: '/finance' },
      { label: '簽核', href: '/finance/signoff' },
      { label: '新建' },
    ]} />
  );

  if (needLogin) {
    return (
      <>
      {breadcrumb}
      <main style={{ minHeight: '100vh', background: CREAM, padding: 24 }}>
        <p>請先<a href="/board/login?next=/finance/signoff/new" style={{ color: WINE }}>登入幹部帳號</a>。</p>
      </main>
      </>
    );
  }

  return (
    <>
    {breadcrumb}
    <main style={{ minHeight: '100vh', background: CREAM, color: INK, padding: '24px 16px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <h1 style={{ fontSize: 20, color: WINE }}>發起經費單簽核</h1>

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
          <option>迎新</option><option>班聚</option><option>活動</option>
          <option>文具雜支</option><option>其他</option>
        </select>

        <label style={label}>憑證 *（發票 / 明細 / 收據，可一次選多個）</label>
        <input
          type="file"
          multiple
          accept="image/png,image/jpeg,application/pdf"
          onChange={(e) => {
            const list = Array.from(e.target.files ?? []);
            setFiles(list);
            setMeta(list.map(() => ({ label: '', caption: '' })));
          }}
          style={{ ...input, padding: 8 }}
        />
        {files.map((f, i) => (
          <div key={i} style={{ marginTop: 8, padding: 10, background: '#FAF7F2', border: '1px solid #E5DCCB', borderRadius: 4 }}>
            <div style={{ fontSize: 12.5, color: MUTE, wordBreak: 'break-all' }}>
              {f.name}（{(f.size / 1024 / 1024).toFixed(2)} MB）
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 7, flexWrap: 'wrap' }}>
              <select
                value={meta[i]?.label ?? ''}
                onChange={(e) => setMeta((prev) => prev.map((m, j) => (j === i ? { ...m, label: e.target.value } : m)))}
                style={{ padding: '6px 8px', border: '1px solid #D9CDB8', borderRadius: 4, fontSize: 13 }}
              >
                <option value="">類型（選填）</option>
                {ATTACHMENT_LABELS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
              <input
                value={meta[i]?.caption ?? ''}
                onChange={(e) => setMeta((prev) => prev.map((m, j) => (j === i ? { ...m, caption: e.target.value } : m)))}
                placeholder="說明（選填）"
                style={{ flex: 1, minWidth: 140, padding: '6px 8px', border: '1px solid #D9CDB8', borderRadius: 4, fontSize: 13 }}
              />
            </div>
          </div>
        ))}

        <label style={label}>指派簽核人 *（勾選 + 填角色；財務長一律必選、排在最後一關）</label>
        <div style={{ border: '1px solid #E5DCCB', borderRadius: 4, background: '#fff' }}>
          {accounts.map((a) => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid #F0E9DC', background: a.isFinance ? '#FBF6EA' : undefined }}>
              <input type="checkbox" checked={a.selected} disabled={a.isFinance} onChange={() => toggle(a.id)} />
              <span style={{ width: 90 }}>{a.username}</span>
              <input
                style={{ ...input, width: 140, padding: '5px 8px', fontSize: 13 }}
                value={a.role}
                disabled={!a.selected}
                onChange={(e) => setRole(a.id, e.target.value)}
                placeholder="角色"
              />
              {a.isFinance && (
                <span style={{ fontSize: 11.5, color: WINE, fontWeight: 700, whiteSpace: 'nowrap' }}>
                  必選．財務長最後核准
                </span>
              )}
            </div>
          ))}
        </div>
        {financeCount === 0 && (
          <p style={{ fontSize: 12.5, color: '#b00', marginTop: 6, lineHeight: 1.7 }}>
            ⚠ 目前系統查無財務長帳號（home_dept_id=finance），建立簽核單時會被系統擋下，請先請系統管理員設定財務長。
          </p>
        )}
        {financeCount > 1 && (
          <p style={{ fontSize: 12.5, color: '#b00', marginTop: 6, lineHeight: 1.7 }}>
            ⚠ 偵測到多位財務長帳號設定（{financeCount} 位），建立簽核單時會被系統擋下，請先聯絡系統管理員釐清。
          </p>
        )}

        <label style={label}>收款帳號（選填，讓財務長知道要匯去哪；有些單據不需匯款可留空）</label>
        <div style={{ border: '1px solid #E5DCCB', borderRadius: 4, background: '#fff', padding: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input style={input} value={paymentBank} onChange={(e) => setPaymentBank(e.target.value)} placeholder="銀行（例：台灣銀行）" />
            <input style={input} value={paymentBranch} onChange={(e) => setPaymentBranch(e.target.value)} placeholder="分行（例：成功分行）" />
            <input style={input} value={paymentAccountName} onChange={(e) => setPaymentAccountName(e.target.value)} placeholder="戶名" />
            <input
              style={input}
              value={paymentAccountNumber}
              onChange={(e) => setPaymentAccountNumber(e.target.value)}
              placeholder="帳號（純數字，可用 - 分段）"
              inputMode="numeric"
            />
          </div>
          <label style={{ ...label, marginTop: 12 }}>或上傳存摺封面／轉帳畫面截圖（選填，兩者可併存）</label>
          <input
            type="file"
            accept="image/png,image/jpeg,application/pdf"
            onChange={(e) => setPaymentProofFile(e.target.files?.[0] ?? null)}
            style={{ ...input, padding: 8 }}
          />
          {paymentProofFile && (
            <div style={{ fontSize: 12.5, color: MUTE, marginTop: 6, wordBreak: 'break-all' }}>
              已選擇：{paymentProofFile.name}（{(paymentProofFile.size / 1024 / 1024).toFixed(2)} MB）
            </div>
          )}
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
    </>
  );
}
