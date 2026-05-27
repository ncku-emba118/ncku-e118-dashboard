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

  // P0-2: cron / scheduled function 用 secret，避免 dispatch endpoint 被任何登入帳號狂打
  CRON_SECRET: z.string().min(32).optional(),
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
