/**
 * /board/admin/new — 寫新公告（server component wrapper）
 * 讀 session → 計算可選部門 → 傳給 client form
 */
import { redirect } from 'next/navigation';
import { readSession, manageableDepts } from '@/lib/auth/session';
import NewPostForm from './NewPostForm';

export default async function NewPostPage() {
  const session = await readSession();
  if (!session) redirect('/board/login?next=/board/admin/new');

  const depts = manageableDepts(session);
  return (
    <NewPostForm
      depts={depts.map((d) => ({ id: d.id, name: d.name, color: d.color }))}
      isSuper={session.role === 'super'}
      username={session.username}
    />
  );
}
