import { describe, expect, it } from "vitest";
import { screenCopy } from "@/content/arcade-collection";
import { createGame } from "../engine";
import { captionOf, chipGeometry, spawnProcess } from "../games/panic";
import { paletteFor } from "./kit";
import { GREEN_PHOSPHOR } from "../theme";
import { chipLeft, drawPanic, dumpLines } from "./panic";

/**
 * Two pure pieces of Kernel Panic's drawing: the panic dump's text, and where
 * a name is drawn so a long command near the edge stays on the glass. How any
 * of it looks is for the screenshots.
 */
describe("the panic dump", () => {
  const dump = { at: 42.318201, comm: "rm -rf /tmp", pid: 4021, code: 0x1f2e3d4c };

  it("says the kernel panicked, names the process that did it, and is the same every time", () => {
    const lines = dumpLines(dump, screenCopy.panicDump, true);
    expect(lines.length).toBe(screenCopy.panicDump.length);
    expect(lines[0]).toMatch(/^\[\s+42\.318201\] Kernel panic - not syncing:/);
    expect(lines.join("\n")).toContain("PID: 4021 Comm: rm -rf /tmp");
    expect(lines.join("\n")).not.toMatch(/\{\w+\}/);
    expect(dumpLines(dump, screenCopy.panicDump, true)).toEqual(lines);
    expect(dumpLines({ ...dump, code: 7 }, screenCopy.panicDump, true)).not.toEqual(lines);
  });

  it("drops the timestamps where the screen is narrow", () => {
    const lines = dumpLines(dump, screenCopy.panicDump, false);
    expect(lines[0]).toMatch(/^Kernel panic - not syncing:/);
    for (const line of lines) expect(line).not.toMatch(/^\[/);
  });
});

const sizeOf = (font: string) => Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 0);

describe("chips are drawn to the model the spawner spaces them by", () => {
  /** Records every strokeRect and every fillText with its maxWidth; measureText is deliberately wider than the model allows. */
  function recording() {
    const rects: { x: number; y: number; w: number; h: number }[] = [];
    const texts: { value: string; x: number; y: number; max?: number; font: string }[] = [];
    const target: Record<string, unknown> = { canvas: { width: 900, height: 560 }, font: "" };
    const ctx = new Proxy(target, {
      get(t, prop: string) {
        if (prop in t) return t[prop];
        // A glyph 0.8 of the font size wide: wider than the model's advance, so the drawer has to fit.
        if (prop === "measureText") return (v: string) => ({ width: [...v].length * 0.8 * sizeOf(String(t.font)) });
        if (prop === "strokeRect") return (x: number, y: number, w: number, h: number) => rects.push({ x: x - 0.5, y: y - 0.5, w, h });
        if (prop === "fillText") return (value: string, x: number, y: number, max?: number) => texts.push({ value, x, y, max, font: String(t.font) });
        return () => undefined;
      },
      set(t, prop: string, value) { t[prop] = value; return true; },
    }) as unknown as CanvasRenderingContext2D;
    return { ctx, rects, texts };
  }

  for (const layout of ["wide", "tall"] as const) {
    it(`${layout}: frames each chip at chipGeometry and fits its name, pid and caption inside`, () => {
      const s = createGame("panic", 3);
      s.processes = [];
      const procs = [spawnProcess(s, "mkfs.ext4 /dev/sda", "proc", 880, 200, 20), spawnProcess(s, "fork()", "fork", 30, 330, 20), spawnProcess(s, "sudo", "sudo", 450, 120, 20)];
      const { ctx, rects, texts } = recording();
      drawPanic({ c: ctx, p: paletteFor(GREEN_PHOSPHOR), theme: GREEN_PHOSPHOR }, s, true, layout);
      for (const p of procs) {
        const g = chipGeometry(p, layout);
        const same = (r: { x: number; y: number; w: number; h: number }) => Math.abs(r.x - g.chip.x) < 0.01 && Math.abs(r.y - g.chip.y) < 0.01 && Math.abs(r.w - g.chip.w) < 0.01 && Math.abs(r.h - g.chip.h) < 0.01;
        expect(rects.some(same), `${p.name}: drew ${JSON.stringify(rects)}, model ${JSON.stringify(g.chip)}`).toBe(true);
        // The name, drawn at whatever size fits inside the model's chip.
        const name = texts.filter((t) => t.value === p.name);
        expect(name.length, p.name).toBeGreaterThan(0);
        for (const t of name) {
          expect(t.x, `${p.name} starts inside its chip`).toBeGreaterThanOrEqual(g.chip.x - 0.01);
          expect(t.x + [...p.name].length * 0.8 * sizeOf(t.font), `${p.name} ends inside its chip`).toBeLessThanOrEqual(g.chip.x + g.chip.w + 0.01);
        }
        const label = texts.find((t) => /pid \d+/.test(t.value) && Math.abs(t.x - g.label.x) < 0.01);
        expect(label?.max, `${p.name}: pid label squeezed to the model`).toBeLessThanOrEqual(g.label.w + 0.01);
        if (g.caption) {
          const caption = texts.find((t) => t.value === captionOf(p.kind));
          expect(caption?.x).toBeCloseTo(g.caption.x);
          expect(caption?.max, `${p.name}: caption squeezed to the model`).toBeLessThanOrEqual(g.caption.w + 0.01);
        }
      }
    });
  }
});

describe("a name's place on the glass", () => {
  it("is centred on the process, and pushed in from either edge when it would not fit", () => {
    expect(chipLeft(450, 100)).toBe(400);
    expect(chipLeft(30, 200)).toBeGreaterThanOrEqual(12);
    expect(chipLeft(880, 200) + 200).toBeLessThanOrEqual(888);
  });
});
