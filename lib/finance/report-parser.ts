/**
 * 解析財務長上傳的月報 Excel（「總表」分頁），抽出網站其他地方還沒追蹤到的
 * 收入細項（利息、班聚結餘款、代收款等）與銀行存款餘額，供 /finance 頁自動
 * 排版顯示，取代財務長手動修飾報表的步驟。
 *
 * 刻意只做「網站沒有的」那塊：班費收入/支出明細網站已經有自己的資料來源
 * （signoff 系統 + LINE Bot 收入同步），這裡不重複解析，避免兩邊算出不同
 * 數字時不知道要信哪邊。
 *
 * 只支援 .xlsx（ExcelJS 讀不了舊版 .xls，也刻意不裝有已知資安漏洞的舊版
 * xlsx/SheetJS npm 套件解析 .xls——財務長請用「另存新檔」存成 .xlsx 上傳，
 * 上傳 .xls/.pdf 一樣能存檔下載，只是不會有這頁的自動整理效果）。
 *
 * 解析對應的是特定一份 Excel 的版面（分頁名「總表」、標籤在 A 欄、金額多半
 * 在 F 欄、日期子列金額在 E 欄、存款餘額在 D 欄），格式如果之後大改，
 * 解析會抓不到東西但不會拋錯——一律回傳 warnings，讓人工確認，絕不編造數字。
 */
import ExcelJS from 'exceljs';

export type ParsedIncomeItem = {
  /** 分類標籤，例如「利息收入」「班聚結餘款」「代收款(資安)」 */
  label: string;
  /** 日期子列才有（例如利息收入底下逐月的明細） */
  date?: string;
  amount: number;
};

export type ParsedReportSummary = {
  incomeItems: ParsedIncomeItem[];
  bankBalances: {
    activeDeposit?: number;
    termDeposit?: number;
    total?: number;
  };
  parsedAt: string;
  warnings: string[];
};

const SHEET_NAME = '總表';
const LABEL_COL = 1;
const VALUE_COL = 6; // F：分類標籤的單一金額（班聚結餘款、測試款…）或子項小計
const DATE_ROW_VALUE_COL = 5; // E：利息收入等分類下面，逐筆日期列的金額
const BALANCE_COL = 4; // D：活期存款／定期存款的餘額

// 這幾個標籤已經在網站別處追蹤（班費收入走 signoff/income 系統、
// 北班分攤款項走 budget/settlement 結算單），這裡刻意跳過，避免重複呈現。
const SKIP_LABELS = new Set(['班費（三年期）A7', '雜項/其他（班服加購等）', '合計', '北班分攤款項']);
const DATE_ROW_RE = /^\d{4}\/\d{1,2}\/\d{1,2}$/;

/** 儲存格文字：純字串或 ExcelJS 的 richText 陣列都處理 */
function cellText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object' && value !== null && 'richText' in value) {
    const runs = (value as { richText: { text: string }[] }).richText;
    return runs.map((r) => r.text).join('').trim();
  }
  return String(value).trim();
}

/** 儲存格數字：純數字、公式結果（含公式結果又是字串的情況）、或帶千分位逗號的字串都處理 */
function cellNumber(value: unknown): number | undefined {
  if (value == null) return undefined;
  if (typeof value === 'number') return value;
  if (typeof value === 'object' && value !== null && 'result' in value) {
    return cellNumber((value as { result: unknown }).result);
  }
  if (typeof value === 'string') {
    const cleaned = value.replace(/[,\s]/g, '');
    if (cleaned === '' || cleaned === '-') return undefined;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export async function parseReportExcel(buffer: Buffer): Promise<ParsedReportSummary | null> {
  const workbook = new ExcelJS.Workbook();
  try {
    // exceljs 型別定義用的是舊版 Node Buffer（無泛型），跟目前 @types/node 的
    // Buffer<ArrayBufferLike> 對不上，純結構型別差異、不影響實際執行。
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch {
    return null; // 不是有效的 .xlsx（例如其實是舊版 .xls）
  }

  const sheet = workbook.getWorksheet(SHEET_NAME);
  if (!sheet) return null;

  const warnings: string[] = [];
  const incomeItems: ParsedIncomeItem[] = [];
  let activeDeposit: number | undefined;
  let termDeposit: number | undefined;
  let currentSection: string | null = null;

  sheet.eachRow((row) => {
    const label = cellText(row.getCell(LABEL_COL).value);
    if (!label) return;

    if (label === '活期存款') { activeDeposit = cellNumber(row.getCell(BALANCE_COL).value); return; }
    if (label === '定期存款') { termDeposit = cellNumber(row.getCell(BALANCE_COL).value); return; }

    if (SKIP_LABELS.has(label)) { currentSection = null; return; }

    // 日期子列（YYYY/MM/DD），歸到上一個看到的分類標籤底下（例如「利息收入」下的逐月明細）
    if (DATE_ROW_RE.test(label)) {
      if (!currentSection) return;
      const amount = cellNumber(row.getCell(DATE_ROW_VALUE_COL).value);
      if (amount !== undefined) incomeItems.push({ label: currentSection, date: label, amount });
      return;
    }

    // 一般「標籤 + 單一金額」列（利息收入小計、班聚結餘款、測試款、代收款(資安)…）
    const amount = cellNumber(row.getCell(VALUE_COL).value);
    if (amount !== undefined) {
      // 有日期子列的分類（目前只有利息收入）只留子列明細，不重複列小計；
      // 沒有子列的分類（班聚結餘款等）直接以這一列本身當作項目。
      currentSection = label;
    }
  });

  // 第二輪：把「有子列」的分類小計從 incomeItems 排除（只留子列），
  // 「沒有子列」的分類直接補回小計列本身。用 label 分組判斷比較穩，寫在這裡
  // 是因為第一輪 eachRow 是逐列 streaming，還不知道後面有沒有子列。
  const hasChildren = new Set(incomeItems.filter((i) => i.date).map((i) => i.label));
  sheet.eachRow((row) => {
    const label = cellText(row.getCell(LABEL_COL).value);
    if (!label || SKIP_LABELS.has(label) || label === '活期存款' || label === '定期存款') return;
    if (DATE_ROW_RE.test(label) || hasChildren.has(label)) return;
    const amount = cellNumber(row.getCell(VALUE_COL).value);
    if (amount !== undefined && !incomeItems.some((i) => i.label === label && i.date === undefined)) {
      incomeItems.push({ label, amount });
    }
  });

  if (incomeItems.length === 0) {
    warnings.push('未解析到任何收入細項，「總表」分頁的欄位排列可能已變動，請人工核對原始檔案');
  }
  if (activeDeposit === undefined && termDeposit === undefined) {
    warnings.push('未解析到活期／定期存款餘額');
  }

  const total =
    activeDeposit !== undefined && termDeposit !== undefined ? activeDeposit + termDeposit : undefined;

  return {
    incomeItems,
    bankBalances: { activeDeposit, termDeposit, total },
    parsedAt: new Date().toISOString(),
    warnings,
  };
}
