import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Contrast guard for the reading surfaces.
 *
 * AGENTS.md calls 4.5:1 non-negotiable, and this site has three phosphor themes
 * that a visitor can switch between from its own terminal (`theme amber`). It is
 * therefore not enough for the default theme to pass: a rule written against the
 * green palette can be comfortably legible and then fail the moment somebody
 * types four characters.
 *
 * That is exactly what happened. The article body copy shipped on
 * `--green-faint`, the base colour at 0.55 alpha, which measures 4.88 on green
 * but 3.95 on amber and 4.47 on ice. Two themes under the floor, on the longest
 * text on the site. This test computes the ratios from the tokens themselves so
 * the next person who dims a reading surface finds out here.
 */

const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

type RGB = [number, number, number];

function hex(value: string): RGB {
  const h = value.trim().replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** WCAG relative luminance. */
function luminance([r, g, b]: RGB): number {
  const chan = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

function ratio(fg: RGB, bg: RGB): number {
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

/** Flattens a translucent foreground against an opaque background. */
function over(fg: RGB, bg: RGB, alpha: number): RGB {
  return fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha))) as RGB;
}

/** Pulls the custom properties out of one selector block. */
function tokens(selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  if (!block) throw new Error(`no block for ${selector}`);
  const out: Record<string, string> = {};
  for (const m of block[1].matchAll(/(--[\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const THEMES = [
  [":root", tokens(":root")],
  ['html[data-theme="amber"]', tokens('html[data-theme="amber"]')],
  ['html[data-theme="ice"]', tokens('html[data-theme="ice"]')],
] as const;

describe("phosphor themes define the tokens the guard needs", () => {
  it.each(THEMES.map((t) => [t[0], t[1]] as const))("%s has --bg and --green", (_name, vars) => {
    expect(vars["--bg"]).toMatch(/^#/);
    expect(vars["--green"]).toMatch(/^#/);
  });
});

describe("reading surfaces clear 4.5:1 on every theme", () => {
  it.each(THEMES.map((t) => [t[0], t[1]] as const))(
    "%s: body copy colour against the page",
    (_name, vars) => {
      expect(ratio(hex(vars["--green"]), hex(vars["--bg"]))).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(THEMES.map((t) => [t[0], t[1]] as const))(
    "%s: --green-faint would NOT have cleared it",
    (_name, vars) => {
      // Documents why the surfaces use --green rather than --green-faint, so the
      // change reads as deliberate rather than as an inconsistency to tidy up.
      // The green theme passes on its own, which is precisely how this shipped.
      const faint = over(hex(vars["--green"]), hex(vars["--bg"]), 0.55);
      expect(ratio(faint, hex(vars["--bg"]))).toBeLessThan(5.0);
    },
  );
});

describe("the prose rules use the token that passes", () => {
  const rule = (selector: string) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css);
    if (!m) throw new Error(`no rule for ${selector}`);
    return m[1];
  };

  it.each([
    ".prose",
    ".writing__desc",
    ".talk__line",
    ".page__lede",
    ".cform__panel-body",
    ".cform__input",
  ])("%s does not use --green-faint for body text", (selector) => {
    expect(rule(selector)).not.toMatch(/color:\s*var\(--green-faint\)/);
  });

  /**
   * A form label is the accessible name of its field, so it is the last thing
   * on the site that may be borderline. The terminal chrome uses `--green-dim`
   * freely, and it must not spread to a label.
   *
   * Measured from the tokens rather than eyeballed, because the numbers are the
   * whole trap. `--green-dim` on `--bg` is **4.67 on green, 4.45 on amber and
   * 4.46 on ice**: it passes on the one theme a developer is looking at and
   * fails on the two a visitor can reach with four characters at the terminal.
   * The assertions below name each theme separately for exactly that reason. A
   * loop asserting one loose bound across all three would have been green
   * whether or not the claim above it was true.
   */
  it("labels the contact fields with the token that passes on every theme", () => {
    expect(rule(".cform__label")).toMatch(/color:\s*var\(--green\)/);
    expect(rule(".cform__label")).not.toMatch(/color:\s*var\(--green-dim\)/);
  });

  it("records why --green-dim cannot be a label, theme by theme", () => {
    const dim = (name: string) => {
      const vars = THEMES.find((t) => t[0] === name)?.[1];
      if (!vars) throw new Error(`no theme ${name}`);
      return ratio(hex(vars["--green-dim"]), hex(vars["--bg"]));
    };

    // Passes here, which is how it would have shipped.
    expect(dim(":root")).toBeGreaterThanOrEqual(4.5);
    // And fails on both of the others, which is why it cannot be used.
    expect(dim('html[data-theme="amber"]')).toBeLessThan(4.5);
    expect(dim('html[data-theme="ice"]')).toBeLessThan(4.5);
  });

  /**
   * The error messages under a rejected field. Red on near-black is not close
   * to the floor on any theme, but it is the one colour on the form a visitor
   * is required to read in order to fix something, so it gets checked rather
   * than assumed.
   */
  it("keeps the field error text readable on every theme", () => {
    expect(rule(".cform__error")).toMatch(/color:\s*var\(--red\)/);
    for (const [name, vars] of THEMES) {
      // `--red` is defined once on :root and deliberately not re-themed, so
      // every theme reads the same literal against its own background.
      const red = vars["--red"] ?? tokens(":root")["--red"];
      expect(ratio(hex(red), hex(vars["--bg"])), name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps the glow off long-form prose", () => {
    // A text-shadow halo on every character is correct for a ten word terminal
    // readout and genuinely tiring across two thousand words.
    expect(rule(".prose")).toMatch(/text-shadow:\s*none/);
  });

  /**
   * HeroName renders the name as plain text on the server and swaps it for the
   * per-character magnetic layer on mount. Anything that differs between the two
   * shows up as a flash at hydration, on every load the boot sequence does not
   * happen to be covering.
   *
   * One thing did. `.heroname__plain` inherited the h1's own text-shadow
   * (0 0 4px / 0 0 16px) while `.heroname__ch` overrides it with `--glow`
   * (0 0 2px / 0 0 7px), so the name dimmed the moment React took over.
   */
  it("renders the hero name with the same glow before and after hydration", () => {
    const glow = /text-shadow:[^;]*var\(--glow\)/;
    expect(rule(".heroname__plain")).toMatch(glow);
    expect(rule(".heroname__ch")).toMatch(glow);
    // The h1 itself is what the plain copy used to inherit from, and it had the
    // green literal hardcoded, which is what made the flash a hue shift on amber
    // and ice rather than a change of radius. Nothing visible inherits it today,
    // so without this line the literal could come back and every test would stay
    // green on the one rule whose comment warns against exactly that.
    expect(rule(".hero__name")).toMatch(glow);
  });
});

/**
 * How hard the tube is allowed to flash.
 *
 * Three separate effects strobe the whole viewport, and on 2026-08-20 all three
 * were halved on Fergus's call: the periodic flicker, the channel-change burst
 * that fires on every route change, and the tap and degauss shockwaves. The
 * first two are here; the third lives in the shader and is guarded in
 * `components/system/PhosphorScreen.test.ts`.
 *
 * Each was individually defensible and collectively a strobe on a site people
 * read two-thousand-word articles on. The numbers are asserted rather than
 * eyeballed because "less aggressive" is exactly the kind of change that creeps
 * back up one commit at a time, with every commit looking reasonable.
 *
 * The power-on strike is deliberately NOT in scope. It happens once per session,
 * it is the shape of a tube coming to life, and dimming it would flatten the one
 * moment the whole conceit is built around.
 */
describe("the full-screen flashes are half what they were", () => {
  /** One @keyframes block, brace-matched: the rule contains nested blocks. */
  const keyframes = (name: string) => {
    const at = css.indexOf(`@keyframes ${name}`);
    if (at < 0) throw new Error(`no @keyframes ${name}`);
    const open = css.indexOf("{", at);
    let depth = 0;
    for (let i = open; i < css.length; i++) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}" && --depth === 0) return css.slice(open + 1, i);
    }
    throw new Error(`unterminated @keyframes ${name}`);
  };

  /** Every `opacity: n` in a block, in source order. */
  const opacities = (block: string) =>
    [...block.matchAll(/opacity:\s*([\d.]+)/g)].map((m) => Number(m[1]));

  it("peaks the periodic flicker at a quarter rather than a half", () => {
    // Was [0, 0.5, 0.15]: a green sheet over the entire viewport, every 3.2
    // seconds, on every page, forever. It is the one flash nobody opted into.
    expect(opacities(keyframes("flicker"))).toEqual([0, 0.25, 0.075]);
  });

  it("halves the channel-change static and the band that sweeps with it", () => {
    // Both are envelopes on top of fixed gradients, so halving the envelope is
    // exactly a halving of peak brightness and leaves the timing untouched.
    expect(opacities(keyframes("channel-static"))).toEqual([0.425, 0]);
    expect(opacities(keyframes("channel-band"))).toEqual([0.5, 0]);
  });
});
