/**
 * 班費收入（feature B）純邏輯 — 權限 / 輸入驗證 / 加總。
 * 純函式、無 server-only，可被 API route + 公開頁 + 單元測試共用。
 */

export type IncomeActor = { role: 'super' | 'dept'; home_dept_id: string | null };

/** 收入管理權限：財務長（home_dept_id='finance'）或 super（班代/副班代/秘書）。 */
export function canManageIncome(actor: IncomeActor): boolean {
  return actor.role === 'super' || actor.home_dept_id === 'finance';
}

export const INCOME_CATEGORIES = ['收班費', '班級活動', '補收', '利息', '退款', '其他'] as const;

/**
 * LINE Bot 對帳同步（/api/board/finance/income/sync）的班費活動 ID 集合。
 * 這些活動入帳 → 「收班費」；其他班務活動（例如 A8）→ 「班級活動」。
 * Bot payload 沒有活動類型，所以用 ID 常數判斷（不靠金額猜）；新增班費類活動時在此補 ID。
 * 舊資料 category 仍是 '收班費' 的列不受影響（category 為自由文字、sumIncome 不看分類），
 * 且 bot 下次同步會以 source_ref UPSERT 覆寫為新分類。
 */
export const CLASS_FEE_ACTIVITY_IDS: ReadonlySet<string> = new Set(['A7']);

export function botIncomeCategory(activityId: string): string {
  return CLASS_FEE_ACTIVITY_IDS.has(activityId) ? '收班費' : '班級活動';
}

export type IncomeInput = {
  occurred_on: string; // YYYY-MM-DD
  category: string;
  amount: number;
  note: string | null;
};

export type ParseResult =
  | { ok: true; value: IncomeInput }
  | { ok: false; error: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_AMOUNT = 99_999_999; // 一億以下，足夠班費情境

/** 驗證 + 正規化收入輸入。不信任 client，金額/日期/長度都在 server 再驗一次。 */
export function parseIncomeInput(raw: unknown): ParseResult {
  if (!raw || typeof raw !== 'object') return { ok: false, error: '欄位格式錯誤' };
  const o = raw as Record<string, unknown>;

  const occurred_on = typeof o.occurred_on === 'string' ? o.occurred_on.trim() : '';
  if (!DATE_RE.test(occurred_on)) return { ok: false, error: '日期格式需為 YYYY-MM-DD' };
  // 真實日期檢查（擋 2026-13-40 這種格式對但無效的日期）
  const [y, m, d] = occurred_on.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return { ok: false, error: '日期無效' };
  }

  const category = typeof o.category === 'string' ? o.category.trim() : '';
  if (!category) return { ok: false, error: '請選擇 / 填寫項目' };
  if (category.length > 20) return { ok: false, error: '項目需 20 字以內' };

  const amountNum = typeof o.amount === 'number' ? o.amount : Number(o.amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    return { ok: false, error: '金額需大於 0' };
  }
  if (amountNum > MAX_AMOUNT) return { ok: false, error: '金額過大' };
  // 最多兩位小數：amount*100 必須夠接近整數（容忍浮點誤差）
  if (Math.abs(amountNum * 100 - Math.round(amountNum * 100)) > 1e-6) {
    return { ok: false, error: '金額最多兩位小數' };
  }
  const amount = Math.round(amountNum * 100) / 100;

  const noteRaw = typeof o.note === 'string' ? o.note.trim() : '';
  if (noteRaw.length > 200) return { ok: false, error: '備註需 200 字以內' };

  return { ok: true, value: { occurred_on, category, amount, note: noteRaw || null } };
}

/** 加總收入金額（amount 可能是 DB 回來的字串或數字）。 */
export function sumIncome(rows: { amount: string | number | null }[]): number {
  return rows.reduce((s, r) => {
    const v =
      typeof r.amount === 'number' ? r.amount : parseFloat(String(r.amount ?? '0')) || 0;
    return s + v;
  }, 0);
}
