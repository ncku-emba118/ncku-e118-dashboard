/**
 * 班費預算資料層 — 南班版（83 人）
 * 適用期間：2026–2028（全期）
 *
 * 設計原則：
 * 1. 所有數字集中於此，頁面只負責呈現；改數字不用動 page
 * 2. 比例 83:16（南:北）= 83.84% : 16.16%；合辦活動實際結算後按此比例請款
 * 3. 預備金「備而不用」、期末按比例退回
 */

export const META = {
  className: 'NCKU EMBA E118 南班',
  period: '2026 – 2028',
  southMembers: 83,
  northMembers: 16,
  totalMembers: 99,
  southRatio: 83 / 99, // ≈ 0.8384
  northRatio: 16 / 99, // ≈ 0.1616
  feePerPerson: 30000,
  version: 'v4',
  updatedAt: '2026-06-23',
  drafter: '秘書長',
} as const;

// 全域預算備註 — 適用所有活動頁與表格
export const BUDGET_DISCLAIMER =
  '本頁所有費用皆為預估金額；實際費用將依活動接近時的市場狀況、廠商報價、出席人數等實際情形調整預算後再行收費或結算。';

// 83:16 比例攤分（四捨五入）
export const split = (amount: number) => ({
  total: amount,
  south: Math.round((amount * META.southMembers) / META.totalMembers),
  north: Math.round((amount * META.northMembers) / META.totalMembers),
});

// ──────────────────────────────────────────────────────────────────────────────
// 收入端
// ──────────────────────────────────────────────────────────────────────────────
export const INCOME = {
  perPerson: META.feePerPerson,
  members: META.southMembers,
  total: META.feePerPerson * META.southMembers,
  rationale:
    '統一收費 30,000 元/人；包含必要支出（保守估）+ 安全水位（多收沉澱、三年期末按人頭退回）。',
};

// ──────────────────────────────────────────────────────────────────────────────
// 活動詳細資料
// ──────────────────────────────────────────────────────────────────────────────
export type LineItem = { name: string; qty?: number; unit?: string; unitPrice?: number; amount: number; note?: string };

export type ActivityType = 'co-hosted' | 'south-only' | 'fixed-cost';
export type ActivityStatus = 'planning' | 'preparing' | 'in-progress' | 'settled';

export type Activity = {
  slug: string;
  name: string;
  shortName: string;
  type: ActivityType;
  date: string;
  dateNote?: string;
  location: string;
  organizer: string;
  organizerNote?: string;
  audience: string;
  estimatedAttendance: string;
  overview: string;
  highlights?: string[];
  budgetBasis: string;
  /** 統一備註：本場活動費用為預估、實際以結算為準（顯示在表格上方） */
  budgetDisclaimer?: string;
  expense: { items: LineItem[]; total: number };
  /** 收入 line items 採樂觀全額；若有保守口徑請用 conservativeIncome 表示 */
  income: { items: LineItem[]; total: number };
  /** 收入保守估算（與 income.total 不同時填）；net 與 burden 一律用保守口徑 */
  conservativeIncome?: number;
  conservativeIncomeNote?: string;
  /** 班費淨負擔（採保守口徑：expense.total - (conservativeIncome ?? income.total)） */
  net: number;
  netNote?: string;
  southBurden: number;
  northBurden: number;
  status: ActivityStatus;
  statusNote?: string;
  historicalReference?: string;
  /** 結算欄位（活動結束後填入） */
  actualExpense?: number;
  /** actualExpense 卡片下方的說明；未填時自動顯示與預算的差額 */
  actualExpenseNote?: string;
  actualIncome?: number;
  settledAt?: string;
  settlementNote?: string;
  /**
   * 實際結算分攤。填入後，分攤區與北班分攤表改以實際領取人數均攤呈現，
   * 取代預算階段的南北 83:16 估算（僅在實際攤法與比例攤分不同時才需要填）。
   */
  actualSplit?: ActualSplit;
  notes?: string[];
};

/** 依實際領取人數均攤的結算結果；south/north 金額以未取整的每人金額計算後四捨五入 */
export type ActualSplit = {
  /** 班費實際支付金額（已扣除個人自費部分） */
  paidByFund: number;
  /** 實際領取人數 */
  recipients: number;
  /** 每人分攤（顯示用四捨五入值） */
  perPerson: number;
  south: { count: number; amount: number };
  north: { count: number; amount: number };
  basisNote?: string;
  northNote?: string;
};

