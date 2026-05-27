'use client';

import { useState } from 'react';
import { ALL_DEPTS } from '@/lib/depts';
import SubscribeButton from '@/components/SubscribeButton';

export default function SubscribePage() {
  // Default：勾全部部門
  const [selected, setSelected] = useState<Set<string>>(
    new Set(ALL_DEPTS.map((d) => d.id)),
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(ALL_DEPTS.map((d) => d.id)));
  }
  function clearAll() {
    setSelected(new Set());
  }

  const deptFilter = Array.from(selected);

  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #FAF7F2 0%, #F4EFE6 100%)',
        padding: '32px 24px 80px',
        fontFamily:
          "-apple-system, BlinkMacSystemFont, system-ui, 'PingFang TC', sans-serif",
      }}
    >
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <nav
          style={{
            fontSize: 11,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: '#8A7F73',
            marginBottom: 20,
          }}
        >
          <a href="/" style={{ color: '#8A7F73', textDecoration: 'none' }}>
            主 dashboard
          </a>
          <span style={{ margin: '0 8px' }}>›</span>
          <a href="/board" style={{ color: '#8A7F73', textDecoration: 'none' }}>
            公告欄
          </a>
          <span style={{ margin: '0 8px' }}>›</span>
          <span style={{ color: '#8B1F2F' }}>訂閱推播</span>
        </nav>

        <h1
          style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: 36,
            fontWeight: 300,
            color: '#1A1612',
            margin: '0 0 6px',
          }}
        >
          Subscribe
        </h1>
        <p
          style={{
            fontFamily: "'Noto Serif TC', 'PingFang TC', serif",
            fontSize: 18,
            color: '#4A413A',
            margin: '0 0 24px',
          }}
        >
          📢 設定推播 — 對應部門發新公告會直接通知這台裝置
        </p>

        {/* iOS reminder */}
        <div
          style={{
            padding: '12px 16px',
            background: 'rgba(31, 63, 92, 0.06)',
            border: '1px solid rgba(31, 63, 92, 0.2)',
            borderRadius: 6,
            color: '#1F3F5C',
            fontSize: 13,
            lineHeight: 1.7,
            marginBottom: 24,
          }}
        >
          <strong>📱 iPhone 用戶請先確認：</strong>
          <br />
          1. 用 Safari 打開 <code>emba.aqualux.dev</code> 主 dashboard
          <br />
          2. 點分享按鈕 ⎙ → 加入主畫面（變成 PWA）
          <br />
          3. 從主畫面 icon 重新打開 → 進到這頁訂閱
          <br />
          <span style={{ fontSize: 12, color: '#4A413A' }}>
            iOS 16.4+ 必須走這個流程才能收 Web Push。Android Chrome / 桌面瀏覽器直接訂閱即可。
          </span>
        </div>

        <div
          style={{
            background: '#fff',
            border: '1px solid #D9CDB8',
            borderRadius: 8,
            padding: '24px 24px 20px',
            marginBottom: 24,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              marginBottom: 14,
            }}
          >
            <label
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: '#4A413A',
                letterSpacing: '0.05em',
              }}
            >
              想追蹤哪些部門？({selected.size}/{ALL_DEPTS.length})
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={selectAll}
                style={{
                  fontSize: 12,
                  color: '#8B1F2F',
                  background: 'transparent',
                  border: '1px solid #D9CDB8',
                  borderRadius: 3,
                  padding: '3px 10px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                全選
              </button>
              <button
                type="button"
                onClick={clearAll}
                style={{
                  fontSize: 12,
                  color: '#8A7F73',
                  background: 'transparent',
                  border: '1px solid #D9CDB8',
                  borderRadius: 3,
                  padding: '3px 10px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                清空
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {ALL_DEPTS.map((d) => {
              const checked = selected.has(d.id);
              return (
                <label
                  key={d.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 14px',
                    borderRadius: 4,
                    border: `1px solid ${checked ? d.color : '#D9CDB8'}`,
                    background: checked ? `${d.color}1A` : '#FAF7F2',
                    cursor: 'pointer',
                    fontSize: 14,
                    color: checked ? d.color : '#4A413A',
                    fontFamily: "'Noto Serif TC', serif",
                    fontWeight: checked ? 600 : 400,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(d.id)}
                    style={{ accentColor: d.color }}
                  />
                  {d.name}
                </label>
              );
            })}
          </div>

          <p
            style={{
              marginTop: 12,
              fontSize: 11,
              color: '#8A7F73',
              fontFamily: 'ui-monospace, Menlo, monospace',
              letterSpacing: '0.03em',
            }}
          >
            預設全部勾選 · 取消勾選即不接收該部門公告
          </p>
        </div>

        <SubscribeButton deptFilter={deptFilter} />

        <p
          style={{
            marginTop: 24,
            fontSize: 11,
            color: '#8A7F73',
            fontFamily: 'ui-monospace, Menlo, monospace',
            letterSpacing: '0.03em',
            textAlign: 'center',
          }}
        >
          推播 management token 存在這台裝置的 localStorage、未來更新訂閱用同一個 token。
          <br />
          清掉瀏覽器資料會失去管理權、要重新訂閱。
        </p>
      </div>
    </main>
  );
}
