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
    ".tools__blurb",
    ".tools__meta",
    ".tool__cantsee-item",
    ".tool__privacy",
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

  /**
   * The privacy line is the first amber *sentence* on the site. Amber has
   * only ever been used for headings and single words, so nothing proved it
   * clears the floor as body text on every theme. Measured from the tokens.
   * If a theme fails here, the fix is `--green` on `.tool__privacy`, not a
   * looser number.
   */
  it("keeps the privacy line readable on every theme", () => {
    expect(rule(".tool__privacy")).toMatch(/color:\s*var\(--amber\)/);
    for (const [name, vars] of THEMES) {
      const amber = vars["--amber"] ?? tokens(":root")["--amber"];
      expect(ratio(hex(amber), hex(vars["--bg"])), name).toBeGreaterThanOrEqual(4.5);
    }
  });

  /**
   * The Talk block's two small lines, the prompt above the title and the
   * address under the button, were `--green-dim` on `--bg-panel`. The panel is
   * lighter than the page, and the phone check's first real run read them at
   * 3.7 and 3.8:1 from the pixels on every profile. `--green` is the token the
   * block's own body line already uses on the same panel.
   */
  it("keeps the Talk block's small print on the token that passes on the panel", () => {
    for (const selector of [".talk__prompt", ".talk__alt"]) {
      expect(rule(selector), selector).toMatch(/color:\s*var\(--green\)/);
      expect(rule(selector), selector).not.toMatch(/color:\s*var\(--green-(dim|faint)\)/);
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

/**
 * The table added on 2026-08-21 is a reading surface, and review was right that
 * the guard was not grown to cover it. A table is one of the few blocks a
 * retrieval step lifts whole, so it is also one of the few worth reading, which
 * makes borderline contrast in it a worse fault than in the chrome.
 *
 * `--bg-panel-2` rather than `--bg`, because `.prose__tablewrap` sets it.
 */
describe("prose tables clear 4.5:1 on every theme", () => {
  const panel = (vars: Record<string, string>) => hex(vars["--bg-panel-2"] ?? vars["--bg"]);

  it.each(THEMES.map((t) => [t[0], t[1]] as const))(
    "%s: header cells against the panel",
    (_name, vars) => {
      expect(ratio(hex(vars["--green-bright"]), panel(vars))).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(THEMES.map((t) => [t[0], t[1]] as const))(
    "%s: body cells against the panel",
    (_name, vars) => {
      // `.prose__td` inherits `.prose`'s colour rather than setting one, so this
      // is the token that actually paints them.
      expect(ratio(hex(vars["--green"]), panel(vars))).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("does not dim the table's own text with --green-faint or --green-dim", () => {
    // Anchored to the start of a declaration. Unanchored, this matched
    // `border-bottom-color: var(--green-dim)`, which is a rule about a line
    // rather than about text and is exactly what a border should be.
    const block = /\.prose__th\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(block).not.toMatch(/(?:^|[\s;])color:\s*var\(--green-(faint|dim)\)/);
  });
});

/**
 * The touch bar's two halves stay apart.
 *
 * `scripts/phone-check.mjs` found the machine controls at 21 by 16 on a phone
 * and the readouts pushing them off a 390px bar, and the fix was one
 * `@media (hover: none)` block holding both answers. Review split it, because a
 * thumb is 44px wide on any screen and a bar only runs out of room on a narrow
 * one: in one block, a touchscreen till or a 27" all-in-one lost the memory
 * readout and had its working directory truncated for space it was not short
 * of.
 *
 * The phone check cannot catch this coming back. It drives 320 and 390 only, so
 * the merged version passes it perfectly. This is the guard instead.
 */
describe("the touch bar separates thumb size from screen space", () => {
  /** Every block with exactly this prelude, matched by counting braces. */
  function mediaBlocks(prelude: string): string {
    const needle = `@media ${prelude} {`;
    const found: string[] = [];
    for (let from = 0; ; ) {
      const at = css.indexOf(needle, from);
      if (at < 0) break;
      const open = at + needle.length - 1;
      let depth = 0;
      let i = open;
      for (; i < css.length; i++) {
        if (css[i] === "{") depth++;
        else if (css[i] === "}" && --depth === 0) break;
      }
      found.push(css.slice(open + 1, i));
      from = i + 1;
    }
    if (found.length === 0) throw new Error(`no @media ${prelude} block`);
    return found.join("\n");
  }

  const touch = mediaBlocks("(hover: none)");
  const touchAndNarrow = mediaBlocks("(hover: none) and (max-width: 768px)");

  it("keeps the 44px floors on the input, so a wide touchscreen gets them too", () => {
    expect(touch).toContain("--status-h: 44px");
    expect(touch).toContain(".machine__btn");
    expect(touch).toContain(".skiplink");
  });

  it("hides the memory readout for room rather than for thumbs", () => {
    expect(touchAndNarrow).toContain(".statusbar__mem");
    expect(touch).not.toContain(".statusbar__mem");
  });

  it("truncates the working directory for room rather than for thumbs", () => {
    expect(touchAndNarrow).toContain(".statusbar__pwd");
    expect(touch).not.toContain(".statusbar__pwd");
  });
});

describe("the arcade measures the same cell it draws", () => {
  it("owns the font token above the probe and grid, never on either sibling", () => {
    expect(tokens(".arcade")["--arcade-font"]).toBe("15px");
    expect(tokens(".arcade__grid")["--arcade-font"]).toBeUndefined();
    expect(tokens(".arcade__probe")["--arcade-font"]).toBeUndefined();
    expect(css).toMatch(/@media \(min-width: 601px\) \{\s*\.arcade \{\s*--arcade-font: 16px;/);
  });

  it("makes the entire input surface non-scrolling, not only the grid", () => {
    const arcade = /\.arcade\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(arcade).toContain("touch-action: none");
    expect(arcade).toContain("overscroll-behavior: contain");
  });
});
