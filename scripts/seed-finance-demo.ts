/**
 * scripts/seed-finance-demo.ts — 種一張示範待簽簽核 + 一份月報到 live，供本機預覽跑流程。
 * 財務 發起「班服訂製 28,000」→ 指派 秘書(審核) + 班代(核准) → routing（待簽）。
 * 用 supabase-js（service role）；env 從 .env.local 讀。跑完印出 doc id + 用哪個帳號簽。
 * Run: npx tsx scripts/seed-finance-demo.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { generateSignoffSheet } from '../lib/signoff/pdf';
import { computeSlotLayout } from '../lib/signoff/layout';
import { computeAssignmentManifestSha256 } from '../lib/signoff/manifest';

function loadEnv() {
  const txt = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8');
  const get = (k: string) => {
    const m = txt.match(new RegExp('^' + k + '=(.*)$', 'm'));
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
  };
  return { url: get('SUPABASE_URL'), key: get('SUPABASE_SERVICE_ROLE_KEY') };
}

async function makePdf(lines: string[]): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const p = pdf.addPage([420, 560]);
  const f = await pdf.embedFont(StandardFonts.Helvetica);
  let y = 510;
  for (const ln of lines) { p.drawText(ln, { x: 28, y, size: 12, font: f }); y -= 24; }
  return Buffer.from(await pdf.save());
}
const sha = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex');

async function main() {
  const { url, key } = loadEnv();
  if (!url || !key) throw new Error('SUPABASE_URL / SERVICE_ROLE_KEY 不在 .env.local');
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const BK = 'signoff-documents';

  const { data: accs } = await sb.from('accounts').select('id, username');
  const byName: Record<string, string> = {};
  (accs ?? []).forEach((a: { id: string; username: string }) => (byName[a.username] = a.id));
  const fin = byName['財務'], sec = byName['秘書'], rep = byName['班代'];
  if (!fin || !sec || !rep) throw new Error('找不到 財務/秘書/班代 帳號');

  // 月報（示範）
  const repPdf = await makePdf(['November Financial Report (sample)', 'Income 303,000  Spent 0  Balance 303,000']);
  const repPath = `reports/${crypto.randomUUID()}.pdf`;
  await sb.storage.from(BK).upload(repPath, repPdf, { contentType: 'application/pdf', upsert: true });
  await sb.from('finance_reports').insert({ period_label: '11 月收支月報（範例）', object_path: repPath, uploaded_by: fin });
  console.log('✓ 月報 seeded');

  // 示範待簽簽核：財務 → 秘書(審核) + 班代(核准)
  const docId = crypto.randomUUID();
  const invoice = await makePdf(['Class T-shirt Quote (sample)', '101 pcs x NT$ 277', 'Total: NT$ 28,000', 'Vendor: ABC Apparel Co.']);
  const srcPath = `incoming/${fin}/${crypto.randomBytes(8).toString('hex')}.pdf`;
  await sb.storage.from(BK).upload(srcPath, invoice, { contentType: 'application/pdf', upsert: true });
  const srcSha = sha(invoice);
  const attachments = [{ object_path: srcPath, sha256: srcSha, mime: 'application/pdf', name: '班服報價單.pdf' }];

  const people = [{ id: sec, role: '審核', name: '秘書' }, { id: rep, role: '核准', name: '班代' }];
  const slots = computeSlotLayout(people.length);
  const assignments = people.map((p, i) => ({
    signer_account_id: p.id, role_label: p.role, sequence_order: null,
    slot_page: slots[i].slot_page, slot_x: slots[i].slot_x, slot_y: slots[i].slot_y, slot_w: slots[i].slot_w, slot_h: slots[i].slot_h,
  }));

  const sheet = await generateSignoffSheet({
    title: '班服訂製（101 件）', amount: '28000.00', currency: 'TWD',
    purpose: '全班班服訂製', applicant: '活動長 楊其峻', dateLabel: '2026-05-29',
    slots: people.map((p, i) => ({ role_label: p.role, signer_name: p.name, slot_page: slots[i].slot_page, slot_x: slots[i].slot_x, slot_y: slots[i].slot_y, slot_w: slots[i].slot_w, slot_h: slots[i].slot_h })),
  });
  const sheetPath = `documents/${docId}/sheet.pdf`;
  await sb.storage.from(BK).upload(sheetPath, Buffer.from(sheet), { contentType: 'application/pdf', upsert: true });

  const manifest = computeAssignmentManifestSha256({
    doc: { title: '班服訂製（101 件）', amount: '28000.00', currency: 'TWD', purpose: '全班班服訂製', applicant: '活動長 楊其峻', owner_dept_id: 'finance', attachment_shas: [srcSha] },
    assignments,
  });

  const { data, error } = await sb.rpc('signoff_create_document', {
    p_doc: {
      id: docId, title: '班服訂製（101 件）', amount: '28000.00', currency: 'TWD',
      purpose: '全班班服訂製', applicant: '活動長 楊其峻', created_by: fin, owner_dept_id: 'finance',
      category: '班服', client_request_id: crypto.randomUUID(), attachments,
      signoff_sheet_object_path: sheetPath, assignment_manifest_sha256: manifest, flow_type: 'parallel',
    },
    p_assignments: assignments,
    p_audit: { ip_hash: 'seed', ip_hash_version: 1, user_agent: 'seed', trace_id: crypto.randomUUID() },
  });
  if (error) throw new Error('create RPC: ' + error.message);

  console.log('\n✅ 示範簽核已建立');
  console.log('   doc id:', data);
  console.log('   待簽：秘書(審核) + 班代(核准) → 用這兩個帳號登入即可簽');
}
main().catch((e) => { console.error('❌', e.message); process.exit(1); });
