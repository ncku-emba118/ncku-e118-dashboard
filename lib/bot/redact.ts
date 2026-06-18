/**
 * 敏感資料 redact — 寫入 bot_chat_history 前 + 送 Gemini 前 + 回 LINE 前都過一次。
 *
 * Codex 敵對審查 Round-1 修正：
 *   • F02 — NFKC normalize + 移除零寬字元（Cf 類）後才做 keyword 比對；防全形/同音/插字繞道
 *   • F03 — 補 E.164 台灣手機（+886）、Luhn 13-19 碼信用卡、新式身分證（含居留證 N1）
 */

// ── normalize helper ─────────────────────────────────────
// NFKC：全形→半形、相容字元統一
// Cf 類：零寬空格 ​ / 零寬連接 ‍ / BOM ﻿ / 軟連字 ­ …
const ZERO_WIDTH_AND_FORMAT_RE = /[­​-‏‪-‮⁠-⁯﻿]/g;

function normalize(text: string): string {
  return text
    .normalize('NFKC')
    .replace(ZERO_WIDTH_AND_FORMAT_RE, '')
    .toLowerCase();
}

function normalizeCompact(text: string): string {
  // 移除全部標點/空白 → 「末．五．碼」→「末五碼」
  return normalize(text).replace(/[\s.,。、!?！？·．・\-_/\\|()（）「」『』<>"'"'`~@#$%^&*+=:;：；]+/g, '');
}

// ── 偵測類（拒答 / 引導指令）──
const SENSITIVE_KEYWORDS = [
  /末\s*[五5]\s*[碼]/,
  /我的?\s*班費/,
  /我繳了(多少)?/,
  /我這(學期|個月|個學期)?繳/,
  /密碼|password|pwd/,
  /身分證(字號|號碼)?/,
  /信用卡卡?號?/,
];

const SENSITIVE_COMPACT_KEYWORDS = [
  /末五碼/, // compact 版（已 normalize 過、空白標點都拿掉）
  /末5碼/,
  /我的班費/,
  /我繳了/,
  /密碼/,
  /password/,
  /身分證/,
  /信用卡/,
];

export function hasSensitiveKeyword(text: string): boolean {
  const norm = normalize(text);
  if (SENSITIVE_KEYWORDS.some((p) => p.test(text) || p.test(norm))) return true;
  const compact = normalizeCompact(text);
  return SENSITIVE_COMPACT_KEYWORDS.some((p) => p.test(compact));
}

// ── Luhn 演算法（信用卡校驗）──
function luhnValid(digits: string): boolean {
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (n < 0 || n > 9) return false;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

// ── Redact 類（寫入前 mask）──
// 順序：先 redact 信用卡（最長）→ 手機 → 身分證 → 末五碼樣式，避免短 pattern 蓋掉長 pattern。

export function redact(text: string): { content: string; redacted: boolean } {
  let out = text;
  let hit = false;

  // 1) 信用卡：13-19 碼數字（容許 - 或 空格分隔），用 Luhn 驗證才視為真卡號
  out = out.replace(/\b(?:\d[\s-]?){12,18}\d\b/g, (m) => {
    const digits = m.replace(/[\s-]/g, '');
    if (luhnValid(digits)) {
      hit = true;
      return '[信用卡已遮蔽]';
    }
    return m;
  });

  // 2) 台灣手機 E.164 +886 開頭：+886912345678 / +886-912-345-678 / 886 0912...
  out = out.replace(/(\+?886|0)[-\s]?9\d{2}[-\s]?\d{3}[-\s]?\d{3}\b/g, () => {
    hit = true;
    return '[手機已遮蔽]';
  });

  // 3) 台灣身分證（舊式 [A-Z][12]\d{8}）+ 新式（內政部 2024+ 第二碼 8/9 為外籍）+ 居留證（[A-Z][A-D89]\d{8}）
  // 為了不漏，第二碼放寬 [12389A-D]，再靠 first letter 是 A-Z 限定。
  out = out.replace(/\b[A-Za-z][12389A-Da-d]\d{8}\b/g, () => {
    hit = true;
    return '[身分證已遮蔽]';
  });

  // 4) 末五碼樣式：直接吃掉「末.五.碼 = 12345」「末五碼12345」之類
  // 用 normalized 抓位置會比較準，但簡化版用寬鬆 regex
  out = out.replace(/末\s*[五5]\s*碼\s*[是為:：=]?\s*\d{4,5}/g, () => {
    hit = true;
    return '末五碼[已遮蔽]';
  });

  // 5) 4 碼以上連續數字若上下文出現「末五碼」「卡號」「身分」字樣 → 額外保護
  if (/末\s*[五5]\s*碼|卡號|身分證/.test(text)) {
    out = out.replace(/\b\d{4,}\b/g, (m) => {
      // 已被前面替換過的不會碰到
      hit = true;
      return '[數字已遮蔽]';
    });
  }

  return { content: out, redacted: hit };
}

// ── 特殊指令偵測 ──
export type SpecialCommand =
  | 'forget_me'
  | 'no_memory'
  | 'resume_memory'
  | 'show_my_log';

export function detectSpecialCommand(text: string): SpecialCommand | null {
  const t = normalizeCompact(text);
  if (/^(忘掉我|忘記我|清空對話|清除對話|清空我的對話|清掉對話)$/.test(t)) return 'forget_me';
  if (/^(不要記|別記|停止記錄|不要記憶|關閉記憶|不記了)$/.test(t)) return 'no_memory';
  if (/^(恢復記憶|開啟記憶|開始記錄|繼續記|要記了)$/.test(t)) return 'resume_memory';
  if (/^(我說了什麼|查我對話|查我的對話|顯示我的對話|看我紀錄)$/.test(t)) return 'show_my_log';
  return null;
}
