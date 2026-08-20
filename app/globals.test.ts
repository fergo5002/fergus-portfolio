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

  it.each([".prose", ".writing__desc", ".talk__line", ".page__lede"])(
    "%s does not use --green-faint for body text",
    (selector) => {
      expect(rule(selector)).not.toMatch(/color:\s*var\(--green-faint\)/);
    },
  );

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
