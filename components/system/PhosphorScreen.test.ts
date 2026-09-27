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
    expect(SIM).toContain("add += exp(-length(toP) * 9.0) * 0.05 * uEmit * uPointerActive;");
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
  it("cuts a tap to roughly a tenth of its old deposit", () => {
    // Was 0.55 / 0.5, which clipped at every frame rate.
    expect(SIM).toContain("add += shockBand(uTap, length(toT), 0.72, 9.0, 2.2) * 0.11 * uEmit;");
    expect(block(PRESENT, "if (uTap < 1.6)")).toContain("glow += band * 0.10;");
  });

  it("cuts a degauss to roughly a fourteenth of its old deposit", () => {
    // Was 0.85 / 0.7. This is the flash a visitor meets most often, because
    // RouteTransition fires it on every navigation.
    expect(SIM).toContain("add += dgDrag * 0.06 * uEmit;");
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

/**
 * The bug a second review caught, and the only part of this file that is a real
 * test rather than a grep.
 *
 * The decay was per second and the deposits were per frame, so a steady emitter
 * settled at `K / (1 - uDecay)`: about 19.9K at 60fps and about 39.2K at 120.
 * Brightness was therefore a function of the visitor's refresh rate. The ring
 * and halo constants had been solved at 60fps, which meant they landed at half
 * strength on a 60Hz laptop, full strength on a 120Hz monitor, and clipped white
 * again at 165Hz. On a fast display the change Fergus asked for would not have
 * existed. `uEmit` normalises the three tuned emitters back to that reference.
 *
 * The arithmetic below is ported from the shader, so it can genuinely fail.
 */
describe("brightness does not depend on the visitor's refresh rate", () => {
  const decay = (dt: number) => Math.pow(0.045, dt / 1000);
  const emit = (fps: number) => (1 - decay(1000 / fps)) / (1 - decay(1000 / 60));
  /** Where a sustained deposit settles: a resting cursor, the worst case. */
  const settled = (k: number, fps: number) => (k * emit(fps)) / (1 - decay(1000 / fps));

  const RATES = [30, 60, 90, 120, 144, 165];

  it("wires uEmit through the three tuned emitters and nothing else", () => {
    expect(SIM).toContain("uniform float uEmit;");
    // Comments stripped first: the long note above the emitters names uEmit
    // several times, and counting prose would make this assertion meaningless.
    const code = SIM.replace(/\/\/[^\n]*/g, "");
    expect(code.length, "comment stripper ate the shader").toBeGreaterThan(1200);
    // One declaration plus exactly three uses: pointer, tap, degauss.
    expect([...code.matchAll(/uEmit/g)]).toHaveLength(4);
    // The beam and the impacts stay frame-rate dependent on purpose. They were
    // never part of what was asked for and have never been tuned to a reference.
    expect(code).toContain("(0.02 + absVel * 0.10);");
    expect(code).toContain("add += exp(-d * 42.0) * im.z * 1.6;");
  });

  it("derives the factor from uDecay on the CPU, once a frame", () => {
    expect(src).toContain(
      "su.uEmit.value = (1 - su.uDecay.value) / (1 - Math.pow(0.045, 1 / 60));",
    );
  });

  it("holds a resting cursor's halo flat from 30fps to 165fps", () => {
    const reference = settled(0.05, 60);
    for (const fps of RATES) {
      const drift = Math.abs(settled(0.05, fps) / reference - 1);
      expect(drift, `${fps}fps drifts ${(drift * 100).toFixed(1)}%`).toBeLessThan(0.01);
    }
  });

  it("fails without the factor, which is what made this worth fixing", () => {
    // Guards the guard: if `emit` ever returned a constant 1, the test above
    // would pass on a broken shader. Unnormalised, 120Hz really does get twice
    // the light of 60Hz, so "half as bright" was no change at all up there.
    const unnormalised = (k: number, fps: number) => k / (1 - decay(1000 / fps));
    expect(unnormalised(0.05, 120) / unnormalised(0.05, 60)).toBeGreaterThan(1.9);
    expect(unnormalised(0.05, 165)).toBeGreaterThan(1);
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

/**
 * The beam hook (2026-09-27). Anything that draws with the gun rather than
 * with the page hands `lib/beam.ts` a polyline, and the sim pass deposits a
 * capsule of light along it. Same rule as every emitter above: into the
 * persistence buffer's energy, where it decays, never straight to the screen
 * and never into burn-in. Greps again, with the same limit: they prove the
 * lines are where they were put. `lib/beam.test.ts` carries the arithmetic,
 * and `scripts/boot-check.mjs` reads the pixels.
 */
describe("the beam deposits into the phosphor and nowhere else", () => {
  const code = SIM.replace(/\/\/[^\n]*/g, "");

  it("declares the path, its length and its gain in the sim pass", () => {
    expect(SIM).toContain("uniform vec2  uBeamPts[${MAX_BEAM_POINTS}];");
    expect(SIM).toContain("uniform float uBeamCount;");
    expect(SIM).toContain("uniform float uBeamGain;");
  });

  it("lays a capsule along the path into the energy the rest of the pass decays", () => {
    const deposit = "add += exp(-bk * bk) * uBeamGain;";
    expect(code).toContain(deposit);
    expect(code).toContain("float bk = bd / ${BEAM_R};");
    // Before the line that turns `add` into phosphor energy, or it is dropped.
    expect(code.indexOf(deposit)).toBeLessThan(code.indexOf("energy += uPhosphor * add;"));
    expect(block(code, "if (uBeamCount > 0.5)")).toContain("bd = min(bd, length(bq - ba - bv * bh));");
  });

  it("takes its gain from the CPU and never from uEmit", () => {
    // The normalisation is baked into beamGain by lib/beam.ts. The uEmit count
    // above pins the other half of this.
    expect(block(code, "if (uBeamCount > 0.5)")).not.toContain("uEmit");
  });

  it("never burns in and never draws in the present pass", () => {
    expect(code.slice(code.indexOf("float staticMask"))).not.toContain("uBeam");
    expect(PRESENT).not.toContain("uBeam");
  });

  it("splices the radius from lib/beam.ts as a float", () => {
    expect(src).toContain("const BEAM_R = BEAM_RADIUS.toFixed(4);");
  });

  it("flips y into GL's space, hands over the gain, and consumes the path once drawn", () => {
    expect(src).toContain("bp[i * 2 + 1] = 1 - f.beamPts[i * 2 + 1];");
    expect(src).toContain("su.uBeamCount.value = f.beamCount;");
    expect(src).toContain("su.uBeamGain.value = f.beamGain;");
    // Cleared only after the sim pass has actually rendered it, so a frame the
    // phone throttle skips leaves the path for the writer to extend.
    expect(src).toMatch(/renderer\.render\(\{ scene: simMesh, target: next \}\);\s*\n\s*clearBeam\(f\);/);
  });
});

describe("the rain is finer and dimmer on a phone (Fergus, 2026-09-06)", () => {
  // Seen on both mobile engines, every route: at 32 columns across a 0.6 dpr
  // buffer the rain cells were about 12 CSS pixels square and read as blocky
  // green dirt behind the text rather than as the texture it is on the desktop.
  // Fergus chose toning it down over removing it. Same rule as every constant
  // here: this proves the numbers are where they were put, and the pixels were
  // measured separately (docs/PROGRESS.md, 2026-09-06).
  it("draws the phone rain on a finer grid", () => {
    expect(PRESENT).toContain("float cols = mix(54.0, 48.0, uMobile);");
  });

  it("scales every rain sample by one mobile gain, declared once", () => {
    expect(PRESENT).toContain("float rainGain = mix(1.0, 0.55, uMobile);");
    // No rain sample reaches the picture without the gain.
    const samples = PRESENT.match(/rain\(uv[^;]*\) \* uRain/g) ?? [];
    expect(samples.length).toBeGreaterThan(0);
    for (const sample of samples) expect(PRESENT).toContain(`${sample} * rainGain`);
  });
});

/**
 * The ejected monitor (2026-09-27). The case, the chin, the base, the control
 * recess, the grille and the LED are all placed by `lib/eject.ts`, which also
 * places the DOM controls on the same chin. These pin the shader's half of that
 * contract: the room takes every size from a uniform, and the lines that build
 * the case are exactly the ones `lib/eject.test.ts` ports into TypeScript and
 * checks against the DOM. Greps, with the usual limit: they prove the lines are
 * where they were put, and `scripts/eject-check.mjs` reads the pixels.
 */
describe("the monitor takes its shape from lib/eject.ts", () => {
  const ROOM = PRESENT.slice(PRESENT.indexOf("vec3 room("), PRESENT.indexOf("void main()"));

  it("found the room", () => {
    expect(ROOM.length).toBeGreaterThan(2000);
  });

  it("builds the case from uniforms, with no size of its own", () => {
    expect(PRESENT).toContain("uniform vec4  uCase;");
    expect(PRESENT).toContain("uniform vec2  uCaseB;");
    // The two lines lib/eject.test.ts ports. Change one here and the port in
    // that file no longer describes the shader.
    expect(ROOM).toContain("vec2 bh = vec2(rh.x + uCase.x, rh.y + (uCase.y + uCase.z) * 0.5);");
    expect(ROOM).toContain("vec2 bc = rc - vec2(0.0, (uCase.z - uCase.y) * 0.5);");
    expect(ROOM).toContain("float dBezel = sdRoundBox(q - bc, bh, uCase.w);");
    expect(ROOM).toContain("float dScreen = sdRoundBox(q - rc, rh, uCaseB.x);");
    // The old literals are gone, so there is no second definition to drift.
    expect(ROOM).not.toContain("rh.x + 0.030");
    expect(ROOM).not.toContain("rh.y + 0.056");
    expect(ROOM).not.toContain("vec2(0.0, 0.026)");
  });

  it("puts the LED where the layout puts it, dimming with the power", () => {
    expect(PRESENT).toContain("uniform vec3  uLed;");
    expect(ROOM).toContain("float dLed = length(q - toQ(uLed.xy));");
    expect(ROOM).toContain("plastic += uPhosphor * exp(-dLed * 300.0) * 1.3 * uLed.z;");
    expect(ROOM).not.toContain("rh.x * 0.80");
  });

  it("hands the shader the same case the DOM hardware is placed from, every frame", () => {
    expect(src).toContain("const c = ejectCase(g, layout);");
    expect(src).toContain("pu.uCase.value = c.uCase;");
    expect(src).toContain("pu.uCaseB.value = [c.glass, c.base];");
    expect(src).toContain("pu.uDeck.value = boxToGl(placeBox(c, layout.deck), vw, vh);");
    // The lean every consumer of the geometry uses, so the monitor, the
    // controls and the bezel cannot lean by different amounts.
    expect(src).toMatch(/ejectLean\(f\.pointerX, f\.pointerY, f\.pointerActive, coarse\)/);
  });

  it("lets the glass's own rounded corners decide what is tube and what is plastic", () => {
    const main = PRESENT.slice(PRESENT.indexOf("void main()"));
    expect(main).toContain("if (sdRoundBox(toQ(uv) - rc, rh, uCaseB.x) < 0.0) {");
  });
});

describe("the power switch works inside the glass while ejected", () => {
  const main = PRESENT.slice(PRESENT.indexOf("void main()"));

  it("collapses the raster in the screen's own space and leaves the room standing", () => {
    const ejected = block(main, "if (uEject > 0.001)");
    expect(ejected).toContain("float sy = suv.y - 0.5;");
    expect(ejected).toContain("if (abs(sy) > halfBand) {");
    expect(ejected).toContain("room(uv, rectMin, rectMax, tubeGlow(suv) * openT)");
  });

  it("keeps the docked power-on exactly as it was", () => {
    expect(main).toContain("float openT = smoothstep(0.05, 0.62, uPower);");
    expect(main).toContain("float halfBand = mix(0.0016, 0.5, openT);");
    expect(main).toMatch(/if \(abs\(yFromMid\) > halfBand\) \{\s*gl_FragColor = vec4\(0\.0, 0\.0, 0\.0, 1\.0\);\s*return;\s*\}/);
    // One strike line for both, untouched.
    expect(main.match(/\* strike \* 1\.4;/g)).toHaveLength(1);
  });

  it("fades the last line only when the monitor's own switch turned the tube off", () => {
    expect(main).toContain("strike *= strikeMask;");
    // The boot and the arcade's power-cycle both switch the tube off too, and
    // neither may be touched by this: they run docked.
    expect(src).toContain("const switchedOff = f.ejectTarget === 1 && f.bootTarget === 0;");
    expect(src).toMatch(/pu\.uLineFade\.value = offAt < 0 \? 1 : Math\.exp\(/);
  });
});
