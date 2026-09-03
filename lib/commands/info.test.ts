import { describe, it, expect } from "vitest";
import { info } from "./info";
import type { CommandDef } from "./registry";
import { profile } from "@/content/profile";
import { projects } from "@/content/projects";

const def = (name: string): CommandDef => {
  const d = info.find((c) => c.name === name);
  if (!d) throw new Error(`info has no ${name}`);
  return d;
};
const lines = (name: string, args: string[] = [], ctx = {}): string[] => {
  const res = def(name).run(args, ctx, [name, ...args].join(" "));
  if (res.type !== "output") throw new Error(`${name} did not print`);
  return res.lines;
};

describe("the info module", () => {
  it("carries exactly the informational commands", () => {
    expect(info.map((c) => c.name).sort()).toEqual([
      "contact", "date", "echo", "history", "neofetch", "resume", "top", "uptime",
    ]);
    expect(def("resume").aliases).toEqual(["cv"]);
    expect(def("top").aliases).toEqual(["ps"]);
  });

  it("top lists an arcade process, and it is the only hint the door gets", () => {
    const out = lines("top");
    expect(out[0]).toContain("PID");
    expect(out.some((l) => /\barcade$/.test(l))).toBe(true);
    // One row. Not a banner, not a comment, not a second line about it.
    expect(out.filter((l) => l.includes("arcade"))).toHaveLength(1);
  });

  it("neofetch and uptime read the context, not the clock", () => {
    const neo = lines("neofetch", [], { uptimeMs: 3_725_000, theme: "amber" }).join("\n");
    expect(neo).toContain("01:02:05");
    expect(neo).toContain("amber");
    expect(neo).toContain(profile.user);
    expect(lines("uptime", [], { uptimeMs: 65_000 })[0]).toContain("00:01:05");
  });

  it("date uses the injected clock", () => {
    const now = new Date("2026-09-03T09:00:00Z");
    expect(lines("date", [], { now })[0]).toBe(now.toString());
  });

  it("history numbers prior commands and says when there are none", () => {
    expect(lines("history")[0]).toContain("no history");
    const out = lines("history", [], { history: ["whoami", "ls"] });
    expect(out).toEqual(["   1  whoami", "   2  ls"]);
  });

  it("echo keeps the typed case and collapses the whitespace the parser already split", () => {
    expect(lines("echo", ["Hello", "World"])).toEqual(["Hello World"]);
  });

  it("resume names every project, and contact every profile", () => {
    const cv = lines("resume").join("\n");
    for (const p of projects) expect(cv).toContain(p.slug);
    const contact = lines("contact").join("\n");
    for (const c of profile.contact) expect(contact).toContain(`${c.label}: ${c.value}`);
  });
});
