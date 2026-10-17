/**
 * Tiny time-based memo for PUBLIC, non-personal data (shared news, recommendations). One copy
 * per server instance; concurrent callers share the same in-flight promise. Never put anything
 * derived from a reader's identity, preferences, feedback or editions in here.
 */
const entries = new Map<string, { at: number; value: Promise<unknown> }>();

export function publicMemo<T>(key: string, ttlMs: number, load: () => Promise<T>, now = Date.now()): Promise<T> {
  const hit = entries.get(key);
  if (hit && now - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = load().catch((err) => {
    entries.delete(key); // don't cache failures
    throw err;
  });
  entries.set(key, { at: now, value });
  return value;
}

export function __clearPublicMemo() {
  entries.clear();
}
