import { expect, test } from 'vitest';
import { MODERATION_RULES } from './moderation-config';
import { needsCommentReview } from './moderation';

for (const rule of MODERATION_RULES) {
  test.each([...rule.zh, ...rule.en])(`${rule.category} 詞庫命中：%s`, (text) => {
    expect(needsCommentReview(text)).toBe(true);
  });
}

test.each([
  '幹部', '幹事', '秘書長', '謝謝幹部與幹事，秘書長辛苦了',
  '雞', '雞肉飯好吃', '屌', '這個表演很屌', '幹', '樹幹', '幹嘛', '骨幹',
  '性別平等', '反對歧視', '同性戀也是同學', '黑人文化', '雞年活動',
  'class assignment', 'Scunthorpe', 'Dickinson', 'classic assessment', 'shitake',
  'Saturday meeting', 'skill yourself', 'I like your family', '傳送照片給幹部', '',
])('正常文字不誤判：%s', (text) => {
  expect(needsCommentReview(text)).toBe(false);
});

test.each([
  'ＦＵＣＫ', 'FuCk', 'f.u.c.k', 'f u c k', 'f\u200bu\u200dc\ufeffk',
  '幹 你 娘', '幹！你＊媽', '干你妈', '甘你娘', '艹你妈', '鸡掰', '鷄－掰',
  '操\n你\t媽', '杀 了 你', '杀你', '约炮', '裸💢照', '死同性恋', '支那猪',
  'ＢＬＯＷＪＯＢ', 's e n d n u d e s', 'kill---you', 'N.I.G.G.E.R',
  '你這個fuck！', '你是白痴', '幹部請看：殺了你', '幹事 fuck 秘書長',
])('規避與中英混合命中：%s', (text) => {
  expect(needsCommentReview(text)).toBe(true);
});

test('重複呼叫沒有 regex lastIndex 副作用，長符號輸入可完成', () => {
  const text = `f${'.'.repeat(996)}uck`;
  expect(needsCommentReview(text)).toBe(true);
  expect(needsCommentReview(text)).toBe(true);
  expect(needsCommentReview('.'.repeat(1000))).toBe(false);
});

test.each([
  'fuckyou', 'fucked', 'fucks', 'fuckin', 'f*ck', 'fuuuck', 'fvck', 'sh1t',
  'kill yourself', 'kys', 'idiot', 'stupid', 'dick', 'slut', 'whore', 'retard', 'stfu',
  '幹妳娘', '靠夭', '雞歪', '笨蛋', '垃圾', '廢物', '腦殘', '北七', '三小', '媽的', '去你的',
  'fuckhead', 'retarded', '$hit', 'wh0re', 'b@stard', 'r3tard', 'SH111T', 'Ｆ＊ＣＫ',
])('審查回歸：辱罵及常見變形命中 %s', (text) => {
  expect(needsCommentReview(text)).toBe(true);
});

test.each([
  '心智障礙者', '去死角', '去死皮', '混蛋白', '若干你媽媽',
  'shoot you at 3pm', 'chink in the armor', '干部', '若干事項', '甘甜',
  'Scunthorpe', 'Dickinson', 'shitake', 'stupidlyx', 'skill yourself',
])('審查回歸：正常詞／片語不誤判 %s', (text) => {
  expect(needsCommentReview(text)).toBe(false);
});

test.each([
  '心智障礙者，你是智障', '去死角，你去死', '去死皮，廢物', '混蛋白，混蛋',
  '若干你媽媽，幹妳娘', 'shoot you at 3pm; fuckyou', 'chink in the armor; chink',
])('例外只排除該片段，不放過其餘辱罵 %s', (text) => {
  expect(needsCommentReview(text)).toBe(true);
});

test.each(['你這個混蛋白痴', '混蛋白，白痴'])('例外不能遮住跨界辱罵 %s', (text) => {
  expect(needsCommentReview(text)).toBe(true);
});
