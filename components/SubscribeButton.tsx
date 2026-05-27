'use client';

/**
 * SubscribeButton — request notification permission + register PWA push subscription
 *
 * 對應 ARCHITECTURE.md v3 第 7 章「訂閱端」流程：
 *   1. 確認 Service Worker + PushManager 支援
 *   2. 跳系統 notification 權限請求
 *   3. SW registration.pushManager.subscribe(VAPID_PUBLIC_KEY)
 *   4. localStorage 存 random management_token
 *   5. POST /api/board/subscribe with token + endpoint + keys + dept_filter
 */

import { useState, useEffect } from 'react';

const TOKEN_KEY = 'e118.board.push.management_token';
const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

// Convert URL-safe base64 to Uint8Array for VAPID applicationServerKey
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const base64Std = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64Std);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function ensureManagementToken(): string {
  if (typeof window === 'undefined') return '';
  let token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    token = Array.from(arr)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    localStorage.setItem(TOKEN_KEY, token);
  }
  return token;
}

type State =
  | { kind: 'idle' }
  | { kind: 'unsupported'; reason: string }
  | { kind: 'permission_denied' }
  | { kind: 'subscribed'; subscription_id: string }
  | { kind: 'error'; message: string }
  | { kind: 'loading' };

export default function SubscribeButton({
  deptFilter,
}: {
  deptFilter: string[];
}) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [supported, setSupported] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!VAPID) {
      setState({ kind: 'unsupported', reason: 'VAPID public key 未設定' });
      setSupported(false);
      return;
    }
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState({
        kind: 'unsupported',
        reason: '瀏覽器不支援 Web Push（iOS 必須 PWA 加入主畫面）',
      });
      setSupported(false);
      return;
    }
    setSupported(true);
  }, []);

  async function subscribe() {
    setState({ kind: 'loading' });
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState({ kind: 'permission_denied' });
        return;
      }

      // 確保 sw.js 已 register（PWARegister 已 register 過，這裡 ready promise 等好）
      const reg = await navigator.serviceWorker.ready;

      // 取現有 subscription 或建新的
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        // TS strict: PushSubscriptionOptions.applicationServerKey 需 BufferSource
        // Uint8Array<ArrayBufferLike> 不被當 BufferSource，cast 過去
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID) as unknown as BufferSource,
        });
      }

      const subJson = sub.toJSON() as {
        endpoint?: string;
        keys?: { p256dh?: string; auth?: string };
      };
      if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) {
        setState({ kind: 'error', message: '無法取得 subscription 資料' });
        return;
      }

      const managementToken = ensureManagementToken();

      const res = await fetch('/api/board/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          p256dh: subJson.keys.p256dh,
          auth: subJson.keys.auth,
          dept_filter: deptFilter,
          management_token: managementToken,
          user_agent: navigator.userAgent,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState({
          kind: 'error',
          message: data.error || `訂閱失敗（HTTP ${res.status}）`,
        });
        return;
      }
      setState({ kind: 'subscribed', subscription_id: data.subscription_id });
    } catch (err) {
      setState({
        kind: 'error',
        message: (err as Error).message || '訂閱發生未預期錯誤',
      });
    }
  }

  if (supported === null) return null;

  if (state.kind === 'unsupported') {
    return (
      <div
        style={{
          padding: '14px 18px',
          background: 'rgba(201, 169, 97, 0.12)',
          border: '1px solid rgba(201, 169, 97, 0.4)',
          borderRadius: 6,
          color: '#6B1622',
          fontSize: 13,
        }}
      >
        ⚠ {state.reason}
        <br />
        <span style={{ fontSize: 11, color: '#8A7F73' }}>
          iPhone 用戶：請先用 Safari 把主 dashboard 加入主畫面、變成 PWA
          後再進到這頁訂閱。
        </span>
      </div>
    );
  }

  if (state.kind === 'subscribed') {
    return (
      <div
        style={{
          padding: '14px 18px',
          background: 'rgba(45, 95, 78, 0.12)',
          border: '1px solid rgba(45, 95, 78, 0.4)',
          borderRadius: 6,
          color: '#2D5F4E',
          fontSize: 13,
        }}
      >
        ✅ 已訂閱推播 · 之後對應部門發新公告會直接通知這台裝置
        <br />
        <span style={{ fontSize: 11, opacity: 0.7 }}>
          subscription_id: {state.subscription_id}
        </span>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={subscribe}
        disabled={state.kind === 'loading' || deptFilter.length === 0}
        style={{
          padding: '12px 22px',
          fontSize: 14,
          fontWeight: 600,
          background:
            state.kind === 'loading' || deptFilter.length === 0
              ? '#A84453'
              : '#8B1F2F',
          color: '#fff',
          border: 'none',
          borderRadius: 4,
          cursor:
            state.kind === 'loading' || deptFilter.length === 0
              ? 'not-allowed'
              : 'pointer',
          fontFamily: 'inherit',
          letterSpacing: '0.05em',
        }}
      >
        {state.kind === 'loading'
          ? '訂閱中…'
          : deptFilter.length === 0
            ? '請先勾選想追蹤的部門'
            : '📢 開啟推播'}
      </button>

      {state.kind === 'permission_denied' && (
        <div
          style={{
            marginTop: 10,
            padding: '8px 12px',
            background: 'rgba(139, 31, 47, 0.08)',
            color: '#8B1F2F',
            fontSize: 12,
            borderRadius: 3,
          }}
        >
          通知權限被拒。請到瀏覽器設定 → 此網站 → 允許通知後再試。
        </div>
      )}
      {state.kind === 'error' && (
        <div
          style={{
            marginTop: 10,
            padding: '8px 12px',
            background: 'rgba(139, 31, 47, 0.08)',
            color: '#8B1F2F',
            fontSize: 12,
            borderRadius: 3,
          }}
        >
          {state.message}
        </div>
      )}
    </div>
  );
}
