import { describe, expect, it, vi } from "vitest";
import { BLOOM_THRESHOLD } from "./bloom";
import { newSalt } from "./hash";
import { MAX_FRAME_CHARS, fingerprintOf, pairedChannels, runExchange, safetyString } from "./protocol";
import type { Entry } from "./types";

const person = (slug: string, label = slug): Entry => ({ slug, label });

const OFFER_FP =
  "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99";
const ANSWER_FP = OFFER_FP.split(":").reverse().join(":");

/** Both sides of one exchange, run to completion, in one process. */
async function meet(a: Entry[], b: Entry[], overrides: Partial<Parameters<typeof runExchange>[0]> = {}) {
  const [left, right] = pairedChannels();
  const fingerprints = { offer: OFFER_FP, answer: ANSWER_FP };
  const [ra, rb] = await Promise.all([
    runExchange({ side: "creator", entries: a, channel: left, fingerprints, ...overrides }),
    runExchange({ side: "joiner", entries: b, channel: right, fingerprints, ...overrides }),
  ]);
  return { ra, rb };
}

describe("runExchange, exact mode", () => {
  it("finds the people in both lists and nobody else", async () => {
    const { ra, rb } = await meet(
      [person("aoife-1"), person("cormac-2"), person("deirdre-3")],
      [person("cormac-2"), person("deirdre-3"), person("eoin-4"), person("fiadh-5")],
    );
    expect(ra.shared.map((e) => e.slug)).toEqual(["cormac-2", "deirdre-3"]);
    expect(rb.shared.map((e) => e.slug)).toEqual(["cormac-2", "deirdre-3"]);
  });

  it("fills every name from the local file and never from the wire", async () => {
    const { ra, rb } = await meet(
      [person("sine-ni-dhomhnaill", "Síne Ní Dhomhnaill")],
      [person("sine-ni-dhomhnaill", "Sine Ni Dhomhnaill")],
    );
    expect(ra.shared[0].label).toBe("Síne Ní Dhomhnaill");
    expect(rb.shared[0].label).toBe("Sine Ni Dhomhnaill");
  });

  it("finds nobody when there is nobody, without failing", async () => {
    const { ra, rb } = await meet([person("a")], [person("b")]);
    expect(ra.shared).toEqual([]);
    expect(rb.shared).toEqual([]);
    expect(ra.theirs).toBe(1);
  });

  it("sorts the result by label so two tabs read the same way", async () => {
    const both = ["zeta", "alpha", "mu"].map((s) => person(s, s.toUpperCase()));
    const { ra } = await meet(both, both);
    expect(ra.shared.map((e) => e.label)).toEqual(["ALPHA", "MU", "ZETA"]);
  });

  it("reports both list sizes and the mode", async () => {
    const { ra, rb } = await meet([person("a"), person("b")], [person("b")]);
    expect(ra.mine).toBe(2);
    expect(ra.theirs).toBe(1);
    expect(ra.mode).toBe("exact");
    expect(ra.falsePositives).toBeNull();
    expect(rb.mine).toBe(1);
  });

  it("agrees on a salt, and only the creator makes one", async () => {
    const fill = vi.fn((b: Uint8Array) => b.fill(9));
    const [left, right] = pairedChannels();
    const fingerprints = { offer: OFFER_FP, answer: ANSWER_FP };
    await Promise.all([
      runExchange({ side: "creator", entries: [person("a")], channel: left, fingerprints, random: fill }),
      runExchange({ side: "joiner", entries: [person("a")], channel: right, fingerprints, random: fill }),
    ]);
    expect(fill).toHaveBeenCalledTimes(1);
  });

  it("chunks a list that will not fit in one message", async () => {
    const many = Array.from({ length: 3_000 }, (_, i) => person(`p${i}`));
    const [left, right] = pairedChannels();
    const sent: string[] = [];
    const watched = {
      ...left,
      send: (t: string) => {
        sent.push(t);
        left.send(t);
      },
    };
    const fingerprints = { offer: OFFER_FP, answer: ANSWER_FP };
    const [ra] = await Promise.all([
      runExchange({ side: "creator", entries: many, channel: watched, fingerprints }),
      runExchange({ side: "joiner", entries: many, channel: right, fingerprints }),
    ]);
    expect(ra.shared).toHaveLength(3_000);
    expect(sent.filter((t) => t.includes('"part"')).length).toBeGreaterThan(1);
    for (const frame of sent) expect(frame.length).toBeLessThanOrEqual(MAX_FRAME_CHARS + 200);
  });
});

