'use client';

import NativePushOptIn from '@/components/NativePushOptIn';

/**
 * App 殼內的通知區塊：新版 App（內建推播外掛）顯示開啟流程；舊版退回 LINE 群組說明（由 NativePushOptIn 判斷）。
 * legacyOnly：幹部「部門留言通知」不走原生通道（原生目前只發新公告），維持原本說明文字。
 */
export default function NativeNotificationNotice({ legacyOnly = false }: { legacyOnly?: boolean }) {
  if (legacyOnly) {
    return (
      <p style={{ padding: '14px 18px', background: '#F4EFE6', borderRadius: 6, lineHeight: 1.7 }}>
        App 內不提供網頁推播。請透過班級 LINE 群組接收通知；需要加入時，請聯絡秘書處。
      </p>
    );
  }
  return <NativePushOptIn />;
}
