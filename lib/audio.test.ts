import { describe, expect, it } from "vitest";
import {
  TubeAudio,
  beamNoiseGain,
  clamp01,
  impactFreq,
  impactGain,
  FLYBACK_HZ,
} from "./audio";

describe("clamp01", () => {
  it("clamps both ends and passes the middle through", () => {
    expect(clamp01(-3)).toBe(0);
    expect(clamp01(0.42)).toBe(0.42);
    expect(clamp01(9)).toBe(1);
  });

  it("treats NaN as silence rather than propagating it into a gain node", () => {
    expect(clamp01(NaN)).toBe(0);
  });
});

describe("impactGain", () => {
  it("is silent below the audible threshold", () => {
    expect(impactGain(0)).toBe(0);
    expect(impactGain(0.01)).toBe(0);
  });

  it("rises with energy and stays under the ceiling", () => {
    const soft = impactGain(0.2);
    const hard = impactGain(0.9);
    expect(soft).toBeGreaterThan(0);
    expect(hard).toBeGreaterThan(soft);
    expect(impactGain(50)).toBeLessThanOrEqual(0.22);
  });
});

describe("impactFreq", () => {
  it("drops in pitch as the impact gets heavier, like a bigger object", () => {
    expect(impactFreq(0.9, 0)).toBeLessThan(impactFreq(0.1, 0));
  });

  it("stays inside an audible band", () => {
    for (let e = 0; e <= 1; e += 0.05) {
      for (let s = 0; s < 5; s++) {
        const f = impactFreq(e, s);
        expect(f).toBeGreaterThan(60);
        expect(f).toBeLessThan(2000);
      }
    }
  });

  it("varies by seed so a pile of impacts is not one repeated note", () => {
    const a = impactFreq(0.5, 1);
    const b = impactFreq(0.5, 2);
    expect(a).not.toBe(b);
  });

  it("is deterministic for the same seed", () => {
    expect(impactFreq(0.5, 7)).toBe(impactFreq(0.5, 7));
  });
});

describe("beamNoiseGain", () => {
  it("is silent at rest, so an idle page makes no hiss", () => {
    expect(beamNoiseGain(0)).toBe(0);
  });

  it("ignores the sign of the scroll direction", () => {
    expect(beamNoiseGain(-0.6)).toBeCloseTo(beamNoiseGain(0.6), 8);
  });

  it("rises with speed and is capped", () => {
    expect(beamNoiseGain(0.8)).toBeGreaterThan(beamNoiseGain(0.2));
    expect(beamNoiseGain(99)).toBeLessThanOrEqual(0.05);
  });
});

describe("tube frequencies", () => {
  it("uses the real horizontal line frequency of a 625-line tube", () => {
    // 15625 Hz = 15.625 kHz: 625 lines x 25 frames. Now only heard as the
    // target of the power-on sweep; it no longer runs as a continuous tone.
    expect(FLYBACK_HZ).toBe(15625);
  });
});

describe("TubeAudio without Web Audio", () => {
  // Node has no AudioContext. Every method must be inert rather than throwing,
  // because the alternative is one unsupported browser taking down the page.
  it("constructs, reports itself unavailable, and no-ops on every call", () => {
    const a = new TubeAudio();
    expect(a.running).toBe(false);
    expect(() => {
      a.setBeam(0.5);
      a.key();
      a.relay();
      a.degauss();
      a.powerOn();
      a.impact(0.4);
      a.thud();
      a.eject(1);
      a.hover();
      a.setMuted(true);
      a.suspend();
      a.dispose();
    }).not.toThrow();
  });

  it("stays unavailable when enable() cannot build a context", async () => {
    const a = new TubeAudio();
    await expect(a.enable()).resolves.toBe(false);
    expect(a.running).toBe(false);
  });
});
