import { describe, it, expect } from "vitest";
import { complete, runCommand, HELP_LINES } from "@/lib/commands";
import { profile } from "@/content/profile";
import { projects } from "@/content/projects";

describe("runCommand", () => {
  it("returns empty output for blank input", () => {
    expect(runCommand("   ")).toEqual({ type: "output", lines: [] });
  });

  it("help lists the available commands", () => {
    const res = runCommand("help");
    expect(res.type).toBe("output");
    if (res.type === "output") {
      expect(res.lines.join("\n")).toContain("whoami");
      expect(res.lines.length).toBeGreaterThan(3);
    }
  });

  it("whoami returns name and tagline", () => {
    const res = runCommand("whoami");
    expect(res).toEqual({ type: "output", lines: [profile.name, profile.tagline] });
  });

  it("ls lists sections including projects", () => {
    const res = runCommand("ls");
    expect(res.type).toBe("output");
    if (res.type === "output") expect(res.lines.join(" ")).toContain("projects");
  });

  it("cd projects navigates to /projects", () => {
    expect(runCommand("cd projects")).toEqual({ type: "navigate", href: "/projects" });
  });

  it("cd experience navigates to /experience", () => {
    expect(runCommand("cd experience")).toEqual({ type: "navigate", href: "/experience" });
  });

  it("cd about navigates to the landing anchor", () => {
    expect(runCommand("cd about")).toEqual({ type: "navigate", href: "/#about" });
  });

  it("cd home / cd ~ returns to root", () => {
    expect(runCommand("cd ~")).toEqual({ type: "navigate", href: "/" });
    expect(runCommand("cd home")).toEqual({ type: "navigate", href: "/" });
  });

  it("cat about.txt returns the bio", () => {
    expect(runCommand("cat about.txt")).toEqual({ type: "output", lines: profile.bio });
  });

  it("clear returns a clear action", () => {
    expect(runCommand("clear")).toEqual({ type: "clear" });
  });

  it("sudo hire-me is an easter egg with the email", () => {
    const res = runCommand("sudo hire-me");
    expect(res.type).toBe("output");
    if (res.type === "output") {
      const text = res.lines.join("\n");
      expect(text).toContain("granted");
      expect(text).toContain("oreillferg@gmail.com");
    }
  });

  it("is case-insensitive on the command token", () => {
    expect(runCommand("WHOAMI").type).toBe("output");
    expect(runCommand("CD projects")).toEqual({ type: "navigate", href: "/projects" });
  });

  it("unknown command reports not found", () => {
    const res = runCommand("foobar");
    expect(res.type).toBe("output");
    if (res.type === "output") expect(res.lines[0]).toContain("command not found");
  });
});

describe("system-effect commands", () => {
  it("theme returns a theme effect for a known phosphor", () => {
    const res = runCommand("theme amber");
    expect(res.type).toBe("effect");
    if (res.type === "effect") expect(res.effect).toEqual({ kind: "theme", theme: "amber" });
  });

  it("theme rejects an unknown phosphor without firing an effect", () => {
    const res = runCommand("theme purple");
    expect(res.type).toBe("output");
    if (res.type === "output") expect(res.lines[0]).toContain("unknown phosphor");
  });

  it("theme with no argument reports the current theme from context", () => {
    const res = runCommand("theme", { theme: "ice" });
    expect(res.type).toBe("output");
    if (res.type === "output") expect(res.lines[0]).toContain("ice");
  });

  it("crt on/off toggles the tube", () => {
    const on = runCommand("crt on");
    const off = runCommand("crt off");
    expect(on.type).toBe("effect");
    expect(off.type).toBe("effect");
    if (on.type === "effect") expect(on.effect).toEqual({ kind: "crt", on: true });
    if (off.type === "effect") expect(off.effect).toEqual({ kind: "crt", on: false });
  });

  it("crt with a bad argument prints usage", () => {
    const res = runCommand("crt maybe");
    expect(res.type).toBe("output");
    if (res.type === "output") expect(res.lines[0]).toContain("usage");
  });

  it("scanlines converts a percentage to a 0-1 intensity", () => {
    const res = runCommand("scanlines 40");
    expect(res.type).toBe("effect");
    if (res.type === "effect") expect(res.effect).toEqual({ kind: "scanlines", value: 0.4 });
  });

  it("scanlines rejects out-of-range and non-numeric values", () => {
    for (const bad of ["scanlines 140", "scanlines -3", "scanlines lots", "scanlines"]) {
      const res = runCommand(bad);
      expect(res.type).toBe("output");
      if (res.type === "output") expect(res.lines[0]).toContain("usage");
    }
  });

  it("matrix and degauss return their effects", () => {
    const matrix = runCommand("matrix");
    const degauss = runCommand("degauss");
    if (matrix.type === "effect") expect(matrix.effect.kind).toBe("matrix");
    if (degauss.type === "effect") expect(degauss.effect).toEqual({ kind: "degauss" });
    expect(matrix.type).toBe("effect");
    expect(degauss.type).toBe("effect");
  });

  it("sudo rm -rf / triggers a reboot rather than pretending to delete anything", () => {
    const res = runCommand("sudo rm -rf /");
    expect(res.type).toBe("effect");
    if (res.type === "effect") {
      expect(res.effect).toEqual({ kind: "reboot" });
      expect(res.lines.join("\n")).toContain("kernel panic");
    }
  });
});

