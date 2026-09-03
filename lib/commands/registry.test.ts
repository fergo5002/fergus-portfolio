import { describe, it, expect } from "vitest";
import {
  HELP_FOOT,
  HELP_HEAD,
  defineCommand,
  findCommand,
  helpLines,
  listCommands,
  registerCommands,
} from "./registry";
import type { CommandDef } from "./registry";
import { ok } from "./shared";

const cmd = (name: string, extra: Partial<CommandDef> = {}): CommandDef =>
  defineCommand({ name, run: () => ok([name]), ...extra });

describe("defineCommand", () => {
  it("returns the definition it was given", () => {
    const def = cmd("alpha");
    expect(def.name).toBe("alpha");
    expect(def.run([], {}, "alpha")).toEqual({ type: "output", lines: ["alpha"] });
  });

  it("refuses a name the parser could never match", () => {
    // runCommand lowercases the first word and splits on whitespace, so a name
    // with a capital or a space is a command nobody can type.
    expect(() => cmd("Bad")).toThrow(/name/);
    expect(() => cmd("two words")).toThrow(/name/);
    expect(() => cmd("")).toThrow(/name/);
  });
});

describe("registerCommands and findCommand", () => {
  it("finds a command by its name and by each alias, hidden included", () => {
    registerCommands([
      cmd("zeta", { aliases: ["z", "zz"] }),
      cmd("secret", { hidden: true }),
    ]);
    expect(findCommand("zeta")?.name).toBe("zeta");
    expect(findCommand("z")?.name).toBe("zeta");
    expect(findCommand("zz")?.name).toBe("zeta");
    expect(findCommand("secret")?.name).toBe("secret");
    expect(findCommand("nope")).toBeUndefined();
  });

  it("re-registering a name replaces it and drops its old aliases", () => {
    // Fast Refresh re-runs a changed module against a registry that kept its
    // state, so a throw here would break every edit in development. Real
    // duplicates are caught by index.test.ts over the source arrays instead.
    registerCommands([cmd("beta", { aliases: ["b"] })]);
    registerCommands([cmd("beta", { aliases: ["bb"] })]);
    expect(findCommand("b")).toBeUndefined();
    expect(findCommand("bb")?.name).toBe("beta");
  });
});

describe("listCommands", () => {
  it("sorts by name whatever the registration order, and leaves hidden ones out", () => {
    registerCommands([cmd("mu"), cmd("kappa", { hidden: true }), cmd("delta"), cmd("lambda")]);
    const names = listCommands().map((c) => c.name);
    expect(names).toEqual([...names].sort());
    expect(names).toContain("delta");
    expect(names).toContain("lambda");
    expect(names).not.toContain("kappa");
  });
});

describe("helpLines", () => {
  const a = cmd("apple", { help: "apple             a fruit" });
  const b = cmd("banana", { help: "banana            another" });
  const quiet = cmd("quiet");
  const hid = cmd("hid", { help: "hid               never seen", hidden: true });

  it("is the same whichever order the modules registered in", () => {
    expect(helpLines([b, quiet, hid, a])).toEqual(helpLines([a, b, hid, quiet]));
  });

  it("opens with the header and closes with the footer", () => {
    const lines = helpLines([a]);
    expect(lines.slice(0, HELP_HEAD.length)).toEqual(HELP_HEAD);
    expect(lines.slice(-HELP_FOOT.length)).toEqual(HELP_FOOT);
  });

  it("indents each listed line by four and lists only commands with help that are not hidden", () => {
    const lines = helpLines([b, quiet, hid, a]);
    const body = lines.slice(HELP_HEAD.length, -HELP_FOOT.length);
    expect(body).toEqual(["  shell", "    apple             a fruit", "    banana            another"]);
  });

  it("prints sections in the fixed order, commands by rank then name, and skips empty sections", () => {
    const nav2 = cmd("zeta", { help: "zeta              second", group: "navigate", rank: 2 });
    const nav1 = cmd("alpha", { help: "alpha             first", group: "navigate", rank: 1 });
    const more = cmd("egg", { help: "egg               last", group: "more" });
    const lines = helpLines([more, nav2, nav1]);
    expect(lines).toEqual([
      ...HELP_HEAD,
      "  navigate",
      "    alpha             first",
      "    zeta              second",
      "",
      "  shell",
      ...HELP_FOOT,
      "",
      "  and one more thing",
      "    egg               last",
    ]);
  });
});