export const ACTIVITIES: Activity[] = [
  // 1. 119 新生報到 ────────────────────────────────────────────────────────────
  {
    slug: 'freshmen-registration-2026',
    name: 'E119 新生報到',
    shortName: '新生報到',
    type: 'co-hosted',
    date: '2026 年 11 月',
    location: '校內（場地待定）',
    organizer: '詹培梅（總籌）',
    audience: '119 新生、師長、E118 工作人員',
    estimatedAttendance: '約 160 人（新生 100 + 師長 20 + 工作人員 40）',
    overview:
      '119 新生開學前的迎新報到日，是 119 班同學第一次與 EMBA 系所、師長、學長姐接觸的場合。E118 作為承接班級主辦，負責現場流程、視覺布置、報到動線、餐點與紀念品。',
    highlights: [
      '報到動線設計，新生 100 位順暢通關',
      '主題拍照牆 / 報到背板',
      '茶水點心 + 工作人員便當',
      '攝影紀錄（優先邀請學長姐協助）',
    ],
    budgetBasis: '參考 E118 培梅總籌 2026 年自編預算',
    expense: {
      items: [
        { name: '茶水及點心', qty: 160, unit: '人', unitPrice: 60, amount: 9600, note: '新生 100 + 師長 20 + 工作人員 40' },
        { name: '工作人員便當', qty: 60, unit: '個', unitPrice: 150, amount: 9000, note: '師長 20 + 工作人員 40' },
        { name: '活動攝影紀錄', qty: 1, unit: '式', unitPrice: 5000, amount: 5000, note: '優先找學長姐' },
        { name: '主題設計及視覺製作', qty: 1, unit: '式', unitPrice: 20000, amount: 20000, note: '主題牆拍照區、背板、指引牌、花藝' },
        { name: '印刷、包裝材料', qty: 100, unit: '份', unitPrice: 50, amount: 5000, note: '名牌、包裝材料、文具' },
        { name: '雜項及預備金', qty: 1, unit: '式', unitPrice: 3000, amount: 3000, note: '臨時支出' },
      ],
      total: 51_600,
    },
    income: { items: [], total: 0 },
    net: 51_600,
    southBurden: Math.round((51_600 * META.southMembers) / META.totalMembers),
    northBurden: Math.round((51_600 * META.northMembers) / META.totalMembers),
    status: 'planning',
    statusNote: '2026/06 立案，11 月執行',
  },
  // 2. 聖誕晚會 ──────────────────────────────────────────────────────────────────
  {
    slug: 'christmas-2026',
    name: 'E118 聖誕晚宴',
    shortName: '聖誕晚宴',
    type: 'south-only',
    date: '2026 年 12 月 19 日（週六）18:00 – 21:00',
    location: '台南晶英酒店',
    organizer: '陳亭穎（總召）',
    organizerNote: '參考歷史資料，由陳亭穎總召編列預算',
    audience:
      '系所師長、校友總會大家長、校友會 96–115 屆學長姐、在校生 116–118、119 新生（早鳥）',
    estimatedAttendance: '最多 30 桌共 300 人，目標出席 270 人（出席率 60%）',
    overview:
      'E118 上任後第一場大型對外公關晚宴，承擔 EMBA 校友會與系所師長的常態招待傳統，並作為 119 新生的歡迎場合。本班 1 桌 12 位、本班同學目標出席率 60%（保守試算用）。',
    highlights: [
      '校友總會固定 2 萬贊助 + 2 桌備位（理事長、秘書長、榮譽理事桌）',
      '系所師長（院長、執行長等）由本班全額招待',
      '校友總會 + 校友會社團（舞蹈、熱舞）+ 116/117 兄弟班為 EMBA 鐵律招待',
      '119 新生早鳥報名（截至 11/30），目標 60 位',
      '雙主唱樂團 / 專業主持音控 / 現場拍照背板',
    ],
    budgetBasis:
      '由本班聖誕晚宴總召陳亭穎編列預算；出席率打 6 折、早鳥目標 60 人均採保守估算',
    expense: {
      items: [
        { name: '宴會廳桌菜', qty: 30, unit: '桌', unitPrice: 14850, amount: 445500, note: '含 10% 服務費、現打果汁暢飲' },
        { name: '精選紅酒（黑皮諾）', qty: 30, unit: '瓶', unitPrice: 950, amount: 28500 },
        { name: '宴會廳佈置', qty: 1, unit: '式', unitPrice: 38000, amount: 38000, note: '主題拍照背板 400×250 cm' },
        { name: '外包主持人與音控', qty: 1, unit: '式', unitPrice: 28000, amount: 28000, note: '主持 + 流程規劃 + 演唱彈性調整 + 專業音控' },
        { name: '活動組道具', qty: 1, unit: '式', unitPrice: 2000, amount: 2000 },
        { name: '遊戲獎品', qty: 1, unit: '式', unitPrice: 3000, amount: 3000 },
        { name: '晚宴報到小禮物', qty: 1, unit: '式', unitPrice: 3000, amount: 3000 },
        { name: '活動宣傳品', qty: 1, unit: '式', unitPrice: 4000, amount: 4000, note: '報到姓名卡、座位佈置、桌卡、海報' },
        { name: '活動當天預備金', qty: 1, unit: '式', unitPrice: 30000, amount: 30000, note: '突發加點、開瓶清潔、雜支' },
        { name: '招待：系所師長', qty: 10, unit: '位', unitPrice: 1200, amount: 12000, note: '院長、執行長等' },
        { name: '招待：校友總會', qty: 20, unit: '位', unitPrice: 1200, amount: 24000, note: 'EMBA 鐵律由本班招待' },
        { name: '招待：校友會社團', qty: 20, unit: '位', unitPrice: 1200, amount: 24000, note: '舞蹈社 + 熱舞社' },
        { name: '招待：E116 級', qty: 10, unit: '位', unitPrice: 1200, amount: 12000 },
        { name: '招待：E117 級', qty: 30, unit: '位', unitPrice: 1200, amount: 36000 },
      ],
      total: 690_000,
    },
    income: {
      // 樂觀全額：上述各筆預估收入完整呈現（不藏折扣），共 260,000
      items: [
        { name: '校友總會贊助', qty: 1, unit: '式', unitPrice: 20000, amount: 20000, note: '理事長、秘書長、榮譽理事桌' },
        { name: '個人報名費（學長姐）', qty: 90, unit: '位', unitPrice: 1200, amount: 108000, note: '90 位 × 1,200 元' },
        { name: '眷屬報名費', qty: 20, unit: '位', unitPrice: 1200, amount: 24000, note: '6 歲以下不收費' },
        { name: '個人認桌贊助', qty: 3, unit: '桌', unitPrice: 12000, amount: 36000, note: '視贊助情況' },
        { name: 'E119 新生早鳥', qty: 60, unit: '位', unitPrice: 1200, amount: 72000, note: '11/30 前，目標 60 名' },
      ],
      total: 260_000,
    },
    conservativeIncome: 156_000,
    conservativeIncomeNote:
      '收入採保守估算：本班同學目標出席率僅 60%（90×1,200×60% ≈ 64,800），其餘各項按比例打折後合計約 156,000；班費淨負擔以此口徑計算',
    net: 534_000,
    netNote: '690,000（支出）− 156,000（保守收入）= 534,000；由南班獨自負擔（v3 起改為南班自辦，不向北班分攤）；若樂觀收入 260,000 達標則淨負擔降至 430,000',
    southBurden: 534_000,
    northBurden: 0,
    status: 'preparing',
    statusNote: '2026/06 已立案、訂金作業中；活動結束後全數退回班費公帳',
  },
  // 3. 116 畢業午宴 ──────────────────────────────────────────────────────────────
  {
    slug: 'e116-lunch-2027',
    name: 'E116 畢業午宴',
    shortName: '116 畢業午宴',
    type: 'co-hosted',
    date: '2027 年 6 月',
    location: '台南（場地待定）',
    organizer: '待定',
    audience: 'E116 畢業生、師長、E117/E118 在校生代表',
    estimatedAttendance: '待定',
    overview:
      '對直屬學長班 E116 的畢業致敬午宴，由 E117、E118 共同贊助。E118 部分為「對學長班的小額贊助」性質，金額穩定、不需修正。',
    highlights: ['延續 EMBA 兄弟班傳統', '參考 E114 學長姐預算規模'],
    budgetBasis: '參考 E114 學長姐預算，金額穩定，不調整',
    expense: {
      items: [{ name: 'E116 畢業午宴贊助', qty: 1, unit: '式', amount: 89100, note: '對學長班小額贊助' }],
      total: 89_100,
    },
    income: { items: [], total: 0 },
    net: 89_100,
    southBurden: Math.round((89_100 * META.southMembers) / META.totalMembers),
    northBurden: Math.round((89_100 * META.northMembers) / META.totalMembers),
    status: 'planning',
    statusNote: '細部規格待 2027 年初確認',
    historicalReference: '參考 E114 學長姐預算',
  },
  // 4. 119 新生營 ──────────────────────────────────────────────────────────────
  {
    slug: 'freshmen-camp-2027',
    name: 'E119 新生營',
    shortName: '新生營',
    type: 'co-hosted',
    date: '2027 年 7 月（兩天一夜）',
    location: '參考 E114 主辦規格（飯店住宿 + 會議廳）',
    organizer: 'E118（主辦班級）',
    audience: 'E119 新生、E118 工作人員、系所師長、E114 校友會',
    estimatedAttendance: '約 150 人（新生 100 + 工作 50）',
    overview:
      'E118 主辦的 119 新生營，兩天一夜活動。流程包含開營、團康、晚宴、隊旗、遊戲關卡、品酒大賽等。住宿與會議廳為主要支出，餐點分為中餐、下午茶、晚宴三段。',
    highlights: [
      '住宿 70 間客房（單雙人房 56 + 三人房 10 + 四人房 4）',
      '會議廳三個時段（地球廳）',
      '晚宴 16 桌（含素食位、獨立包廂）',
      '四人樂團 + 音響設備 + 舞台搭建',
      '隊旗、獎旗、工作吊繩、戶外關卡道具',
      '系辦活動補助 150,000 + 導師房費 6,000',
    ],
    budgetBasis:
      '參考 E114 學長姐 2025 年實際數字 + 6% 漲幅（保守估）；E114 在帳「續用酒水 55,000」屬一次性沖抵、118 版本歸零',
    expense: {
      items: [
        { name: '住宿（70 間房）', qty: 1, unit: '式', amount: 443200, note: '單雙 56 間、三人 10 間、四人 4 間' },
        { name: '住宿（提前布置 + 額外房）', qty: 1, unit: '式', amount: 70220, note: '提前布置 2 間 + 額外 1 + 額外 10 間（含折扣）' },
        { name: '會議廳租用', qty: 3, unit: '時段', unitPrice: 14000, amount: 42000, note: '地球廳，圓桌型' },
        { name: '中餐便當', qty: 297, unit: '份', unitPrice: 150, amount: 44550, note: '7/1: 147 份 / 7/2: 150 份' },
        { name: '下午茶', qty: 150, unit: '份', unitPrice: 150, amount: 22500, note: '咖啡、蛋糕、甜點' },
        { name: '7-11 餐盒', qty: 150, unit: '個', amount: 20062, note: '7/2 中段' },
        { name: '晚宴桌菜', qty: 16, unit: '桌', amount: 124900, note: '7000/桌 + 300 開瓶 × 16 桌 + 素食位 + 獨立包廂 + 樂團電力' },
        { name: '餐廳酒水', qty: 1, unit: '式', amount: 10270, note: '金牌啤酒 78 瓶 + 綠茶 36 + 麥茶 24 + 果汁' },
        { name: '自備酒水', qty: 1, unit: '式', amount: 32100, note: '水、運動飲料、紅酒、威士忌（續用酒水 55,000 已歸零）' },
        { name: '慶生蛋糕', qty: 1, unit: '式', amount: 1855 },
        { name: '遊戲用品（品酒大賽）', qty: 1, unit: '式', amount: 254 },
        { name: '樂團（建達文創）', qty: 1, unit: '式', amount: 38000, note: '四人樂團 + 音響設備（原 43000 優惠 38000）' },
        { name: '舞台搭建（昇億嚮度）', qty: 1, unit: '式', amount: 13000, note: '560×360×30，原 15000 優惠 13000' },
        { name: '隊旗（8 面 + 畫布）', qty: 1, unit: '式', amount: 1741 },
        { name: '獎旗（88 面）', qty: 1, unit: '式', amount: 3614 },
        { name: '工作吊繩（160 條）', qty: 1, unit: '式', amount: 1777 },
        { name: '名牌桌卡印製', qty: 1, unit: '式', amount: 1890 },
        { name: '計分卡', qty: 1, unit: '式', amount: 1324 },
        { name: '塑膠球（戶外關卡）', qty: 1, unit: '式', amount: 105 },
        { name: '魔王關卡（唱歌）', qty: 1, unit: '式', amount: 280 },
        { name: '礦泉水（戶外關卡）', qty: 1, unit: '式', amount: 621 },
        { name: '保守 +6% 漲幅', qty: 1, unit: '式', amount: 52456, note: '對照 E114 實價的保守緩衝' },
      ],
      total: 926_719,
    },
    income: {
      items: [
        { name: 'E119 新生房費收取', qty: 1, unit: '式', amount: 384800, note: 'E114 版本：115 收 384,800' },
        { name: '校友會房費贊助', qty: 1, unit: '式', amount: 47200 },
        { name: '校友會贊助晚宴', qty: 1, unit: '式', amount: 10000, note: '南校友會 10,000' },
        { name: '系辦活動補助', qty: 1, unit: '式', amount: 150000 },
        { name: '導師房費', qty: 1, unit: '式', amount: 6000, note: '單人房一晚' },
        { name: '剩餘房費收取（114 對沖）', qty: 1, unit: '式', amount: 51742 },
      ],
      total: 649_742,
    },
    net: 276_977,
    netNote: 'E114 樂觀淨支出 169,521；E118 保守估 = 支出 +6% 漲幅 − 續用酒水 55,000 歸零 = 276,977',
    southBurden: Math.round((276_977 * META.southMembers) / META.totalMembers),
    northBurden: Math.round((276_977 * META.northMembers) / META.totalMembers),
    status: 'planning',
    statusNote: '2027/07 執行，2026 末啟動籌備',
    historicalReference: 'E114 主辦 115 新生營實際決算',
  },
  // 5. 南班迎新晚會 ────────────────────────────────────────────────────────────
  {
    slug: 'south-welcome-2026',
    name: 'E119 迎新晚會（南班自辦）',
    shortName: '南迎新',
    type: 'south-only',
    date: '2027 年 9 月',
    location: '台南（場地待定）',
    organizer: '南班活動長 + 公關長',
    audience: 'E119 新生、E118 南班同學、系所師長、校友會代表',
    estimatedAttendance: '約 100 人（含 119 新生、118 南班、師長、樂團、攝影）',
    overview:
      '南班自辦的 119 迎新晚會，承擔南台灣場次的歡迎傳統。費用全由南班負擔、不向北班分攤。',
    highlights: [
      '桌菜（19 桌）含素食位 + 樂團便當 + 攝影師素餐',
      '威士忌（慕赫 12 年）× 12 瓶',
      '師長服裝配件（吊帶 + 領結）8 位師長',
      '雙主唱樂團 + 小提琴',
      '視覺設計：背板設計 + 安裝拆卸 + 姓名貼紙',
      '靜態攝影師 1 位（含車馬費）',
    ],
    budgetBasis: '參考 E115 學姐 2025 年實際數字 + 6% 漲幅',
    expense: {
      items: [
        { name: '桌菜 + 素食', qty: 1, unit: '式', amount: 187088, note: '19 桌 × 8000+10% + 200/桌清潔 + 素食 6 位 × 800 + 便當（樂團 6、攝影師素 1）' },
        { name: '威士忌（慕赫 12 年）', qty: 12, unit: '瓶', unitPrice: 1380, amount: 16560 },
        { name: '師長服裝配件', qty: 8, unit: '位', unitPrice: 435, amount: 3480, note: '吊帶 360 + 領結 75' },
        { name: '慶生蛋糕（葡吉）', qty: 1, unit: '式', amount: 1500 },
        { name: '樂團（雙主唱 + 小提琴）', qty: 1, unit: '式', amount: 32000 },
        { name: '音響設備', qty: 1, unit: '式', amount: 10000 },
        { name: '視覺設計', qty: 1, unit: '式', amount: 15000, note: '背板設計 + 安裝 + 姓名貼紙' },
        { name: '靜態攝影', qty: 1, unit: '式', amount: 4300, note: '攝影師 3800 + 車馬費 500' },
        { name: '保守 +6% 漲幅', qty: 1, unit: '式', amount: 16196, note: '對照 E115 實價的保守緩衝（269,928 × 6%）' },
      ],
      total: 286_124,
    },
    income: {
      items: [{ name: 'EMBA 校友會贊助餐費', qty: 1, unit: '式', amount: 30000 }],
      total: 30_000,
    },
    net: 256_124,
    netNote: '286,124（支出含 6% 漲幅）− 30,000（收入）= 256,124；由南班獨自負擔',
    southBurden: 256_124,
    northBurden: 0,
    status: 'planning',
    statusNote: '南班自辦、北班不分攤',
    historicalReference: 'E115 學姐迎新晚會實際決算',
  },
  // 6. E117 畢業相關（典禮、晚會、謝師宴）— E118 幫 E117 學長班舉辦 ─────────────
  {
    slug: 'graduation-2028',
    name: 'E117 畢業相關（典禮、晚會、謝師宴）',
    shortName: '117 畢業相關',
    type: 'co-hosted',
    date: '2028 年 6 月（待確認）',
    location: '台南（場地待確認；參考 E113 採晶英）',
    organizer: 'E118 公關組 + 活動長共同籌備（幫 E117 學長班舉辦）',
    audience: 'E117 學長姐畢業生、師長、E116/E118 在校生代表、親屬、校友會',
    estimatedAttendance: '參考 E113：晚宴 24 桌、親屬 19 位、學弟妹班 9 位 + 7 位',
    overview:
      'E118 幫 E117 學長班舉辦的畢業相關活動，含畢業典禮、畢業晚會、謝師宴三段。這是 E118 在學期間最大的對外公關活動，承擔對學長班「傳承」的責任。班費負擔淨額由南北班按 83:16 分攤，校友會餐費部分自付 + 招待校友會 2 桌。',
    highlights: [
      '視覺設計 + 樂團（含畢業典禮、晚宴布置）',
      '攝影團隊（動態 1 + 靜態 1）',
      '晶英晚宴 24 桌（含酒水、素食、便當）',
      'LED 牆（含電力）',
      '紀念禮：威士忌杯禮盒（參考 E113 700 × 94 = 65,800）',
    ],
    budgetBasis: '參考 E113 學長姐 2024 年實際數字 + 6% 漲幅；時間地點細部規格待 2027 年下旬確認',
    expense: {
      items: [
        { name: '視覺設計及樂團', qty: 1, unit: '式', amount: 158000, note: '含畢業典禮 + 晚宴布置 + 樂團' },
        { name: '攝影團隊', qty: 1, unit: '式', amount: 21000, note: '動態 1 位 + 靜態 1 位' },
        { name: '晶英晚宴', qty: 1, unit: '式', amount: 338660, note: '24 桌 + 酒水 + 素食 + 便當' },
        { name: 'LED 牆', qty: 1, unit: '式', amount: 41000, note: '36000 + 電 5000' },
        { name: '紀念禮（畢業禮盒）', qty: 94, unit: '個', unitPrice: 700, amount: 65800, note: '威士忌杯禮盒' },
        { name: '保守 +6% 漲幅', qty: 1, unit: '式', amount: 37468, note: '對照 E113 實價的保守緩衝' },
      ],
      total: 661_928,
    },
    income: {
      items: [
        { name: '系辦經費', qty: 1, unit: '式', amount: 75000, note: '50,000 場布給建達 + 25,000 餐費給晶英' },
        { name: '113 學長班贊助', qty: 1, unit: '式', amount: 120000 },
        { name: '113 親屬餐費', qty: 19, unit: '位', unitPrice: 1500, amount: 28500 },
        { name: 'LED 牆（113 自付）', qty: 1, unit: '式', amount: 41000 },
        { name: '115 級餐費', qty: 9, unit: '位', unitPrice: 1500, amount: 13500 },
        { name: '116 級餐費', qty: 7, unit: '位', unitPrice: 1500, amount: 10500 },
        { name: '校友會餐費', qty: 1, unit: '式', amount: 30000, note: '自付 2 桌、招待 1 桌' },
      ],
      total: 318_500,
    },
    net: 343_428,
    netNote: 'E113 實際淨支出 305,960；E118 保守 +6% 漲幅 = 343,428',
    southBurden: Math.round((343_428 * META.southMembers) / META.totalMembers),
    northBurden: Math.round((343_428 * META.northMembers) / META.totalMembers),
    status: 'planning',
    statusNote: '時間地點規格未確認，預算採 E113 參考 +6% 漲幅；2027 下旬正式啟動',
    historicalReference: 'E113 學長姐畢業典禮 + 晚宴決算',
  },
  // 7. 班服 ───────────────────────────────────────────────────────────────────
  {
    slug: 'uniform',
    name: '班服',
    shortName: '班服',
    type: 'fixed-cost',
    date: '2026 年（首發）',
    location: '—',
    organizer: '班服統籌小組',
    audience: 'E118 全班 99 人',
    estimatedAttendance: '—',
    overview:
      '班服為三年共用的班級識別物資，三項品項一次發放，後續視需求補製。費用由實際領取的同學均攤，南北同價。',
    highlights: ['POLO 衫', 'T-shirt', '帽子'],
    budgetBasis: '依現有統計數據（細項款式 / 廠商 / 設計理念待補）',
    expense: {
      items: [{ name: '班服三項合計', qty: 1, unit: '式', amount: 118380, note: 'POLO + T-shirt + 帽子（預算，依原估 99 人份規劃）' }],
      total: 118_380,
    },
    income: { items: [], total: 0 },
    net: 118_380,
    southBurden: Math.round((118_380 * META.southMembers) / META.totalMembers),
    northBurden: Math.round((118_380 * META.northMembers) / META.totalMembers),
    status: 'in-progress',
    statusNote: '已完成訂製與發放，合計 326 件（POLO + T-shirt + 帽子，含師長與備用庫存）',
    actualExpense: 123_480,
    actualExpenseNote: '廠商帳單總額；其中個人自費加購 480，班費實付 NT$ 123,000',
    settlementNote:
      '廠商帳單合計 NT$ 123,480，較預算 NT$ 118,380 增加 NT$ 5,100，全數來自件數調整、單價與預算書完全相同（POLO 480／T-shirt 280／帽 350）：①送師長的 POLO 由原估 20 件增為實際 24 件（+1,920）；②加留備用庫存 POLO 3、T-shirt 2、帽 2，供尺寸落差臨時更換（+2,700）；③另有同學自費加購 1 件（+480），由本人另行支付、不列入班費。班費實際支出為 NT$ 123,000。',
    actualSplit: {
      paidByFund: 123_000,
      recipients: 98,
      perPerson: 1_255,
      south: { count: 82, amount: 102_918 },
      north: { count: 16, amount: 20_082 },
      basisNote:
        '每人 NT$ 1,255 ＝ 自己整套 1,110（POLO 480 ＋ T-shirt 280 ＋ 帽 350）＋ 師長與備用庫存均攤 145。班服實際按領取件數均攤、南北同價，故不套用預算階段的 83:16 比例。南北合計依未取整的每人金額計算，與「每人 × 人數」會有數元進位差。',
      northNote: '請北班窗口彙整後轉南班財務',
    },
  },
  // 8. 校友會費 ────────────────────────────────────────────────────────────────
  {
    slug: 'alumni-fee',
    name: '校友會費',
    shortName: '校友會費',
    type: 'fixed-cost',
    date: '2026 年（一次性收齊）',
    location: '—',
    organizer: '財務部',
    audience: 'E118 全班 99 人',
    estimatedAttendance: '—',
    overview:
      'EMBA 校友總會費為一次性繳款，由本班統一收齊後，財務部於後續年度逐年撥付校友總會。屬於長期義務性支出，由南北班按 83:16 比例分攤。',
    highlights: ['一次收齊', '財務部逐年撥付校友總會', '同班同學享校友會 20 年資源'],
    budgetBasis: '校友總會公定費率',
    expense: {
      items: [{ name: '校友會費（全班）', qty: 1, unit: '式', amount: 360000, note: '一次收齊，後續逐年撥付' }],
      total: 360_000,
    },
    income: { items: [], total: 0 },
    net: 360_000,
    southBurden: Math.round((360_000 * META.southMembers) / META.totalMembers),
    northBurden: Math.round((360_000 * META.northMembers) / META.totalMembers),
    status: 'planning',
    statusNote: '入學首年一次性收齊',
  },
  // 9. 教師節禮品（南北合辦、固定費用）— v3 新增 ────────────────────────────
  {
    slug: 'teacher-day-gifts',
    name: '教師節禮品',
    shortName: '教師節禮品',
    type: 'fixed-cost',
    date: '2026 / 2027 / 2028 每年 9 月',
    location: '—',
    organizer: '南班公關組（提案）',
    audience: '系所師長（每年教師節）',
    estimatedAttendance: '—',
    overview:
      '由公關組統籌準備教師節禮品贈與系所師長，比照 E117 學長班規格編列預算。三年共三次（2026、2027、2028），每年 36,000 元、三年合計 108,000 元。屬南北合辦固定費用，由南北班按 83:16 比例分攤。',
    highlights: [
      '比照 E117 學長班規格編列',
      '每年 36,000 元、三年共 108,000 元',
      '由南班公關組統籌規劃禮品',
      '對象：系所教授群（南北班共同享有的師長關係）',
    ],
    budgetBasis: '比照 E117 學長班教師節禮品預算編列；由南班公關組提案',
    expense: {
      items: [
        { name: '教師節禮品（2026）', qty: 1, unit: '式', amount: 36000, note: '由公關組規劃' },
        { name: '教師節禮品（2027）', qty: 1, unit: '式', amount: 36000, note: '由公關組規劃' },
        { name: '教師節禮品（2028）', qty: 1, unit: '式', amount: 36000, note: '由公關組規劃' },
      ],
      total: 108_000,
    },
    income: { items: [], total: 0 },
    net: 108_000,
    southBurden: Math.round((108_000 * META.southMembers) / META.totalMembers),
    northBurden: Math.round((108_000 * META.northMembers) / META.totalMembers),
    status: 'planning',
    statusNote: 'v3 新增（2026-06-22）；每年 9 月教師節前由公關組準備',
  },
];

