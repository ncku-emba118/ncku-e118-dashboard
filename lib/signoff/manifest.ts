/**
 * Assignment manifest hash — Codex #1 finding 3-1.
 *
 * 三層 SHA-256（source / signature / final）若不涵蓋「誰被要求簽哪一格」，
 * 攻擊者改 signer / role / slot 不會被任何 hash 偵測。此 manifest hash 把
 * 文件 metadata + 全部指派（signer + role + sequence + slot）綁進證據鏈，
 * 建立文件時計算、最終 PDF hash 引用它。
 *
 * 必須 deterministic：與 assignment 陣列順序、物件 key 順序無關 →
 * 用固定欄位順序手動序列化，再 sha256。純函式、可單元測試。
 */
import crypto from 'node:crypto';

export type ManifestDoc = {
  title: string;
  amount: string | null; // 以字串保存，避免浮點誤差影響 hash
  currency: string;
  purpose: string | null;
  applicant: string | null;
  owner_dept_id: string;
  attachment_shas: string[]; // 全部附件（發票/明細...）的 sha256，順序無關
};

export type ManifestAssignment = {
  signer_account_id: string;
  role_label: string;
  sequence_order: number | null;
  slot_page: number;
  slot_x: number;
  slot_y: number;
  slot_w: number;
  slot_h: number;
};

export type ManifestInput = {
  doc: ManifestDoc;
  assignments: ManifestAssignment[];
};

function canonicalAssignment(a: ManifestAssignment): string {
  // 固定欄位順序；數值以 JSON 數字序列化（slot 為整數/簡單浮點，穩定）
  return JSON.stringify([
    a.signer_account_id,
    a.role_label,
    a.sequence_order,
    a.slot_page,
    a.slot_x,
    a.slot_y,
    a.slot_w,
    a.slot_h,
  ]);
}

export function computeAssignmentManifestSha256(input: ManifestInput): string {
  const { doc } = input;
  // 指派以 canonical 字串排序 → 與輸入順序無關
  const assignments = input.assignments
    .map(canonicalAssignment)
    .sort();

  const canonical = JSON.stringify([
    doc.title,
    doc.amount,
    doc.currency,
    doc.purpose,
    doc.applicant,
    doc.owner_dept_id,
    [...doc.attachment_shas].sort(),
    assignments,
  ]);

  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}
