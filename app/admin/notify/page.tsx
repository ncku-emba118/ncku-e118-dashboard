/**
 * /admin/notify — 秘書手動發 LINE 通知（手機優先，獨立頁面）。
 *
 * 刻意設計成跟班網完全脫鉤的獨立工具：
 *   - 不掛 Breadcrumb、不連回「班級面板」，畫面上看不出跟班網有任何關聯
 *   - 路徑放 /admin/notify 而非 /board/admin/notify：
 *     middleware.ts matcher = ['/board/admin/:path*', '/api/board/:path*']，
 *     放這裡不會被幹部 JWT 攔截，也不需要動既有 middleware（本次不改任何既有檔案）。
 *     本頁自己用 PIN session 把關（見 lib/notify/session.ts）。
 *   - 唯一跟班網共用的是網域（emba.aqualux.dev）跟部署管線，使用上完全獨立。
 *
 * 🔒 本頁與其呼叫的所有 API 都只處理姓名；LINE userId 全程留在 GAS 側，前端拿不到。
 */
import NotifyClient from '@/components/notify/NotifyClient';
import { hasNotifySession } from '@/lib/notify/session';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'E118 手動通知',
};

export default async function NotifyAdminPage() {
  const authed = await hasNotifySession();
  return <NotifyClient initialAuthed={authed} />;
}