// ──────────────────────────────────────────────────────────────────────────────
// 預備金（南班自理區塊）
// ──────────────────────────────────────────────────────────────────────────────
export type Reserve = {
  slug: string;
  name: string;
  amount: number;
  purpose: string;
  trigger: string[];
  approvers: string;
  refundPolicy: string;
  examples?: string[];
};

export const RESERVES: Reserve[] = [
  {
    slug: 'leisure-fund',
    name: '聯誼機動金',
    amount: 150_000,
    purpose: '南班內部聯誼活動的「補助池」，採補助制（不全額買單，參加者再自付差額），鼓勵班遊、聚餐、年節等凝聚感情的活動。',
    trigger: ['班遊、班級聚餐、年節聚會', '南班自辦的小型主題活動（例：家庭日、雙年慶）'],
    approvers: '活動長提案 → 財務長核',
    refundPolicy: '三年期末未動用部分按南班 83 人比例退回',
    examples: [
      '春季班遊兩天一夜：補助每人 1,500，活動長另收參加者自付差額',
      '期末聚餐：補助桌費 50%，參加者自付飲料、加菜',
      '跨年小聚：補助場地與餐費上限 10,000',
    ],
  },
  {
    slug: 'emergency-fund',
    name: '緊急預備金',
    amount: 150_000,
    purpose: '突發醫療、意外、重大公務支出的兜底資金，備而不用。',
    trigger: ['同學突發醫療需求（住院、急難）', '南班公務性意外事件', '活動現場重大超支或臨時加場（先撥用、事後核銷）'],
    approvers: '秘書長 + 班代 + 財務長三方確認',
    refundPolicy: '三年期末未動用部分按南班 83 人比例退回',
  },
  {
    slug: 'condolence',
    name: '婚喪喜慶',
    amount: 36_000,
    purpose: '同學人生大事的祝賀與致意，全班共同的人情往來。',
    trigger: [
      '同學本人或配偶結婚：6,000 元（雙數）',
      '同學本人或配偶生子：3,600 元（雙數）',
      '同學本人直系親屬喪事：5,000 元（單數）',
    ],
    approvers: '秘書長 + 財務長雙簽',
    refundPolicy: '三年期末未動用部分按南班 83 人比例退回',
    examples: [
      '直系親屬範圍：父母、配偶、子女、本人；岳父母 / 公婆視同直系',
      '旁系（兄弟姐妹、祖父母、叔伯姑舅）原則不列；如人情濃厚，秘書處個案簽核 1,000–3,000 致意金',
    ],
  },
  {
    slug: 'north-participation',
    name: '南班參與北班活動補助',
    amount: 50_000,
    purpose: '鼓勵南班同學上去參加北班的事務，補助參加者的車馬費與餐費，促進南北班交流。',
    trigger: ['北班招生說明會聚餐（2027 年 9 月）', '北班聖誕晚會（2026 年 12 月）'],
    approvers: '活動結束後由活動長 / 秘書長依實際出席人數核算撥款，不需正式申請',
    refundPolicy:
      '每場補助上限 25,000 元，超過部分由參加者自行攤付；三年活動結束後未動用部分按南班 83 人比例退回',
    examples: [
      '補助項目：高鐵 / 油資 / 停車 + 該場餐費',
      '撥款方式：活動結束後活動長依出席人數核算，撥入南班財務帳戶後再轉發給參加者',
      '公告方式：每場結束後在幹部群組公告（出席人數、補助總額、平均每人補助多少）',
    ],
  },
];

