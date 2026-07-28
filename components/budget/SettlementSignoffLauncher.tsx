'use client';

/**
 * 結算單頁「送出簽核」按鈕 + modal（0022）。
 *
 * 只在 server component（app/budget/settlement/[slug]/page.tsx）已經判斷
 * 角色（財務長／班代）且目前沒有進行中/已核准的簽核單時才會被渲染；
 * 但這裡仍然完整走 POST /api/board/signoff，該 route 會再驗一次角色
 * （canInitiateSettlementSignoff），不能只靠「這顆按鈕有沒有出現」把關。
 *
 * 標題／金額／用途自動帶入，財務長只需要：勾選簽核人 + 上傳一份憑證。
 * 送出成功後用 router.refresh() 讓 server component 重新查 DB，
 * 畫面立刻顯示「簽核中」，不必重新部署。
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { normalizeImageOrientation } from '@/lib/signoff/normalize-image';

const WINE = '#8B1F2F';
const WINE_DEEP = '#6B1622';
const INK = '#1A1612';
const MUTE = '#8A7F73';
const LINE = '#E8DFD0';

type Account = { id: string; username: string; role: string; home_dept_id: string | null };
type Pick = Account & { selected: boolean; role_label: string };

export default function SettlementSignoffLauncher({
  settlementNo,
  defaultTitle,
  defaultAmount,
  defaultPurpose,
}: {
  settlementNo: string;
  defaultTitle: string;
  defaultAmount: number | null;
  defaultPurpose: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="no-print" style={launchBtnStyle}>
        ✍️ 送出簽核
      </button>
      {open && (
        <Modal
          settlementNo={settlementNo}
          defaultTitle={defaultTitle}
          defaultAmount={defaultAmount}
          defaultPurpose={defaultPurpose}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function Modal({
  settlementNo,
  defaultTitle,
  defaultAmount,
  defaultPurpose,
  onClose,
}: {
  settlementNo: string;
  defaultTitle: string;
  defaultAmount: number | null;
  defaultPurpose: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Pick[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/board/signoff/accounts');
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setAccounts(
            (data.accounts as Account[]).map((a) => ({ ...a, selected: false, role_label: '會簽' })),
          );
        } else {
          setMsg(data.error || '無法取得幹部帳號清單');
        }
      } catch {
        setMsg('無法取得幹部帳號清單');
      } finally {
        setLoadingAccounts(false);
      }
    })();
  }, []);

  function toggle(id: string) {
    setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, selected: !a.selected } : a)));
  }
  function setRole(id: string, role_label: string) {
    setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, role_label } : a)));
  }

  async function submit() {
    setMsg(null);
    const picks = accounts.filter((a) => a.selected);
    if (!file) return setMsg('請上傳一份憑證（發票 / 明細 / 收據）');
    if (picks.length === 0) return setMsg('請至少指派一位簽核人');
    if (picks.some((p) => !p.role_label.trim())) return setMsg('每位簽核人都要填角色（如 審核 / 核准）');

    setBusy(true);
    try {
      // 1. 上傳憑證
      const normalized = await normalizeImageOrientation(file);
      const upRes = await fetch('/api/board/signoff/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mime: normalized.type, size: normalized.size }),
      });
      const up = await upRes.json().catch(() => ({}));
      if (!upRes.ok) {
        setMsg(up.error || '取得上傳網址失敗');
        setBusy(false);
        return;
      }
      const put = await fetch(up.signed_url, {
        method: 'PUT',
        headers: { 'Content-Type': normalized.type, 'x-upsert': 'false' },
        body: normalized,
      });
      if (!put.ok) {
        setMsg(`憑證上傳失敗（HTTP ${put.status}）`);
        setBusy(false);
        return;
      }

      // 2. 建立簽核（帶 settlement_no，route 端會再驗一次財務長/班代身分）
      const createRes = await fetch('/api/board/signoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_request_id: crypto.randomUUID(),
          title: defaultTitle,
          amount: defaultAmount !== null ? String(Math.round(defaultAmount)) : null,
          currency: 'TWD',
          purpose: defaultPurpose,
          settlement_no: settlementNo,
          sources: [
            {
              object_path: up.object_path,
              mime: up.mime,
              name: file.name,
              label: '結算單',
            },
          ],
          assignees: picks.map((p) => ({ account_id: p.id, role_label: p.role_label.trim() })),
        }),
      });
      const created = await createRes.json().catch(() => ({}));
      if (!createRes.ok) {
        setMsg(created.error || '建立簽核失敗');
        setBusy(false);
        return;
      }

      setDone(true);
      setBusy(false);
      router.refresh();
    } catch (e) {
      setMsg(`發生錯誤：${(e as Error).message}`);
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Overlay onClose={onClose}>
        <p style={{ fontSize: 14, color: WINE_DEEP, fontWeight: 600 }}>✓ 已送出簽核</p>
        <p style={{ fontSize: 12.5, color: MUTE, marginTop: 8 }}>
          頁面已更新為「簽核中」；幹部簽核進度可於各自登入後在班網「經費單簽核」查看。
        </p>
        <button type="button" onClick={onClose} style={{ ...primaryBtnStyle, marginTop: 16 }}>
          關閉
        </button>
      </Overlay>
    );
  }

  return (
    <Overlay onClose={onClose}>
      <h2 style={{ fontFamily: "'Noto Serif TC', serif", fontSize: 17, color: WINE_DEEP, margin: '0 0 4px' }}>
        送出結算單簽核
      </h2>
      <p style={{ fontSize: 11.5, color: MUTE, margin: '0 0 14px' }}>結算單編號 {settlementNo}</p>

      <div style={fieldRowStyle}>
        <span style={fieldLabelStyle}>標題</span>
        <span style={{ color: INK }}>{defaultTitle}</span>
      </div>
      <div style={fieldRowStyle}>
        <span style={fieldLabelStyle}>金額</span>
        <span style={{ color: INK }}>{defaultAmount !== null ? `NT$ ${defaultAmount.toLocaleString('en-US')}` : '未填（見結算單明細）'}</span>
      </div>
      <div style={fieldRowStyle}>
        <span style={fieldLabelStyle}>用途</span>
        <span style={{ color: INK }}>{defaultPurpose}</span>
      </div>

      <label style={label}>憑證 *（結算單本身或發票 / 明細，擇一上傳）</label>
      <input
        type="file"
        accept="image/png,image/jpeg,application/pdf"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        style={{ ...input, padding: 8 }}
      />
      {file && (
        <div style={{ fontSize: 12, color: MUTE, marginTop: 4 }}>
          {file.name}（{(file.size / 1024 / 1024).toFixed(2)} MB）
        </div>
      )}

      <label style={label}>指派簽核人 *（勾選 + 填角色）</label>
      {loadingAccounts ? (
        <div style={{ fontSize: 12.5, color: MUTE }}>載入幹部名單中…</div>
      ) : (
        <div style={{ border: `1px solid ${LINE}`, borderRadius: 4, background: '#fff', maxHeight: 260, overflowY: 'auto' }}>
          {accounts.map((a) => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: `1px solid #F0E9DC` }}>
              <input type="checkbox" checked={a.selected} onChange={() => toggle(a.id)} />
              <span style={{ width: 78, fontSize: 13 }}>{a.username}</span>
              <input
                value={a.role_label}
                disabled={!a.selected}
                onChange={(e) => setRole(a.id, e.target.value)}
                placeholder="角色（如 審核/核准）"
                style={{ ...input, flex: 1, padding: '5px 8px', fontSize: 12.5 }}
              />
            </div>
          ))}
        </div>
      )}

      {msg && (
        <div style={{ marginTop: 12, fontSize: 12, color: '#B00', background: '#FDF2F2', border: '1px solid #F6C7C7', padding: '6px 10px', borderRadius: 4 }}>
          {msg}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onClose} disabled={busy} style={secondaryBtnStyle}>
          取消
        </button>
        <button type="button" onClick={submit} disabled={busy} style={{ ...primaryBtnStyle, opacity: busy ? 0.6 : 1 }}>
          {busy ? '送出中…' : '確認送出'}
        </button>
      </div>
    </Overlay>
  );
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      className="no-print"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(26, 22, 18, 0.55)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 12,
          padding: 24,
          width: '100%',
          maxWidth: 520,
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 16px 60px rgba(0,0,0,0.3)',
        }}
      >
        {children}
      </div>
    </div>
  );
}

const label: React.CSSProperties = { display: 'block', fontSize: 12.5, color: MUTE, marginTop: 14, marginBottom: 5 };
const input: React.CSSProperties = {
  width: '100%',
  padding: '9px 10px',
  border: `1px solid ${LINE}`,
  borderRadius: 4,
  fontSize: 13.5,
  boxSizing: 'border-box',
  background: '#fff',
  color: INK,
};

const fieldRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '64px 1fr',
  gap: 8,
  fontSize: 13,
  padding: '3px 0',
};
const fieldLabelStyle: React.CSSProperties = { color: MUTE };

const launchBtnStyle: React.CSSProperties = {
  appearance: 'none',
  border: `1px solid ${WINE_DEEP}`,
  background: '#fff',
  color: WINE_DEEP,
  borderRadius: 4,
  padding: '9px 18px',
  fontSize: 13.5,
  fontWeight: 600,
  fontFamily: "'Noto Serif TC', 'PingFang TC', 'Songti TC', serif",
  cursor: 'pointer',
  letterSpacing: 0.5,
};

const primaryBtnStyle: React.CSSProperties = {
  padding: '8px 18px',
  background: WINE,
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: '8px 14px',
  background: '#fff',
  color: INK,
  border: `1px solid ${LINE}`,
  borderRadius: 6,
  fontSize: 13,
  cursor: 'pointer',
};
