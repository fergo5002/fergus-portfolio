/**
 * The tube's colours, as strings a canvas can use.
 *
 * A canvas cannot read a CSS custom property, so the component reads the
 * site's tokens once (and again on a theme change) and hands the renderer
 * this object. Every colour the arcade paints traces back to a token in
 * `app/globals.css`, which is what lets the games follow the amber and ice
 * phosphors instead of staying green on a blue screen.
 *
 * Pure: takes a reader function rather than touching `getComputedStyle`, so
 * the three real theme blocks can be parsed in node and asserted.
 */

export type ArcadeTheme = {
  ink: string;
  bright: string;
  dim: string;
  line: string;
  accent: string;
  accentBright: string;
  bg: string;
  panel: string;
  /** Font families, already resolved by next/font into their hashed names. */
  display: string;
  mono: string;
};

/** The `:root` block of globals.css on 2026-09-05, used when a token is missing. */
export const GREEN_PHOSPHOR: ArcadeTheme = {
  ink: "#33ff66",
  bright: "#6effa3",
  dim: "#1f8f3a",
  line: "rgba(51, 255, 102, 0.22)",
  accent: "#ffb000",
  accentBright: "#ffc94d",
  bg: "#0a0e0a",
  panel: "#0c120c",
  display: "VT323, monospace",
  mono: "ui-monospace, Consolas, monospace",
};

const COLOUR = /^(#[0-9a-f]{3,8}|rgba?\([^)]*\))$/i;

function usableColour(value: string | undefined | null): string | null {
  const trimmed = (value ?? "").trim();
  return COLOUR.test(trimmed) ? trimmed : null;
}

function usableFont(value: string | undefined | null): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 && !trimmed.startsWith("#") ? trimmed : null;
}

export function readArcadeTheme(read: (name: string) => string): ArcadeTheme {
  const colour = (name: string, fallback: string) => usableColour(read(name)) ?? fallback;
  const font = (name: string, fallback: string) => usableFont(read(name)) ?? fallback;
  return {
    ink: colour("--green", GREEN_PHOSPHOR.ink),
    bright: colour("--green-bright", GREEN_PHOSPHOR.bright),
    dim: colour("--green-dim", GREEN_PHOSPHOR.dim),
    line: colour("--green-line", GREEN_PHOSPHOR.line),
    accent: colour("--amber", GREEN_PHOSPHOR.accent),
    accentBright: colour("--amber-bright", GREEN_PHOSPHOR.accentBright),
    bg: colour("--bg", GREEN_PHOSPHOR.bg),
    panel: colour("--bg-panel", GREEN_PHOSPHOR.panel),
    display: font("--font-display", GREEN_PHOSPHOR.display),
    mono: font("--font-mono", GREEN_PHOSPHOR.mono),
  };
}

/** The red, green and blue of a hex or rgb(a) colour, or null when it is neither. */
export function parseRgb(colour: string): [number, number, number] | null {
  const value = colour.trim();
  const hex = /^#([0-9a-f]{3,8})$/i.exec(value);
  if (hex) {
    let digits = hex[1];
    if (digits.length === 3 || digits.length === 4) digits = [...digits].map((d) => d + d).join("");
    if (digits.length !== 6 && digits.length !== 8) return null;
    return [parseInt(digits.slice(0, 2), 16), parseInt(digits.slice(2, 4), 16), parseInt(digits.slice(4, 6), 16)];
  }
  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(value);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return null;
}

/** The same colour at a different opacity. Unparseable input comes back untouched. */
export function withAlpha(colour: string, alpha: number): string {
  const rgb = parseRgb(colour);
  if (!rgb) return colour;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}
