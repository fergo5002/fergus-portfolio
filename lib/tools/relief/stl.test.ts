import { describe, it, expect } from "vitest";
import { HOURS, WEEKS, type Field } from "./types";
import { buildHeightmap } from "./heightmap";
import { demoEvents } from "./demo";
import {
  BASE_MM,
  CELL_MM,
  RELIEF_MM,
  STL_HEADER,
  buildMesh,
  openEdges,
  signedVolume,
  triangleCount,
  writeBinaryStl,
} from "./stl";

const field: Field = buildHeightmap(demoEvents()).field;
const mesh = buildMesh(field);

const tiny: Field = [
  [0, 0.5],
  [1, 0.25],
];

describe("triangleCount", () => {
  it("is the top, the base and the skirt", () => {
    expect(triangleCount(HOURS, WEEKS)).toBe(23 * 51 * 2 + 23 * 51 * 2 + 2 * (51 + 23) * 2);
    expect(triangleCount(HOURS, WEEKS)).toBe(4988);
    expect(triangleCount(2, 2)).toBe(2 + 2 + 2 * (1 + 1) * 2);
  });
});

describe("buildMesh", () => {
  it("makes exactly the triangles the formula says", () => {
    expect(mesh).toHaveLength(triangleCount(HOURS, WEEKS));
    expect(buildMesh(tiny)).toHaveLength(triangleCount(2, 2));
  });

  it("puts the plate where the plan says", () => {
    const xs = mesh.flat().map((v) => v[0]);
    const ys = mesh.flat().map((v) => v[1]);
    const zs = mesh.flat().map((v) => v[2]);
    expect(Math.min(...xs)).toBe(0);
    expect(Math.max(...xs)).toBe((WEEKS - 1) * CELL_MM);
    expect(Math.min(...ys)).toBe(0);
    expect(Math.max(...ys)).toBe((HOURS - 1) * CELL_MM);
    expect(Math.min(...zs)).toBe(0);
    expect(Math.max(...zs)).toBeLessThanOrEqual(BASE_MM + RELIEF_MM + 1e-9);
    // No zero-thickness region: even a flat cell has the base under it.
    expect(zs.filter((z) => z > 0).every((z) => z >= BASE_MM - 1e-9)).toBe(true);
  });

  /**
   * The classic failure. Every directed edge exactly once, and every one with
   * its opposite present, is a closed orientable manifold: each undirected
   * edge is shared by exactly two triangles wound the opposite way. A printer
   * rejects anything less, and the repair some slicers do instead is worse
   * than a rejection because it is silent.
   */
  it("is watertight", () => {
    expect(openEdges(mesh)).toEqual([]);
  });

  it("is watertight on the smallest possible field too", () => {
    expect(openEdges(buildMesh(tiny))).toEqual([]);
  });

  it("winds every face outward, which a positive volume proves", () => {
    const v = signedVolume(mesh);
    const footprint = (WEEKS - 1) * CELL_MM * ((HOURS - 1) * CELL_MM);
    expect(v).toBeGreaterThan(footprint * BASE_MM * 0.99);
    expect(v).toBeLessThan(footprint * (BASE_MM + RELIEF_MM));
  });

  it("refuses a field too small to have a cell in it", () => {
    expect(buildMesh([[0.5]])).toEqual([]);
    expect(buildMesh([])).toEqual([]);
  });
});

describe("openEdges", () => {
  /**
   * Proving the guard can fail. A single triangle is the simplest open mesh
   * there is, and if this returned [] the watertight test above would be
   * decoration.
   */
  it("reports a lone triangle as open", () => {
    const one: [number, number, number][][] = [
      [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
      ],
    ];
    expect(openEdges(one as never)).toHaveLength(3);
  });

  it("reports a doubled triangle, which has every edge twice the same way round", () => {
    const t: [number, number, number][] = [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
    ];
    expect(openEdges([t, t] as never).length).toBeGreaterThan(0);
  });
});

describe("writeBinaryStl", () => {
  const buffer = writeBinaryStl(mesh);
  const view = new DataView(buffer);

  it("is 84 bytes plus 50 a triangle", () => {
    expect(buffer.byteLength).toBe(84 + 50 * mesh.length);
    expect(buffer.byteLength).toBe(249484);
  });

  it("declares the triangle count little-endian at offset 80", () => {
    expect(view.getUint32(80, true)).toBe(mesh.length);
  });

  it("does not start with the word solid, which some parsers read as ASCII", () => {
    const header = new TextDecoder().decode(new Uint8Array(buffer, 0, 80));
    expect(header.startsWith("solid")).toBe(false);
    expect(header.startsWith(STL_HEADER.slice(0, 6))).toBe(true);
  });

  it("writes the first triangle's vertices where the layout says", () => {
    const [a] = mesh[0];
    expect(view.getFloat32(96, true)).toBeCloseTo(a[0], 5);
    expect(view.getFloat32(100, true)).toBeCloseTo(a[1], 5);
    expect(view.getFloat32(104, true)).toBeCloseTo(a[2], 5);
    expect(view.getUint16(132, true)).toBe(0);
  });

  it("writes a unit normal for every triangle, never a NaN", () => {
    for (let i = 0; i < mesh.length; i++) {
      const at = 84 + 50 * i;
      const n = [0, 4, 8].map((o) => view.getFloat32(at + o, true));
      expect(Number.isFinite(n[0] + n[1] + n[2])).toBe(true);
      expect(Math.hypot(n[0], n[1], n[2])).toBeCloseTo(1, 4);
    }
  });

  it("writes an empty mesh as a valid 84-byte file", () => {
    const empty = writeBinaryStl([]);
    expect(empty.byteLength).toBe(84);
    expect(new DataView(empty).getUint32(80, true)).toBe(0);
  });
});
