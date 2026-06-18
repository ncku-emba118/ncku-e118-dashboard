/**
 * POST /api/board/bot/chat — LINE Bot 私訊聊天端點（L4）
 *
 * 用途：Bot 在 GAS 端偵測到「私訊 + 非指令 + 已綁定」→ POST 過來，
 *       這邊組 history context 給 Gemini 2.5 Flash 回答，並把這輪對話寫進 bot_chat_history。
 *
 * 鑑權：Authorization: Bearer ${BOT_SYNC_SECRET}（timing-safe，同 group-log / finance/income/sync）。
 *
 * Body: { userId, displayName?, text }
 *   • userId  = LINE userId（U 開頭）必填
 *   • text    = 同學原始文字必填
 *
 * 流程：
 *   1. Bearer 驗證
 *   2. 偵測特殊指令（忘掉我 / 不要記 / 恢復記憶 / 我說了什麼）→ 直接處理回應
 *   3. 偵測敏感關鍵字 → 不送 Gemini，回引導訊息
 *   4. Redact 敏感資料（身分證/手機/信用卡）→ 才寫 DB
 *   5. 撈最近 20 條 history（限同 user）→ 組 context
 *   6. 呼叫 Gemini 2.5 Flash
 *   7. 同步寫入 user msg + assistant msg 兩列（memory_enabled=true 才寫）
 *   8. 回 { answer, greeting? }
 */
