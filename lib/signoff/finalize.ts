/**
 * 最終 PDF 合成編排（sign 完成 finalize 時呼叫）。
 *
 * 全簽完 → 重建簽核表(SheetInput) + 疊所有簽名 PNG + 夾帶原始憑證 → composeFinalPdf
 * → 算 final_pdf_sha256 → 上傳 documents/{id}/final.pdf → 寫回 signoff_documents。
 *
 * 註：不再下載已存的 sheet bytes 來合成（那會造成最終 PDF 雙份字型 ~10MB）；
 *     改重建 sheet，全程只嵌一次字型。
 */
import 'server-only';
import crypto from 'node:crypto';
import { composeFinalPdf, type SheetInput } from './pdf';
import { objectPaths } from './constants';
import {
  downloadObject,
  getSignaturesForFinalize,
  setFinalPdf,
  uploadObject,
  type SignoffDocumentRow,
} from './dal';

function tpeDate(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
}
function tpeLabel(iso: string): string {
  return new Date(iso).toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).slice(0, 16);
}

export async function composeAndStoreFinal(
  doc: SignoffDocumentRow,
): Promise<{ ok: boolean; error: string | null }> {
  const sources: { bytes: Buffer; mime: string }[] = [];
  for (const att of doc.attachments) {
    const b = await downloadObject(att.object_path);
    if (!b.bytes) return { ok: false, error: `attachment download: ${b.error}` };
    sources.push({ bytes: b.bytes, mime: att.mime });
  }

  const sigs = await getSignaturesForFinalize(doc.id);
  if (sigs.error || !sigs.data) return { ok: false, error: `signatures: ${sigs.error}` };

  // 重建簽核表輸入（slots = 全部已簽者）
  const sheet: SheetInput = {
    title: doc.title,
    amount: doc.amount,
    currency: doc.currency,
    purpose: doc.purpose,
    applicant: doc.applicant,
    dateLabel: tpeDate(doc.created_at),
    slots: sigs.data.map((s) => ({
      role_label: s.role_label,
      signer_name: s.signer_username ?? '',
      slot_page: s.slot_page,
      slot_x: s.slot_x,
      slot_y: s.slot_y,
      slot_w: s.slot_w,
      slot_h: s.slot_h,
    })),
  };

  const signatures = [];
  for (const s of sigs.data) {
    const png = await downloadObject(s.signature_png_path);
    if (!png.bytes) return { ok: false, error: `signature png download: ${png.error}` };
    signatures.push({
      slot_page: s.slot_page,
      slot_x: s.slot_x,
      slot_y: s.slot_y,
      slot_w: s.slot_w,
      slot_h: s.slot_h,
      signer_name: s.signer_username ?? '',
      signed_at_label: tpeLabel(s.signed_at),
      comment: s.comment ?? undefined,
      png: png.bytes,
    });
  }

  const finalBytes = await composeFinalPdf({ sheet, signatures, sources });

  const finalSha = crypto.createHash('sha256').update(finalBytes).digest('hex');
  const finalPath = objectPaths.final(doc.id);
  const up = await uploadObject(finalPath, finalBytes, 'application/pdf', true);
  if (up.error) return { ok: false, error: `final upload: ${up.error}` };

  const set = await setFinalPdf(doc.id, finalPath, finalSha);
  if (set.error) return { ok: false, error: `set final: ${set.error}` };

  return { ok: true, error: null };
}
