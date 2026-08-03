/**
 * FergusOS system bus — the shared state every animated layer reads from.
 *
 * Split deliberately in two:
 *
 *  - `SystemFrame` is mutated in place, sixty times a second, and NEVER lives in
 *    React state. The shader, cursor trail and status bar read it straight off a
 *    ref during their own frame callback, so a fast scroll costs zero re-renders.
 *  - `SystemSettings` are the discrete, user-facing switches (theme, CRT on/off,
 *    scanline intensity). These change rarely and do live in React state, because
 *    they need to re-render chrome and rewrite CSS variables.
 */

export type Theme = "green" | "amber" | "ice";

export const THEMES: Theme[] = ["green", "amber", "ice"];

export function isTheme(value: string): value is Theme {
  return (THEMES as string[]).includes(value);
}

/**
 * Phosphor colour per theme, as linear-ish 0..1 RGB for the shader. Kept in sync
 * with the `html[data-theme]` blocks in globals.css by eye — these feed the WebGL
 * layer, those feed the DOM.
 */
export const THEME_PHOSPHOR: Record<Theme, [number, number, number]> = {
  green: [0.2, 1.0, 0.4],
  amber: [1.0, 0.66, 0.18],
  ice: [0.55, 0.87, 1.0],
};

/** Per-frame values. Mutated in place; never cloned, never set into state. */
export type SystemFrame = {
  /** Pointer in 0..1 viewport space. */
  pointerX: number;
  pointerY: number;
  /** 1 while the pointer is over the page, easing to 0 when it leaves. */
  pointerActive: number;
  /** What `pointerActive` is easing towards. Set by the pointer listeners. */
  pointerTargetActive: number;
  /** Smoothed scroll speed, normalised so ordinary scrolling sits near 0..1. */
  scrollVelocity: number;
  /** 0..1 down the document. */
  scrollProgress: number;
  /** performance.now() of the last degauss pulse, or -Infinity when idle. */
  degaussAt: number;
  /** performance.now() of the last tap, or -Infinity when idle. */
  tapAt: number;
  /** Where that tap landed, in 0..1 viewport space. */
  tapX: number;
  tapY: number;
  /** 1 while a finger is held down. Distinct from `pointerActive`, which a mouse
   *  raises merely by existing — on touch there is no hover, so "is the user
   *  touching the glass right now" is its own signal. */
  touchDown: number;
  /** performance.now() until which digital rain is boosted to full. */
  rainBoostUntil: number;
  /** 0 while booting, 1 once the desktop is live. Fades the shader in. */
  live: number;
  /** What `live` is easing towards. Driven by the boot sequence. */
  targetLive: number;
  /** Rolling frames-per-second estimate, for the status bar. */
  fps: number;
  /** ms since the system booted, for uptime readouts. */
  uptimeMs: number;
};

export function createSystemFrame(): SystemFrame {
  return {
    pointerX: 0.5,
    pointerY: 0.5,
    pointerActive: 0,
    pointerTargetActive: 0,
    scrollVelocity: 0,
    scrollProgress: 0,
    degaussAt: -Infinity,
    tapAt: -Infinity,
    tapX: 0.5,
    tapY: 0.5,
    touchDown: 0,
    rainBoostUntil: -Infinity,
    live: 1,
    targetLive: 1,
    fps: 60,
    uptimeMs: 0,
  };
}

export type SystemSettings = {
  theme: Theme;
  /** Master switch for the CRT illusion (scanlines, shader, curvature). */
  crtEnabled: boolean;
  /** 0..1 scanline/mask intensity. */
  scanlines: number;
};

export const DEFAULT_SETTINGS: SystemSettings = {
  theme: "green",
  crtEnabled: true,
  scanlines: 0.55,
};

export const SETTINGS_KEY = "fergusos_settings";

/**
 * Read persisted settings. Tolerates absent, malformed, or partial storage —
 * anything unreadable falls back to defaults rather than throwing.
 */
export function loadSettings(): SystemSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<SystemSettings>;
    return {
      theme: typeof parsed.theme === "string" && isTheme(parsed.theme) ? parsed.theme : DEFAULT_SETTINGS.theme,
      crtEnabled: typeof parsed.crtEnabled === "boolean" ? parsed.crtEnabled : DEFAULT_SETTINGS.crtEnabled,
      scanlines:
        typeof parsed.scanlines === "number" && Number.isFinite(parsed.scanlines)
          ? Math.min(1, Math.max(0, parsed.scanlines))
          : DEFAULT_SETTINGS.scanlines,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: SystemSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* private mode / quota — the site works fine unpersisted */
  }
}

/** Format a duration the way `uptime` would. */
export function formatUptime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/**
 * Render scroll position as a fake memory address, so the status bar reads like
 * a debugger rather than a progress percentage.
 */
export function memoryAddress(progress: number): string {
  const clamped = Math.min(1, Math.max(0, progress));
  const addr = Math.floor(clamped * 0xfffff) + 0x400000;
  return `0x${addr.toString(16).toUpperCase().padStart(8, "0")}`;
}
