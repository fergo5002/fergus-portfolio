import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { OWNED_PREFIX, forget, isOwnedKey, listKeys, ownedKeys, removeKeys } from "./forget";
import type { StorageLike } from "./forget";
import { SETTINGS_KEY } from "./system";
import { INITIALS_KEY } from "./arcade/session";

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

/**
 * The guard the key list did not have.
 *
 * `forget` promises that everything the site keeps on a visitor's machine goes
 * when they type it, and it keeps that promise by knowing two things: the
 * `fergusos:` prefix, and the one older fixed name. Nothing enforced either.
 * A tool added next month that wrote `drift-profile` would leave that key
 * behind for ever, `forget` would print a list that did not include it, and
 * every test in this file would still be green, because they all test `forget`
 * against keys the test itself made up.
 *
 * So this walks the source instead and checks the writes. A source-coupling
 * check, with the same limits as `components/chrome.test.ts`: it reads text,
 * it cannot run a browser, and a key assembled at run time from pieces is
 * beyond it. What it can do is fail the moment somebody writes a name the
 * site does not own, which is the regression it exists for.
 */
describe("every key the site writes is a key the site owns", () => {
  const ROOT = join(process.cwd());

  /** Every .ts/.tsx under the given directories, tests excluded. */
  function sources(dirs: string[]): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
          walk(path);
          continue;
        }
        if (!/\.tsx?$/.test(entry.name)) continue;
        // A test's fake storage is a Map, not the visitor's machine.
        if (/\.test\.tsx?$/.test(entry.name)) continue;
        out.push(path);
      }
    };
    for (const dir of dirs) walk(join(ROOT, dir));
    return out;
  }

  /**
   * Constants this file has checked by hand, because the walk reads text and
   * cannot follow an import. Adding a row here is the deliberate act: it means
   * somebody looked at the key and said what it is.
   */
  const KNOWN: Record<string, { value: string; session: boolean }> = {
    SETTINGS_KEY: { value: SETTINGS_KEY, session: false },
    // The boot marker. Session storage, so it dies with the tab and `forget`
    // is not the thing that removes it. `lib/forget.ts`'s docblock says so.
    SESSION_KEY: { value: "fergusos_booted", session: true },
    // The three characters a visitor chose for the arcade board, written
    // only when they post a score. Under OWNED_PREFIX, so `forget` finds it
    // without knowing its name.
    INITIALS_KEY: { value: INITIALS_KEY, session: false },
  };

  type Write = { file: string; receiver: string; arg: string };

  /** Every `setItem(` call, with the expression it was called on. */
  function writes(): Write[] {
    const found: Write[] = [];
    for (const file of sources(["app", "components", "lib"])) {
      const source = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/^\s*\/\/.*$/gm, " ");
      const call = /([A-Za-z_$][\w$.?]*)\.setItem\(\s*([^,]+?)\s*,/g;
      for (let m = call.exec(source); m !== null; m = call.exec(source)) {
        found.push({ file: file.slice(ROOT.length + 1), receiver: m[1], arg: m[2] });
      }
    }
    return found;
  }

  const all = writes();

  it("finds the writes at all, so a silent zero cannot pass for a clean sweep", () => {
    // Three today: the settings, the boot marker in session storage, and the
    // arcade's initials. The number is not the point; finding none would mean
    // the regex had rotted and every assertion below had quietly become
    // vacuous.
    expect(all.length).toBeGreaterThanOrEqual(3);
  });

  it("writes no key under a name the site does not own", () => {
    for (const w of all) {
      const literal = /^(["'`])(.*)\1$/.exec(w.arg);
      const known = KNOWN[w.arg];
      const where = `${w.file}: ${w.receiver}.setItem(${w.arg}, ...)`;

      if (literal) {
        expect(isOwnedKey(literal[2]), `${where} writes a key forget cannot find`).toBe(true);
        continue;
      }
      if (known) {
        if (known.session) {
          // Allowed precisely because it is not local storage. Say so, so a
          // later change that points it at localStorage has to come back here.
          expect(w.receiver, `${where} is session-only but writes elsewhere`).toMatch(
            /sessionStorage$/,
          );
        } else {
          expect(isOwnedKey(known.value), `${where} writes a key forget cannot find`).toBe(true);
        }
        continue;
      }
      // Neither a literal nor a name this file has vouched for. That is not a
      // pass, because nothing here can tell what it writes.
      expect.fail(`${where} writes a key this guard cannot check. Add it to KNOWN, or use a literal.`);
    }
  });
});
