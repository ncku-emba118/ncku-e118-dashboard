'use client';

/**
 * AdminCommentSubscribeButton — 幹部後台「訂閱留言通知」
 *
 * 跟 components/SubscribeButton.tsx（全班公告推播、匿名自助）的差異：
 *   • 這裡登入身份就是授權依據，POST /api/board/admin/comment-subscribe 不用 client token
 *   • 可勾選要訂閱的部門（dept 帳號只有自己那個、super 全部可選）
 *   • 有人在勾選的部門公告下留言 → 只有這裡訂閱的裝置會收到，不是全班
 */

import { useState, useEffect } from 'react';
import type { DeptInfo } from '@/lib/depts';

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const base64Std = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64Std);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type State =
  | { kind: 'idle' }
  | { kind: 'unsupported'; reason: string }
  | { kind: 'permission_denied' }
  | { kind: 'subscribed'; dept_ids: string[] }
  | { kind: 'error'; message: string }
  | { kind: 'loading' };

export default function AdminCommentSubscribeButton({
  depts,
}: {
  depts: DeptInfo[];
}) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [supported, setSupported] = useState<boolean | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set(depts.map((d) => d.id)));

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!VAPID) {
      setState({ kind: 'unsupported', reason: 'VAPID public key 未設定' });
      setSupported(false);
      return;
    }
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState({ kind: 'unsupported', reason: '瀏覽器不支援 Web Push（iOS 必須 PWA 加入主畫面）' });
      setSupported(false);
      return;
    }
    setSupported(true);
  }, []);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function subscribe() {
    setState({ kind: 'loading' });
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState({ kind: 'permission_denied' });
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
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

      const res = await fetch('/api/board/admin/comment-subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          p256dh: subJson.keys.p256dh,
          auth: subJson.keys.auth,
          user_agent: navigator.userAgent,
          dept_ids: [...selected],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState({ kind: 'error', message: data.error || `訂閱失敗（HTTP ${res.status}）` });
        return;
      }
      setState({ kind: 'subscribed', dept_ids: data.dept_ids ?? [...selected] });
    } catch (err) {
      setState({ kind: 'error', message: (err as Error).message || '訂閱發生未預期錯誤' });
    }
  }

  if (supported === null) return null;

  const box = {
    background: '#fff',
    border: '1px solid #D9CDB8',
    borderRadius: 6,
    padding: '16px 20px',
    marginBottom: 20,
  } as const;

  if (state.kind === 'unsupported') {
    return (
      <div style={{ ...box, color: '#6B1622', fontSize: 13 }}>
        🔕 留言通知：⚠ {state.reason}
      </div>
    );
  }

  if (state.kind === 'subscribed') {
    const names = depts
      .filter((d) => state.dept_ids.includes(d.id))
      .map((d) => d.name);
    return (
      <div style={{ ...box, color: '#2D5F4E' }}>
        <span style={{ fontSize: 13 }}>
          ✅ 已訂閱留言通知：{names.length > 0 ? names.join('、') : '（目前沒有勾選部門，等於暫停通知）'}
        </span>
        <div style={{ marginTop: 6 }}>
          <DeptCheckboxes depts={depts} selected={selected} onToggle={toggle} />
        </div>
        <button
          type="button"
          onClick={subscribe}
          style={{
            marginTop: 10,
            padding: '6px 14px',
            fontSize: 12,
            background: 'transparent',
            color: '#8B1F2F',
            border: '1px solid #8B1F2F',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          更新訂閱設定
        </button>
      </div>
    );
  }

  const loading = state.kind === 'loading';

  return (
    <div style={box}>
      <p style={{ fontSize: 13, color: '#4A413A', margin: '0 0 10px' }}>
        🔔 留言通知 — 有人在下面勾選的部門公告底下留言時，通知這台裝置（不是全班，只有訂閱的幹部會收到）
      </p>
      <DeptCheckboxes depts={depts} selected={selected} onToggle={toggle} />
      <button
        type="button"
        onClick={subscribe}
        disabled={loading}
        style={{
          marginTop: 12,
          padding: '10px 20px',
          fontSize: 13,
          fontWeight: 600,
          background: loading ? '#A84453' : '#8B1F2F',
          color: '#fff',
          border: 'none',
          borderRadius: 4,
          cursor: loading ? 'not-allowed' : 'pointer',
          letterSpacing: '0.03em',
        }}
      >
        {loading ? '訂閱中…' : '訂閱留言通知'}
      </button>

      {state.kind === 'permission_denied' && (
        <div style={{ marginTop: 10, fontSize: 12, color: '#8B1F2F' }}>
          通知權限被拒。請到瀏覽器設定 → 此網站 → 允許通知後再試。
        </div>
      )}
      {state.kind === 'error' && (
        <div style={{ marginTop: 10, fontSize: 12, color: '#8B1F2F' }}>{state.message}</div>
      )}
    </div>
  );
}

function DeptCheckboxes({
  depts,
  selected,
  onToggle,
}: {
  depts: DeptInfo[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  if (depts.length <= 1) return null; // dept 帳號只有一個部門可選，不用顯示清單
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
      {depts.map((d) => (
        <label
          key={d.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 12,
            color: '#4A413A',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={selected.has(d.id)}
            onChange={() => onToggle(d.id)}
          />
          {d.name}
        </label>
      ))}
    </div>
  );
}
