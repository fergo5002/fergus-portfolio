import { describe, it, expect } from "vitest";
import {
  createInitialsProgram, initialInitialsState, initialsReduce, initialsValue, initialsView,
} from "@/lib/arcade/initials";
import { arcadeCopy } from "@/content/arcade";
import type { ProgramHost } from "@/lib/arcade/program";

describe("initialInitialsState", () => {
  it("starts at AAA when nothing was saved", () => {
    expect(initialsValue(initialInitialsState(null))).toBe("AAA");
  });

  it("starts at what the visitor used last time", () => {
    expect(initialsValue(initialInitialsState("FOR"))).toBe("FOR");
  });

  it("ignores a saved value it would not have accepted", () => {
    expect(initialsValue(initialInitialsState("nonsense"))).toBe("AAA");
  });
});

describe("initialsReduce", () => {
  it("walks the alphabet forwards on up and backwards on down, wrapping", () => {
    let s = initialInitialsState(null);
    s = initialsReduce(s, "up").state;
    expect(initialsValue(s)).toBe("BAA");
    s = initialsReduce(s, "down").state;
    s = initialsReduce(s, "down").state;
    // A wraps back round to the last character of the alphabet, which is 9.
    expect(initialsValue(s)).toBe("9AA");
  });

  it("moves the cursor and stops at both ends", () => {
    let s = initialInitialsState(null);
    s = initialsReduce(s, "left").state;
    expect(s.cursor).toBe(0);
    s = initialsReduce(s, "right").state;
    s = initialsReduce(s, "right").state;
    s = initialsReduce(s, "right").state;
    expect(s.cursor).toBe(2);
  });

  it("submits on enter", () => {
    expect(initialsReduce(initialInitialsState("FOR"), "start").submit).toBe("FOR");
  });

  it("refuses a blocked set in place, without submitting it", () => {
    const out = initialsReduce(initialInitialsState("ASS"), "start");
    expect(out.submit).toBeNull();
    expect(out.state.note).toBe(arcadeCopy.initials.blocked);
  });

  it("clears the note the moment the visitor changes anything", () => {
    const blocked = initialsReduce(initialInitialsState("ASS"), "start").state;
    expect(initialsReduce(blocked, "up").state.note).toBeNull();
  });
});

describe("initialsView", () => {
  it("fills the grid exactly, at both sizes", () => {
    for (const [cols, rows] of [[48, 20], [32, 16]] as const) {
      const lines = initialsView(initialInitialsState("FOR"), "bounce", 4200, cols, rows);
      expect(lines).toHaveLength(rows);
      for (const line of lines) expect(line.length).toBe(cols);
    }
  });

  it("shows the three characters, the score, and which character is being changed", () => {
    const text = initialsView(initialInitialsState("FOR"), "bounce", 4200, 48, 20).join("\n");
    expect(text).toContain("F O R");
    expect(text).toContain("4,200");
    expect(text).toContain(arcadeCopy.initials.footer);
  });
});

describe("createInitialsProgram", () => {
  const host = (overrides: Partial<ProgramHost> = {}): ProgramHost => ({
    cols: 48, rows: 20, draw: () => {}, exit: () => {}, ...overrides,
  });

  it("submits once, whatever the visitor presses after that", () => {
    const got: string[] = [];
    const p = createInitialsProgram({
      game: "bounce",
      score: 12,
      seed: "FOR",
      onSubmit: (initials) => got.push(initials),
    }).start(host());
    p.key("start", true);
    p.key("start", true);
    p.key("up", true);
    expect(got).toEqual(["FOR"]);
    p.dispose();
  });

  it("does not exit itself, because the server has not answered yet", () => {
    // The runtime exits with what the server said. Exiting here would print
    // "score posted" before anything had been posted, which is the failure the
    // contact form's spam filter was rewritten to stop making.
    let exited = 0;
    const p = createInitialsProgram({
      game: "bounce", score: 12, seed: "FOR", onSubmit: () => {},
    }).start(host({ exit: () => void exited++ }));
    p.key("start", true);
    expect(exited).toBe(0);
    p.dispose();
  });

  it("says it is posting rather than leaving a dead screen", () => {
    let last: string[] = [];
    const p = createInitialsProgram({
      game: "bounce", score: 12, seed: "FOR", onSubmit: () => {},
    }).start(host({ draw: (lines) => void (last = lines) }));
    p.key("start", true);
    expect(last.join("\n")).toContain(arcadeCopy.initials.posting);
    p.dispose();
  });
});
