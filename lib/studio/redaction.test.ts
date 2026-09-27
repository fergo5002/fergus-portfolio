import { describe, it, expect } from "vitest";
import {
  editMasks,
  undoMasks,
  redoMasks,
  moveMask,
  matchingBoxes,
  candidateAt,
  centredMask,
  hitMask,
  pendingCandidates,
  resizeMask,
  type MaskHistory,
} from "./redaction";
it("undoes and redoes edits across pages without retaining discarded futures", () => {
  const h: MaskHistory = { past: [], present: [[], []], future: [] },
    r = { x: 1, y: 2, width: 30, height: 20 };
  const next = editMasks(h, 1, [r]);
  expect(undoMasks(next).present).toEqual([[], []]);
  expect(redoMasks(undoMasks(next)).present[1]).toEqual([r]);
  expect(editMasks(undoMasks(next), 0, [r]).future).toEqual([]);
});
it("moves rectangles without losing coverage outside the page", () => {
  expect(
    moveMask({ x: 10, y: 10, width: 20, height: 30 }, 100, -50, 80, 90),
  ).toEqual({ x: 60, y: 0, width: 20, height: 30 });
});
it("finds whole text boxes and never treats a query as a regex", () => {
  const boxes = [
    { text: "Email: demo@example.org", x: 1, y: 2, width: 100, height: 20 },
    { text: "total [42]", x: 3, y: 4, width: 50, height: 20 },
  ];
  expect(matchingBoxes(boxes, "[42]")).toEqual([boxes[1]]);
  expect(matchingBoxes(boxes, "", "email")).toEqual([boxes[0]]);
});

/**
 * The find line lights its candidates on the page as dashed boxes. One the
 * visitor has already covered stops being lit, a tap on a lit box covers that
 * box alone, and a mask made from the keyboard starts somewhere visible.
 */
describe("candidates on the page", () => {
  const boxes = [
    { text: "Email: a@b.org", x: 67, y: 286, width: 190, height: 32 },
    { text: "Phone: +353 85 123 4567", x: 67, y: 366, width: 310, height: 32 },
  ];

  it("stops lighting a box a mask already covers whole", () => {
    expect(pendingCandidates(boxes, [{ x: 60, y: 280, width: 200, height: 40 }])).toEqual([boxes[1]]);
  });

  it("keeps lighting a box a mask covers only in part", () => {
    // The example opens with the address masked and its label in the clear.
    expect(pendingCandidates(boxes, [{ x: 158, y: 286, width: 233, height: 32 }])).toEqual(boxes);
  });

  it("finds the lit box under a tap, the topmost when two overlap, and none off every box", () => {
    expect(candidateAt(boxes, 100, 300)).toBe(0);
    expect(candidateAt(boxes, 300, 380)).toBe(1);
    expect(candidateAt(boxes, 800, 300)).toBe(-1);
    const stacked = [boxes[0], { ...boxes[0], text: "again" }];
    expect(candidateAt(stacked, 100, 300)).toBe(1);
  });
});

describe("masks without a pointer", () => {
  it("picks the topmost mask under a point, with a little slop for a finger", () => {
    const masks = [
      { x: 10, y: 10, width: 100, height: 20 },
      { x: 50, y: 15, width: 100, height: 20 },
    ];
    expect(hitMask(masks, 60, 20)).toBe(1);
    expect(hitMask(masks, 20, 12)).toBe(0);
    expect(hitMask(masks, 5, 12, 8)).toBe(0);
    expect(hitMask(masks, 5, 12)).toBe(-1);
    expect(hitMask(masks, 400, 400, 8)).toBe(-1);
  });

  it("resizes from the bottom-right corner, never below two pixels and never off the page", () => {
    const r = { x: 10, y: 10, width: 20, height: 20 };
    expect(resizeMask(r, 5, -3, 100, 100)).toEqual({ x: 10, y: 10, width: 25, height: 17 });
    expect(resizeMask(r, -50, -50, 100, 100)).toEqual({ x: 10, y: 10, width: 2, height: 2 });
    expect(resizeMask(r, 500, 500, 100, 100)).toEqual({ x: 10, y: 10, width: 90, height: 90 });
  });

  it("starts a keyboard mask in the middle of the page, whole pixels, inside it", () => {
    const m = centredMask(900, 1160);
    expect(m.x + m.width / 2).toBeCloseTo(450, -1);
    expect(m.y + m.height / 2).toBeCloseTo(580, -1);
    for (const n of Object.values(m)) expect(Number.isInteger(n)).toBe(true);
    expect(m.width).toBeGreaterThan(40);
    expect(m.height).toBeGreaterThanOrEqual(24);
    const tiny = centredMask(30, 20);
    expect(tiny.x + tiny.width).toBeLessThanOrEqual(30);
    expect(tiny.y + tiny.height).toBeLessThanOrEqual(20);
  });
});
