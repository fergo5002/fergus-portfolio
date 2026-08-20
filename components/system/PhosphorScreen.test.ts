import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Brightness guards on the tube's two shader passes.
 *
 * **What this cannot do.** Vitest runs in a `node` environment, there is no
 * WebGL context, and the GLSL here is a template literal. Nothing below renders
 * anything: these are greps, the same kind `lib/boot.test.ts` and the
 * `ContactForm` block in `lib/contact.test.ts` carry, and for the same reason.
 * A magic number in a shader is the least reviewable line in the codebase and
 * the easiest to nudge.
 *
 * **They also cannot tell you what a number looks like.** That is not a footnote,
 * it is the reason this file was nearly useless. On 2026-08-20 the ring
 * constants were halved, every assertion here passed, and the degauss carried on
 * flashing at exactly the same brightness: the persistence buffer clamps at 1.0
 * every frame and both the old and the new values were far above it. The numbers
 * below are now solved backwards from the composite peak that lands on screen
 * (see the note in SIM_FRAG), so they are deliberately NOT round halves. If one
 * needs to change, work out what it does to the picture first. A green test
 * here is evidence a constant is where it was put, and nothing more.
 *
 * Just as important is what is asserted *unchanged*: the tap and degauss
 * deflection offsets, the burn-in scrub and the power-on strike were all left
 * alone on purpose, so a later "while I'm here" edit that dims the wrong thing
 * fails here rather than in somebody's eyes.
 */
const src = readFileSync(
  join(process.cwd(), "components", "system", "PhosphorScreen.tsx"),
  "utf8",
);

/** Text between two markers, so a sim-pass line can never satisfy a present-pass claim. */
function between(from: string, to: string): string {
  const a = src.indexOf(from);
  const b = src.indexOf(to);
  if (a < 0) throw new Error(`marker not found: ${from}`);
  if (b <= a) throw new Error(`marker not found after ${from}: ${to}`);
  return src.slice(a, b);
}

/** One `if (...) {` block, brace-matched, so two similar lines cannot be swapped. */
function block(source: string, opener: string): string {
  const at = source.indexOf(opener);
  if (at < 0) throw new Error(`block not found: ${opener}`);
  const open = source.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}" && --depth === 0) return source.slice(open + 1, i);
  }
  throw new Error(`unterminated block: ${opener}`);
}

const SIM = between("const SIM_FRAG =", "/* ── pass 2: present");
const PRESENT = between("const PRESENT_FRAG =", "/** The persistence buffer runs at half");

describe("the passes were actually located", () => {
  /**
   * `between` throws on a missing marker, so a rename is an import-time error
   * rather than a quiet pass. What this catches is the subtler case: two markers
   * that both still exist but no longer bracket the shader, which would return a
   * short slice and make every assertion below fail for a confusing reason.
   * Failing here first says which.
   */
  it("found two substantial shader sources", () => {
    expect(SIM.length).toBeGreaterThan(1500);
    expect(PRESENT.length).toBeGreaterThan(3000);
    expect(SIM).toContain("uniform sampler2D tPrev;");
    expect(PRESENT).toContain("uniform sampler2D tSim;");
  });
});

/**
 * The halo the cursor drags around the screen. It is deposited twice: once into
 * the persistence buffer, where it smears and decays behind the pointer, and
 * once directly into the present pass as an immediate soft glow. Halving one
 * and not the other would leave the lagging smear brighter than the thing
 * casting it, which looks like a bug rather than a dimmer setting.
 *
 * This is the one effect where the halving is honest end to end: it did not sit
 * far enough over the clamp for the ceiling to eat it. The saturated white core
 * goes from roughly 115px of screen radius to roughly 15px.
 */
describe("the light around the pointer is half strength", () => {
  it("deposits half as much into the persistence buffer", () => {
    expect(SIM).toContain("add += exp(-length(toP) * 9.0) * 0.05 * uPointerActive;");
  });

  it("adds half as much immediate glow in the present pass", () => {
    expect(PRESENT).toContain("glow += exp(-d * 5.0) * 0.025 * uPointerActive;");
  });

  it("leaves the deflection ripple exactly as it was", () => {
    // Fergus was asked and chose the light only. The ripple is geometry, not
    // brightness: it is what makes the glass read as something the cursor is
    // pressing on, and it is not what "too much light" describes.
    expect(PRESENT).toContain("uv += normalize(toP + 1e-5) * ripple * 0.0045 * uPointerActive;");
  });
});

/**
 * The expanding rings: a tap on the glass, and the degauss that fires on every
 * theme change and every route change.
 *
 * Asserted inside their own brace-matched blocks rather than against the whole
 * pass, because `glow += band * N` appears in both and a check against the
 * whole file would happily accept the two values swapped over.
 */
describe("the tap and degauss shockwaves flash at about half the light", () => {
  it("puts a tap's peak near 0.48 on the 30fps path it ships on", () => {
    // Touch-only, and small screens are capped at 30fps by minFrameMs, so 30 is
    // the frame rate to solve for. Was 0.55 / 0.5, which clipped at both rates.
    expect(SIM).toContain("add += shockBand(uTap, length(toT), 0.72, 9.0, 2.2) * 0.11;");
    expect(block(PRESENT, "if (uTap < 1.6)")).toContain("glow += band * 0.10;");
  });

  it("puts a degauss's peak near 0.50 at 60fps", () => {
    // Was 0.85 / 0.7. This is the flash a visitor meets most often, because
    // RouteTransition fires it on every navigation.
    expect(SIM).toContain("add += dgDrag * 0.06;");
    expect(block(PRESENT, "if (uDegauss < 2.4)")).toContain("glow += band * 0.05;");
  });

  it("still drags the picture the same distance", () => {
    // The wave is the effect. Only its brightness came down.
    expect(SIM).toContain("src += normalize(toC + 1e-5) * dgDrag * 0.045;");
    expect(block(PRESENT, "if (uTap < 1.6)")).toContain(
      "uv += normalize(toT + 1e-5) * band * 0.04;",
    );
    expect(block(PRESENT, "if (uDegauss < 2.4)")).toContain(
      "uv += normalize(toC + 1e-5) * band * 0.055;",
    );
  });

  it("still scrubs burn-in at full strength", () => {
    // Clearing burn-in is the entire reason that button existed on a real
    // monitor. Dimming the flash must not quietly stop the degauss working.
    expect(SIM).toContain("burn *= 1.0 - clamp(dgDrag * 3.5, 0.0, 1.0);");
  });
});

describe("the power-on strike was left alone", () => {
  it("still strikes at full brightness", () => {
    // Explicitly out of scope: once per session, and it is the shape of a cold
    // tube coming up. Halving it would flatten the moment the site is built on.
    // It shares no maths with the rings, so nothing here could have moved it by
    // accident; this is a guard against a later tidy-up, not against this change.
    expect(PRESENT).toContain("col += (uPhosphor * 0.9 + vec3(0.35)) * strike * 1.4;");
  });
});
