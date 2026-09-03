import { isTheme } from "@/lib/system";
import { defineCommand } from "./registry";
import type { CommandDef } from "./registry";
import { argOf, ok } from "./shared";

/**
 * Commands that change the running site. Every one returns an effect
 * descriptor and touches nothing itself; `components/Terminal.tsx` is the only
 * place that applies one. That is what keeps them testable without a DOM.
 */

/**
 * The refusals, as named constants and one-line guards, so
 * `scripts/mutation-check.mjs` can anchor on the guard and prove the tests
 * notice when it goes.
 */
export const GRAVITY_DECLINED: string[] = [
  "gravity: declined.",
  "your system asks for reduced motion, and there is no still version of",
  "this one. everything on the page stays where it is.",
];

export const EJECT_DECLINED: string[] = [
  "eject: declined.",
  "your system asks for reduced motion. the camera stays where it is.",
];

/**
 * `eject` with no argument pulls back, `dock` pushes in; either accepts an
 * explicit on/off so the two names stay one behaviour rather than two.
 */
function ejectOrDock(mode: "eject" | "dock"): CommandDef["run"] {
  return (args, ctx) => {
    const arg = argOf(args);
    const on = mode === "eject" ? arg !== "off" : arg === "on";
    if (on && ctx.reducedMotion) return ok(EJECT_DECLINED);
    return {
      type: "effect",
      effect: { kind: "eject", on },
      lines: on ? ["stepping back from the glass..."] : ["back against the tube."],
    };
  };
}

export const effects = [
  defineCommand({
    name: "theme",
    help: "theme <name>      green · amber · ice",
    argPool: ["green", "amber", "ice"],
    run: (args, ctx) => {
      const arg = argOf(args);
      if (!arg) return ok([`theme: ${ctx.theme ?? "green"}`, "usage: theme green|amber|ice"]);
      if (!isTheme(arg)) return ok([`theme: unknown phosphor '${arg}'`, "try: green · amber · ice"]);
      return { type: "effect", effect: { kind: "theme", theme: arg }, lines: [`phosphor -> ${arg}`] };
    },
  }),

  defineCommand({
    name: "crt",
    help: "crt <on|off>      toggle the tube",
    argPool: ["on", "off"],
    run: (args) => {
      const arg = argOf(args);
      if (arg !== "on" && arg !== "off") return ok(["usage: crt on|off"]);
      return {
        type: "effect",
        effect: { kind: "crt", on: arg === "on" },
        lines: [arg === "on" ? "tube warming up..." : "tube off. flat pixels restored."],
      };
    },
  }),

  defineCommand({
    name: "scanlines",
    help: "scanlines <0-100> set mask intensity",
    run: (args) => {
      const arg = argOf(args);
      const n = Number(arg);
      if (!arg || !Number.isFinite(n) || n < 0 || n > 100) return ok(["usage: scanlines <0-100>"]);
      return {
        type: "effect",
        effect: { kind: "scanlines", value: n / 100 },
        lines: [`mask intensity -> ${Math.round(n)}%`],
      };
    },
  }),

  defineCommand({
    name: "matrix",
    help: "matrix            let it rain",
    run: () => ({
      type: "effect",
      effect: { kind: "matrix", ms: 9000 },
      lines: ["wake up, neo...", "following the white rabbit for 9 seconds."],
    }),
  }),

  defineCommand({
    name: "degauss",
    help: "degauss           thump the magnets",
    run: () => ({ type: "effect", effect: { kind: "degauss" }, lines: ["*THWOMP*"] }),
  }),

  defineCommand({
    name: "gravity",
    help: "gravity           drop the page. drag it. throw it.",
    argPool: ["on", "off"],
    run: (args, ctx) => {
      const arg = argOf(args);
      const on = arg !== "off" && arg !== "0";
      if (on && ctx.reducedMotion) return ok(GRAVITY_DECLINED);
      return {
        type: "effect",
        effect: { kind: "gravity", on },
        lines: on
          ? ["gravity: 9.81 m/s² restored.", "drag a word · space shakes the tube · esc puts it back"]
          : ["gravity: released. reassembling."],
      };
    },
  }),

  defineCommand({
    name: "eject",
    help: "eject / dock      pull the camera back off the glass",
    run: ejectOrDock("eject"),
  }),

  defineCommand({
    name: "dock",
    run: ejectOrDock("dock"),
  }),

  defineCommand({
    name: "sound",
    help: "sound <on|off>    the tube has a voice",
    argPool: ["on", "off"],
    run: (args) => {
      const arg = argOf(args);
      if (arg !== "on" && arg !== "off") return ok(["usage: sound on|off"]);
      const on = arg === "on";
      return {
        type: "effect",
        effect: { kind: "sound", on },
        lines: on
          ? [
              "audio: unmuted. silent at rest, so it only speaks when you do something.",
              "(everything you hear is synthesised at runtime. there are no audio files.)",
            ]
          : ["audio: muted."],
      };
    },
  }),

  defineCommand({
    name: "clear",
    aliases: ["cls"],
    run: () => ({ type: "clear" }),
  }),
];
