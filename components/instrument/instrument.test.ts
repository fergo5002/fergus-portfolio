import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Source-coupling checks for the controls kit. Vitest runs in a `node`
 * environment here, so nothing can be mounted; these read the files.
 *
 * The rule they exist for: every kit control is a styled NATIVE element
 * underneath (a range input, a radio, a button, a file input). That keeps
 * keyboard and screen-reader behaviour the browser's, and it keeps the
 * browser checks working: `getByRole("slider")`, `getByLabel(...).fill()` on a
 * range, `setInputFiles` on a file input. A kit control rebuilt as a `div`
 * with a role on it would pass a screenshot and break all three, which is why
 * `scripts/mutation-check.mjs` replaces one with a div and expects red here.
 */
const DIR = join(process.cwd(), "components", "instrument");
const read = (name: string) =>
  readFileSync(join(DIR, name), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, " ");

const files = ["Knob.tsx", "Slider.tsx", "Segmented.tsx", "Toggle.tsx", "DropSlot.tsx", "ExportBar.tsx", "DateRange.tsx", "Select.tsx"];

describe("the kit exists and is client code", () => {
  it.each(files)("%s is a client component with a stylesheet", (name) => {
    expect(existsSync(join(DIR, name)), name).toBe(true);
    const src = read(name);
    expect(src.startsWith('"use client"'), name).toBe(true);
    expect(src, name).toContain('import "./instrument.css"');
  });

  it("exports every control from one barrel", () => {
    const barrel = read("index.ts");
    for (const name of ["Knob", "Slider", "Segmented", "Toggle", "DropSlot", "FilePicker", "useIntake", "ExportBar", "DateRange", "Select"]) {
      expect(barrel, name).toMatch(new RegExp(`\\b${name}\\b`));
    }
  });
});

