'use client';

/**
 * NativePushOptIn — App 殼內的「開啟通知」說明與同意流程（繁中白話）
 *
 *   1. 先顯示說明（會收到什麼、可隨時關閉）——此時不呼叫任何系統權限
 *   2. 使用者按「開啟通知」才 requestPermissions()（iOS／Android 13+ 系統彈窗）
 *   3. granted → register() → 'registration' 事件取得 token → POST /api/native-push-register
 *   4. 拒絕（系統層或按「暫時不要」）→ 不再主動彈窗；只顯示去系統設定開啟的說明
 * 外掛不存在（舊版 App／一般瀏覽器）→ 顯示原本的 LINE 群組說明。
 */
import { useCallback, useEffect, useState } from 'react';
import {
  DECLINED_KEY,
  ensureManagementToken,
  getNativePlatform,
  getPushPlugin,
  parseShellVersion,
  postRegistration,
  type PermState,
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

export const TOKEN_CACHE_KEY = 'e118.native.push.last_token';

export default function NativePushOptIn() {
  const [view, setView] = useState<View>({ kind: 'checking' });

  const register = useCallback(async (): Promise<void> => {
    const plugin = getPushPlugin(window);
    const platform = getNativePlatform(window);
    if (!plugin || !platform) {
      setView({ kind: 'unavailable' });
      return;
    }
    setView({ kind: 'working' });
    try {
      const handle = await plugin.addListener('registration', (async (t: { value: string }) => {
        try {
          const r = await postRegistration({
            action: 'register',
            platform,
            token: t.value,
            appVersion: parseShellVersion(navigator.userAgent),
            managementToken: ensureManagementToken(localStorage),
          });
          if (r.ok) {
            try {
              localStorage.setItem(TOKEN_CACHE_KEY, t.value);
            } catch {
              /* 無痕模式等，略過 */
            }
            setView({ kind: 'on' });
          } else {
            setView({ kind: 'error', message: `通知設定未能儲存（${r.status}），請稍後再試。` });
          }
        } finally {
          void handle.remove();
        }
      }) as never);
      await plugin.addListener('registrationError', (() => {
        setView({ kind: 'error', message: '這台裝置暫時無法開啟通知，請稍後再試。' });
      }) as never);
      await plugin.register();
    } catch {
      setView({ kind: 'error', message: '開啟通知時發生問題，請稍後再試。' });
    }
  }, []);

  useEffect(() => {
    const plugin = getPushPlugin(window);
    if (!plugin || !getNativePlatform(window)) {
      setView({ kind: 'unavailable' });
      return;
    }
    (async () => {
      try {
        const { receive } = await plugin.checkPermissions();
        if (receive === 'granted') {
          // 已同意過：靜默更新 token（不彈窗）
          await register();
        } else if (receive === 'denied') {
          setView({ kind: 'denied' });
        } else if (localStorage.getItem(DECLINED_KEY)) {
          setView({ kind: 'declined' });
        } else {
          setView({ kind: 'prompt' });
        }
      } catch {
        setView({ kind: 'unavailable' });
      }
    })();
  }, [register]);

  async function enable() {
    const plugin = getPushPlugin(window);
    if (!plugin) return;
    setView({ kind: 'working' });
    try {
      const { receive }: { receive: PermState } = await plugin.requestPermissions();
      if (receive !== 'granted') {
        setView({ kind: 'denied' });
        return;
      }
      try {
        localStorage.removeItem(DECLINED_KEY);
      } catch {
        /* ignore */
      }
      await register();
    } catch {
      setView({ kind: 'error', message: '開啟通知時發生問題，請稍後再試。' });
    }
  }

  async function disable() {
    setView({ kind: 'working' });
    try {
      const platform = getNativePlatform(window);
      const token = localStorage.getItem(TOKEN_CACHE_KEY);
      if (platform && token) {
        await postRegistration({
          action: 'disable',
          platform,
          token,
          managementToken: ensureManagementToken(localStorage),
        });
        localStorage.removeItem(TOKEN_CACHE_KEY);
      }
      localStorage.setItem(DECLINED_KEY, '1');
    } catch {
      /* 失敗也讓使用者看到已關閉的畫面；系統設定可再關 */
    }
    setView({ kind: 'declined' });
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
            你可以隨時回到這個頁面關閉，或到手機的「設定」→「通知」關閉。不開啟也不影響其他功能。
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button type="button" style={btn} onClick={enable}>
              開啟通知
            </button>
            <button
              type="button"
              style={btn2}
              onClick={() => {
                try {
                  localStorage.setItem(DECLINED_KEY, '1');
                } catch {
                  /* ignore */
                }
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
