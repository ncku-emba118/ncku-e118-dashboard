'use client';

import SubscribeButton from '@/components/SubscribeButton';
import Breadcrumb from '@/components/Breadcrumb';

export default function SubscribePage() {
  return (
    <>
    <Breadcrumb items={[
      { label: '班級面板', href: '/' },
      { label: '班級公告欄', href: '/board' },
      { label: '訂閱推播' },
    ]} />
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
          📢 設定推播 — 任何部門發新公告都會直接通知這台裝置
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

        {/* Hero info card */}
        <div
          style={{
            background: '#fff',
            border: '1px solid #D9CDB8',
            borderRadius: 8,
            padding: '24px 24px 22px',
            marginBottom: 20,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 36, marginBottom: 8 }}>🔔</div>
          <div
            style={{
              fontFamily: "'Noto Serif TC', serif",
              fontWeight: 600,
              fontSize: 16,
              color: '#1A1612',
              marginBottom: 6,
            }}
          >
            全班公告統一推播
          </div>
          <div
            style={{
              fontSize: 13,
              color: '#4A413A',
              lineHeight: 1.7,
            }}
          >
            7 個部門（秘書／學務／活動／公關／財務／文宣／醫務）任何一篇新公告
            <br />
            都會直接通知這台裝置 — 一次訂閱、全部收到
          </div>
        </div>

        <SubscribeButton />

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
    </>
  );
}
