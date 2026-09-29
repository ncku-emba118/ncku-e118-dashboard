/**
 * /class-login — 班級共用密碼輸入頁（外層閘門入口）。
 *
 * middleware 對沒有有效班級 cookie 的頁面請求導來這裡（帶 ?next=原路徑），
 * 輸入正確後由 POST /api/class-gate/login 發 90 天 cookie，再整頁導回 next。
 * 本頁本身在 lib/auth/class-gate.ts 的豁免清單內。
 */
import type { Metadata } from 'next';
import ClassLoginForm from '@/components/class-gate/ClassLoginForm';

export const metadata: Metadata = {
  title: 'E118 班級面板 · 請輸入班級密碼',
  robots: { index: false, follow: false },
};

export default function ClassLoginPage() {
  return <ClassLoginForm />;
}
