import { describe, it, expect } from "vitest";
import { COMMANDS, HELP_LINES, complete, runCommand } from "@/lib/commands";
import { defineCommand, registerCommands } from "@/lib/commands/registry";
import type { ProgramSpec } from "@/lib/arcade/program";

/**
 * The properties the registry buys, proven through the public surface. The
 * behavioural parity of every existing command is `lib/commands.test.ts`,
 * which this plan leaves untouched on purpose.
 */

describe("hidden commands", () => {
  it("are absent from COMMANDS, HELP_LINES, completion and ls", () => {
    expect(COMMANDS).not.toContain("arcade");
    expect(HELP_LINES.join("\n")).not.toContain("arcade");
    expect(complete("arc")).toBeNull();
    expect(complete("arcade ")).toBeNull();
    expect(complete("cd arc")).toBeNull();
    const ls = runCommand("ls");
    if (ls.type !== "output") throw new Error("expected output");
    expect(ls.lines.join(" ")).not.toContain("arcade");
  });

  it("open as `cd <name>`, and the arcade is closed until G0", () => {
    expect(runCommand("cd arcade")).toEqual({ type: "output", lines: ["arcade: no runtime yet"] });
    expect(runCommand("arcade")).toEqual({ type: "output", lines: ["arcade: no runtime yet"] });
  });

  it("get their one hint from top", () => {
    const res = runCommand("top");
    if (res.type !== "output") throw new Error("expected output");
    expect(res.lines.join("\n")).toContain("arcade");
  });
});

describe("aliases", () => {
  it.each([
    ["dir", "ls"],
    ["cv", "resume"],
    ["ps", "top"],
    ["cls", "clear"],
    ["?", "help"],
    ["man", "help"],
  ])("%s runs as %s", (alias, name) => {
    expect(runCommand(alias)).toEqual(runCommand(name));
  });

  it("are not offered by completion, exactly as before", () => {
    expect(complete("di")).toBeNull();
    expect(complete("cl")).toBe("clear");
  });
});

describe("derived lists", () => {
  it("COMMANDS is sorted and hides nothing visible", () => {
    expect([...COMMANDS]).toEqual([...COMMANDS].sort());
    for (const name of ["help", "whoami", "ls", "cd", "cat", "contact", "resume", "open", "neofetch",
      "uptime", "top", "theme", "crt", "scanlines", "matrix", "degauss", "gravity", "eject", "dock",
      "sound", "history", "echo", "date", "pwd", "clear", "sudo"]) {
      expect(COMMANDS, name).toContain(name);
    }
  });

  it("help the command prints HELP_LINES the export", () => {
    expect(runCommand("help")).toEqual({ type: "output", lines: HELP_LINES });
  });

  it("HELP_LINES is sorted between its header and footer", () => {
    const body = HELP_LINES.filter((l) => l.startsWith("    ") && !l.includes("·"));
    const names = body.map((l) => l.trim().split(/\s+/)[0]);
    expect(names).toEqual([...names].sort());
    expect(names).toContain("gravity");
    expect(names).toContain("sudo");
  });
});

describe("a program result", () => {
  const spec: ProgramSpec = {
    id: "zz-probe",
    title: "zz probe",
    start: () => ({ tick() {}, key() {}, dispose() {} }),
  };
  registerCommands([
    defineCommand({ name: "zz-probe", hidden: true, run: () => ({ type: "program", program: spec }) }),
  ]);

  it("comes back from runCommand untouched", () => {
    const res = runCommand("zz-probe");
    expect(res.type).toBe("program");
    if (res.type === "program") expect(res.program).toBe(spec);
  });

  it("comes through the cd door too", () => {
    expect(runCommand("cd zz-probe")).toEqual({ type: "program", program: spec });
  });

  it("stays out of the derived lists even when registered late", () => {
    // COMMANDS and HELP_LINES are computed once at import; a late hidden
    // registration is invisible either way, and this pins that down.
    expect(COMMANDS).not.toContain("zz-probe");
    expect(complete("zz")).toBeNull();
  });
});
