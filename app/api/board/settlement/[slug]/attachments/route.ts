/**
 * GET /api/board/settlement/[slug]/attachments
 *
 * 讓四位幹部（班代／執行副班代／秘書長／財務長）從結算單頁下載該結算單
 * 對應簽核單的「原始附件」（發票／收據等）。刻意不回傳 final.pdf——
 * lib/signoff/pdf.ts 的 finalize 會把每位簽核人的手寫簽名影像嵌進
 * final.pdf，那是個資，不能因為這支下載小功能擴大暴露面。
 *
 * 簽章 URL 走「點擊當下才產生」：SIGNED_READ_URL_TTL_S 只有 5 分鐘，
 * 若在結算單頁 server component 渲染時就先產生連結，使用者頁面開著
 * 超過 5 分鐘再點就會失效，故改由這支 API route 在被呼叫的當下才簽。
 *
 * 權限只靠 canDownloadSettlementProof 判斷（role/home_dept_id，非
 * username 字串），不能只靠前端「有沒有渲染這顆按鈕」把關——未登入
 * 一律 401，登入但不是四人之一一律 403。
 */
import { type NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { readSession } from '@/lib/auth/session';
import { jsonResp } from '@/lib/signoff/http';
import { canDownloadSettlementProof } from '@/lib/signoff/permission';
import { getSettlementDocAttachments, createSignedReadUrl } from '@/lib/signoff/dal';
import { ACTIVITIES } from '@/lib/budget/data';

const settledActivities = ACTIVITIES.filter((a) => a.settlement);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const traceId = crypto.randomUUID();
  const { slug } = await params;

  const session = await readSession();
  if (!session) return jsonResp({ error: '未登入或 session 過期' }, 401, traceId);
  if (!canDownloadSettlementProof(session)) {
    return jsonResp({ error: '無權限下載此結算單的憑證' }, 403, traceId);
  }

  const activity = settledActivities.find((a) => a.slug === slug);
  if (!activity) return jsonResp({ error: '查無此結算單' }, 404, traceId);
  const settlementNo = activity.settlement!.no;

  const { data, error } = await getSettlementDocAttachments(settlementNo);
  if (error) {
    console.error('[settlement.attachments.query_failed]', { traceId, slug, settlementNo, error });
    return jsonResp({ error: '系統暫時無法讀取憑證' }, 503, traceId);
  }
  if (!data || data.attachments.length === 0) {
    return jsonResp({ attachments: [] }, 200, traceId);
  }

  // 只回附件呈現所需的欄位（name/mime/label/caption/url）——不含
  // signoff_sheet_object_path、docId、帳號 id 等非必要欄位。
  const attachments = await Promise.all(
    data.attachments.map(async (a) => ({
      name: a.name,
      mime: a.mime,
      label: a.label ?? null,
      caption: a.caption ?? null,
      url: (await createSignedReadUrl(a.object_path)).url,
    })),
  );

  return jsonResp({ attachments }, 200, traceId);
}