describe("runExchange, bloom mode", () => {
  it("sends a filter above the threshold and an exact list below it", async () => {
    const big = Array.from({ length: 40 }, (_, i) => person(`big${i}`));
    const small = Array.from({ length: 5 }, (_, i) => person(`big${i}`));
    // The threshold is lowered for the test rather than building 10,001 entries,
    // which would make this file slow for no extra assurance.
    const { ra, rb } = await meet(big, small, { bloomThreshold: 10 });
    expect(ra.mode).toBe("bloom");
    expect(rb.mode).toBe("exact");
    // Each side reports the mode of what it received, so the page can print the
    // right sentence. `rb` was handed a filter.
    expect(rb.theirMode).toBe("bloom");
    expect(ra.theirMode).toBe("exact");
    expect(rb.falsePositives).toBeGreaterThan(0);
    expect(rb.shared.map((e) => e.slug).sort()).toEqual(small.map((e) => e.slug).sort());
  });

  it("still keeps the design's threshold as the default", () => {
    expect(BLOOM_THRESHOLD).toBe(10_000);
  });
});

describe("the safety string", () => {
  it("is four characters from the room alphabet", async () => {
    const s = await safetyString(newSalt(), OFFER_FP, ANSWER_FP);
    expect(s).toMatch(/^[234679FKMRW]{4}$/);
  });

  it("is the same on both sides of one exchange", async () => {
    const { ra, rb } = await meet([person("a")], [person("a")]);
    expect(ra.safety).toBe(rb.safety);
  });

  it("changes when either fingerprint changes, which is the whole point", async () => {
    const salt = newSalt();
    const base = await safetyString(salt, OFFER_FP, ANSWER_FP);
    expect(await safetyString(salt, ANSWER_FP, ANSWER_FP)).not.toBe(base);
    expect(await safetyString(salt, OFFER_FP, OFFER_FP)).not.toBe(base);
    expect(await safetyString(newSalt(), OFFER_FP, ANSWER_FP)).not.toBe(base);
  });

  it("reads a DTLS fingerprint out of an SDP and says so when there is none", () => {
    expect(fingerprintOf(`v=0\r\na=fingerprint:sha-256 ${OFFER_FP}\r\n`)).toBe(OFFER_FP);
    expect(fingerprintOf("v=0\r\na=nothing\r\n")).toBe("");
  });
});

describe("what it refuses", () => {
  it("refuses a frame it cannot read rather than carrying on", async () => {
    const [left, right] = pairedChannels();
    const fingerprints = { offer: OFFER_FP, answer: ANSWER_FP };
    const run = runExchange({ side: "joiner", entries: [person("a")], channel: right, fingerprints });
    left.send("not json at all");
    await expect(run).rejects.toThrow(/protocol/);
  });

  it("refuses a salt of the wrong size", async () => {
    const [left, right] = pairedChannels();
    const fingerprints = { offer: OFFER_FP, answer: ANSWER_FP };
    const run = runExchange({ side: "joiner", entries: [person("a")], channel: right, fingerprints });
    left.send(JSON.stringify({ t: "salt", v: btoa("short") }));
    await expect(run).rejects.toThrow();
  });

  it("refuses a version it does not know", async () => {
    const [left, right] = pairedChannels();
    const fingerprints = { offer: OFFER_FP, answer: ANSWER_FP };
    const run = runExchange({ side: "joiner", entries: [person("a")], channel: right, fingerprints });
    left.send(JSON.stringify({ t: "meta", version: 99, mode: "exact", count: 0 }));
    await expect(run).rejects.toThrow(/protocol/);
  });
});

describe("what crosses the wire", () => {
  /**
   * The central promise, checked on the frames themselves. Every message is
   * captured and searched for a slug and for a label. A slug appearing here
   * would mean the tool sends the list it says it does not.
   */
  it("carries no slug and no name in any frame", async () => {
    const [left, right] = pairedChannels();
    const traffic: string[] = [];
    const tap = (c: typeof left) => ({
      ...c,
      send: (t: string) => {
        traffic.push(t);
        c.send(t);
      },
    });
    const fingerprints = { offer: OFFER_FP, answer: ANSWER_FP };
    const a = [person("sine-ni-dhomhnaill", "Síne Ní Dhomhnaill"), person("cormac-x", "Cormac X")];
    const b = [person("cormac-x", "Cormac Ecks")];
    await Promise.all([
      runExchange({ side: "creator", entries: a, channel: tap(left), fingerprints }),
      runExchange({ side: "joiner", entries: b, channel: tap(right), fingerprints }),
    ]);
    const wire = traffic.join("\n");
    for (const secret of ["sine-ni-dhomhnaill", "cormac-x", "Síne", "Cormac", "Ecks"]) {
      expect(wire, `"${secret}" reached the wire`).not.toContain(secret);
    }
    expect(traffic.length).toBeGreaterThan(0);
  });

  it("carries only the frame kinds the protocol defines", async () => {
    const [left, right] = pairedChannels();
    const kinds = new Set<string>();
    const tap = (c: typeof left) => ({
      ...c,
      send: (t: string) => {
        kinds.add(JSON.parse(t).t);
        c.send(t);
      },
    });
    const fingerprints = { offer: OFFER_FP, answer: ANSWER_FP };
    await Promise.all([
      runExchange({ side: "creator", entries: [person("a")], channel: tap(left), fingerprints }),
      runExchange({ side: "joiner", entries: [person("a")], channel: tap(right), fingerprints }),
    ]);
    expect([...kinds].sort()).toEqual(["done", "meta", "part", "salt"]);
  });
});
