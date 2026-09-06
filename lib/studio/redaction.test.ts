import { it, expect } from "vitest";
import {
  editMasks,
  undoMasks,
  redoMasks,
  moveMask,
  matchingBoxes,
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
