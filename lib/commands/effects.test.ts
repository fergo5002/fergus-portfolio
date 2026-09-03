import { describe, it, expect } from "vitest";
import { effects, EJECT_DECLINED, GRAVITY_DECLINED } from "./effects";
import type { CommandDef } from "./registry";

const def = (name: string): CommandDef => {
  const d = effects.find((c) => c.name === name);
  if (!d) throw new Error(`effects has no ${name}`);
  return d;
};
const run = (name: string, args: string[] = [], ctx = {}) =>
  def(name).run(args, ctx, [name, ...args].join(" "));

describe("the effects module", () => {
  it("carries exactly the commands that touch the machine", () => {
    expect(effects.map((c) => c.name).sort()).toEqual([
      "clear", "crt", "degauss", "dock", "eject", "gravity", "matrix", "scanlines", "sound", "theme",
    ]);
    expect(def("clear").aliases).toEqual(["cls"]);
  });

  it("theme reports, rejects, or fires, and completes the three phosphors", () => {
    expect(run("theme", [], { theme: "ice" })).toMatchObject({ type: "output" });
    expect(run("theme", ["purple"])).toMatchObject({ type: "output" });
    expect(run("theme", ["amber"])).toEqual({
      type: "effect",
      effect: { kind: "theme", theme: "amber" },
      lines: ["phosphor -> amber"],
    });
    expect(def("theme").argPool).toEqual(["green", "amber", "ice"]);
  });

  it("scanlines maps a percentage and refuses the rest", () => {
    expect(run("scanlines", ["40"])).toMatchObject({ effect: { kind: "scanlines", value: 0.4 } });
    for (const bad of [["140"], ["-3"], ["lots"], []]) {
      expect(run("scanlines", bad)).toEqual({ type: "output", lines: ["usage: scanlines <0-100>"] });
    }
  });

  it("gravity and eject decline under reduced motion with the named sentences", () => {
    expect(run("gravity", [], { reducedMotion: true })).toEqual({ type: "output", lines: GRAVITY_DECLINED });
    expect(run("eject", [], { reducedMotion: true })).toEqual({ type: "output", lines: EJECT_DECLINED });
    // The way back is never declined.
    expect(run("gravity", ["off"], { reducedMotion: true })).toMatchObject({ type: "effect" });
    expect(run("dock", [], { reducedMotion: true })).toMatchObject({ effect: { kind: "eject", on: false } });
  });

  it("eject and dock are two names for one behaviour", () => {
    expect(run("eject")).toMatchObject({ effect: { kind: "eject", on: true } });
    expect(run("eject", ["off"])).toMatchObject({ effect: { kind: "eject", on: false } });
    expect(run("dock")).toMatchObject({ effect: { kind: "eject", on: false } });
    expect(run("dock", ["on"])).toMatchObject({ effect: { kind: "eject", on: true } });
    // Parity with the switch: neither completes an argument yet.
    expect(def("eject").argPool).toBeUndefined();
    expect(def("dock").argPool).toBeUndefined();
  });

  it("crt, sound and gravity complete on and off", () => {
    for (const name of ["crt", "sound", "gravity"]) expect(def(name).argPool).toEqual(["on", "off"]);
    expect(run("crt", ["maybe"])).toEqual({ type: "output", lines: ["usage: crt on|off"] });
    expect(run("sound")).toEqual({ type: "output", lines: ["usage: sound on|off"] });
  });

  it("matrix, degauss and clear are what they were", () => {
    expect(run("matrix")).toMatchObject({ effect: { kind: "matrix", ms: 9000 } });
    expect(run("degauss")).toEqual({ type: "effect", effect: { kind: "degauss" }, lines: ["*THWOMP*"] });
    expect(run("clear")).toEqual({ type: "clear" });
  });
});
