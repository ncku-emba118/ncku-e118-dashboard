'use client';

import { useEffect, useState } from 'react';
import Breadcrumb from '@/components/Breadcrumb';

const WINE = '#8B1F2F';
const CREAM = '#FAF7F2';
const INK = '#1A1612';
const MUTE = '#8A7F73';

type InboxRow = {
  role_label: string;
  status: string;
  signoff_documents: {
    id: string;
    title: string;
    amount: string | null;
    currency: string;
    status: string;
    created_at: string;
    due_at: string | null;
  } | null;
};
type CreatedRow = {
  id: string;
  title: string;
  amount: string | null;
  currency: string;
  status: string;
  created_at: string;
};
type HistoryRow = {
  role_label: string;
  status: string;
  acted_at: string | null;
  signoff_documents: {
    id: string;
    title: string;
    amount: string | null;
    currency: string;
    status: string;
    created_at: string;
  } | null;
};

const DOC_STATUS: Record<string, string> = {
  routing: '簽核中',
  approved: '✅ 已核准',
  rejected: '已退回',
  voided: '已作廢',
};

function money(a: string | null, c: string) {
  return a ? `${c} ${a}` : '—';
}

export default function SignoffInboxPage() {
  const [loading, setLoading] = useState(true);
  const [needLogin, setNeedLogin] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [inbox, setInbox] = useState<InboxRow[]>([]);
  const [created, setCreated] = useState<CreatedRow[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/board/signoff');
      if (res.status === 401) {
        setNeedLogin(true);
        setLoading(false);
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error || '載入失敗');
        setLoading(false);
        return;
      }
      setInbox(data.inbox || []);
      setCreated(data.created || []);
      setHistory(data.history || []);
      setLoading(false);
    })();
  }, []);

  return (
    <>
    <Breadcrumb items={[{ label: '班級面板', href: '/' }, { label: '班級經費中心', href: '/finance' }, { label: '簽核流程' }]} />
    <main style={{ minHeight: '100vh', background: CREAM, color: INK, padding: '24px 16px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, color: WINE, margin: 0 }}>📋 經費簽核</h1>
          <a
            href="/finance/signoff/new"
            style={{ background: WINE, color: '#fff', textDecoration: 'none', padding: '9px 16px', borderRadius: 4, fontSize: 14, fontWeight: 600 }}
          >
            ＋ 發起簽核
          </a>
        </div>

        {loading && <p style={{ color: MUTE }}>載入中…</p>}
        {needLogin && (
          <p>
            請先<a href="/board/login?next=/finance/signoff" style={{ color: WINE }}>登入幹部帳號</a>。
          </p>
        )}
        {err && <p style={{ color: '#b00' }}>{err}</p>}

        {!loading && !needLogin && !err && (
          <>
            <section style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 15, color: MUTE, borderBottom: '1px solid #E5DCCB', paddingBottom: 6 }}>
                待我簽核（{inbox.length}）
              </h2>
              {inbox.length === 0 && <p style={{ color: MUTE, fontSize: 14 }}>目前沒有待你簽核的文件。</p>}
              {inbox.map((row) =>
                row.signoff_documents ? (
                  <a
                    key={row.signoff_documents.id}
                    href={`/finance/signoff/${row.signoff_documents.id}`}
                    style={cardStyle}
                  >
                    <div style={{ fontWeight: 600 }}>{row.signoff_documents.title}</div>
                    <div style={{ fontSize: 13, color: MUTE, marginTop: 4 }}>
                      你的角色：{row.role_label} · {money(row.signoff_documents.amount, row.signoff_documents.currency)}
                    </div>
                  </a>
                ) : null,
              )}
            </section>

            <section>
              <h2 style={{ fontSize: 15, color: MUTE, borderBottom: '1px solid #E5DCCB', paddingBottom: 6 }}>
                我發起的（{created.length}）
              </h2>
              {created.length === 0 && <p style={{ color: MUTE, fontSize: 14 }}>你還沒發起過簽核。</p>}
              {created.map((d) => (
                <a key={d.id} href={`/finance/signoff/${d.id}`} style={cardStyle}>
                  <div style={{ fontWeight: 600 }}>{d.title}</div>
                  <div style={{ fontSize: 13, color: MUTE, marginTop: 4 }}>
                    {DOC_STATUS[d.status] ?? d.status} · {money(d.amount, d.currency)}
                  </div>
                </a>
              ))}
            </section>

            <section style={{ marginTop: 28 }}>
              <h2 style={{ fontSize: 15, color: MUTE, borderBottom: '1px solid #E5DCCB', paddingBottom: 6 }}>
                已簽核紀錄（{history.length}）
              </h2>
              {history.length === 0 && <p style={{ color: MUTE, fontSize: 14 }}>你還沒簽核過任何文件。</p>}
              {history.map((row, i) =>
                row.signoff_documents ? (
                  <a
                    key={`${row.signoff_documents.id}-${i}`}
                    href={`/finance/signoff/${row.signoff_documents.id}`}
                    style={cardStyle}
                  >
                    <div style={{ fontWeight: 600 }}>{row.signoff_documents.title}</div>
                    <div style={{ fontSize: 13, color: MUTE, marginTop: 4 }}>
                      {row.status === 'rejected' ? '你已退回' : '你已簽核'}
                      {row.acted_at ? ` · ${row.acted_at.slice(0, 10)}` : ''} · {DOC_STATUS[row.signoff_documents.status] ?? row.signoff_documents.status} · {money(row.signoff_documents.amount, row.signoff_documents.currency)}
                    </div>
                  </a>
                ) : null,
              )}
            </section>
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

const cardStyle: React.CSSProperties = {
  display: 'block',
  background: '#fff',
  border: '1px solid #E5DCCB',
  borderLeft: `4px solid ${WINE}`,
  borderRadius: 4,
  padding: '12px 14px',
  marginTop: 10,
  textDecoration: 'none',
  color: INK,
};
