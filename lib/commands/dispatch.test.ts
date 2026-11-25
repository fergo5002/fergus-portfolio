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

  it("open as `cd <name>`, and the arcade opens onto a program", () => {
    for (const input of ["cd arcade", "arcade"]) {
      const res = runCommand(input);
      expect(res.type, input).toBe("program");
      if (res.type !== "program") continue;
      expect(res.program.id).toBe("arcade");
    }
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
      "sound", "history", "echo", "date", "pwd", "clear", "sudo", "forget", "who"]) {
      expect(COMMANDS, name).toContain(name);
    }
  });

  it("help the command prints HELP_LINES the export", () => {
    expect(runCommand("help")).toEqual({ type: "output", lines: HELP_LINES });
  });

  it("HELP_LINES is, line for line, the reference the site prints", () => {
    // The parity oracle. Sections, their order and the order within them come
    // from each command's `group` and `rank`. A new command with a help line
    // must pick a section and a rank, and this list must grow with it.
    // Rewritten on 2026-11-25 with the terminal clean-up: book, status and
    // exit joined, and the keys lost their angle brackets.
    expect(HELP_LINES).toEqual([
      "FergusOS 6.0 · command reference",
      "",
      "  navigate",
      "    whoami            who is this",
      "    ls                what's here",
      "    cd <section>      go to a page",
      "    open <name>       a project, or github · linkedin · email",
      "    cat about.txt     read the bio",
      "    resume            print the short CV",
      "    contact           show contact details",
      "    book coffee|call  pick a time in my calendar",
      "",
      "  system",
      "    neofetch          system summary",
      "    status            what the machine is doing",
      "    uptime            session uptime",
      "    top               running processes",
      "    theme <name>      green · amber · ice",
      "    crt on|off        toggle the tube",
      "    scanlines 0-100   how strong the lines are",
      "    matrix            let it rain",
      "    degauss           thump the magnets",
      "",
      "  physical",
      "    gravity           drop the page. drag it. throw it.",
      "    eject / dock      pull the camera back off the glass",
      "    sound on|off      the tube has a voice",
      "",
      "  shell",
      "    forget            wipe what this site saved on your machine",
      "    who               who else is on the tube",
      "    history · echo · date · pwd · clear · exit · help",
      "    tab completes · up/down recalls · ctrl+L clears",
      "",
      "  and one more thing",
      "    sudo hire-me      ;)",
    ]);
  });

  it("lines every description up in one column", () => {
    // The 2026-11-25 rewrite shipped two lines a space out, and only printing
    // the list showed it. Every key is padded to 18 characters.
    const keyed = HELP_LINES.filter((l) => /^    \S/.test(l) && /\S\s{2,}\S/.test(l.slice(4)));
    expect(keyed.length).toBeGreaterThan(15);
    for (const line of keyed) {
      const m = /^    (.+?)\s{2,}(\S.*)$/.exec(line);
      expect(m ? line.length - m[2].length : -1, line).toBe(22);
    }
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