describe("informational commands", () => {
  it("neofetch reports the uptime it was given", () => {
    const res = runCommand("neofetch", { uptimeMs: 3_725_000, theme: "amber" });
    expect(res.type).toBe("output");
    if (res.type === "output") {
      const text = res.lines.join("\n");
      expect(text).toContain("01:02:05");
      expect(text).toContain("amber");
      expect(text).toContain(profile.user);
    }
  });

  it("uptime is derived from context, not wall clock", () => {
    const res = runCommand("uptime", { uptimeMs: 65_000 });
    if (res.type === "output") expect(res.lines[0]).toContain("00:01:05");
  });

  it("date uses the injected clock so it is deterministic", () => {
    const now = new Date("2026-08-03T09:00:00Z");
    const res = runCommand("date", { now });
    if (res.type === "output") expect(res.lines[0]).toBe(now.toString());
  });

  it("history lists prior commands, and says so when there are none", () => {
    const empty = runCommand("history");
    if (empty.type === "output") expect(empty.lines[0]).toContain("no history");

    const res = runCommand("history", { history: ["whoami", "ls"] });
    if (res.type === "output") {
      expect(res.lines).toHaveLength(2);
      expect(res.lines[0]).toContain("whoami");
      expect(res.lines[1]).toContain("ls");
    }
  });

  it("resume includes every project and the contact details", () => {
    const res = runCommand("resume");
    expect(res.type).toBe("output");
    if (res.type === "output") {
      const text = res.lines.join("\n");
      for (const p of projects) expect(text).toContain(p.slug);
      expect(text).toContain(profile.contact[0].value);
    }
  });

  it("contact lists every profile, each with a distinct label", () => {
    // This asserted both GitHub accounts until 2026-08-21. `oreillyfergus` was
    // removed from the contact list because it had nothing behind it, and the
    // reasoning lives in `content/profile.ts`. The terminal reads the same
    // list as the page and the graph, which is why one content change moved
    // all three at once.
    const res = runCommand("contact");
    expect(res.type).toBe("output");
    if (res.type === "output") {
      const text = res.lines.join("\n");
      for (const c of profile.contact) expect(text).toContain(c.value);
    }
    // Two rows both reading "github" would be useless to a reader and to a
    // screen reader, and the landing page keys its rows on the label.
    const labels = profile.contact.map((c) => c.label);
    expect(new Set(labels).size).toBe(labels.length);

    // .contact__row's key column is a fixed 18ch. A fixed grid track does not
    // grow for its content, so a 19-character label would run into the value
    // rather than widen the column. This keeps that CSS fact true.
    for (const c of profile.contact) expect(c.label.length, c.label).toBeLessThanOrEqual(18);
  });

  it("echo returns its argument verbatim", () => {
    const res = runCommand("echo hello  world");
    if (res.type === "output") expect(res.lines[0]).toBe("hello world");
  });

  it("top prints a process table with a header", () => {
    const res = runCommand("top");
    if (res.type === "output") {
      expect(res.lines[0]).toContain("PID");
      expect(res.lines.length).toBeGreaterThan(4);
    }
  });
});

describe("open", () => {
  it("navigates to a project by exact slug", () => {
    expect(runCommand("open presterly")).toEqual({
      type: "navigate",
      href: "/projects#presterly",
    });
  });

  it("navigates on a slug prefix", () => {
    expect(runCommand("open contra")).toEqual({
      type: "navigate",
      href: "/projects#contrabot",
    });
  });

  it("lists the options when given no argument", () => {
    const res = runCommand("open");
    if (res.type === "output") expect(res.lines.join(" ")).toContain("presterly");
  });

  it("reports a miss rather than navigating somewhere wrong", () => {
    const res = runCommand("open nonsense");
    expect(res.type).toBe("output");
    if (res.type === "output") expect(res.lines[0]).toContain("no project matching");
  });
});

