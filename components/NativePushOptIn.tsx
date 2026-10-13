'use client';

/**
 * NativePushOptIn — App 殼內的「開啟通知」說明與同意流程（繁中白話；FCM 主題訂閱版）
 *
 *   1. 先顯示說明（會收到什麼、如何取得識別碼、可隨時關閉）——此時不呼叫任何系統權限、不取得識別碼
 *   2. 使用者按「同意並開啟」才 requestPermissions()（iOS／Android 13+ 系統彈窗）→ getToken() → subscribeToTopic('e118_all')
 *   3. 拒絕（系統層或按「暫時不要」）→ 不再主動彈窗；只顯示去系統設定開啟的說明
 *   4. 關閉通知 → unsubscribeFromTopic + deleteToken
 * 本站不儲存任何裝置識別碼（沒有 token 資料庫）；外掛不存在（舊版 App／一般瀏覽器）→ 顯示原本的 LINE 群組說明。
 */
import { useEffect, useState } from 'react';
import {
  DECLINED_KEY,
  ENABLED_KEY,
  disableNativePush,
  enableNativePush,
  getMessagingPlugin,
  getNativePlatform,
} from '@/lib/native-push-client';

type View =
  | { kind: 'checking' }
  | { kind: 'unavailable' }
  | { kind: 'prompt' }
  | { kind: 'declined' }
  | { kind: 'denied' }
  | { kind: 'working' }
  | { kind: 'on' }
  | { kind: 'error'; message: string };

const box = { padding: '14px 18px', background: '#F4EFE6', borderRadius: 6, lineHeight: 1.7 } as const;
const btn = {
  padding: '12px 24px',
  fontSize: 15,
  fontWeight: 600,
  background: '#8B1F2F',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
} as const;
const btn2 = { ...btn, background: 'transparent', color: '#6B1622', border: '1px solid #8B1F2F' } as const;

function store(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* 無痕模式等，略過 */
  }
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export default function NativePushOptIn() {
  const [view, setView] = useState<View>({ kind: 'checking' });

  useEffect(() => {
    const plugin = getMessagingPlugin(window);
    if (!plugin) {
      setView({ kind: 'unavailable' });
      return;
    }
    (async () => {
      try {
        const { receive } = await plugin.checkPermissions();
        if (receive === 'denied') setView({ kind: 'denied' });
        else if (receive === 'granted' && read(ENABLED_KEY)) {
          // 本機旗標只代表「曾經開啟」；識別碼可能已更新，所以每次進來都靜默重新訂閱（可重複執行），成功才顯示已開啟
          const r = await enableNativePush(plugin, getNativePlatform(window));
          setView(r === 'ok' ? { kind: 'on' } : { kind: 'prompt' });
        }
        else if (read(DECLINED_KEY)) setView({ kind: 'declined' });
        else setView({ kind: 'prompt' });
      } catch {
        setView({ kind: 'unavailable' });
      }
    })();
  }, []);

  async function enable() {
    const plugin = getMessagingPlugin(window);
    if (!plugin) return;
    setView({ kind: 'working' });
    const r = await enableNativePush(plugin, getNativePlatform(window));
    if (r === 'ok') {
      store(DECLINED_KEY, null);
      store(ENABLED_KEY, '1');
      setView({ kind: 'on' });
    } else if (r === 'denied') {
      setView({ kind: 'denied' });
    } else {
      setView({ kind: 'error', message: '這台裝置暫時無法開啟通知，請稍後再試。' });
    }
  }

  async function disable() {
    const plugin = getMessagingPlugin(window);
    if (!plugin) return;
    setView({ kind: 'working' });
    if (await disableNativePush(plugin)) {
      store(ENABLED_KEY, null);
      store(DECLINED_KEY, '1');
      setView({ kind: 'declined' });
    } else {
      setView({ kind: 'error', message: '關閉通知時發生問題，請稍後再試，或到手機「設定」→「通知」關閉。' });
    }
  }

  switch (view.kind) {
    case 'checking':
    case 'working':
      return <p style={box}>處理中…</p>;
    case 'unavailable':
      return (
        <p style={box}>
          App 內不提供網頁推播。請透過班級 LINE 群組接收通知；需要加入時，請聯絡秘書處。
        </p>
      );
    case 'prompt':
      return (
        <div style={box}>
          <h2 style={{ fontSize: 18, margin: '0 0 8px' }}>要接收班級公告通知嗎？</h2>
          <p style={{ margin: '0 0 12px' }}>
            班級有新公告時，我們會在這支手機通知你。只會通知公告，不會用來打廣告。
            按「同意並開啟」後，手機會向 Google Firebase 取得一組裝置通知識別碼，並加入「全班公告」通知群組；
            本站不會儲存這組識別碼，也不會用它辨識你是誰。你可以隨時回到這個頁面關閉，或到手機的「設定」→「通知」關閉。
            不開啟也不影響其他功能。
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button type="button" style={btn} onClick={enable}>
              同意並開啟
            </button>
            <button
              type="button"
              style={btn2}
              onClick={() => {
                store(DECLINED_KEY, '1');
                setView({ kind: 'declined' });
              }}
            >
              暫時不要
            </button>
          </div>
        </div>
      );
    case 'declined':
      return (
        <div style={box}>
          <p style={{ margin: '0 0 12px' }}>通知目前是關閉的。想收到班級公告通知時，可以隨時開啟。</p>
          <button type="button" style={btn} onClick={enable}>
            開啟通知
          </button>
        </div>
      );
    case 'denied':
      return (
        <p style={box}>
          通知已關閉。要開啟請到手機「設定」→「通知」→「NCKU E118」，允許通知後再回到這裡。
        </p>
      );
    case 'on':
      return (
        <div style={box}>
          <p style={{ margin: '0 0 12px' }}>已開啟通知，班級有新公告時會通知這支手機。</p>
          <button type="button" style={btn2} onClick={disable}>
            關閉通知
          </button>
        </div>
      );
    case 'error':
      return (
        <div style={box}>
          <p style={{ margin: '0 0 12px' }}>{view.message}</p>
          <button type="button" style={btn} onClick={enable}>
            再試一次
          </button>
        </div>
      );
  }
}
