import { describe, it, expect } from "vitest";
import type { ProgramHost, ProgramInstance, ProgramSpec } from "@/lib/arcade/program";

/**
 * A compile-time fixture as much as a test. G0 widens `exit` and narrows
 * `key`'s first parameter, and both are claimed to be compatible with anything
 * written against F1's shapes. If either claim were wrong, this file would not
 * typecheck, and `npx tsc --noEmit` is part of the CI gate.
 */

/** Written the way F1 froze it: no result parameter, `key` typed as a string. */
const oldStyleHost: ProgramHost = {
  cols: 48,
  rows: 20,
  draw: () => {},
  exit: () => {},
};

const oldStyleInstance: ProgramInstance = {
  tick: (_dtMs: number) => {},
  key: (_key: string, _down: boolean) => {},
  dispose: () => {},
};

describe("the frozen program types", () => {
  it("still accepts a host written before the additions", () => {
    expect(oldStyleHost.cols).toBe(48);
    expect(() => oldStyleHost.exit()).not.toThrow();
  });

  it("still accepts an instance whose key takes a plain string", () => {
    expect(() => oldStyleInstance.key("up", true)).not.toThrow();
  });

  it("lets a host be called with a score", () => {
    let got: number | undefined;
    const host: ProgramHost = { ...oldStyleHost, exit: (result) => { got = result?.score; } };
    host.exit({ score: 12 });
    expect(got).toBe(12);
  });

  it("makes the three additions optional, so nothing has to implement them", () => {
    const spec: ProgramSpec = { id: "x", title: "x", start: () => oldStyleInstance };
    expect(spec.start(oldStyleHost).dispose).toBeTypeOf("function");
    expect(oldStyleHost.flash).toBeUndefined();
    expect(oldStyleHost.run).toBeUndefined();
    expect(oldStyleHost.sound).toBeUndefined();
  });
});
