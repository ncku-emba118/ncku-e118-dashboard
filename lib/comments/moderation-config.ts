/**
 * 留言過濾的唯一詞庫。新增詞語請同時補 moderation.test.ts 的正／反例。
 * 全部視為文字，不支援 regex。中文採片語；不封鎖「雞」「屌」「幹」單字。
 * 英文採 Latin／數字邊界，避免 class、assignment 等正常詞被子字串命中。
 */
export const MODERATION_RULES = [
  {
    category: 'abuse',
    zh: ['幹你娘', '幹你媽', '操你媽', '草你媽', '肏你媽', '他媽的', '你媽的', '靠北', '靠杯', '哭爸', '哭夭', '雞掰', '機掰', '雞巴', '屌你', '白痴', '智障', '王八蛋', '混蛋', '傻逼', '傻屄', '賤人', '婊子', '狗娘養', '去你媽', '趕羚羊', '靠夭', '雞歪', '笨蛋', '垃圾', '廢物', '腦殘', '北七', '三小', '媽的', '去你的'],
    en: ['fuck', 'fucking', 'fucker', 'fuckers', 'motherfucker', 'motherfuckers', 'shit', 'shitty', 'bullshit', 'bitch', 'bitches', 'bastard', 'asshole', 'assholes', 'dickhead', 'cunt', 'idiot', 'stupid', 'dick', 'slut', 'whore', 'retard', 'stfu'],
  },
  {
    category: 'sexual',
    zh: ['做愛', '性交', '口交', '肛交', '打手槍', '約炮', '約砲', '援交', '色情', 'A片', '裸照', '露奶', '舔穴', '舔屌', '強姦', '性奴'],
    en: ['porn', 'porno', 'pornography', 'blowjob', 'handjob', 'hentai', 'sexting', 'send nudes', 'nude photos', 'show me your tits', 'suck my dick', 'anal sex'],
  },
  {
    category: 'threat',
    zh: ['殺了你', '殺死你', '殺你', '弄死你', '打死你', '砍死你', '砍你', '宰了你', '讓你死', '去死', '殺全家', '全家死', '滅你全家', '揍死你'],
    en: ['kill you', 'kill u', 'murder you', 'shoot you', 'stab you', 'beat you to death', 'kill your family', 'go die', 'kill yourself', 'kys'],
  },
  {
    category: 'hate',
    zh: ['死基佬', '死同性戀', '同性戀去死', '黑鬼', '白鬼', '支那豬', '支那人', '死外勞', '死番仔', '低等民族', '劣等民族'],
    en: ['nigger', 'niggers', 'nigga', 'faggot', 'faggots', 'chink', 'kike', 'white power', 'heil hitler'],
  },
] as const;

// 簡繁及常見替字只做單字對應；是否命中仍取決於上述完整片語。
export const MODERATION_CHAR_VARIANTS: Readonly<Record<string, string>> = {
  妳: '你', 艹: '操', 媽: '媽', 妈: '媽', 娘: '娘', 孃: '娘',
  鸡: '雞', 鷄: '雞', 机: '機', 贱: '賤', 养: '養', 爱: '愛',
  枪: '槍', 约: '約', 强: '強', 奸: '姦', 杀: '殺', 让: '讓',
  废: '廢', 脑: '腦', 残: '殘', 灭: '滅', 恋: '戀', 猪: '豬', 劣: '劣', 赶: '趕', 羚: '羚',
};

// 限定完整辱罵片語，不將正常文字的「干／甘」一律改成「幹」。
export const MODERATION_ZH_ALIASES = ['干你媽', '干你娘', '甘你媽', '甘你娘'];
export const MODERATION_EXCEPTIONS = {
  zh: ['心智障礙者', '去死角', '去死皮', '混蛋白', '若干你媽媽'],
  en: ['shoot you at 3pm', 'chink in the armor'],
};
// 明列常見字尾並保留左右邊界，避免 Dickinson／shitake。
export const MODERATION_EN_SUFFIXES: Readonly<Record<string, readonly string[]>> = {
  fuck: ['ed', 's', 'ing', 'in', 'er', 'ers', 'head', 'heads', 'you'],
  shit: ['s', 'ty', 'ting', 'head', 'heads'],
  bitch: ['es', 'y', 'ing'], bastard: ['s'], asshole: ['s'], cunt: ['s'],
  idiot: ['s', 'ic'], stupid: ['ly'], dick: ['s', 'head', 'heads'],
  slut: ['s', 'ty'], whore: ['s'], retard: ['s', 'ed'],
};
export const MODERATION_LEET: Readonly<Record<string, string>> = {
  '0': 'o', '1': 'i', '3': 'e', '@': 'a', '$': 's', v: 'u',
};
