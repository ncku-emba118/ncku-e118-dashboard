'use client';

/**
 * Admin 後台 LINE 推播路由設定（super only、秘書長獨佔）
 *
 * 對應：
 *   GET /api/board/line-routing/groups → 撈 Bot 已加入的群
 *   POST /api/board/line-routing/set  → 設目標群（單選；空 = idle）
 *
 * 設計：
 *   - 載入時自動 fetch 群清單
 *   - radio 單選 + 1 個「不推任何群」option（idle 狀態）
 *   - 即時生效：按「儲存」→ POST → 成功提示
 *   - 顯示「群名 + 加入時間」，不顯示完整 LINE group ID（保護資訊）
 */

import { useEffect, useState } from 'react';

type LineGroup = {
  groupId: string;
  name: string;
  joinedAt: string | null;
  isBroadcast: boolean;
};

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; groups: LineGroup[] }
  | { status: 'error'; message: string };

const IDLE_VALUE = '__idle__';

function formatJoinedAt(iso: string | null): string {
  if (!iso) return '—';
  try {
    return iso.slice(0, 10); // YYYY-MM-DD
  } catch {
    return '—';
  }
}

function shortGroupId(id: string): string {
  if (id.length <= 12) return id;
  return id.slice(0, 4) + '…' + id.slice(-4);
}

