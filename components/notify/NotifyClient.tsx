'use client';

/**
 * 秘書手動通知主畫面（手機優先）。
 *
 * 兩段式：
 *   1. 未過 PIN → 4 位數密碼卡（版面／配色照抄 app/board/login/page.tsx 的幹部登入卡）
 *   2. 過 PIN   → 剩餘額度 + 可搜尋姓名勾選清單 + 訊息輸入 + 送出 + 結果 + 最近發送紀錄
 *
 * 🔒 這支元件從頭到尾只看得到姓名字串，沒有任何 LINE userId 的存在。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// ── 設計 token（沿用 CLAUDE.md 第 7 節色票，不自創）──
const WINE = '#8B1F2F';
const WINE_SOFT = '#A84453';
const GOLD_LINE = '#D9CDB8';
const CREAM = '#FAF7F2';
const INK = '#1A1612';
const MUTE = '#8A7F73';
const BODY_FONT =
  "-apple-system, BlinkMacSystemFont, system-ui, 'PingFang TC', sans-serif";
const SERIF = "'Cormorant Garamond', Georgia, serif";
const SERIF_TC = "'Noto Serif TC', 'PingFang TC', serif";

const MAX_MESSAGE_LEN = 4500;
const MAX_RECIPIENTS = 100;

type Quota =
  | { available: true; unlimited: boolean; limit: number | null; used: number | null; remaining: number | null }
  | { available: false; reason: string };

type FailedItem = { name: string; reason: string };

type HistoryRow = {
  ts: string;
  recipients: string;
  message: string;
  sent: string;
  failed: string;
  failedList: string;
};

type SendOutcome = {
  total: number;
  sent: number;
  failed: FailedItem[];
  /** false = 推播本身可能成功，但 GAS 寫「手動通知紀錄」分頁失敗，紀錄可能沒存到 */
  auditPersisted: boolean;
};

const shell: React.CSSProperties = {
  minHeight: '100vh',
  background: `linear-gradient(180deg, ${CREAM} 0%, #F4EFE6 100%)`,
  padding: '20px 14px 56px',
  fontFamily: BODY_FONT,
  color: INK,
};

const card: React.CSSProperties = {
  width: '100%',
  maxWidth: 560,
  margin: '0 auto 16px',
  background: '#fff',
  border: `1px solid ${GOLD_LINE}`,
  borderRadius: 8,
  padding: '20px 18px',
  boxShadow: '0 12px 32px rgba(26, 22, 18, 0.06)',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 500,
  color: '#4A413A',
  marginBottom: 6,
  letterSpacing: '0.05em',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  fontSize: 16, // ≥16px：iOS Safari 聚焦時才不會自動放大整頁
  border: `1px solid ${GOLD_LINE}`,
  borderRadius: 4,
  background: CREAM,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

function primaryButton(disabled: boolean): React.CSSProperties {
  return {
    width: '100%',
    padding: '14px 20px',
    fontSize: 15,
    fontWeight: 600,
    background: disabled ? WINE_SOFT : WINE,
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit',
    letterSpacing: '0.05em',
  };
}

const errorBox: React.CSSProperties = {
  padding: '10px 14px',
  background: 'rgba(139, 31, 47, 0.08)',
  border: '1px solid rgba(139, 31, 47, 0.25)',
  borderRadius: 4,
  color: WINE,
  fontSize: 13,
  marginBottom: 14,
};

// ════════════════════════════════════════════════════════════════
// PIN 卡
// ════════════════════════════════════════════════════════════════
function PinGate({ onPass }: { onPass: () => void }) {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pin.length !== 4) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/notify/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || '密碼錯誤');
        setPin('');
        return;
      }
      onPass();
    } catch {
      setError('網路錯誤，請稍後再試');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={shell}>
      <div style={{ ...card, marginTop: 24 }}>
        <h1 style={{ fontFamily: SERIF, fontSize: 34, fontWeight: 300, margin: '0 0 4px' }}>
          Notify
        </h1>
        <p style={{ fontFamily: SERIF_TC, fontSize: 17, color: '#4A413A', margin: '0 0 24px' }}>
          手動通知 · 秘書專用
        </p>

        <form onSubmit={submit}>
          <label style={labelStyle} htmlFor="notify-pin">
            4 位數密碼
          </label>
          <input
            id="notify-pin"
            type="password"
            inputMode="numeric"
            pattern="[0-9]{4}"
            maxLength={4}
            autoComplete="off"
            placeholder="••••"
            value={pin}
            onChange={(e) => {
              setPin(e.target.value.replace(/[^0-9]/g, ''));
              setError(null);
            }}
            disabled={loading}
            style={{ ...inputStyle, fontSize: 20, letterSpacing: '0.5em', textAlign: 'center', marginBottom: 16 }}
          />
          {error && <div style={errorBox}>{error}</div>}
          <button type="submit" disabled={loading || pin.length !== 4} style={primaryButton(loading || pin.length !== 4)}>
            {loading ? '驗證中…' : '進入'}
          </button>
        </form>

        <p style={{ marginTop: 20, fontSize: 11, color: MUTE, lineHeight: 1.7, fontFamily: 'ui-monospace, Menlo, monospace' }}>
          密碼由負責人發放 · 每分鐘最多嘗試 5 次
        </p>
      </div>
    </main>
  );
}

