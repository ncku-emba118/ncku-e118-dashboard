import 'server-only'; // ⚠ Codex Sec F5: build-time barrier — client component import this 會 build fail

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getEnv } from '../env';

/**
 * Server-only Supabase client using service_role key.
 *
 * 對應 ARCHITECTURE.md v3 第 6 章 API Route Security Table：
 * - service_role key 只允許在這個 server-only DAL 模組出現
 * - `import 'server-only'` 在 build time 擋掉 client 端 import
 * - 所有 mutation API route 都應該過 requireDeptPermission() 後才呼叫這個 client
 *
 * Codex #2 fixes:
 * - Sec F5: import 'server-only' barrier
 * - Rel F5: 內建 AbortController fetch timeout（2.5s），防 lambda 被 Supabase hang 卡到 10s
 */

const QUERY_TIMEOUT_MS = 2500;

function makeTimeoutFetch(timeoutMs: number): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return await fetch(input, { ...init, signal: ctrl.signal });
    } finally {
      clearTimeout(t);
    }
  }) as typeof fetch;
}

let cached: SupabaseClient | null = null;

export function getServerClient(): SupabaseClient {
  if (cached) return cached;
  const env = getEnv();
  cached = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      fetch: makeTimeoutFetch(QUERY_TIMEOUT_MS),
    },
  });
  return cached;
}
