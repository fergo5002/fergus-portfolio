import { describe, it, expect } from "vitest";
import { finishOutcome } from "@/lib/arcade/finish";
import { arcadeCopy } from "@/content/arcade";

const base = { posted: false, board: true, available: true };

describe("finishOutcome", () => {
  it("offers the board for a real score when the board can take it", () => {
    expect(finishOutcome({ ...base, score: 42 })).toEqual({ kind: "initials", score: 42 });
  });

  it("says what the score was, and why it went nowhere, when the board cannot take it", () => {
    // The failure this exists for. It used to fall through to the same line
    // Escape prints, so forty bounces and a plain quit read identically. With
    // F4 unmerged that is every score on the live site.
    const out = finishOutcome({ ...base, available: false, score: 42 });
    expect(out).toEqual({
      kind: "leave",
      lines: [`${arcadeCopy.board.scoreLabel}: 42`, ...arcadeCopy.board.unavailable],
    });
  });

  it("groups the digits of a score it prints", () => {
    const out = finishOutcome({ ...base, available: false, score: 4200 });
    if (out.kind !== "leave") throw new Error("expected leave");
    expect(out.lines[0]).toBe(`${arcadeCopy.board.scoreLabel}: 4,200`);
  });

  it("never offers twice in one session", () => {
    expect(finishOutcome({ ...base, posted: true, score: 42 }).kind).toBe("leave");
    expect(finishOutcome({ ...base, posted: true, score: 42 })).toEqual({
      kind: "leave",
      lines: [arcadeCopy.left],
    });
  });

  it("does not offer a board to a game that has none", () => {
    expect(finishOutcome({ ...base, board: false, score: 42 }).kind).toBe("leave");
  });

  it("treats a zero and a missing score as no score, not as a score of nothing", () => {
    // `>= 0` here would put "score: 0" on the board for anyone who quit at the
    // title screen, which is the mutation this test exists to catch.
    expect(finishOutcome({ ...base, score: 0 })).toEqual({ kind: "leave", lines: [arcadeCopy.left] });
    expect(finishOutcome({ ...base })).toEqual({ kind: "leave", lines: [arcadeCopy.left] });
  });

  it("prefers a program's own parting line when it has nothing to post", () => {
    expect(finishOutcome({ ...base, label: "arcade: you win." })).toEqual({
      kind: "leave",
      lines: ["arcade: you win."],
    });
  });

  it("puts the score ahead of a label, because a number nobody sees is the bug", () => {
    const out = finishOutcome({ ...base, available: false, score: 7, label: "arcade: you win." });
    if (out.kind !== "leave") throw new Error("expected leave");
    expect(out.lines[0]).toContain("7");
  });
});
