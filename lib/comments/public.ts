import 'server-only';
import { hashIp } from '@/lib/ip-hash';

export const COMMENT_FIELDS = 'id, post_id, author_name, content, status, created_at, ip_hash, ip_hash_version';

type StoredComment = {
  id: string; post_id: string; author_name: string | null; content: string;
  status: string; created_at: string; ip_hash: string; ip_hash_version: number;
};

// Domain-separated opaque identifier. Never return stored IP hashes to clients.
export function publicComment(row: StoredComment) {
  return {
    id: row.id, post_id: row.post_id, author_name: row.author_name,
    content: row.content, status: row.status, created_at: row.created_at,
    author_key: hashIp(`comment-author:${row.ip_hash_version}:${row.ip_hash}`).hash,
  };
}
