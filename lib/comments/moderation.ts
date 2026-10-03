import {
  MODERATION_CHAR_VARIANTS, MODERATION_RULES, MODERATION_EN_SUFFIXES,
  MODERATION_EXCEPTIONS, MODERATION_ZH_ALIASES, MODERATION_LEET,
} from './moderation-config';

function normalize(text: string): string {
  return Array.from(text.normalize('NFKC').toLowerCase(),
    (char) => MODERATION_CHAR_VARIANTS[char] ?? char).join('');
}
const compress = (text: string) => text.replace(/([a-z])\1+/g, '$1');
function english(text: string, leet: boolean, collapse: boolean): string {
  const value = leet
    ? text.replace(/[013@$v]/g, (char) => MODERATION_LEET[char])
      .replace(/(?<=[a-z])\*(?=[a-z])/g, 'u')
    : text;
  return collapse ? compress(value) : value;
}
const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const separator = '[\\s\\p{P}\\p{S}\\p{Cf}]*';
function phrase(term: string): string {
  return Array.from(term.replace(/\s/g, '')).map(escapeRegex).join(separator);
}
const boundary = '[\\p{Script=Latin}\\p{N}]';
const word = (pattern: string) => `(?<!${boundary})${pattern}(?!${boundary})`;
const zhPatterns = MODERATION_RULES.flatMap((rule) => rule.zh.map((term) => new RegExp(phrase(normalize(term)), 'u')));
const aliasPatterns = MODERATION_ZH_ALIASES.map((term) =>
  new RegExp(`(?<!\\p{Script=Han})${phrase(normalize(term))}`, 'u'));
const zhExceptions = MODERATION_EXCEPTIONS.zh.map((term) => new RegExp(phrase(normalize(term)), 'gu'));
const enMatchers = [false, true].flatMap((leet) => [false, true].map((collapse) => ({
  leet, collapse,
  patterns: MODERATION_RULES.flatMap((rule) => rule.en.map((term) => {
    const variants = [term, ...(MODERATION_EN_SUFFIXES[term] ?? []).map((suffix) => term + suffix)];
    return new RegExp(word(`(?:${variants.map((value) => phrase(english(normalize(value), leet, collapse))).join('|')})`), 'u');
  })),
  exceptions: MODERATION_EXCEPTIONS.en.map((term) => new RegExp(word(phrase(english(normalize(term), leet, collapse))), 'gu')),
})));
// Only exempt matches fully contained by a normal phrase; overlapping abuse stays visible.
function matchesOutsideExceptions(text: string, patterns: RegExp[], exceptions: RegExp[]): boolean {
  const spans = exceptions.flatMap((pattern) => Array.from(text.matchAll(pattern),
    (match) => ({ start: match.index!, end: match.index! + match[0].length })));
  return patterns.some((pattern) => Array.from(text.matchAll(new RegExp(pattern.source, 'gu')))
    .some((match) => !spans.some((span) => match.index! >= span.start && match.index! + match[0].length <= span.end)));
}

/** Pure server-side decision; never returns matched words or categories to callers. */
export function needsCommentReview(text: string): boolean {
  const normalized = normalize(text);
  if (matchesOutsideExceptions(normalized, [...zhPatterns, ...aliasPatterns], zhExceptions)) return true;
  return enMatchers.some(({ leet, collapse, patterns, exceptions }) => {
    return matchesOutsideExceptions(english(normalized, leet, collapse), patterns, exceptions);
  });
}