describe("complete", () => {
  it("completes a unique command name", () => {
    expect(complete("neo")).toBe("neofetch");
    expect(complete("scan")).toBe("scanlines");
  });

  it("completes only as far as the shared prefix when ambiguous", () => {
    // "c" spans cd, cat, contact, crt, clear: they share nothing beyond "c".
    expect(complete("c")).toBe("c");
  });

  it("completes command arguments", () => {
    expect(complete("cd pro")).toBe("cd projects");
    expect(complete("theme am")).toBe("theme amber");
    expect(complete("open pres")).toBe("open presterly");
    expect(complete("crt o")).toBe("crt o"); // on/off share only "o"
  });

  it("offers the shared prefix after a trailing space", () => {
    expect(complete("theme ")).toBe("theme ");
    expect(complete("cat ")).toBe("cat about.txt");
  });

  it("returns null when there is nothing to complete", () => {
    expect(complete("")).toBeNull();
    expect(complete("zzz")).toBeNull();
    expect(complete("echo something")).toBeNull();
  });
});

describe("physical commands", () => {
  it("drops gravity by default and lifts it on request", () => {
    const on = runCommand("gravity");
    expect(on).toMatchObject({ type: "effect", effect: { kind: "gravity", on: true } });
    const off = runCommand("gravity off");
    expect(off).toMatchObject({ type: "effect", effect: { kind: "gravity", on: false } });
  });

  it("tells the visitor how to get out of gravity, not just into it", () => {
    const res = runCommand("gravity");
    if (res.type !== "effect") throw new Error("expected an effect");
    expect(res.lines.join(" ")).toMatch(/esc/i);
  });

  it("ejects and docks with two names for one behaviour", () => {
    expect(runCommand("eject")).toMatchObject({ effect: { kind: "eject", on: true } });
    expect(runCommand("dock")).toMatchObject({ effect: { kind: "eject", on: false } });
    expect(runCommand("eject off")).toMatchObject({ effect: { kind: "eject", on: false } });
  });

  it("requires an explicit argument for sound rather than guessing", () => {
    expect(runCommand("sound")).toMatchObject({ type: "output" });
    expect(runCommand("sound on")).toMatchObject({ effect: { kind: "sound", on: true } });
    expect(runCommand("sound off")).toMatchObject({ effect: { kind: "sound", on: false } });
  });

  it("lists every new command in help, so none of them are secrets", () => {
    const help = HELP_LINES.join("\n");
    for (const cmd of ["gravity", "eject", "sound"]) {
      expect(help).toContain(cmd);
    }
  });

  it("completes on/off for sound and gravity", () => {
    expect(complete("sound o")).toBe("sound o");
    expect(complete("sound of")).toBe("sound off");
    expect(complete("gravity of")).toBe("gravity off");
  });
});

describe("reduced motion", () => {
  it("declines gravity and says why, rather than promising it", () => {
    const res = runCommand("gravity", { reducedMotion: true });
    expect(res.type).toBe("output");
    if (res.type !== "output") throw new Error("expected output");
    expect(res.lines.join(" ")).toMatch(/declined/);
  });

  it("declines eject too", () => {
    expect(runCommand("eject", { reducedMotion: true }).type).toBe("output");
  });

  it("still lets you turn both back off", () => {
    expect(runCommand("gravity off", { reducedMotion: true })).toMatchObject({ type: "effect" });
    expect(runCommand("dock", { reducedMotion: true })).toMatchObject({ type: "effect" });
  });
});

describe("neofetch and the boards", () => {
  const boards = {
    available: true,
    boards: [{ game: "bounce", rows: [{ initials: "FOR", score: 12 }] }],
  };

  it("says nothing about the arcade to somebody who has not found it", () => {
    const res = runCommand("neofetch", { arcade: { seen: false, entered: false, boards, lastPosted: null } });
    expect(res.type).toBe("output");
    if (res.type !== "output") return;
    expect(res.lines.join("\n")).not.toContain("FOR");
  });

  it("prints the boards once the door has been opened", () => {
    const res = runCommand("neofetch", { arcade: { seen: true, entered: true, boards, lastPosted: null } });
    expect(res.type).toBe("output");
    if (res.type !== "output") return;
    expect(res.lines.join("\n")).toContain("FOR");
  });

  it("says the boards are unavailable rather than printing a gap", () => {
    const res = runCommand("neofetch", { arcade: { seen: true, entered: true, boards: null, lastPosted: null } });
    expect(res.type).toBe("output");
    if (res.type !== "output") return;
    expect(res.lines.join("\n")).toContain("unavailable");
  });

  it("is unchanged for a context with no arcade at all", () => {
    const before = runCommand("neofetch", {});
    const after = runCommand("neofetch", { arcade: { seen: false, entered: false, boards: null, lastPosted: null } });
    expect(before).toEqual(after);
  });
});
