import { describe, it, expect } from "vitest";
import { reliefCopy } from "@/content/tools/relief";
import {
  PNG_MIME,
  STL_MIME,
  SVG_MIME,
  type SaveEnv,
  canvasBlob,
  plateFilename,
  saveBlob,
  stlBlob,
  svgBlob,
} from "./download";

/** Records the four globals a download touches, in the order they are touched. */
function saver() {
  const calls: string[] = [];
  const deferred: (() => void)[] = [];
  const anchor = { href: "", download: "", rel: "", click: () => calls.push("click") };
  const env: SaveEnv = {
    createObjectURL: () => {
      calls.push("createObjectURL");
      return "blob:relief/one";
    },
    revokeObjectURL: (url) => calls.push(`revokeObjectURL ${url}`),
    anchor: () => {
      calls.push("anchor");
      return anchor;
    },
    defer: (run) => {
      calls.push("defer");
      deferred.push(run);
    },
  };
  return { env, calls, anchor, flush: () => deferred.splice(0).forEach((run) => run()) };
}

describe("plateFilename", () => {
  it("names the file after the tool, the source and the day", () => {
    expect(plateFilename("demo", "png", "2026-09-03T14:22:05.000Z")).toBe(
      "relief-demo-2026-09-03.png",
    );
    expect(plateFilename("csv", "svg", "2026-09-03T00:00:00.000Z")).toBe(
      "relief-csv-2026-09-03.svg",
    );
    expect(plateFilename("github", "stl", "2026-01-09T23:59:59.999Z")).toBe(
      "relief-github-2026-01-09.stl",
    );
  });

  /**
   * The name is on the visitor's disk, not in an event, but it is still the
   * one string the tool writes that outlives the tab. It carries the source
   * and the day and nothing else: no username, no token, no name lifted off
   * the file they dropped in.
   */
  it("carries nothing that came from the visitor", () => {
    // The whole shape, anchored at both ends, so anything interpolated into it
    // later fails here rather than reaching somebody's downloads folder.
    const name = plateFilename("github", "png", "2026-09-03T14:22:05.000Z");
    expect(name).toMatch(/^relief-(demo|github|csv)-\d{4}-\d{2}-\d{2}\.(png|svg|stl)$/);
  });
});

describe("the union types line up with the copy", () => {
  // `PlateSource` and `PlateKind` are declared in lib and the labels live in
  // content. Neither can see the other, so this is the seam that pins them.
  it("has a label for every source and every download", () => {
    expect(Object.keys(reliefCopy.sources).sort()).toEqual(["csv", "demo", "github"]);
    expect(Object.keys(reliefCopy.downloads).sort()).toEqual(["png", "stl", "svg"]);
  });
});

describe("the blobs", () => {
  it("wraps an SVG string as an SVG", async () => {
    const blob = svgBlob("<svg xmlns='http://www.w3.org/2000/svg'></svg>");
    expect(blob.type).toBe(`${SVG_MIME};charset=utf-8`);
    expect(await blob.text()).toContain("<svg");
  });

  it("wraps an STL buffer without re-encoding it", async () => {
    const buffer = new ArrayBuffer(134);
    new DataView(buffer).setUint8(0, 0x72);
    const blob = stlBlob(buffer);
    expect(blob.type).toBe(STL_MIME);
    expect(blob.size).toBe(134);
    expect(new Uint8Array(await blob.arrayBuffer())[0]).toBe(0x72);
  });

  it("takes a PNG off a canvas", async () => {
    const canvas = {
      toBlob(cb: (b: Blob | null) => void, type?: string) {
        cb(new Blob([type ?? ""], { type: type ?? "" }));
      },
    };
    const blob = await canvasBlob(canvas);
    expect(blob.type).toBe(PNG_MIME);
  });

  it("rejects rather than saving an empty file when the canvas gives nothing back", async () => {
    const canvas = {
      toBlob(cb: (b: Blob | null) => void) {
        cb(null);
      },
    };
    await expect(canvasBlob(canvas)).rejects.toThrow(/relief/);
  });
});

describe("saveBlob", () => {
  it("goes through the four globals in the one order that works", () => {
    const { env, calls, anchor, flush } = saver();
    saveBlob(new Blob(["x"]), "relief-demo-2026-09-03.png", env);

    // The revoke is deliberately not here. WebKit cancels a download whose
    // object URL was revoked between the click and the fetch the click starts.
    expect(calls).toEqual(["createObjectURL", "anchor", "click", "defer"]);
    expect(anchor.href).toBe("blob:relief/one");
    expect(anchor.download).toBe("relief-demo-2026-09-03.png");
    expect(anchor.rel).toBe("noopener");

    flush();
    expect(calls.at(-1)).toBe("revokeObjectURL blob:relief/one");
  });

  it("still revokes when the click throws, so a failure does not leak the blob", () => {
    const { env, calls, flush } = saver();
    const angry: SaveEnv = {
      ...env,
      anchor: () => ({
        href: "",
        download: "",
        rel: "",
        click: () => {
          throw new Error("no");
        },
      }),
    };
    expect(() => saveBlob(new Blob(["x"]), "relief-demo-2026-09-03.stl", angry)).toThrow("no");
    flush();
    expect(calls.some((c) => c.startsWith("revokeObjectURL"))).toBe(true);
  });
});

/**
 * The promise on the page is that nothing is uploaded. Every export is a pure
 * function over data already in the tab plus four browser globals, and none of
 * those four is a network call. This asserts it rather than believing it: the
 * whole export path runs with `fetch` replaced by something that counts and
 * throws, and the count has to be zero.
 */
describe("exporting touches no network", () => {
  it("builds and saves all three without a single fetch", async () => {
    const real = globalThis.fetch;
    let reached = 0;
    globalThis.fetch = (() => {
      reached++;
      throw new Error("relief: an export reached the network");
    }) as typeof fetch;

    try {
      const { env } = saver();
      saveBlob(
        svgBlob("<svg xmlns='http://www.w3.org/2000/svg'></svg>"),
        plateFilename("demo", "svg", "2026-09-03T00:00:00.000Z"),
        env,
      );
      saveBlob(
        stlBlob(new ArrayBuffer(84)),
        plateFilename("demo", "stl", "2026-09-03T00:00:00.000Z"),
        env,
      );
      const canvas = {
        toBlob(cb: (b: Blob | null) => void, type?: string) {
          cb(new Blob(["png"], { type }));
        },
      };
      saveBlob(
        await canvasBlob(canvas),
        plateFilename("demo", "png", "2026-09-03T00:00:00.000Z"),
        env,
      );
    } finally {
      globalThis.fetch = real;
    }

    expect(reached).toBe(0);
  });
});
