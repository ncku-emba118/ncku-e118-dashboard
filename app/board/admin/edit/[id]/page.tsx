/**
 * /board/admin/edit/[id] — 編輯既有公告
 * Server wrapper: 驗 session + 載 post + 檢權限 → 傳給 PostForm mode=edit
 */
import { notFound, redirect } from 'next/navigation';
import {
  readSession,
  canManageDept,
  ALL_DEPTS,
  deptInfo,
} from '@/lib/auth/session';
import { getServerClient } from '@/lib/supabase/server';
import PostForm, { type PostFormInitial } from '@/components/PostForm';
import { normalizeAttachments } from '@/lib/attachment';
import Breadcrumb from '@/components/Breadcrumb';

const UUID_RE = /^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/;

type LoadedPost = {
  id: string;
  department_id: string;
  title: string;
  content: string;
  attachments: unknown;
  pinned: boolean;
  version: number;
};

async function loadPost(id: string): Promise<LoadedPost | null> {
  if (!UUID_RE.test(id)) return null;
  const supabase = getServerClient();
  const { data } = await supabase
    .from('posts')
    .select(
      'id, department_id, title, content, attachments, pinned, version',
    )
    .eq('id', id)
    .maybeSingle();
  if (!data) return null;
  return data as unknown as LoadedPost;
}

export default async function EditPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await readSession();
  if (!session) {
    redirect(`/board/login?next=/board/admin/edit/${id}`);
  }

  const post = await loadPost(id);
  if (!post) notFound();

  if (!canManageDept(session, post.department_id)) {
    // 不在自己部門 — 跳回 admin
    redirect('/board/admin');
  }

  const initial: PostFormInitial = {
    department_id: post.department_id,
    title: post.title,
    content: post.content,
    pinned: post.pinned,
    attachments: normalizeAttachments(post.attachments),
    version: post.version,
  };

  // edit mode 只給原部門選項（鎖定、不能改）
  const lockedDept = deptInfo(post.department_id);
  const depts = [{ id: lockedDept.id, name: lockedDept.name, color: lockedDept.color }];

  return (
    <>
    <Breadcrumb items={[{ label: '班級面板', href: '/' }, { label: '班級公告欄', href: '/board' }, { label: '後台', href: '/board/admin' }, { label: '編輯公告' }]} />
    <PostForm
      mode="edit"
      depts={depts}
      isSuper={session.role === 'super'}
      username={session.username}
      postId={post.id}
      initial={initial}
    />
    </>
  );
}
