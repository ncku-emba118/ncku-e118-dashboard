/**
 * 解析財務長上傳的月報 Excel（「總表」分頁），抽出銀行存款餘額
 * （活期/定期存款）供 /finance/report/[id] 報表頁顯示。
 *
 * 刻意只做這一塊：班費收入/支出明細網站已經有自己的資料來源（signoff
 * 系統 + 收入明細帳本），Excel 裡的利息/班聚結餘款等零散收入其實財務長
 * 也另外手動記在收入明細帳本裡了（實測比對過，數字完全對得上）——重複
 * 解析只會多一份看起來像是「另一組數字」的複本，容易讓人搞不清楚要信
 * 哪邊。銀行存款餘額才是網站真的沒有在追蹤、Excel 獨有的資訊。
 *
 * 只支援 .xlsx（ExcelJS 讀不了舊版 .xls，也刻意不裝有已知資安漏洞的舊版
 * xlsx/SheetJS npm 套件解析 .xls——財務長請用「另存新檔」存成 .xlsx 上傳，
 * 上傳 .xls/.pdf 一樣能存檔下載，只是不會有這頁的自動整理效果）。
 */
import ExcelJS from 'exceljs';

export type ParsedReportSummary = {
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
const BALANCE_COL = 4; // D：活期存款／定期存款的餘額

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
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : undefined;
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
  let activeDeposit: number | undefined;
  let termDeposit: number | undefined;

  sheet.eachRow((row) => {
    const label = cellText(row.getCell(LABEL_COL).value);
    if (label === '活期存款') activeDeposit = cellNumber(row.getCell(BALANCE_COL).value);
    if (label === '定期存款') termDeposit = cellNumber(row.getCell(BALANCE_COL).value);
  });

  if (activeDeposit === undefined && termDeposit === undefined) {
    warnings.push('未解析到活期／定期存款餘額，「總表」分頁的欄位排列可能已變動，請人工核對原始檔案');
  }

  const total =
    activeDeposit !== undefined && termDeposit !== undefined ? activeDeposit + termDeposit : undefined;

  return {
    bankBalances: { activeDeposit, termDeposit, total },
    parsedAt: new Date().toISOString(),
    warnings,
  };
}