describe("every control is a native element underneath", () => {
  it("the knob is a range input, labelled, with a spoken value", () => {
    const src = read("Knob.tsx");
    expect(src).toMatch(/<input\s[^>]*type="range"/);
    expect(src).toContain("aria-valuetext=");
    expect(src).toMatch(/<label\s[^>]*htmlFor=\{id\}/);
  });

  it("the slider is a range input, labelled, with a spoken value", () => {
    const src = read("Slider.tsx");
    expect(src).toMatch(/<input\s[^>]*type="range"/);
    expect(src).toContain("aria-valuetext=");
    expect(src).toMatch(/<label\s[^>]*htmlFor=\{id\}/);
  });

  it("the segmented control is a radiogroup of real radios sharing one name", () => {
    const src = read("Segmented.tsx");
    expect(src).toContain('role="radiogroup"');
    expect(src).toMatch(/<input\s[^>]*type="radio"/);
    expect(src).toMatch(/name=\{name\}/);
    expect(src).toMatch(/checked=\{/);
  });

  it("the toggle is a button with the switch role and a checked state", () => {
    const src = read("Toggle.tsx");
    expect(src).toMatch(/<button\s[^>]*type="button"/);
    expect(src).toContain('role="switch"');
    expect(src).toContain("aria-checked={");
  });

  it("the drop slot keeps a real file input behind a label", () => {
    const src = read("DropSlot.tsx");
    expect(src).toMatch(/<input\s[^>]*type="file"/);
    expect(src).toMatch(/<label\s[^>]*htmlFor=\{id\}/);
  });

  it("export actions are buttons whose glyph is hidden from the accessible name", () => {
    const src = read("ExportBar.tsx");
    expect(src).toMatch(/<button\s[^>]*type="button"/);
    expect(src).toMatch(/<svg[^>]*aria-hidden="true"/);
  });

  it("the date range is two range inputs, and no stock date input exists in the kit", () => {
    const src = read("DateRange.tsx");
    expect(src.match(/type="range"/g)?.length).toBe(2);
    for (const name of files) expect(read(name), name).not.toContain('type="date"');
  });

  it("the select is a real select with a label", () => {
    const src = read("Select.tsx");
    expect(src).toMatch(/<select\s/);
    expect(src).toMatch(/<label\s[^>]*htmlFor=\{id\}/);
  });
});

describe("the arithmetic lives in lib/instrument, not in the components", () => {
  it("the knob drags, scrolls and steps through the tested functions", () => {
    const src = read("Knob.tsx");
    for (const call of ["dragValue(", "wheelValue(", "applyKey(", "knobKey(", "knobAngle(", "toFraction("]) {
      expect(src, call).toContain(call);
    }
  });

  it("the drop slot screens every file through the tested rule, dropped or picked", () => {
    const src = read("DropSlot.tsx");
    expect(src).toContain("screenFiles(");
    expect(src).toContain("acceptChips(");
  });

  it("the date range moves its thumbs through the tested functions", () => {
    const src = read("DateRange.tsx");
    for (const call of ["moveFrom(", "moveTo(", "rangeIndices(", "presetRange(", "presetOf("]) expect(src, call).toContain(call);
  });
});

describe("behaviour the browser does not give for free", () => {
  it("the knob takes the wheel only while focused, so page scrolling is never hijacked", () => {
    const src = read("Knob.tsx");
    expect(src).toMatch(/addEventListener\("wheel", [^,]+, \{ passive: false \}\)/);
    expect(src).toMatch(/document\.activeElement !== input/);
    expect(src).toContain("data-lenis-prevent");
  });

  it("the knob never starts an animation loop of its own", () => {
    for (const name of files) expect(read(name), name).not.toMatch(/requestAnimationFrame|setInterval/);
  });

  it("the drop zone reacts only to drags that carry files, and counts nested enters", () => {
    const src = read("DropSlot.tsx");
    expect(src).toMatch(/types[^;]*includes\("Files"\)/);
    expect(src).toMatch(/depth\.current \+= 1|depth\.current\+\+/);
  });

  it("a refused file is said out loud", () => {
    const src = read("DropSlot.tsx");
    expect(src).toMatch(/role="alert"/);
  });

  it("carries no sentence of its own: every word comes from content", () => {
    for (const name of files) {
      const body = read(name);
      const sentences = [...body.matchAll(/"[A-Z][a-z][^"]{20,}"/g)].map((m) => m[0]);
      expect(sentences, name).toEqual([]);
    }
  });
});

describe("the stylesheet", () => {
  const css = readFileSync(join(DIR, "instrument.css"), "utf8").replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, " ");

  it("puts a 44px floor under every tap target the kit draws", () => {
    for (const selector of [".inst-seg__opt", ".inst-toggle", ".inst-picker__button", ".inst-export__btn", ".inst-slider__input", ".inst-select__input"]) {
      const block = new RegExp(`${selector.replace(/[.]/g, "\\.")}\\s*\\{[^}]*min-height:\\s*44px`);
      expect(css, selector).toMatch(block);
    }
    expect(css).toMatch(/\.inst-knob__face\s*\{[^}]*width:\s*var\(--knob\)/);
    expect(css).toMatch(/--knob:\s*(4[4-9]|[5-9]\d)px/);
  });

  it("keeps every text input at 16px, which stops iOS zooming on focus", () => {
    expect(css).toMatch(/\.inst-select__input\s*\{[^}]*font-size:\s*16px/);
  });

  it("takes every colour from the theme tokens", () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/rgba?\(/);
    expect(css).not.toMatch(/color:\s*var\(--green-(dim|faint)\)/);
  });

  it("restyles the range completely rather than tinting the stock one", () => {
    expect(css).toMatch(/\.inst-slider__input\s*\{[^}]*appearance:\s*none/);
    expect(css).toContain("::-webkit-slider-thumb");
    expect(css).toContain("::-moz-range-thumb");
    expect(css).not.toContain("accent-color");
  });

  it("gates its motion behind reduced motion", () => {
    expect(css).toContain("@media (prefers-reduced-motion: no-preference)");
    const outside = css.replace(/@media \(prefers-reduced-motion: no-preference\)\s*\{[\s\S]*?\n\}/g, "");
    expect(outside).not.toMatch(/transition:|animation:/);
  });

  it("has no eyebrow", () => {
    expect(css).not.toMatch(/eyebrow/i);
  });
});