import { type NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { getEnv } from '@/lib/env';
import { jsonResp } from '@/lib/signoff/http';
import {
  getRecentHistory,
  insertMessage,
  softDeleteByUser,
  getPrefs,
  upsertPrefs,
} from '@/lib/bot/chat-dal';
import { callGemini, friendlyFallback } from '@/lib/bot/gemini';
import { hasSensitiveKeyword, redact, detectSpecialCommand } from '@/lib/bot/redact';
import { FIRST_TIME_GREETING } from '@/lib/bot/system-prompt';

// SHA-256 後 timingSafeEqual — 同 group-log / finance/income/sync 模式
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// per-user simple rate limit（記憶體版，重啟會清空；防同學狂洗版燒 Gemini 配額）
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_PER_WINDOW = 10;
const rateBuckets = new Map<string, number[]>();
function checkRate(userId: string): boolean {
  const now = Date.now();
  const arr = (rateBuckets.get(userId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_MAX_PER_WINDOW) {
    rateBuckets.set(userId, arr);
    return false;
  }
  arr.push(now);
  rateBuckets.set(userId, arr);
  return true;
}

export async function POST(req: NextRequest) {
  const traceId = crypto.randomUUID();
  const env = getEnv();

  // 1. Bearer 驗證
  const auth = req.headers.get('authorization');
  if (
    !env.BOT_SYNC_SECRET ||
    !auth?.startsWith('Bearer ') ||
    !safeEqual(auth.slice('Bearer '.length).trim(), env.BOT_SYNC_SECRET)
  ) {
    return jsonResp({ error: 'unauthorized' }, 401, traceId);
  }

  // Gemini key 沒設 → fail-soft
  if (!env.GEMINI_API_KEY) {
    return jsonResp({ error: 'chat endpoint not configured' }, 503, traceId);
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonResp({ error: '欄位格式錯誤' }, 400, traceId);

  const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
  const rawText = typeof body.text === 'string' ? body.text.trim() : '';
  if (!userId || !rawText) {
    return jsonResp({ error: '缺 userId / text' }, 400, traceId);
  }
  if (rawText.length > 2000) {
    return jsonResp({ answer: '一次講太多我會 lag，分段講？' }, 200, traceId);
  }

  // rate limit（per-user）
  if (!checkRate(userId)) {
    return jsonResp({ answer: '我休息一下～你打太快了 😅' }, 200, traceId);
  }

  // 2. 特殊指令處理（不送 Gemini）
  const cmd = detectSpecialCommand(rawText);
  if (cmd === 'forget_me') {
    const { error, count } = await softDeleteByUser(userId);
    if (error) {
      console.error('[bot.chat.forget_me.failed]', { traceId, e: error });
      return jsonResp({ answer: friendlyFallback('server') }, 200, traceId);
    }
    return jsonResp(
      {
        answer: `好，全部清空了（${count} 條）。7 天內後悔還可以救回，打「還我對話」就好 🫶`,
      },
      200,
      traceId,
    );
  }
  if (cmd === 'no_memory') {
    await upsertPrefs(userId, { memory_enabled: false });
    return jsonResp({ answer: '好，從現在開始我只回不存。要恢復就打「恢復記憶」🙆' }, 200, traceId);
  }
  if (cmd === 'resume_memory') {
    await upsertPrefs(userId, { memory_enabled: true });
    return jsonResp({ answer: '好，記憶回來了 ✅' }, 200, traceId);
  }
  if (cmd === 'show_my_log') {
    const { rows } = await getRecentHistory(userId, 20);
    if (!rows.length) return jsonResp({ answer: '你跟我還沒聊過什麼 😶' }, 200, traceId);
    const summary = rows
      .map((r) => `${r.role === 'user' ? '你' : '我'}：${r.content.slice(0, 80)}`)
      .join('\n');
    return jsonResp({ answer: `最近這幾條：\n${summary}` }, 200, traceId);
  }

  // 3. 敏感關鍵字 → 引導指令
  if (hasSensitiveKeyword(rawText)) {
    return jsonResp(
      {
        answer: '個人財務 / 個資這類我這邊不查，用指令會比較準（例如「我的繳費紀錄」）💰',
      },
      200,
      traceId,
    );
  }

  // 4. Redact 後存（即使前面 deny-list 漏掉，這層再擋一次）
  const { content: safeUserText, redacted: userRedacted } = redact(rawText);

  // 5. 讀 prefs + history（限同 user）
  const { prefs } = await getPrefs(userId);
  const { rows: history } = prefs.memory_enabled
    ? await getRecentHistory(userId, 20)
    : { rows: [] as Awaited<ReturnType<typeof getRecentHistory>>['rows'] };

  // ── Codex F05 fix：user message 先寫 DB 再呼叫 Gemini ──
  // 同學連發兩條訊息時，第二條的 getRecentHistory 才看得到第一條，避免 race。
  if (prefs.memory_enabled) {
    await insertMessage({
      userId,
      role: 'user',
      content: safeUserText,
      redacted: userRedacted,
    }).catch((e) => console.error('[bot.chat.insert.user.failed]', { traceId, e }));
  }

  // 6. 呼叫 Gemini
  const result = await callGemini({
    apiKey: env.GEMINI_API_KEY,
    history,
    currentUserText: safeUserText,
  });

  if (!result.ok) {
    console.warn('[bot.chat.gemini.failed]', { traceId, reason: result.reason, latency_ms: result.latency_ms });
    return jsonResp({ answer: friendlyFallback(result.reason) }, 200, traceId);
  }

  // ── Codex F06 fix：response 回 LINE 前也 redact 一次 ──
  // 防 prompt injection 讓 Gemini 把 history 裡某條敏感數字洩漏出來。
  const { content: safeAnswer, redacted: assistantRedacted } = redact(result.answer);

  // 7. 寫入 assistant message（user message 已在前面寫過）
  if (prefs.memory_enabled) {
    await insertMessage({
      userId,
      role: 'assistant',
      content: safeAnswer,
      redacted: assistantRedacted,
    }).catch((e) => console.error('[bot.chat.insert.assistant.failed]', { traceId, e }));
  }

  // 8. 首次聊天的告知訊息（一次性）
  let greeting: string | null = null;
  if (!prefs.greeting_shown) {
    greeting = FIRST_TIME_GREETING;
    await upsertPrefs(userId, { greeting_shown: true }).catch(() => {
      // 失敗不阻擋；下次再試秀
    });
  }

  return jsonResp(
    { answer: safeAnswer, greeting, latency_ms: result.latency_ms },
    200,
    traceId,
  );
}