// ════════════════════════════════════════════════════════════════
// 主控台
// ════════════════════════════════════════════════════════════════
function Console({ onSessionExpired }: { onSessionExpired: () => void }) {
  const [names, setNames] = useState<string[]>([]);
  const [ambiguous, setAmbiguous] = useState<string[]>([]);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [keyword, setKeyword] = useState('');
  const [message, setMessage] = useState('');

  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<SendOutcome | null>(null);

  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  // 本次「送出」操作的一次性識別碼。逾時/網路錯誤重試時沿用同一個值（不重新產生），
  // 讓 GAS 端的 10 分鐘去重快取擋得住重送；成功送出或使用者改動收件人/內容後清空，下次送出才換新的。
  const requestIdRef = useRef<string | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/notify/history?limit=10');
      if (res.status === 401) {
        onSessionExpired();
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { rows?: HistoryRow[] };
      if (res.ok && Array.isArray(data.rows)) setHistory(data.rows);
    } catch {
      /* 紀錄載不到不擋主流程 */
    }
  }, [onSessionExpired]);

  const loadCandidates = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const res = await fetch('/api/notify/candidates');
      if (res.status === 401) {
        onSessionExpired();
        return;
      }
      const data = (await res.json().catch(() => ({}))) as {
        names?: string[];
        ambiguous?: string[];
        quota?: Quota;
        error?: string;
      };
      if (!res.ok) {
        setListError(data.error || '無法取得名單');
        return;
      }
      setNames(data.names ?? []);
      setAmbiguous(data.ambiguous ?? []);
      setQuota(data.quota ?? null);
    } catch {
      setListError('網路錯誤，請稍後再試');
    } finally {
      setLoadingList(false);
    }
  }, [onSessionExpired]);

  useEffect(() => {
    void loadCandidates();
    void loadHistory();
  }, [loadCandidates, loadHistory]);

  const visible = useMemo(() => {
    const k = keyword.trim();
    return k ? names.filter((n) => n.includes(k)) : names;
  }, [names, keyword]);

  // 收件人/內容一有變動，就視為「新的一次送出」，之前留著要重試的 requestId 作廢。
  function toggle(name: string) {
    requestIdRef.current = null;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function selectAllVisible() {
    requestIdRef.current = null;
    setSelected((prev) => {
      const next = new Set(prev);
      visible.forEach((n) => next.add(n));
      return next;
    });
  }

  function clearSelected() {
    requestIdRef.current = null;
    setSelected(new Set());
  }

  async function send() {
    const list = Array.from(selected);
    if (!list.length || !message.trim() || sending) return;
    if (!window.confirm(`確定要發送給 ${list.length} 位同學嗎？送出後無法收回。`)) return;

    // 同一次送出（含逾時/網路錯誤後的重試）沿用同一個 requestId；只有在成功送出、
    // 或使用者改動了收件人/訊息內容之後（見 toggle/selectAllVisible/clearSelected/textarea onChange）
    // 才會被清空，下一次送出才會拿到新的 requestId。
    if (!requestIdRef.current) requestIdRef.current = crypto.randomUUID();
    const requestId = requestIdRef.current;

    setSending(true);
    setSendError(null);
    setOutcome(null);
    try {
      const res = await fetch('/api/notify/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ names: list, message: message.trim(), requestId }),
      });
      if (res.status === 401) {
        onSessionExpired();
        return;
      }
      const data = (await res.json().catch(() => ({}))) as {
        total?: number;
        sent?: number;
        failed?: FailedItem[];
        quota?: Quota;
        auditPersisted?: boolean;
        dedup?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setSendError(data.error || '發送失敗');
        // 送出失敗（含 502）：requestId 保留，讓使用者按同一顆按鈕重試時沿用同一個 id。
        return;
      }
      setOutcome({
        total: data.total ?? list.length,
        sent: data.sent ?? 0,
        failed: data.failed ?? [],
        auditPersisted: data.auditPersisted !== false,
      });
      if (data.quota) setQuota(data.quota);
      // 成功了：這次送出已經完結，清掉 requestId 讓下一次送出換新的一個。
      requestIdRef.current = null;
      setSelected(new Set());
      setMessage('');
      void loadHistory();
    } catch {
      setSendError('網路錯誤，訊息可能未送出，請查看發送紀錄再決定是否重送');
      // 網路錯誤：requestId 保留，重按會沿用同一個 id，GAS 端才擋得住重複 push。
    } finally {
      setSending(false);
    }
  }

  const quotaText = (() => {
    if (!quota) return '額度查詢中…';
    if (!quota.available) return `本月剩餘推播額度：查詢失敗（${quota.reason}）`;
    if (quota.unlimited) return '本月推播額度：無上限';
    return `本月剩餘推播額度：${quota.remaining} 則（上限 ${quota.limit} · 已用 ${quota.used}）`;
  })();

  const lowQuota = quota?.available === true && !quota.unlimited && (quota.remaining ?? 0) < selected.size;
  const canSend = selected.size > 0 && message.trim().length > 0 && !sending && selected.size <= MAX_RECIPIENTS;

  return (
    <main style={shell}>
      {/* 獨立頁首：只有標題＋登出，不連回班網任何地方 */}
      <div
        style={{
          maxWidth: 560,
          margin: '0 auto 14px',
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
        }}
      >
        <h1 style={{ fontFamily: SERIF_TC, fontSize: 20, fontWeight: 600, margin: 0, color: WINE }}>
          E118 手動通知
        </h1>
        <button
          type="button"
          onClick={() => {
            void fetch('/api/notify/logout', { method: 'POST' }).finally(onSessionExpired);
          }}
          style={{
            background: 'none',
            border: 'none',
            color: MUTE,
            fontSize: 13,
            cursor: 'pointer',
            fontFamily: 'inherit',
            padding: 4,
          }}
        >
          登出
        </button>
      </div>

      {/* 額度 */}
      <div style={{ ...card, padding: '14px 18px', marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: lowQuota ? WINE : '#4A413A', fontWeight: lowQuota ? 600 : 400 }}>
          {quotaText}
        </div>
        {lowQuota && (
          <div style={{ fontSize: 12, color: WINE, marginTop: 6 }}>
            ⚠️ 勾選人數已超過剩餘額度，部分同學可能收不到。
          </div>
        )}
      </div>

      {/* 收件人 */}
      <section style={card}>
        <h2 style={{ fontFamily: SERIF_TC, fontSize: 17, margin: '0 0 12px' }}>
          1 · 選擇收件人
          <span style={{ fontSize: 13, color: MUTE, fontWeight: 400 }}>（已選 {selected.size} 位）</span>
        </h2>

        <input
          type="search"
          placeholder="搜尋姓名"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          style={{ ...inputStyle, marginBottom: 10 }}
        />

        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={selectAllVisible} style={chipButton}>
            全選目前清單
          </button>
          <button type="button" onClick={clearSelected} style={chipButton}>
            清除選取
          </button>
          <button type="button" onClick={() => void loadCandidates()} style={chipButton}>
            重新載入
          </button>
        </div>

        {listError && <div style={errorBox}>{listError}</div>}
        {loadingList && <div style={{ fontSize: 13, color: MUTE }}>載入名單中…</div>}

        {!loadingList && !listError && (
          <div
            style={{
              maxHeight: 320,
              overflowY: 'auto',
              border: `1px solid ${GOLD_LINE}`,
              borderRadius: 4,
              background: CREAM,
            }}
          >
            {visible.length === 0 && (
              <div style={{ padding: 14, fontSize: 13, color: MUTE }}>沒有符合的姓名</div>
            )}
            {visible.map((n) => {
              const on = selected.has(n);
              return (
                <label
                  key={n}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '12px 14px',
                    borderBottom: `1px solid ${GOLD_LINE}`,
                    background: on ? 'rgba(139, 31, 47, 0.06)' : 'transparent',
                    fontSize: 15,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(n)}
                    style={{ width: 20, height: 20, accentColor: WINE }}
                  />
                  <span>{n}</span>
                </label>
              );
            })}
          </div>
        )}

        {ambiguous.length > 0 && (
          <div style={{ marginTop: 10, fontSize: 12, color: MUTE, lineHeight: 1.7 }}>
            以下姓名在名冊有多筆同名、無法安全定位，不列入可選名單，請改用其他方式聯絡：
            <br />
            {ambiguous.join('、')}
          </div>
        )}
      </section>

      {/* 訊息 */}
      <section style={card}>
        <h2 style={{ fontFamily: SERIF_TC, fontSize: 17, margin: '0 0 12px' }}>2 · 通知內容</h2>
        <textarea
          value={message}
          onChange={(e) => {
            requestIdRef.current = null;
            setMessage(e.target.value.slice(0, MAX_MESSAGE_LEN));
          }}
          rows={7}
          placeholder="貼上或輸入要發給同學的訊息…"
          style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.7 }}
        />
        <div style={{ fontSize: 11, color: MUTE, marginTop: 6, textAlign: 'right' }}>
          {message.length} / {MAX_MESSAGE_LEN}
        </div>
      </section>

      {/* 送出 */}
      <section style={card}>
        <h2 style={{ fontFamily: SERIF_TC, fontSize: 17, margin: '0 0 12px' }}>3 · 確認送出</h2>
        {sendError && <div style={errorBox}>{sendError}</div>}
        <button
          type="button"
          onClick={() => void send()}
          disabled={!canSend || sending}
          style={primaryButton(!canSend || sending)}
        >
          {sending ? '發送中…' : `送出通知給 ${selected.size} 位同學`}
        </button>
        <p style={{ fontSize: 11, color: MUTE, marginTop: 10, lineHeight: 1.7 }}>
          逐一單獨私訊，每人各扣 1 則額度。送出後無法收回。
        </p>

        {outcome && (
          <div
            style={{
              marginTop: 14,
              padding: '12px 14px',
              border: `1px solid ${GOLD_LINE}`,
              borderRadius: 4,
              background: CREAM,
              fontSize: 13,
              lineHeight: 1.8,
            }}
          >
            <strong>發送結果</strong>
            <br />
            成功 {outcome.sent} 位 · 失敗 {outcome.failed.length} 位（共 {outcome.total} 位）
            {!outcome.auditPersisted && (
              <div style={{ marginTop: 6, fontSize: 12, color: MUTE }}>
                發送成功，但紀錄寫入可能失敗，建議之後跟系統管理員確認。
              </div>
            )}
            {outcome.failed.length > 0 && (
              <ul style={{ margin: '8px 0 0', paddingLeft: 18, color: WINE }}>
                {outcome.failed.map((f) => (
                  <li key={f.name}>
                    {f.name}：{f.reason}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* 紀錄 */}
      <section style={card}>
        <button
          type="button"
          onClick={() => {
            setHistoryOpen((v) => !v);
            if (!historyOpen) void loadHistory();
          }}
          style={{
            ...chipButton,
            width: '100%',
            padding: '10px 14px',
            fontSize: 14,
          }}
        >
          {historyOpen ? '收合最近發送紀錄' : '查看最近發送紀錄'}
        </button>

        {historyOpen && (
          <div style={{ marginTop: 12 }}>
            {history.length === 0 && <div style={{ fontSize: 13, color: MUTE }}>目前沒有紀錄</div>}
            {history.map((h, i) => (
              <div
                key={`${h.ts}-${i}`}
                style={{
                  padding: '10px 0',
                  borderBottom: i === history.length - 1 ? 'none' : `1px solid ${GOLD_LINE}`,
                  fontSize: 13,
                  lineHeight: 1.7,
                }}
              >
                <div style={{ color: MUTE, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11 }}>
                  {h.ts} · 成功 {h.sent} / 失敗 {h.failed}
                </div>
                <div style={{ color: '#4A413A' }}>{h.recipients}</div>
                <div style={{ color: INK, whiteSpace: 'pre-wrap', marginTop: 4 }}>{h.message}</div>
                {h.failedList && <div style={{ color: WINE, marginTop: 4 }}>失敗：{h.failedList}</div>}
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

const chipButton: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: 13,
  background: '#fff',
  color: '#4A413A',
  border: `1px solid ${GOLD_LINE}`,
  borderRadius: 4,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

export default function NotifyClient({ initialAuthed }: { initialAuthed: boolean }) {
  const [authed, setAuthed] = useState(initialAuthed);
  // API 回 401（session 過期/未登入）時，Console 內的 fetch 呼叫這個 callback：
  // 清掉已登入狀態、切回 PIN 輸入畫面，不會卡在一個按什麼都沒反應的畫面。
  const onSessionExpired = useCallback(() => setAuthed(false), []);
  if (!authed) return <PinGate onPass={() => setAuthed(true)} />;
  return <Console onSessionExpired={onSessionExpired} />;
}