export default function AdminLineRouting() {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [selected, setSelected] = useState<string>(IDLE_VALUE);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  async function fetchGroups() {
    setLoad({ status: 'loading' });
    try {
      const r = await fetch('/api/board/line-routing/groups', { cache: 'no-store' });
      const data = await r.json();
      if (!r.ok) {
        setLoad({
          status: 'error',
          message: `${data.error || 'unknown'}${data.reason ? ` (${data.reason})` : ''}${data.detail ? ` · ${data.detail}` : ''}`,
        });
        return;
      }
      const groups = (data.groups || []) as LineGroup[];
      setLoad({ status: 'ready', groups });
      // 預設選中既有的 broadcast group（若有）
      const current = groups.find((g) => g.isBroadcast);
      setSelected(current ? current.groupId : IDLE_VALUE);
    } catch (err) {
      setLoad({
        status: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  useEffect(() => {
    void fetchGroups();
  }, []);

  async function onSave() {
    setSaving(true);
    setSaveMsg(null);
    try {
      const groupId = selected === IDLE_VALUE ? '' : selected;
      const r = await fetch('/api/board/line-routing/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId }),
      });
      const data = await r.json();
      if (!r.ok) {
        setSaveMsg({
          type: 'err',
          text: `${data.error || '存檔失敗'}${data.detail ? ` · ${data.detail}` : ''}`,
        });
        return;
      }
      const target = groupId
        ? load.status === 'ready'
          ? load.groups.find((g) => g.groupId === groupId)?.name || groupId
          : groupId
        : '無（idle）';
      setSaveMsg({
        type: 'ok',
        text: `✓ 已存：班級公告會推到「${target}」（清掉 ${data.cleared} 筆舊設定）`,
      });
      // refresh 看新狀態
      await fetchGroups();
    } catch (err) {
      setSaveMsg({
        type: 'err',
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  }

  const cardStyle: React.CSSProperties = {
    background: '#fff',
    border: '1px solid #D9CDB8',
    borderRadius: 6,
    padding: '16px 18px',
  };

  return (
    <section style={{ marginBottom: 20 }}>
      <h2
        style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontSize: 22,
          fontWeight: 400,
          color: '#1A1612',
          margin: '24px 0 8px',
        }}
      >
        LINE Broadcast Routing
      </h2>
      <p
        style={{
          fontSize: 12,
          color: '#8A7F73',
          margin: '0 0 12px',
          lineHeight: 1.6,
        }}
      >
        班級公告會推到下面選定的 LINE 群。<strong>單選</strong>，選「不推任何群」則完全 idle、不會打 LINE。<br />
        群清單從 Bot 即時撈（你 / Bot 加入新群會出現在這）。此設定**只有 super role 看得見**，其他幹部完全不會看到這塊。
      </p>

      <div style={cardStyle}>
        {load.status === 'loading' && (
          <div style={{ color: '#8A7F73', fontSize: 13 }}>載入中…</div>
        )}

        {load.status === 'error' && (
          <div style={{ color: '#8B1F2F', fontSize: 13 }}>
            ⚠️ 載入失敗：{load.message}
            <br />
            <span style={{ color: '#8A7F73', fontSize: 11 }}>
              常見：Netlify env `LINE_BOT_WEBHOOK_URL` 沒設、GAS 服務帳號權限、或 Bot script 還沒貼 patch。
            </span>
          </div>
        )}

        {load.status === 'ready' && (
          <>
            {load.groups.length === 0 ? (
              <div style={{ color: '#8A7F73', fontSize: 13 }}>
                Bot 目前還沒加入任何群（或 sheet 「狀態」欄全標非「啟用」）。<br />
                把 Bot 加進你的班務群後重新整理此頁。
              </div>
            ) : (
              <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
                <legend style={{ fontSize: 11, color: '#8A7F73', marginBottom: 8 }}>
                  選一個群：
                </legend>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {load.groups.map((g) => (
                    <label
                      key={g.groupId}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 10px',
                        border: selected === g.groupId ? '1px solid #8B1F2F' : '1px solid #E8DFD0',
                        background: selected === g.groupId ? 'rgba(139,31,47,0.05)' : '#fff',
                        borderRadius: 4,
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="radio"
                        name="line-broadcast"
                        value={g.groupId}
                        checked={selected === g.groupId}
                        onChange={() => setSelected(g.groupId)}
                        style={{ accentColor: '#8B1F2F' }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontFamily: "'Noto Serif TC', serif",
                            fontSize: 13.5,
                            fontWeight: 600,
                            color: '#1A1612',
                          }}
                        >
                          {g.name}
                          {g.isBroadcast && (
                            <span
                              style={{
                                marginLeft: 8,
                                fontSize: 10,
                                padding: '1px 6px',
                                background: 'rgba(139,31,47,0.12)',
                                color: '#8B1F2F',
                                borderRadius: 3,
                                fontWeight: 500,
                                letterSpacing: '0.05em',
                              }}
                            >
                              目前
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: 10.5,
                            color: '#8A7F73',
                            fontFamily: 'ui-monospace, Menlo, monospace',
                            marginTop: 2,
                          }}
                        >
                          ID {shortGroupId(g.groupId)} · 加入 {formatJoinedAt(g.joinedAt)}
                        </div>
                      </div>
                    </label>
                  ))}
                  {/* idle option */}
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 10px',
                      border: selected === IDLE_VALUE ? '1px solid #8A7F73' : '1px solid #E8DFD0',
                      background: selected === IDLE_VALUE ? 'rgba(138,127,115,0.06)' : '#fff',
                      borderRadius: 4,
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="radio"
                      name="line-broadcast"
                      value={IDLE_VALUE}
                      checked={selected === IDLE_VALUE}
                      onChange={() => setSelected(IDLE_VALUE)}
                      style={{ accentColor: '#8A7F73' }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: '#8A7F73' }}>
                        不推任何群（idle）
                      </div>
                      <div style={{ fontSize: 10.5, color: '#8A7F73', marginTop: 2 }}>
                        新公告完全不會推到 LINE — 只走 web push
                      </div>
                    </div>
                  </label>
                </div>
                <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={onSave}
                    disabled={saving}
                    style={{
                      padding: '8px 16px',
                      background: '#8B1F2F',
                      color: '#fff',
                      fontSize: 13,
                      fontWeight: 600,
                      borderRadius: 4,
                      border: 'none',
                      cursor: saving ? 'not-allowed' : 'pointer',
                      opacity: saving ? 0.6 : 1,
                      fontFamily: 'inherit',
                    }}
                  >
                    {saving ? '儲存中…' : '儲存設定'}
                  </button>
                  {saveMsg && (
                    <span
                      style={{
                        fontSize: 12,
                        color: saveMsg.type === 'ok' ? '#2D5F4E' : '#8B1F2F',
                      }}
                    >
                      {saveMsg.text}
                    </span>
                  )}
                </div>
              </fieldset>
            )}
          </>
        )}
      </div>
    </section>
  );
}
