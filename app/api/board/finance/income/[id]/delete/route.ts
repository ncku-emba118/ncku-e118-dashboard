/**
 * POST /api/board/finance/income/[id]/delete — 刪除一筆收入（限財務長 / super）。
 * 收入是純記帳資料（非簽核文件），允許財務長 / 班代直接刪除以更正錯誤。
 */
import { type NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { readSession } from '@/lib/auth/session';
import { jsonResp, isSameOrigin } from '@/lib/signoff/http';
import { rateLimit } from '@/lib/signoff/rate-limit';
import { canManageIncome } from '@/lib/finance/income';
import { deleteFinanceIncome } from '@/lib/signoff/dal';

const UUID_RE =
  /^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const traceId = crypto.randomUUID();
  const { id } = await params;
  if (!UUID_RE.test(id)) return jsonResp({ error: '無效的 ID' }, 400, traceId);

  const session = await readSession();
  if (!session) return jsonResp({ error: '未登入或 session 過期' }, 401, traceId);
  if (!isSameOrigin(req)) return jsonResp({ error: '來源驗證失敗' }, 403, traceId);
  if (!canManageIncome(session)) {
    return jsonResp({ error: '只有財務長 / 班代可管理收入' }, 403, traceId);
  }
  if (!rateLimit(`finance:income:delete:${session.sub}`, 20, 60_000)) {
    return jsonResp({ error: '請求過於頻繁，請稍候' }, 429, traceId);
  }

  const { error } = await deleteFinanceIncome(id, session.sub);
  if (error) {
    console.error('[finance.income.delete.failed]', { traceId, e: error });
    return jsonResp({ error: '刪除失敗，請稍後再試' }, 503, traceId);
  }
  console.info('[finance.income.delete.ok]', { traceId, id, by: session.username });
  return jsonResp({ ok: true }, 200, traceId);
}
