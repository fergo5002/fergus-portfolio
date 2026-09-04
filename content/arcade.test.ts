import { describe, it, expect } from "vitest";
import { arcadeCopy, BLOCKED_INITIALS, GAME_TITLES, NARROW_COLS } from "@/content/arcade";

/**
 * The arcade's copy is drawn into a character grid, so a sentence that is
 * wider than the narrowest grid is not a style problem, it is a truncation.
 * These assertions are the reason `content/arcade.ts` reads oddly short.
 */

const gridStrings = (): { where: string; text: string }[] => [
  { where: "cabinet.title", text: arcadeCopy.cabinet.title },
  { where: "cabinet.footer", text: arcadeCopy.cabinet.footer },
  { where: "cabinet.notReady", text: arcadeCopy.cabinet.notReady },
  { where: "cabinet.boardsHeading", text: arcadeCopy.cabinet.boardsHeading },
  ...arcadeCopy.board.unavailable.map((text, i) => ({ where: `board.unavailable[${i}]`, text })),
  { where: "board.empty", text: arcadeCopy.board.empty },
  { where: "initials.heading", text: arcadeCopy.initials.heading },
  { where: "initials.footer", text: arcadeCopy.initials.footer },
  { where: "initials.blocked", text: arcadeCopy.initials.blocked },
  { where: "initials.shape", text: arcadeCopy.initials.shape },
  { where: "initials.posting", text: arcadeCopy.initials.posting },
  { where: "bounce.footer", text: arcadeCopy.bounce.footer },
  ...Object.entries(GAME_TITLES).map(([id, title]) => ({ where: `GAME_TITLES.${id}`, text: title })),
];
// `declined` and `noRoom` are deliberately absent: they are printed into the
// terminal's scrollback, which wraps, not into the grid, which does not.

describe("arcade copy fits the narrowest grid", () => {
  it("keeps every string drawn in the grid inside 32 columns", () => {
    for (const { where, text } of gridStrings()) {
      expect(text.length, `${where}: ${text.length} columns`).toBeLessThanOrEqual(NARROW_COLS);
    }
  });

  it("leaves a title room for the cabinet's cursor, number and brackets", () => {
    // The cabinet draws "> 5 (under the terminal)" from column 1, so a title
    // costs six columns of furniture before it costs anything for itself.
    for (const [id, title] of Object.entries(GAME_TITLES)) {
      expect(title.length, id).toBeLessThanOrEqual(NARROW_COLS - 6);
    }
  });
});

describe("the initials blocklist", () => {
  it("holds only three-character uppercase entries", () => {
    for (const entry of BLOCKED_INITIALS) {
      expect(entry, entry).toMatch(/^[A-Z]{3}$/);
    }
  });

  it("holds nothing that the leet fold would have rewritten", () => {
    // The check runs on the folded form, so an entry containing 0, 1, 3, 4, 5,
    // 7 or 8 could never match anything and would be a dead line pretending to
    // be a guard.
    for (const entry of BLOCKED_INITIALS) {
      expect(entry, entry).not.toMatch(/[01345780]/);
    }
  });

  it("is a set, so a duplicate cannot hide in it", () => {
    expect(BLOCKED_INITIALS.size).toBeGreaterThan(15);
  });
});

describe("the refusals say what happened", () => {
  it("declines the arcade under reduced motion in three lines that name the reason", () => {
    expect(arcadeCopy.declined).toHaveLength(3);
    expect(arcadeCopy.declined[0]).toBe("arcade: declined.");
    expect(arcadeCopy.declined.join(" ")).toContain("reduced motion");
  });

  it("says the screen is too small rather than drawing a clipped one", () => {
    expect(arcadeCopy.noRoom[0]).toBe("arcade: not enough glass.");
    expect(arcadeCopy.noRoom.join(" ")).toMatch(/32 columns/);
  });

  it("says the boards are unavailable and that the games still play", () => {
    const sentence = arcadeCopy.board.unavailable.join(" ");
    expect(sentence).toContain("unavailable");
    expect(sentence).toContain("still play");
  });
});
