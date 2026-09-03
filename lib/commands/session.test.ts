import { describe, it, expect } from "vitest";
import { session } from "./session";
import type { CommandDef } from "./registry";
import { OWNED_PREFIX } from "@/lib/forget";
import { SETTINGS_KEY } from "@/lib/system";

const def = (name: string): CommandDef => {
  const d = session.find((c) => c.name === name);
  if (!d) throw new Error(`session has no ${name}`);
  return d;
};

describe("forget", () => {
  it("is listed under shell, above the two static lines, and completes no argument", () => {
    expect(def("forget").help).toMatch(/^forget\s+/);
    expect(def("forget").group).toBe("shell");
    expect(def("forget").rank).toBe(1);
    expect(def("forget").hidden).toBeUndefined();
    expect(def("forget").argPool).toBeUndefined();
  });

  it("asks the Terminal to remove exactly the owned keys, and prints them", () => {
    const res = def("forget").run(
      [],
      { storageKeys: () => ["theirs", SETTINGS_KEY, `${OWNED_PREFIX}drift`] },
      "forget",
    );
    expect(res).toEqual({
      type: "effect",
      effect: { kind: "forget", keys: [SETTINGS_KEY, `${OWNED_PREFIX}drift`] },
      lines: ["forgotten:", `  ${SETTINGS_KEY}`, `  ${OWNED_PREFIX}drift`],
    });
  });

  it("says when there is nothing to forget, and fires no effect", () => {
    expect(def("forget").run([], { storageKeys: () => ["theirs"] }, "forget")).toEqual({
      type: "output",
      lines: ["nothing to forget"],
    });
    expect(def("forget").run([], {}, "forget")).toEqual({ type: "output", lines: ["nothing to forget"] });
  });

  it("is the only thing that reads the storage, and reads it once", () => {
    // The context used to hold the keys as a value, so every command paid for
    // an enumeration of the visitor's local storage whether it cared or not.
    let reads = 0;
    const storageKeys = () => {
      reads++;
      return [SETTINGS_KEY];
    };
    def("who").run([], { storageKeys, presence: 1 }, "who");
    expect(reads).toBe(0);
    def("forget").run([], { storageKeys }, "forget");
    expect(reads).toBe(1);
  });
});

describe("who", () => {
  it("is listed under shell, after forget", () => {
    expect(def("who").help).toMatch(/^who\s+/);
    expect(def("who").group).toBe("shell");
    expect(def("who").rank).toBe(2);
  });

  it("prints just you until there is a count above one", () => {
    expect(def("who").run([], {}, "who")).toEqual({ type: "output", lines: ["just you"] });
    expect(def("who").run([], { presence: 1 }, "who")).toEqual({ type: "output", lines: ["just you"] });
    const res = def("who").run([], { presence: 4 }, "who");
    if (res.type !== "output") throw new Error("expected output");
    expect(res.lines[0]).toContain("4");
  });
});
