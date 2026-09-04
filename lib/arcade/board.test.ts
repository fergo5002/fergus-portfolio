import { describe, it, expect } from "vitest";
import {
  BOARD_SIZE, checkInitials, foldLeet, formatBoard, formatBoards, groupDigits,
  insertScore, normaliseInitials,
} from "@/lib/arcade/board";
import { arcadeCopy, GAME_TITLES } from "@/content/arcade";

describe("normaliseInitials", () => {
  it("uppercases and drops everything outside the alphabet", () => {
    expect(normaliseInitials("f o r")).toBe("FOR");
    expect(normaliseInitials("a-b!c")).toBe("ABC");
  });

  it("keeps digits, which are part of the alphabet", () => {
    expect(normaliseInitials("f0r")).toBe("F0R");
  });
});

describe("foldLeet", () => {
  it("rewrites the seven digits that stand in for letters", () => {
    expect(foldLeet("F4G")).toBe("FAG");
    expect(foldLeet("N1G")).toBe("NIG");
    expect(foldLeet("4SS")).toBe("ASS");
    expect(foldLeet("5H7")).toBe("SHT");
  });

  it("leaves 2, 6 and 9 alone, because they stand in for nothing", () => {
    expect(foldLeet("269")).toBe("269");
  });
});

describe("checkInitials", () => {
  it("accepts three characters and hands back the unfolded form", () => {
    expect(checkInitials("for")).toEqual({ ok: true, initials: "FOR" });
    expect(checkInitials("F0R")).toEqual({ ok: true, initials: "F0R" });
  });

  it("refuses a length that is not three, and says which rule it broke", () => {
    expect(checkInitials("ab")).toEqual({ ok: false, reason: arcadeCopy.initials.shape });
    expect(checkInitials("abcd")).toEqual({ ok: false, reason: arcadeCopy.initials.shape });
    expect(checkInitials("")).toEqual({ ok: false, reason: arcadeCopy.initials.shape });
  });

  it("truncates nothing, because deciding somebody's initials for them is worse than refusing", () => {
    expect(checkInitials("fergus").ok).toBe(false);
  });

  it("refuses the blocklist", () => {
    expect(checkInitials("ass").ok).toBe(false);
    expect(checkInitials("KKK")).toEqual({ ok: false, reason: arcadeCopy.initials.blocked });
  });

  it("refuses the blocklist through the leet fold, which is the whole point of the fold", () => {
    expect(checkInitials("4ss").ok).toBe(false);
    expect(checkInitials("N1G").ok).toBe(false);
    expect(checkInitials("5H7").ok).toBe(false);
  });

  it("matches exactly, never as a substring, so an innocent three stays innocent", () => {
    // "CNT" is blocked. "CAN", "TAN" and "NCT" are not, and a substring rule on
    // a three-character string would be an exact rule with a wider blast radius.
    for (const ok of ["CAN", "TAN", "NCT", "BUM", "GIT"]) {
      expect(checkInitials(ok).ok, ok).toBe(true);
    }
  });
});

describe("insertScore", () => {
  it("sorts by score, highest first", () => {
    const rows = insertScore([{ initials: "AAA", score: 10 }], { initials: "BBB", score: 20 });
    expect(rows.map((r) => r.initials)).toEqual(["BBB", "AAA"]);
  });

  it("keeps only the top twenty", () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ initials: "AAA", score: i }));
    expect(insertScore(many, { initials: "ZZZ", score: 100 })).toHaveLength(BOARD_SIZE);
  });

  it("drops the lowest, not the newest", () => {
    const many = Array.from({ length: BOARD_SIZE }, (_, i) => ({ initials: "AAA", score: i + 10 }));
    const rows = insertScore(many, { initials: "ZZZ", score: 500 });
    expect(rows[0]).toEqual({ initials: "ZZZ", score: 500 });
    expect(rows.some((r) => r.score === 10)).toBe(false);
  });

  it("lets whoever got there first keep the rank on a tie", () => {
    const rows = insertScore([{ initials: "OLD", score: 50 }], { initials: "NEW", score: 50 });
    expect(rows.map((r) => r.initials)).toEqual(["OLD", "NEW"]);
  });

  it("does not modify the array it was given", () => {
    const original = [{ initials: "AAA", score: 1 }];
    insertScore(original, { initials: "BBB", score: 2 });
    expect(original).toHaveLength(1);
  });
});

describe("groupDigits", () => {
  it("groups in threes without asking the platform", () => {
    // Never toLocaleString: node and a browser can pick different separators,
    // and the board would then print differently on the server and the client.
    expect(groupDigits(0)).toBe("0");
    expect(groupDigits(999)).toBe("999");
    expect(groupDigits(1000)).toBe("1,000");
    expect(groupDigits(1234567)).toBe("1,234,567");
  });

  it("floors and refuses to print a negative", () => {
    expect(groupDigits(12.9)).toBe("12");
    expect(groupDigits(-5)).toBe("0");
  });
});

describe("formatBoard", () => {
  const board = { game: "pong", rows: [{ initials: "FOR", score: 4200 }, { initials: "CKK", score: 910 }] };

  it("fits the narrowest grid, every line", () => {
    for (const line of formatBoard(board, 32, GAME_TITLES.pong)) {
      expect(line.length, line).toBeLessThanOrEqual(32);
    }
  });

  it("ranks, names and right-aligns the score", () => {
    // Nine columns of furniture (two of rank, two spaces, three of initials,
    // two spaces) and the rest is the score field, so a row fills the width
    // exactly. At 24 that is a 15-column score field.
    const lines = formatBoard(board, 24, GAME_TITLES.pong);
    expect(lines[0]).toBe(GAME_TITLES.pong);
    expect(lines[1]).toBe(" 1  FOR            4,200");
    expect(lines[2]).toBe(" 2  CKK              910");
    for (const line of lines.slice(1)) expect(line).toHaveLength(24);
  });

  it("says the board is empty rather than printing a heading over nothing", () => {
    const lines = formatBoard({ game: "pong", rows: [] }, 32, GAME_TITLES.pong);
    expect(lines[1]).toContain(arcadeCopy.board.empty);
  });
});

describe("formatBoards", () => {
  it("says so, in a sentence, when there is no board to print", () => {
    const lines = formatBoards({ available: false, boards: [] }, 32, GAME_TITLES);
    expect(lines).toEqual([...arcadeCopy.board.unavailable]);
  });

  it("treats never having asked the same as having been told no", () => {
    expect(formatBoards(null, 32, GAME_TITLES)).toEqual([...arcadeCopy.board.unavailable]);
  });

  it("prints one block per game that has any scores", () => {
    const snapshot = {
      available: true,
      boards: [
        { game: "pong", rows: [{ initials: "FOR", score: 10 }] },
        { game: "snake", rows: [] },
      ],
    };
    const lines = formatBoards(snapshot, 32, GAME_TITLES);
    expect(lines.join("\n")).toContain(GAME_TITLES.pong);
    expect(lines.join("\n")).not.toContain(GAME_TITLES.snake);
  });

  it("says the same empty sentence when every game is empty", () => {
    const snapshot = { available: true, boards: [{ game: "pong", rows: [] }] };
    expect(formatBoards(snapshot, 32, GAME_TITLES)).toEqual([arcadeCopy.board.empty]);
  });
});
