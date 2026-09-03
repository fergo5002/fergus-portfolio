import { SETTINGS_KEY } from "@/lib/system";

/**
 * What the site keeps on the visitor's machine, and how to make it forget.
 *
 * The rule (AGENTS.md, "What the site may keep"): local storage holds only
 * what the visitor explicitly saved, and the `forget` command wipes all of it.
 * For that to be true without a list somebody has to maintain, every key a
 * tool writes starts with `OWNED_PREFIX`. The one older key, the settings,
 * is named here. Nothing else on the site writes local storage: PostHog is
 * cookieless by project setting, and the boot marker is session storage.
 *
 * Pure over a Storage-like interface, so it is tested with a Map and applied
 * by `components/Terminal.tsx` to `window.localStorage`.
 */
export type StorageLike = {
  readonly length: number;
  key(index: number): string | null;
  removeItem(key: string): void;
};

/** Every key a tool writes starts with this. `forget` needs no list of them. */
export const OWNED_PREFIX = "fergusos:";

/** Keys written under a fixed name, from before the prefix rule. */
export const OWNED_KEYS: readonly string[] = [SETTINGS_KEY];

export function isOwnedKey(key: string): boolean {
  return OWNED_KEYS.includes(key) || (key.length > OWNED_PREFIX.length && key.startsWith(OWNED_PREFIX));
}

/** Every key in the store, by index. Read fully before anything is removed. */
export function listKeys(storage: StorageLike): string[] {
  const out: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key !== null) out.push(key);
  }
  return out;
}

export function ownedKeys(keys: readonly string[]): string[] {
  return keys.filter(isOwnedKey);
}

/**
 * Removes the named keys, in order, and returns the ones removed. A key the
 * site does not own is skipped even when named: this function is the last
 * thing between an effect descriptor and somebody else's storage.
 */
export function removeKeys(storage: StorageLike, keys: readonly string[]): string[] {
  const removed: string[] = [];
  for (const key of keys) {
    if (!isOwnedKey(key)) continue;
    storage.removeItem(key);
    removed.push(key);
  }
  return removed;
}

/** Everything the site owns, gone. Returns what went. */
export function forget(storage: StorageLike): string[] {
  return removeKeys(storage, ownedKeys(listKeys(storage)));
}
