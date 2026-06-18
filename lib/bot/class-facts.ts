/**
 * E118 班級事實 — 寫死的「結構性」資料（幹部組織、班別）。
 *
 * 來源（authoritative）：
 *   秘書長工作/通訊錄/名片資料/E118{南,北}班幹部_名片資料.xlsx（2026-06-11）
 *
 * 注意：只放職位 + 中文名 + 英文名/暱稱。手機 / Email / 戶籍地址 等 PII 絕不放這。
 * 全班 101 人的職業、公司、產業由 lib/bot/class-roster.ts 動態 fetch members.json。
 */

export type Officer = {
  position: string;
  name: string;
  alias?: string;
  班別: '南班' | '北班';
};

export const E118_OFFICERS: Officer[] = [
  // 南班（24 人）
  { position: '班代',       name: '毛榮海', alias: '毛帥 / JUNG HAI', 班別: '南班' },
  { position: '第一副班代', name: '卓彤穎', alias: 'Tony',             班別: '南班' },
  { position: '秘書長',     name: '黃政傑', alias: 'Jerry',            班別: '南班' },
  { position: '副班代',     name: '王景瑞', alias: 'Ray',              班別: '南班' },
  { position: '副班代',     name: '賴建良', alias: 'Jacky-Lai',        班別: '南班' },
  { position: '副班代',     name: '吳佳展', alias: 'Dan',              班別: '南班' },
  { position: '副班代',     name: '嚴瑟',   alias: 'Tiffany',          班別: '南班' },
  { position: '副班代',     name: '杜筱婷', alias: 'Ting',             班別: '南班' },
  { position: '副班代',     name: '賴昱仁',                            班別: '南班' },
  { position: '副班代',     name: '黃建華', alias: 'tedy',             班別: '南班' },
  { position: '副班代',     name: '甘家瑋', alias: 'Edward',           班別: '南班' },
  { position: '副班代',     name: '王騰宏', alias: 'Ryan',             班別: '南班' },
  { position: '副班代',     name: '李政慧', alias: 'Faye',             班別: '南班' },
  { position: '副班代',     name: '蔡一郎', alias: 'Steven',           班別: '南班' },
  { position: '副班代',     name: '蔡宏南', alias: 'Eric',             班別: '南班' },
  { position: '副班代',     name: '周伯威', alias: 'Patrick',          班別: '南班' },
  { position: '副班代',     name: '李嘉祺', alias: 'Charles',          班別: '南班' },
  { position: '醫務長',     name: '詹培梅', alias: 'Vivian',           班別: '南班' },
  { position: '學務長',     name: '盧宣佑', alias: 'Yoyo',             班別: '南班' },
  { position: '活動長',     name: '楊其峻', alias: 'Alex Yang',        班別: '南班' },
  { position: '公關長',     name: '黃燕玲', alias: 'Ellie',            班別: '南班' },
  { position: '副公關長',   name: '林明燦', alias: 'Patrick',          班別: '南班' },
  { position: '財務長',     name: '羅偉哲', alias: 'Wesley',           班別: '南班' },
  { position: '文宣長',     name: '呂世萱', alias: 'Grace',            班別: '南班' },

  // 北班（16 人）
  { position: '班代',       name: '鄧在國', alias: 'Peter',            班別: '北班' },
  { position: '副班代',     name: '劉旻杰', alias: 'Jamison',          班別: '北班' },
  { position: '秘書長（秘書組）', name: '戴伶育', alias: 'Candy',  班別: '北班' },
  { position: '秘書長（秘書組）', name: '許育瑄', alias: 'Angela', 班別: '北班' },
  { position: '醫護/攝影組', name: '蔡依庭', alias: 'Carrie',          班別: '北班' },
  { position: '醫護/攝影組', name: '卓冠宏', alias: 'Joe',             班別: '北班' },
  { position: '學務組',     name: '丁國泰',                            班別: '北班' },
  { position: '學務組',     name: '王蒨如', alias: 'Grace',            班別: '北班' },
  { position: '活動組',     name: '陳彥儒', alias: 'Walter',           班別: '北班' },
  { position: '活動組',     name: '陳業偉', alias: 'Alex',             班別: '北班' },
  { position: '公關組',     name: '邱士哲', alias: '邱馳',             班別: '北班' },
  { position: '公關組',     name: '周子鈞', alias: 'Justin',           班別: '北班' },
  { position: '財務組',     name: '陳珮芬', alias: 'Claire',           班別: '北班' },
  { position: '財務組',     name: '涂慧珊', alias: 'Abbie',            班別: '北班' },
  { position: '文宣組',     name: '陳宏哲',                            班別: '北班' },
  { position: '文宣組',     name: '林濰誌',                            班別: '北班' },
];

/** 把幹部清單組成 LLM 友善的 Markdown 表，給 system prompt 用。 */
export function officersAsMarkdown(): string {
  const fmt = (o: Officer) =>
    `- ${o.班別} ${o.position}：${o.name}${o.alias ? `（${o.alias}）` : ''}`;
  const 南 = E118_OFFICERS.filter((o) => o.班別 === '南班').map(fmt).join('\n');
  const 北 = E118_OFFICERS.filter((o) => o.班別 === '北班').map(fmt).join('\n');
  return `【E118 幹部組織（2026 春，authoritative）】\n\n南班：\n${南}\n\n北班：\n${北}`;
}
