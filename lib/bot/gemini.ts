/**
 * Gemini 2.5 Flash 呼叫 wrapper — Google AI Studio API。
 *
 * 設計：
 *   • 純 fetch、無 SDK 依賴
 *   • 8 秒 timeout（搭配 GAS UrlFetchApp 無 timeout 限制問題，這邊強制砍掉）
 *   • 錯誤分類：429 (quota) / 5xx (server) / timeout → 各自友善訊息
 *   • maxOutputTokens 限制 → 強制簡短回覆，符合 LINE 體驗
 */
import { buildSystemPrompt } from './system-prompt';
import { getRoster, rosterAsCompactText } from './class-roster';
import type { ChatHistoryRow } from './chat-dal';

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const TIMEOUT_MS = 8000;
const MAX_OUTPUT_TOKENS = 400;

export type GeminiFailReason = 'quota' | 'server' | 'timeout' | 'blocked' | 'empty';

export type GeminiResult =
  | { ok: true; answer: string; latency_ms: number }
  | { ok: false; reason: GeminiFailReason; latency_ms: number };

export async function callGemini(opts: {
  apiKey: string;
  history: ChatHistoryRow[];
  currentUserText: string;
}): Promise<GeminiResult> {
  const start = Date.now();

  // 組 contents：history 順序（舊→新）+ 本次 user 訊息
  const contents = [
    ...opts.history.map((row) => ({
      role: row.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: row.content }],
    })),
    { role: 'user', parts: [{ text: opts.currentUserText }] },
  ];

  // RAG：動態抓全班名冊塞 system prompt（失敗回空、靠幹部清單兜底）
  const roster = await getRoster();
  const systemText = buildSystemPrompt(rosterAsCompactText(roster));

  const body = {
    systemInstruction: { parts: [{ text: systemText }] },
    contents,
    generationConfig: {
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      temperature: 0.9,
      // Gemini 2.5 thinking 預設開，聊天用不到太深 → 關掉省 latency
      thinkingConfig: { thinkingBudget: 0 },
    },
    // 安全設定維持預設（Gemini default block 高風險）
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const resp = await fetch(`${GEMINI_ENDPOINT}?key=${encodeURIComponent(opts.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const latency_ms = Date.now() - start;

    if (resp.status === 429) return { ok: false, reason: 'quota', latency_ms };
    if (resp.status >= 500) return { ok: false, reason: 'server', latency_ms };

    const json = (await resp.json().catch(() => null)) as
      | {
          candidates?: Array<{
            content?: { parts?: Array<{ text?: string }> };
            finishReason?: string;
          }>;
          promptFeedback?: { blockReason?: string };
        }
      | null;

    if (!json) return { ok: false, reason: 'server', latency_ms };

    // 內容被 Gemini 安全過濾擋掉
    if (json.promptFeedback?.blockReason) {
      return { ok: false, reason: 'blocked', latency_ms };
    }

    const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim();
    if (!text) return { ok: false, reason: 'empty', latency_ms };

    return { ok: true, answer: text, latency_ms };
  } catch (e) {
    const latency_ms = Date.now() - start;
    if ((e as Error)?.name === 'AbortError') {
      return { ok: false, reason: 'timeout', latency_ms };
    }
    return { ok: false, reason: 'server', latency_ms };
  } finally {
    clearTimeout(timer);
  }
}

export function friendlyFallback(reason: GeminiFailReason): string {
  switch (reason) {
    case 'quota':
      return '我今天聊太多累了，明天再聊好嗎 🥱';
    case 'timeout':
      return '想到一半斷線了，再講一次？';
    case 'blocked':
      return '這話題我不太敢接欸 😅 換個聊？';
    case 'empty':
      return '腦袋空白了一下，再講一次？';
    case 'server':
    default:
      return '我這邊出了點狀況 🥲 晚點再試';
  }
}
