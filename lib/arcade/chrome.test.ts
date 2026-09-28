import { describe, expect, it } from "vitest";
import { cabinets, screenCopy } from "@/content/arcade-collection";
import { cardCta, cardDemo } from "./chrome";
import { GAME_IDS, type GameId } from "./engine";
import { stageFor, type Rect, type StageKind } from "./layout";
import { renderRun } from "./renderer";
import { createRun, stepRun } from "./run";
import { GREEN_PHOSPHOR } from "./theme";

/**
 * The how-to-play card, from the shared chrome, for every cabinet.
 *
 * The recorder here follows the canvas transform (save, restore, translate,
 * scale, setTransform), so text the card's live demo draws is recorded where
 * it lands on the stage, not at the world coordinates it was asked for. It
 * records every string drawn and every rectangle a clip was made from.
 */

type Matrix = [number, number, number, number, number, number];
type Drawn = { value: string; x: number; y: number };

function recorder() {
  let m: Matrix = [1, 0, 0, 1, 0, 0];
  const stack: Matrix[] = [];
  let lastRect: Rect | null = null;
  const texts: Drawn[] = [], clips: Rect[] = [];
  const apply = (x: number, y: number) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });
  const target: Record<string, unknown> = { canvas: { width: 900, height: 560 } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const methods: Record<string, (...a: any[]) => unknown> = {
    save: () => { stack.push([...m] as Matrix); },
    restore: () => { m = stack.pop() ?? [1, 0, 0, 1, 0, 0]; },
    translate: (x: number, y: number) => { m = [m[0], m[1], m[2], m[3], m[4] + m[0] * x + m[2] * y, m[5] + m[1] * x + m[3] * y]; },
    scale: (x: number, y: number) => { m = [m[0] * x, m[1] * x, m[2] * y, m[3] * y, m[4], m[5]]; },
    setTransform: (a: number, b: number, c: number, d: number, e: number, f: number) => { m = [a, b, c, d, e, f]; },
    rect: (x: number, y: number, w: number, h: number) => { const p = apply(x, y), q = apply(x + w, y + h); lastRect = { x: p.x, y: p.y, w: q.x - p.x, h: q.y - p.y }; },
    clip: () => { if (lastRect) clips.push(lastRect); },
    fillText: (value: string, x: number, y: number) => { texts.push({ value: String(value), ...apply(x, y) }); },
    measureText: () => ({ width: 10 }),
  };
  const ctx = new Proxy(target, {
    get: (t, prop: string) => (prop in t ? t[prop] : methods[prop] ?? (() => undefined)),
    set: (t, prop: string, value) => { t[prop] = value; return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, texts, clips };
}

function card(id: GameId, kind: StageKind, touch: boolean) {
  const run = createRun(id, 9);
  // Let the demo put something on screen, so its own text is in the recording too.
  for (let i = 0; i < 60 * 6; i++) stepRun(run, 1 / 60, new Set());
  const stage = stageFor(id, kind);
  const face = cabinets.find((c) => c.id === id)!;
  const rec = recorder();
  renderRun(rec.ctx, run, stage.w, stage.h, GREEN_PHOSPHOR, { stage, ghost: null, touch, face, words: screenCopy });
  return { ...rec, stage, face };
}

const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("the how-to-play card", () => {
  for (const id of GAME_IDS) {
    for (const kind of ["wide", "tall"] as const) {
      for (const touch of [false, true]) {
        it(`${id}, ${kind}${touch ? ", touch" : ""}: draws no label above the title (no eyebrow)`, () => {
          const { texts, stage, face } = card(id, kind, touch);
          const title = texts.filter((t) => t.value === face.title);
          expect(title.length, "the title is drawn").toBeGreaterThan(0);
          const titleY = Math.min(...title.map((t) => t.y));
          // Wide, the demo screen has the right-hand column to itself; tall, the title spans the stage.
          const column = kind === "wide" ? (t: Drawn) => t.x < stage.w / 2 : () => true;
          const above = texts.filter((t) => t.value !== face.title && t.y <= titleY && column(t));
          expect(above.map((t) => t.value), "text drawn above the title").toEqual([]);
        });
      }

      it(`${id}, ${kind}: keeps its live demo clear of the call to action`, () => {
        const { clips, stage, face } = card(id, kind, true);
        const cta = cardCta(stage);
        const demo = cardDemo(stage, face);
        expect(overlap(demo.rect, cta), `${JSON.stringify(demo)} against ${JSON.stringify(cta)}`).toBe(false);
        // And the renderer really draws the demo inside that rectangle: it clips to it.
        expect(clips.some((r) => Math.abs(r.y - demo.rect.y) < 0.5 && Math.abs(r.y + r.h - (demo.rect.y + demo.rect.h)) < 0.5), JSON.stringify(clips)).toBe(true);
      });
    }
  }

  it("keeps the genre line under the title", () => {
    const { texts, face } = card("panic", "wide", false);
    const title = texts.find((t) => t.value === face.title)!;
    const genre = texts.find((t) => t.value === face.genre)!;
    expect(genre.y).toBeGreaterThan(title.y);
  });

  it("no longer has the words for an eyebrow", () => {
    expect(Object.values(screenCopy)).not.toContain("HOW TO PLAY");
  });
});
