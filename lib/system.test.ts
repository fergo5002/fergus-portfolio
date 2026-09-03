import { describe, it, expect } from "vitest";
import {
  DEFAULT_SETTINGS,
  MAX_FRAME_IMPACTS,
  SETTINGS_KEY,
  createSystemFrame,
  formatUptime,
  isDefaultSettings,
  isTheme,
  memoryAddress,
  pushImpact,
  saveSettings,
  THEME_PHOSPHOR,
  THEMES,
} from "@/lib/system";
import type { SystemSettings } from "@/lib/system";

describe("formatUptime", () => {
  it("renders zero as a padded clock", () => {
    expect(formatUptime(0)).toBe("00:00:00");
  });

  it("rolls seconds, minutes and hours", () => {
    expect(formatUptime(5_000)).toBe("00:00:05");
    expect(formatUptime(65_000)).toBe("00:01:05");
    expect(formatUptime(3_725_000)).toBe("01:02:05");
  });

  it("keeps counting past 24 hours rather than wrapping", () => {
    expect(formatUptime(90_000_000)).toBe("25:00:00");
  });
});

describe("memoryAddress", () => {
  it("is a fixed-width hex address", () => {
    expect(memoryAddress(0)).toMatch(/^0x[0-9A-F]{8}$/);
    expect(memoryAddress(1)).toMatch(/^0x[0-9A-F]{8}$/);
  });

  it("increases with scroll progress", () => {
    const low = parseInt(memoryAddress(0.1).slice(2), 16);
    const high = parseInt(memoryAddress(0.9).slice(2), 16);
    expect(high).toBeGreaterThan(low);
  });

  it("clamps out-of-range progress instead of producing junk", () => {
    expect(memoryAddress(-5)).toBe(memoryAddress(0));
    expect(memoryAddress(99)).toBe(memoryAddress(1));
  });
});

describe("themes", () => {
  it("recognises only the known phosphors", () => {
    expect(isTheme("green")).toBe(true);
    expect(isTheme("amber")).toBe(true);
    expect(isTheme("ice")).toBe(true);
    expect(isTheme("purple")).toBe(false);
  });

  it("has a shader colour for every theme", () => {
    for (const theme of THEMES) {
      const rgb = THEME_PHOSPHOR[theme];
      expect(rgb).toHaveLength(3);
      for (const channel of rgb) {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("audio setting", () => {
  it("is off by default, whatever else is configured", () => {
    expect(DEFAULT_SETTINGS.audio).toBe(false);
  });
});

describe("pushImpact", () => {
  const impact = (energy: number) => ({ x: 0.5, y: 0.5, energy, at: 0 });

  it("collects impacts up to the shader's slot count", () => {
    const f = createSystemFrame();
    for (let i = 0; i < MAX_FRAME_IMPACTS; i++) pushImpact(f, impact(0.1 * (i + 1)));
    expect(f.impacts).toHaveLength(MAX_FRAME_IMPACTS);
  });

  it("keeps the loudest when the slots are full, not the first to arrive", () => {
    const f = createSystemFrame();
    for (let i = 0; i < MAX_FRAME_IMPACTS; i++) pushImpact(f, impact(0.5));
    pushImpact(f, impact(0.9));
    expect(f.impacts).toHaveLength(MAX_FRAME_IMPACTS);
    expect(f.impacts.some((p) => p.energy === 0.9)).toBe(true);
  });

  it("drops an impact quieter than everything already held", () => {
    const f = createSystemFrame();
    for (let i = 0; i < MAX_FRAME_IMPACTS; i++) pushImpact(f, impact(0.5));
    pushImpact(f, impact(0.01));
    expect(f.impacts.every((p) => p.energy === 0.5)).toBe(true);
  });
});

describe("saveSettings keeps only what the visitor chose", () => {
  const fake = () => {
    const map = new Map<string, string>();
    return {
      map,
      setItem: (k: string, v: string) => {
        map.set(k, v);
      },
      removeItem: (k: string) => {
        map.delete(k);
      },
    };
  };

  it("writes nothing for the defaults, and removes a stale record of them", () => {
    const s = fake();
    s.map.set(SETTINGS_KEY, "stale");
    saveSettings(DEFAULT_SETTINGS, s);
    expect(s.map.has(SETTINGS_KEY)).toBe(false);
  });

  it("writes a setting the visitor changed", () => {
    const s = fake();
    saveSettings({ ...DEFAULT_SETTINGS, theme: "amber" }, s);
    expect(JSON.parse(s.map.get(SETTINGS_KEY) ?? "null")).toMatchObject({ theme: "amber" });
  });

  it("compares every field, not just the theme", () => {
    expect(isDefaultSettings(DEFAULT_SETTINGS)).toBe(true);
    expect(isDefaultSettings({ ...DEFAULT_SETTINGS, audio: true })).toBe(false);
    expect(isDefaultSettings({ ...DEFAULT_SETTINGS, crtEnabled: false })).toBe(false);
    expect(isDefaultSettings({ ...DEFAULT_SETTINGS, scanlines: 0.4 })).toBe(false);
  });

  it("compares a field added later too, without being edited", () => {
    // `isDefaultSettings` used to hand-list the four fields, so a fifth would
    // have been ignored and a visitor who changed only that one would have had
    // their saved key removed as though they had changed nothing. A fifth
    // field arrives by being added to DEFAULT_SETTINGS, so that is what this
    // does, rather than asserting on the shape of the source. The type is left
    // alone on purpose: the point is the runtime keys, not the declaration.
    const defaults = DEFAULT_SETTINGS as unknown as Record<string, unknown>;
    defaults.glow = 0.5;
    try {
      const asSettings = (o: Record<string, unknown>) => o as unknown as SystemSettings;
      expect(isDefaultSettings(asSettings({ ...defaults }))).toBe(true);
      expect(isDefaultSettings(asSettings({ ...defaults, glow: 0.9 }))).toBe(false);

      // And the consequence that made it worth fixing: the key is kept.
      const s = fake();
      saveSettings(asSettings({ ...defaults, glow: 0.9 }), s);
      expect(s.map.has(SETTINGS_KEY)).toBe(true);
    } finally {
      delete defaults.glow;
    }
  });

  it("does nothing on the server", () => {
    expect(() => saveSettings(DEFAULT_SETTINGS)).not.toThrow();
  });
});