// ──────────────────────────────────────────────────────────────────────────────
// 收支總表（南班視角）— 改用一次性 computed 物件，避免突變污染
// 計算精度：A 區合辦項目「先把全班 net 加總、最後一次乘 83/99 再四捨五入」
// 避免逐場捨入累積誤差（Codex P0 #1）
// ──────────────────────────────────────────────────────────────────────────────
const CO_HOSTED = ACTIVITIES.filter((a) => a.type === 'co-hosted' || a.type === 'fixed-cost');
const SOUTH_ONLY = ACTIVITIES.filter((a) => a.type === 'south-only');

const CO_HOSTED_TOTAL_NET = CO_HOSTED.reduce((s, a) => s + a.net, 0);
const CO_HOSTED_SOUTH_SHARE = Math.round((CO_HOSTED_TOTAL_NET * META.southMembers) / META.totalMembers);

const SOUTH_ONLY_TOTAL = SOUTH_ONLY.reduce((s, a) => s + a.southBurden, 0);
const RESERVES_TOTAL = RESERVES.reduce((s, r) => s + r.amount, 0);

export const SUMMARY = {
  coHosted: {
    label: 'A 合辦項目分攤（83/99）',
    items: ['班服', '116 畢業午宴', '119 新生報到', '119 新生營', '117 畢業相關', '校友會費', '教師節禮品'],
    totalNet: CO_HOSTED_TOTAL_NET,
    total: CO_HOSTED_SOUTH_SHARE,
  },
  southOnly: {
    label: 'B 南班自辦',
    items: ['119 迎新晚會（南班）', '聖誕晚會（v3 改南班自辦）'],
    total: SOUTH_ONLY_TOTAL,
  },
  reserves: {
    label: 'C 南班自理（預備金 / 補助）',
    items: RESERVES.map((r) => r.name),
    total: RESERVES_TOTAL,
  },
} as const;

