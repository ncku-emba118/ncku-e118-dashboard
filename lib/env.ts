/**
 * Env validation via zod — fails build / runtime fast if any required env missing.
 * 對應 ARCHITECTURE.md v3 第 10 章「Env validation + degraded mode」。
 */
import { z } from 'zod';

const envSchema = z.object({
  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(40),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(40),

  // Session / JWT
  SESSION_SECRET: z.string().min(32),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(28800),

  // IP hash (留言 spam 防護)
  IP_HASH_SECRET: z.string().min(32),
  IP_HASH_VERSION: z.coerce.number().int().positive().default(1),

  // Web Push (VAPID) — optional for now，PUSH_ENABLED=false 時不要求
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),
  VAPID_JWT_EXP_SECONDS: z.coerce.number().int().positive().default(21600),

  // Push runtime tuning
  PUSH_ENABLED: z.enum(['true', 'false']).default('true'),
  PUSH_BATCH_SIZE: z.coerce.number().int().positive().default(100),
  PUSH_CONCURRENCY: z.coerce.number().int().positive().default(20),
  PUSH_PER_CALL_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),

  // 原生推播（Capacitor App）— 全部 optional；NATIVE_PUSH_ENABLED 預設 false（安全上線：
  // 先套 0032 migration、設好下列憑證，再改 true）。值一律放 1Password AI-agent vault → Netlify env，
  // 程式碼/repo 只定義名稱，不得硬編。
  NATIVE_PUSH_ENABLED: z.enum(['true', 'false']).default('false'),
  // 原生通道自己的時間預算（ms）：超過就停止送出剩餘 token，避免拖累 Netlify 10s 函式上限
  NATIVE_PUSH_BUDGET_MS: z.coerce.number().int().positive().default(5000),
  // iOS（直送 APNs，token-based）：Key ID／Team ID／.p8 內容 base64（不放路徑，Netlify 無本機檔案）
  APNS_KEY_ID: z.string().length(10).optional(),
  APNS_TEAM_ID: z.string().length(10).optional(),
  APNS_P8_B64: z.string().min(100).optional(),
  APNS_ENV: z.enum(['production', 'sandbox']).default('production'),
  // Android（FCM HTTP v1）：專案 ID + 服務帳號 JSON（原文或 base64 擇一）
  FCM_PROJECT_ID: z.string().min(3).optional(),
  FCM_SERVICE_ACCOUNT_JSON: z.string().min(50).optional(),
  FCM_SERVICE_ACCOUNT_JSON_B64: z.string().min(50).optional(),

  // P0-2: cron / scheduled function 用 secret，避免 dispatch endpoint 被任何登入帳號狂打
  CRON_SECRET: z.string().min(32).optional(),

  // L1: LINE Bot 對帳收款連動用 secret（Bearer），保護 /api/board/finance/income/sync
  BOT_SYNC_SECRET: z.string().min(32).optional(),

  // L2: 班網→Bot 推 LINE 班群用，GAS Web App URL
  // 沒設定時 dispatcher 不會打 LINE（fail-soft）— web push 照樣運作
  LINE_BOT_WEBHOOK_URL: z.string().url().optional(),

  // L4: Bot 私訊聊天端點用 — Gemini 2.5 Flash API key（Google AI Studio）
  // 沒設定時 /api/board/bot/chat 回 503（fail-soft），bot 那邊看到就跳「我這邊出狀況」
  GEMINI_API_KEY: z.string().min(20).optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    throw new Error(
      `[env] Invalid environment configuration:\n${JSON.stringify(errors, null, 2)}`,
    );
  }
  cached = parsed.data;
  return cached;
}
