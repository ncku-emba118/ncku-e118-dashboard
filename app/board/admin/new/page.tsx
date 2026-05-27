import { redirect } from 'next/navigation';
import { readSession, manageableDepts } from '@/lib/auth/session';
import PostForm from '@/components/PostForm';

export default async function NewPostPage() {
  const session = await readSession();
  if (!session) redirect('/board/login?next=/board/admin/new');

  const depts = manageableDepts(session);
  return (
    <PostForm
      mode="create"
      depts={depts.map((d) => ({ id: d.id, name: d.name, color: d.color }))}
      isSuper={session.role === 'super'}
      username={session.username}
    />
  );
}
