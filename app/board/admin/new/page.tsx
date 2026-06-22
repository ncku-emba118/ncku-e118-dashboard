import { redirect } from 'next/navigation';
import { readSession, manageableDepts } from '@/lib/auth/session';
import PostForm from '@/components/PostForm';
import Breadcrumb from '@/components/Breadcrumb';

export default async function NewPostPage() {
  const session = await readSession();
  if (!session) redirect('/board/login?next=/board/admin/new');

  const depts = manageableDepts(session);
  return (
    <>
    <Breadcrumb items={[{ label: '班級面板', href: '/' }, { label: '班級公告欄', href: '/board' }, { label: '後台', href: '/board/admin' }, { label: '新建公告' }]} />
    <PostForm
      mode="create"
      depts={depts.map((d) => ({ id: d.id, name: d.name, color: d.color }))}
      isSuper={session.role === 'super'}
      username={session.username}
    />
    </>
  );
}