export const TOTAL_EXPENSE = SUMMARY.coHosted.total + SUMMARY.southOnly.total + SUMMARY.reserves.total;
export const NECESSARY_PER_PERSON = Math.round(TOTAL_EXPENSE / META.southMembers);
export const SURPLUS = INCOME.total - TOTAL_EXPENSE;
export const SURPLUS_PER_PERSON = Math.round(SURPLUS / META.southMembers);

// ──────────────────────────────────────────────────────────────────────────────
// 北班分攤估算（給北班的通知用）
// ──────────────────────────────────────────────────────────────────────────────
export const NORTH_ALLOCATION = CO_HOSTED.map((a) => ({
  slug: a.slug,
  name: a.shortName,
  date: a.date,
  southNet: a.actualSplit?.south.amount ?? a.southBurden,
  northEstimate: a.actualSplit?.north.amount ?? a.northBurden,
  totalNet: a.actualSplit?.paidByFund ?? a.net,
  /** 已結算項目：金額為實際請款數，非 16/99 估算 */
  settled: a.actualSplit !== undefined,
  // 注意：fmt 定義在本檔後段，模組初始化時尚在 TDZ，此處改用 toLocaleString
  settledNote: a.actualSplit
    ? `實際結算：${a.actualSplit.recipients} 位領取者均攤，每人 NT$ ${a.actualSplit.perPerson.toLocaleString('en-US')}`
    : undefined,
}));

