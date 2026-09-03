import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MODULES } from "./index";
import { findCommand } from "./registry";

describe("the registration file", () => {
  it("never claims one name or alias twice across modules", () => {
    // The registry replaces on re-registration (for Fast Refresh), so this is
    // the place a genuine duplicate is caught.
    const owner = new Map<string, string>();
    for (const defs of MODULES) {
      for (const d of defs) {
        for (const word of [d.name, ...(d.aliases ?? [])]) {
          expect(owner.has(word), `'${word}' is claimed by ${owner.get(word)} and ${d.name}`).toBe(false);
          owner.set(word, d.name);
        }
      }
    }
  });

  it("registers everything on import", () => {
    for (const defs of MODULES) for (const d of defs) expect(findCommand(d.name)).toBe(d);
  });

  it("keeps its module imports alphabetical, so two pull requests rarely collide", () => {
    const src = readFileSync(join(process.cwd(), "lib", "commands", "index.ts"), "utf8");
    const mods = [...src.matchAll(/^import \{ \w+ \} from "\.\/(\w+)";\r?$/gm)]
      .map((m) => m[1])
      .filter((m) => m !== "registry");
    expect(mods.length).toBe(MODULES.length);
    expect(mods).toEqual([...mods].sort());
  });
});
