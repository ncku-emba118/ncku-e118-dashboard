/**
 * /board/admin/class-password — 更換班級共用密碼（super only）。
 *
 * 在 /board/admin/* 底下 → middleware 內層既有邏輯先擋未登入；
 * 本頁再 readSession() + role 檢查（API 端也會再檢查一次）。
 */
import { redirect } from 'next/navigation';
import Breadcrumb from '@/components/Breadcrumb';
import { readSession } from '@/lib/auth/session';
import ClassPasswordForm from '@/components/class-gate/ClassPasswordForm';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '班級密碼設定',
  robots: { index: false, follow: false },
};

export default async function ClassPasswordPage() {
  const session = await readSession();
  if (!session) redirect('/board/login?next=/board/admin/class-password');

  const isSuper = session.role === 'super';

  return (
    <>
      <Breadcrumb
        items={[
          { label: '班級面板', href: '/' },
          { label: '後台管理', href: '/board/admin' },
          { label: '班級密碼' },
        ]}
      />
      <main
        style={{
          minHeight: '100vh',
          background: 'linear-gradient(180deg, #FAF7F2 0%, #F4EFE6 100%)',
          padding: '32px 20px 80px',
          fontFamily: "-apple-system, BlinkMacSystemFont, system-ui, 'PingFang TC', sans-serif",
        }}
      >
        <div
          style={{
            maxWidth: 480,
            margin: '0 auto',
            background: '#fff',
            border: '1px solid #D9CDB8',
            borderRadius: 8,
            padding: '32px 28px',
          }}
        >
          <h1
            style={{
              fontFamily: "'Noto Serif TC', 'PingFang TC', serif",
              fontSize: 22,
              color: '#1A1612',
              margin: '0 0 8px',
            }}
          >
            更換班級共用密碼
          </h1>
          <p style={{ fontSize: 13, color: '#4A413A', lineHeight: 1.7, margin: '0 0 20px' }}>
            這組密碼是全班共用的「外層」門鎖（首頁、行事曆、公告欄、成員圖鑑等）。
            跟幹部個人登入是兩回事，改這裡不影響任何幹部帳號。
            <br />
            ⚠ 改密碼後，已經登入過的同學在 90 天內仍可繼續使用，只有新裝置 / 新登入要用新密碼。
          </p>
          {isSuper ? (
            <ClassPasswordForm />
          ) : (
            <p style={{ fontSize: 14, color: '#8B1F2F' }}>
              只有班代、副班代、秘書帳號可以更換班級密碼。
            </p>
          )}
        </div>
      </main>
    </>
  );
}
