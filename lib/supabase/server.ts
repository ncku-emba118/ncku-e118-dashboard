/**
 * Server-only Supabase client using service_role key.
 *
 * ⚠ 對應 ARCHITECTURE.md v3 第 6 章 API Route Security Table：
 * - service_role key 只允許在這個 server-only DAL 模組出現
 * - 絕對不可從 'use client' 元件 import，避免 leak 到 browser bundle
 * - 所有 mutation API route 都應該過 requireDeptPermission() 後才呼叫這個 client
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getEnv } from '../env';

let cached: SupabaseClient | null = null;

export function getServerClient(): SupabaseClient {
  if (cached) return cached;
  const env = getEnv();
  cached = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return cached;
}