// 北班總額：已結算項目用實際請款數，未結算項目先彙總 net 再乘 16/99（避免逐場捨入誤差）
const CO_HOSTED_PENDING_NET = CO_HOSTED.filter((a) => !a.actualSplit).reduce((s, a) => s + a.net, 0);
const NORTH_SETTLED_TOTAL = CO_HOSTED.reduce((s, a) => s + (a.actualSplit?.north.amount ?? 0), 0);
export const NORTH_TOTAL_ESTIMATE =
  Math.round((CO_HOSTED_PENDING_NET * META.northMembers) / META.totalMembers) + NORTH_SETTLED_TOTAL;

// ──────────────────────────────────────────────────────────────────────────────
// 工具函式
// ──────────────────────────────────────────────────────────────────────────────
export const fmt = (n: number) => n.toLocaleString('en-US');
export const fmtNTD = (n: number) => `NT$ ${n.toLocaleString('en-US')}`;

// ──────────────────────────────────────────────────────────────────────────────
// 版本歷史 — 每次重大修訂在此新增一筆，最新版放最上面
// ──────────────────────────────────────────────────────────────────────────────
export type ChangelogEntry = {
  version: string;
  date: string;
  title: string;
  summary: string;
  changes: { type: 'new' | 'change' | 'fix' | 'remove'; text: string }[];
  numbers?: { label: string; before: string; after: string; delta: string }[];
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: 'v4',
    date: '2026-06-23',
    title: '南班人數調整 + 預備金用詞 + 簽核版',
    summary:
      '南班同學卓冠宏轉北班，南班 84 → 83 人、北班 15 → 16 人；合辦項目分攤比例由 84:15 改為 83:16。同時新增單頁式預算簽核書（供班代、執行副班代、幹部簽核），統一用詞「預備金」（取代「多收／退回」），避免同學誤解為等額退款。',
    changes: [
      { type: 'change', text: '南班人數 84 → 83（南班同學卓冠宏轉北班）；北班 15 → 16；合辦項目分攤比例改為 83:16' },
      { type: 'new', text: '單頁式預算簽核書（/budget/signoff）：A4 列印友善、含班代/執行副班代/幹部簽核欄、版本印記，供正式簽核使用' },
      { type: 'change', text: '用詞統一：原「多收／期末退回」改為「班費預備金／安全水位」，避免引發同學「等額退款」的誤解' },
    ],
    numbers: [
      { label: '南班總支出', before: '2,319,445', after: '2,305,834', delta: '−13,611' },
      { label: '南班必要支出/人', before: '27,612', after: '27,781', delta: '+169' },
      { label: '收費（不變）', before: '30,000', after: '30,000', delta: '—' },
      { label: '南班預備金/人', before: '2,388', after: '2,219', delta: '−169' },
      { label: '北班合辦分攤（給北班參考）', before: '204,164', after: '217,775', delta: '+13,611' },
    ],
  },
  {
    version: 'v3',
    date: '2026-06-22',
    title: '教師節禮品 + 主辦調整',
    summary:
      '新增公關組提案的教師節禮品（南北合辦、3 年共 108,000）；聖誕晚會由南北合辦改為南班自辦；E118 畢業相關活動正名為 E117 畢業相關（E118 幫 E117 學長班舉辦）。',
    changes: [
      { type: 'new', text: '新增「教師節禮品」項目：南北合辦、3 年共 108,000 元（每年 36,000），比照 E117 級規格，由南班公關組統籌' },
      { type: 'change', text: '聖誕晚會由「南北合辦」改為「南班自辦」：淨負擔 534,000 全由南班負擔，北班不分攤' },
      { type: 'change', text: '「E118 畢業晚會 / 謝師宴」更名為「E117 畢業相關（典禮、晚會、謝師宴）」— E118 幫 E117 學長班舉辦' },
    ],
    numbers: [
      { label: '南班總支出', before: '2,146,899', after: '2,319,445', delta: '+172,546' },
      { label: '南班必要支出/人', before: '25,558', after: '27,612', delta: '+2,054' },
      { label: '統一收費（不變）', before: '30,000', after: '30,000', delta: '—' },
      { label: '多收/人（沉澱期末退）', before: '4,442', after: '2,388', delta: '−2,054' },
      { label: '北班合辦分攤合計', before: '268,710', after: '204,164', delta: '−64,546' },
    ],
  },
  {
    version: 'v2',
    date: '2026-06-22',
    title: '南北分帳定案',
    summary:
      '南班 84 人 / 北班 15 人正式分帳：合辦項目按 84:15 攤、南班自辦的 119 迎新晚會獨立、預備金重新評估降低、南班新增「參與北班補助」項目。統一收費仍維持 30,000 元/人、多收沉澱期末按比例退回。',
    changes: [
      { type: 'change', text: '正式南北分帳：合辦活動結束後按 84:15 比例向北班請款（不再混算成全班一份預算）' },
      { type: 'new', text: '119 迎新晚會列為「南班自辦」（淨額 256,124 由南班獨自負擔，北班不分攤）' },
      { type: 'change', text: '預備金重整：聯誼機動金 200,000 → 150,000；南班緊急預備金 300,000 → 150,000；活動補助 100,000 → 50,000' },
      { type: 'remove', text: '北班緊急預備金 150,000 移出南班帳（由北班自決）' },
      { type: 'new', text: '新增「南班參與北班補助」50,000：補助南班同學參加北班招生聚餐、北班聖誕晚會的車馬費與餐費' },
      { type: 'change', text: '校友會費 360,000 按 84:15 拆分為南班 305,455 / 北班 54,545' },
      { type: 'change', text: '婚喪喜慶 36,000 列為南班自理（北班同學由北班自決）' },
    ],
    numbers: [
      { label: '全班舊預算', before: '30,000', after: '—', delta: '不再使用單一預算' },
      { label: '南班建議收費', before: '—', after: '30,000', delta: '同（多收 4,442 沉澱期末退）' },
      { label: '南班必要支出/人', before: '—', after: '25,558', delta: '新計算基礎' },
    ],
  },
  {
    version: 'v1',
    date: '2026-06-18',
    title: '初版（全班統一預算）',
    summary: '南北班合一份預算、全班 99 人統一收費 30,000 元/人、6 場活動 + 校友會費 + 班服，預備金 5 項：聯誼機動金 200k、婚喪喜慶 36k、活動補助 100k、南班緊急 300k、北班緊急 150k。',
    changes: [
      { type: 'new', text: '初版預算說明：6 場活動（新生報到、聖誕晚宴、116 畢業午宴、新生營、迎新晚會、118 畢業晚會）' },
      { type: 'new', text: '預備金 5 項：聯誼 200k、婚喪 36k、活動補助 100k、南緊急 300k、北緊急 150k' },
      { type: 'new', text: '校友會費 360k 一次性收齊、班服 118,380 共擔' },
      { type: 'new', text: '統一收費 30,000 元/人，未動用全數退回' },
    ],
  },
];
