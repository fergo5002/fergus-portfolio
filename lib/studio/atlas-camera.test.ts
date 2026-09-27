import { describe, expect, it } from "vitest";
import {
  K_MAX,
  K_MIN,
  boundsOf,
  centreOn,
  fitCamera,
  hitNode,
  nodeRadius,
  toScreen,
  toWorld,
  viewBoxFor,
  zoomAt,
} from "./atlas-camera";

const safe = { x: 0, y: 40, w: 800, h: 400 };

describe("the camera", () => {
  it("has no bounds for no points", () => {
    expect(boundsOf([])).toBeNull();
    expect(boundsOf([{ x: -10, y: 5 }, { x: 30, y: -20 }])).toEqual({ minX: -10, minY: -20, maxX: 30, maxY: 5 });
  });

  it("fits the bounds, padded, into the safe rectangle and centres them there", () => {
    const bounds = { minX: -100, minY: -50, maxX: 100, maxY: 50 };
    const camera = fitCamera(bounds, safe, 50);
    // 300 by 200 of world into 800 by 400 of screen: the height decides.
    expect(camera.k).toBeCloseTo(2, 6);
    const centre = toScreen(camera, { x: 0, y: 0 });
    expect(centre.x).toBeCloseTo(400, 6);
    expect(centre.y).toBeCloseTo(240, 6);
  });

  it("never fits so close that one node fills the screen, nor so far that nothing shows", () => {
    expect(fitCamera({ minX: 0, minY: 0, maxX: 0, maxY: 0 }, safe, 1).k).toBeLessThanOrEqual(K_MAX);
    expect(fitCamera({ minX: -1e6, minY: -1e6, maxX: 1e6, maxY: 1e6 }, safe, 0).k).toBeGreaterThanOrEqual(K_MIN);
  });

  it("zooms about the pointer: the world point under it stays under it", () => {
    const camera = { x: 120, y: -40, k: 0.8 };
    const before = toWorld(camera, { x: 300, y: 200 });
    const after = zoomAt(camera, 1.7, 300, 200);
    expect(after.k).toBeCloseTo(1.36, 6);
    const back = toScreen(after, before);
    expect(back.x).toBeCloseTo(300, 6);
    expect(back.y).toBeCloseTo(200, 6);
    expect(zoomAt(camera, 1e9, 0, 0).k).toBe(K_MAX);
    expect(zoomAt(camera, 1e-9, 0, 0).k).toBe(K_MIN);
  });

  it("converts between screen and world both ways", () => {
    const camera = { x: 17, y: -3, k: 1.5 };
    const p = toScreen(camera, toWorld(camera, { x: 91, y: 44 }));
    expect(p.x).toBeCloseTo(91, 9);
    expect(p.y).toBeCloseTo(44, 9);
  });

  it("centres a point in the safe rectangle without changing the zoom", () => {
    const camera = centreOn({ x: 0, y: 0, k: 2 }, { x: 10, y: 20 }, safe);
    expect(camera.k).toBe(2);
    expect(toScreen(camera, { x: 10, y: 20 })).toEqual({ x: 400, y: 240 });
  });

  it("writes the same framing as an SVG viewBox, for the picture drawn before the script arrives", () => {
    expect(viewBoxFor({ minX: -100.26, minY: -50, maxX: 100, maxY: 50.04 }, 40)).toBe("-140.3 -90 280.3 180");
  });
});

describe("hitting a node", () => {
  const nodes = [
    { id: "a", kind: "md", degree: 1, x: 0, y: 0 },
    { id: "b", kind: "md", degree: 1, x: 30, y: 0 },
    { id: "f", kind: "folder", degree: 9, x: 200, y: 200 },
  ];
  const camera = { x: 0, y: 0, k: 1 };

  it("sizes folders larger than files and files by how connected they are, within a cap", () => {
    expect(nodeRadius({ kind: "folder", degree: 1 })).toBeGreaterThan(nodeRadius({ kind: "md", degree: 1 }));
    expect(nodeRadius({ kind: "md", degree: 9 })).toBeGreaterThan(nodeRadius({ kind: "md", degree: 0 }));
    expect(nodeRadius({ kind: "md", degree: 10_000 })).toBe(nodeRadius({ kind: "md", degree: 16 }));
  });

  it("takes the nearest node within the slop, in screen pixels", () => {
    expect(hitNode(nodes, camera, 12, 0, 14)?.id).toBe("a");
    expect(hitNode(nodes, camera, 18, 0, 14)?.id).toBe("b");
    expect(hitNode(nodes, camera, 100, 100, 14)).toBeUndefined();
  });

  it("keeps the slop a finger's width however far out the map is zoomed", () => {
    // At a tenth of the size, 12 screen pixels is 120 world units: still a hit.
    expect(hitNode(nodes, { x: 0, y: 0, k: 0.1 }, -12, 0, 14)?.id).toBe("a");
  });
});
