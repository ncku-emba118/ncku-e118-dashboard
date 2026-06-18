/**
 * bot_chat_history / bot_chat_prefs DAL — 只走 service_role。
 *
 * 跨用戶資料隔離：所有 select / delete 必帶 user_id 過濾，呼叫端不允許省略。
 */
import { getServerClient } from '@/lib/supabase/server';

const HISTORY_LIMIT_FOR_CONTEXT = 20;

export type ChatRole = 'user' | 'assistant';

export type ChatHistoryRow = {
  role: ChatRole;
  content: string;
  created_at: string;
};

/** 撈該 user 最近 N 條未刪除的對話（時間升序，最舊在前 → 給 Gemini 順序合理） */
export async function getRecentHistory(
  userId: string,
  limit = HISTORY_LIMIT_FOR_CONTEXT,
): Promise<{ rows: ChatHistoryRow[]; error: string | null }> {
  if (!userId) return { rows: [], error: 'missing userId' };
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from('bot_chat_history')
    .select('role, content, created_at')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return { rows: [], error: error.message };
  const rows = (data ?? []).reverse() as ChatHistoryRow[];
  return { rows, error: null };
}

/** 新增一條訊息（user 或 assistant）。若 prefs.memory_enabled=false 則呼叫端應跳過。 */
export async function insertMessage(input: {
  userId: string;
  role: ChatRole;
  content: string;
  redacted: boolean;
  tokenCount?: number | null;
}): Promise<{ error: string | null }> {
  if (!input.userId) return { error: 'missing userId' };
  const supabase = getServerClient();
  const { error } = await supabase.from('bot_chat_history').insert({
    user_id: input.userId,
    role: input.role,
    content: input.content,
    redacted: input.redacted,
    token_count: input.tokenCount ?? null,
  });
  return { error: error ? error.message : null };
}

/** Soft delete：標記 deleted_at=now()，7 天後 cron 真刪。 */
export async function softDeleteByUser(
  userId: string,
): Promise<{ error: string | null; count: number }> {
  if (!userId) return { error: 'missing userId', count: 0 };
  const supabase = getServerClient();
  const { error, count } = await supabase
    .from('bot_chat_history')
    .update({ deleted_at: new Date().toISOString() }, { count: 'exact' })
    .eq('user_id', userId)
    .is('deleted_at', null);
  return { error: error ? error.message : null, count: count ?? 0 };
}

/** 7 天緩衝內反悔：把該 user 還在 soft-deleted 狀態的列復活。 */
export async function restoreSoftDeleted(
  userId: string,
): Promise<{ error: string | null; count: number }> {
  if (!userId) return { error: 'missing userId', count: 0 };
  const supabase = getServerClient();
  const { error, count } = await supabase
    .from('bot_chat_history')
    .update({ deleted_at: null }, { count: 'exact' })
    .eq('user_id', userId)
    .not('deleted_at', 'is', null);
  return { error: error ? error.message : null, count: count ?? 0 };
}

// ── Cleanup（給 cron 用，service_role）─────────────────

/**
 * 真刪 soft-deleted 滿 7 天的列。
 * 對應「忘掉我」7 天緩衝政策。
 */
export async function hardDeleteSoftDeletedOlderThan(
  days: number,
): Promise<{ error: string | null; count: number }> {
  const supabase = getServerClient();
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
  const { error, count } = await supabase
    .from('bot_chat_history')
    .delete({ count: 'exact' })
    .not('deleted_at', 'is', null)
    .lt('deleted_at', cutoff);
  return { error: error ? error.message : null, count: count ?? 0 };
}

/**
 * 真刪 created_at 超過 N 天的列（不論有沒 soft-deleted）。
 * 對應 365 天保留政策。
 */
export async function hardDeleteCreatedBefore(
  days: number,
): Promise<{ error: string | null; count: number }> {
  const supabase = getServerClient();
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
  const { error, count } = await supabase
    .from('bot_chat_history')
    .delete({ count: 'exact' })
    .lt('created_at', cutoff);
  return { error: error ? error.message : null, count: count ?? 0 };
}

// ── prefs ─────────────────────────────────────────────

export type ChatPrefs = {
  memory_enabled: boolean;
  greeting_shown: boolean;
};

const DEFAULT_PREFS: ChatPrefs = { memory_enabled: true, greeting_shown: false };

export async function getPrefs(
  userId: string,
): Promise<{ prefs: ChatPrefs; error: string | null }> {
  if (!userId) return { prefs: DEFAULT_PREFS, error: 'missing userId' };
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from('bot_chat_prefs')
    .select('memory_enabled, greeting_shown')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return { prefs: DEFAULT_PREFS, error: error.message };
  return { prefs: (data as ChatPrefs) ?? DEFAULT_PREFS, error: null };
}

export async function upsertPrefs(
  userId: string,
  patch: Partial<ChatPrefs>,
): Promise<{ error: string | null }> {
  if (!userId) return { error: 'missing userId' };
  const supabase = getServerClient();
  const { error } = await supabase.from('bot_chat_prefs').upsert(
    {
      user_id: userId,
      ...patch,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  return { error: error ? error.message : null };
}
