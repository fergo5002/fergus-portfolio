import { describe, it, expect } from "vitest";
import { COMMAND_CAP, ENTRY_CAP, WELCOME, historyReduce, initialHistory } from "./history";

describe("historyReduce", () => {
  it("starts with the welcome and no commands", () => {
    const s = initialHistory();
    expect(s.entries).toEqual([{ cmd: "", lines: WELCOME }]);
    expect(s.commands).toEqual([]);
  });

  it("records a typed command for recall, trimmed, and ignores a blank", () => {
    let s = initialHistory();
    s = historyReduce(s, { type: "typed", cmd: "  ls  " });
    expect(s.commands).toEqual(["ls"]);
    const same = historyReduce(s, { type: "typed", cmd: "   " });
    expect(same).toBe(s);
  });

  it("prints an entry into the scrollback", () => {
    let s = initialHistory();
    s = historyReduce(s, { type: "print", cmd: "whoami", lines: ["a", "b"] });
    expect(s.entries.at(-1)).toEqual({ cmd: "whoami", lines: ["a", "b"] });
  });

  it("clears the scrollback and keeps the recall list", () => {
    let s = initialHistory();
    s = historyReduce(s, { type: "typed", cmd: "ls" });
    s = historyReduce(s, { type: "print", cmd: "ls", lines: ["x"] });
    s = historyReduce(s, { type: "clear" });
    expect(s.entries).toEqual([]);
    expect(s.commands).toEqual(["ls"]);
    expect(historyReduce(s, { type: "clear" })).toBe(s);
  });

  it("caps both lists, dropping the oldest", () => {
    let s = initialHistory();
    for (let i = 0; i < ENTRY_CAP + 5; i++) s = historyReduce(s, { type: "print", cmd: String(i), lines: [] });
    expect(s.entries).toHaveLength(ENTRY_CAP);
    // ENTRY_CAP + 6 entries went in (the welcome, then 0..ENTRY_CAP+4), so six
    // fell off: the welcome and 0..4.
    expect(s.entries[0].cmd).toBe("5");
    for (let i = 0; i < COMMAND_CAP + 3; i++) s = historyReduce(s, { type: "typed", cmd: `c${i}` });
    expect(s.commands).toHaveLength(COMMAND_CAP);
    expect(s.commands[0]).toBe("c3");
  });
});
