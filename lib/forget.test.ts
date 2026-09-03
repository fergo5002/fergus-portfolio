import { describe, it, expect } from "vitest";
import { OWNED_PREFIX, forget, isOwnedKey, listKeys, ownedKeys, removeKeys } from "./forget";
import type { StorageLike } from "./forget";
import { SETTINGS_KEY } from "./system";

/** An in-memory Storage with the three members the module is allowed to use. */
function fake(initial: Record<string, string> = {}): StorageLike & { keys(): string[] } {
  const map = new Map(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => {
      map.delete(k);
    },
    keys: () => [...map.keys()],
  };
}

describe("what the site owns", () => {
  it("is the settings key and anything under the prefix", () => {
    expect(isOwnedKey(SETTINGS_KEY)).toBe(true);
    expect(isOwnedKey(`${OWNED_PREFIX}drift-profile`)).toBe(true);
    expect(isOwnedKey("fergusos_booted")).toBe(false); // session storage, and not local
    expect(isOwnedKey("someone_elses_key")).toBe(false);
    expect(isOwnedKey("")).toBe(false);
  });

  it("filters a key list without touching storage", () => {
    expect(ownedKeys([SETTINGS_KEY, "x", `${OWNED_PREFIX}a`])).toEqual([SETTINGS_KEY, `${OWNED_PREFIX}a`]);
  });
});

describe("listKeys", () => {
  it("reads every key by index", () => {
    expect(listKeys(fake({ a: "1", b: "2" }))).toEqual(["a", "b"]);
    expect(listKeys(fake())).toEqual([]);
  });
});

describe("removeKeys", () => {
  it("removes what it is asked to, in order, and reports it", () => {
    const s = fake({ [SETTINGS_KEY]: "{}", [`${OWNED_PREFIX}a`]: "1", other: "2" });
    expect(removeKeys(s, [`${OWNED_PREFIX}a`, SETTINGS_KEY])).toEqual([`${OWNED_PREFIX}a`, SETTINGS_KEY]);
    expect(s.keys()).toEqual(["other"]);
  });

  it("refuses a key the site does not own, even when asked", () => {
    const s = fake({ other: "2" });
    expect(removeKeys(s, ["other"])).toEqual([]);
    expect(s.keys()).toEqual(["other"]);
  });
});

describe("forget", () => {
  it("removes every owned key and nothing else, and says which", () => {
    const s = fake({
      other_site: "keep",
      [SETTINGS_KEY]: "{}",
      [`${OWNED_PREFIX}drift`]: "1",
      [`${OWNED_PREFIX}arcade`]: "2",
    });
    expect(forget(s)).toEqual([SETTINGS_KEY, `${OWNED_PREFIX}drift`, `${OWNED_PREFIX}arcade`]);
    expect(s.keys()).toEqual(["other_site"]);
  });

  it("collects before it removes, so consecutive owned keys are not skipped", () => {
    // Removing by index while iterating shifts the rest down one, which is
    // exactly the bug this guards against.
    const s = fake({ [`${OWNED_PREFIX}a`]: "1", [`${OWNED_PREFIX}b`]: "2", [`${OWNED_PREFIX}c`]: "3" });
    expect(forget(s)).toHaveLength(3);
    expect(s.length).toBe(0);
  });

  it("returns nothing when there is nothing to forget", () => {
    expect(forget(fake({ other: "x" }))).toEqual([]);
    expect(forget(fake())).toEqual([]);
  });
});
