/**
 * /api/board/finance/reports — 財務月報上傳（給 /finance 公開頁「月報下載」用）。
 *   POST : 任何已登入帳號皆可上傳（不限財務長，班代/秘書等幹部也常代為上傳）。
 * 檔案存進既有 signoff bucket 的 reports/ 前綴（沿用 listFinanceReports 的過濾條件），
 * 資料列寫入 finance_reports，/finance 頁下次讀取即可看到新月報。
 */
import { type NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { readSession } from '@/lib/auth/session';
import { jsonResp, isSameOrigin } from '@/lib/signoff/http';
import { rateLimit } from '@/lib/signoff/rate-limit';
import { uploadObject, createFinanceReport } from '@/lib/signoff/dal';

const MAX_BYTES = 15 * 1024 * 1024; // 15MB，比照既有簽核附件上限
const ALLOWED_TYPES = new Set([
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);
const EXT_BY_TYPE: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

export async function POST(req: NextRequest) {
  const traceId = crypto.randomUUID();
  const session = await readSession();
  if (!session) return jsonResp({ error: '未登入或 session 過期' }, 401, traceId);
  if (!isSameOrigin(req)) return jsonResp({ error: '來源驗證失敗' }, 403, traceId);
  if (!rateLimit(`finance:reports:create:${session.sub}`, 10, 60_000)) {
    return jsonResp({ error: '請求過於頻繁，請稍候' }, 429, traceId);
  }

  const form = await req.formData().catch(() => null);
  if (!form) return jsonResp({ error: '格式錯誤' }, 400, traceId);

  const file = form.get('file');
  const periodLabelRaw = form.get('period_label');
  if (!(file instanceof File) || typeof periodLabelRaw !== 'string' || !periodLabelRaw.trim()) {
    return jsonResp({ error: '請提供檔案與期別名稱' }, 400, traceId);
  }
  const periodLabel = periodLabelRaw.trim().slice(0, 60);
  if (!ALLOWED_TYPES.has(file.type)) {
    return jsonResp({ error: '只接受 PDF 或 Excel（.xls/.xlsx）檔案' }, 400, traceId);
  }
  if (file.size > MAX_BYTES) {
    return jsonResp({ error: '檔案超過 15MB 上限' }, 400, traceId);
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const objectPath = `reports/${crypto.randomUUID()}.${EXT_BY_TYPE[file.type]}`;

  const { error: uploadError } = await uploadObject(objectPath, bytes, file.type);
  if (uploadError) {
    console.error('[finance.reports.upload.failed]', { traceId, e: uploadError });
    return jsonResp({ error: '上傳失敗，請稍後再試' }, 503, traceId);
  }

  const { id, error } = await createFinanceReport({
    period_label: periodLabel,
    object_path: objectPath,
    sha256,
    uploaded_by: session.sub,
  });
  if (error) {
    console.error('[finance.reports.create.failed]', { traceId, e: error });
    return jsonResp({ error: '資料庫寫入失敗，請稍後再試' }, 503, traceId);
  }

  console.info('[finance.reports.create.ok]', { traceId, id, by: session.username });
  return jsonResp({ id }, 201, traceId);
}
