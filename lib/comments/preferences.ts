export const PREFERENCES_KEY = 'e118.comments.preferences.v1';
const DEVICE_KEY = 'e118.comments.reporter.v1';
export type Preferences = { hidden: string[]; blocked: { key: string; name: string }[] };
export const emptyPreferences = (): Preferences => ({ hidden: [], blocked: [] });

export function readPreferences(storage: Pick<Storage, 'getItem'>): Preferences {
  const raw = storage.getItem(PREFERENCES_KEY);
  if (!raw) return emptyPreferences();
  const value = JSON.parse(raw);
  if (!Array.isArray(value?.hidden) || !value.hidden.every((x: unknown) => typeof x === 'string') ||
      !Array.isArray(value?.blocked) || !value.blocked.every((x: { key?: unknown; name?: unknown } | null) =>
        x && typeof x.key === 'string' && typeof x.name === 'string')) {
    throw new Error('invalid preferences');
  }
  return { hidden: value.hidden, blocked: value.blocked };
}

let inMemoryReporterId: string | undefined;
export function reporterId(storage?: Pick<Storage, 'getItem' | 'setItem'>): string {
  try {
    // Access the browser getter inside try too: privacy settings may throw here.
    const store = storage ?? localStorage;
    const stored = store.getItem(DEVICE_KEY);
    if (stored && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stored)) {
      return (inMemoryReporterId = stored);
    }
    inMemoryReporterId ??= crypto.randomUUID();
    store.setItem(DEVICE_KEY, inMemoryReporterId);
  } catch { /* Reporting must work even when localStorage is unavailable. */ }
  return (inMemoryReporterId ??= crypto.randomUUID());
}

export function isCommentVisible(comment: { id: string; author_key: string; status?: string }, prefs: Preferences) {
  return (!comment.status || comment.status === 'visible') && !prefs.hidden.includes(comment.id) &&
    !prefs.blocked.some((entry) => entry.key === comment.author_key);
}

// Read at write time: a report response must not overwrite blocks from another tab.
export function updatePreferences(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  fallback: Preferences,
  update: (current: Preferences) => Preferences,
  readLatest = true,
): { value: Preferences; saved: boolean } {
  let current = fallback;
  if (readLatest) {
    try { current = readPreferences(storage); } catch { /* retain in-page preferences */ }
  }
  const value = update(current);
  try {
    storage.setItem(PREFERENCES_KEY, JSON.stringify(value));
    return { value, saved: true };
  } catch { return { value, saved: false }; }
}
