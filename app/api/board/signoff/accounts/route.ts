/**
 * GET /api/board/signoff/accounts — 幹部帳號清單（指派 picker 用，需登入）。
 */
import crypto from 'node:crypto';
import { readSession } from '@/lib/auth/session';
import { jsonResp } from '@/lib/signoff/http';
import { listAccounts } from '@/lib/signoff/dal';

export async function GET() {
  const traceId = crypto.randomUUID();
  const session = await readSession();
  if (!session) return jsonResp({ error: '未登入或 session 過期' }, 401, traceId);

  const { data, error } = await listAccounts();
  if (error || !data) return jsonResp({ error: '系統暫時無法取得帳號清單' }, 503, traceId);

  return jsonResp(
    {
      accounts: data.map((a) => ({
        id: a.id,
        username: a.username,
        role: a.role,
        home_dept_id: a.home_dept_id,
      })),
    },
    200,
    traceId,
  );
}
