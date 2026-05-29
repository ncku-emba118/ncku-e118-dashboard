/**
 * /api/board/finance/income — 收入明細帳本（feature B）。
 *   GET  : 列出所有收入 entry（限財務長 / super，給管理頁用）
 *   POST : 新增一筆收入（限財務長 / super）
 * 公開透明頁不走這支，是 server component 直讀 DAL。
 */
import { type NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { readSession } from '@/lib/auth/session';
import { jsonResp, isSameOrigin } from '@/lib/signoff/http';
import { rateLimit } from '@/lib/signoff/rate-limit';
import { canManageIncome, parseIncomeInput } from '@/lib/finance/income';
import { listFinanceIncome, createFinanceIncome } from '@/lib/signoff/dal';

export async function GET() {
  const traceId = crypto.randomUUID();
  const session = await readSession();
  if (!session) return jsonResp({ error: '未登入或 session 過期' }, 401, traceId);
  if (!canManageIncome(session)) {
    return jsonResp({ error: '只有財務長 / 班代可管理收入' }, 403, traceId);
  }
  const income = await listFinanceIncome();
  return jsonResp({ income }, 200, traceId);
}

export async function POST(req: NextRequest) {
  const traceId = crypto.randomUUID();
  const session = await readSession();
  if (!session) return jsonResp({ error: '未登入或 session 過期' }, 401, traceId);
  if (!isSameOrigin(req)) return jsonResp({ error: '來源驗證失敗' }, 403, traceId);
  if (!canManageIncome(session)) {
    return jsonResp({ error: '只有財務長 / 班代可管理收入' }, 403, traceId);
  }
  if (!rateLimit(`finance:income:create:${session.sub}`, 20, 60_000)) {
    return jsonResp({ error: '請求過於頻繁，請稍候' }, 429, traceId);
  }

  const body = await req.json().catch(() => null);
  const parsed = parseIncomeInput(body);
  if (!parsed.ok) return jsonResp({ error: parsed.error }, 400, traceId);

  const { id, error } = await createFinanceIncome({
    ...parsed.value,
    created_by: session.sub,
  });
  if (error) {
    console.error('[finance.income.create.failed]', { traceId, e: error });
    return jsonResp({ error: '新增失敗，請稍後再試' }, 503, traceId);
  }
  console.info('[finance.income.create.ok]', { traceId, id, by: session.username });
  return jsonResp({ id }, 201, traceId);
}
