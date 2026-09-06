import { describe, expect, it } from "vitest";
import { simulateService } from "./service";
import { findWindows, parseForecast } from "./weather";
import { parseTrace, traceSummary } from "./trace";
import { compareAnswers, parseAnswerFile } from "./alignment";
import { estimate } from "./estimate";
import { scheduleDoubles } from "./schedule";
import { investigate, scoreCase } from "./investigation";
import { parseChat, analyseChat } from "./chat";
import { normaliseRect, coveredPixels } from "./redact";
import {
  parseCalendar,
  freeBlocks,
  moveEvent,
  calendarExport,
} from "./calendar";
import { analyseFiles, compareSnapshots, parseSnapshot } from "./atlas";
import { pendulumPosition, crossings, parsePatch } from "./resonance";
import { cases } from "@/content/lab/cases";

describe("Bottleneck: work actually flows through finite capacity", () => {
  const cfg = {
    arrivalsPerHour: 20,
    duration: 120,
    servers: 1,
    service: 10,
    turnover: 0,
    capacity: 6,
    mode: "queue" as const,
    seed: 12,
  };
  it("is reproducible and adding service capacity reduces wait on identical arrivals", () => {
    const a = simulateService(cfg),
      b = simulateService({ ...cfg, servers: 4 });
    expect(simulateService(cfg)).toEqual(a);
    expect(b.averageWait).toBeLessThan(a.averageWait);
    expect(b.completed).toBeGreaterThan(a.completed);
    expect(a.people.map((p) => p.arrival)).toEqual(
      b.people.map((p) => p.arrival),
    );
  });
  it("never overlaps two customers at one server", () => {
    const run = simulateService(cfg);
    const served = run.people
      .filter((p) => p.start !== null)
      .sort((a, b) => a.start! - b.start!);
    for (let i = 1; i < served.length; i++)
      expect(served[i].start!).toBeGreaterThanOrEqual(served[i - 1].end!);
  });
  it("books bounded batches and refuses bad inputs", () => {
    const run = simulateService({
      ...cfg,
      mode: "session",
      service: 30,
      turnover: 15,
    });
    const groups = new Map<number, number>();
    run.people
      .filter((p) => p.start !== null)
      .forEach((p) => groups.set(p.start!, (groups.get(p.start!) ?? 0) + 1));
    expect([...groups.values()].every((n) => n <= 6)).toBe(true);
    expect([...groups.keys()].every((t) => t % 45 === 0)).toBe(true);
    expect(() => simulateService({ ...cfg, service: 0 })).toThrow();
  });
});

describe("Good Window: contiguous complete forecast intervals", () => {
  const start = Date.parse("2026-09-06T10:00:00Z");
  const rows = Array.from({ length: 5 }, (_, i) => ({
    at: start + i * 3600000,
    rain: i === 2 ? 3 : 0,
    wind: 8,
    temperature: 17,
    daylight: true,
  }));
  const prefs = {
    hours: 2,
    maxRain: 0.5,
    maxWind: 15,
    minTemperature: 8,
    daylight: true,
    after: start,
  };
  it("does not bridge a wet hour or a missing hour", () => {
    expect(findWindows(rows, prefs).map((w) => w.start)).toEqual([
      start,
      start + 3 * 3600000,
    ]);
    expect(findWindows([rows[0], rows[3]], prefs)).toEqual([]);
  });
  it("excludes past starts and rejects incomplete API arrays", () => {
    expect(findWindows(rows, { ...prefs, after: start + 1 })).toHaveLength(1);
    expect(() =>
      parseForecast({ hourly: { time: [1], precipitation: [] } }),
    ).toThrow();
  });
  it("does not treat a blank weather limit as an unlimited filter", () => {
    expect(() => findWindows(rows, { ...prefs, maxWind: NaN })).toThrow();
  });
});

describe("Black Box: malformed evidence is visible", () => {
  const lines = [
    {
      at: "2026-09-06T10:00:00Z",
      type: "tool",
      name: "test",
      input: "npm test",
      status: "error",
      durationMs: 300,
    },
    {
      at: "2026-09-06T10:00:02Z",
      type: "tool",
      name: "test",
      input: "npm test",
      status: "ok",
      durationMs: 400,
    },
    { at: "2026-09-06T10:00:03Z", type: "claim", text: "Complete" },
  ];
  it("imports JSONL and separates failures, repetition and claims", () => {
    const events = parseTrace(lines.map((x) => JSON.stringify(x)).join("\n"));
    expect(traceSummary(events)).toMatchObject({
      failures: 1,
      repeated: 1,
      claims: 1,
      toolCalls: 2,
    });
  });
  it("does not quietly drop malformed records or unknown formats", () => {
    expect(() => parseTrace(JSON.stringify(lines[0]) + "\nnot json")).toThrow(
      /2/,
    );
    expect(() => parseTrace('[{"hello":"world"}]')).toThrow();
  });
});

describe("Same Page: compare original answers without a compatibility score", () => {
  it("ranks numeric disagreements and preserves different words", () => {
    const result = compareAnswers(
      { priority: 1, customer: "venues" },
      { priority: 5, customer: "agencies" },
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ key: "priority", distance: 4 });
    expect(compareAnswers({ priority: 2 }, { priority: 2 })).toEqual([]);
  });
  it("rejects an unrelated JSON file", () => {
    expect(() => parseAnswerFile('{"name":"x"}')).toThrow();
    expect(
      parseAnswerFile(
        '{"format":"same-page-v1","name":"A","answers":{"priority":2}}',
      ).name,
    ).toBe("A");
  });
});

describe("What If: arithmetic and uncertainty are inspectable", () => {
  const fixed = (n: number) => ({ min: n, likely: n, max: n });
  it("agrees with hand arithmetic when inputs are certain", () => {
    const result = estimate(
      "event",
      {
        guests: fixed(100),
        ticket: fixed(20),
        variable: fixed(5),
        fixed: fixed(500),
      },
      1,
      100,
    );
    expect(result.mean).toBe(1000);
    expect(result.p10).toBe(1000);
    expect(result.positive).toBe(1);
  });
  it("is seeded, finite and rejects inverted ranges", () => {
    const ranges = {
      guests: { min: 20, likely: 50, max: 100 },
      ticket: fixed(20),
      variable: fixed(5),
      fixed: fixed(500),
    };
    expect(estimate("event", ranges, 1, 100)).toEqual(
      estimate("event", ranges, 1, 100),
    );
    expect(() =>
      estimate(
        "event",
        { ...ranges, guests: { min: 100, likely: 50, max: 20 } },
        1,
        100,
      ),
    ).toThrow();
  });
});

describe("Fair Play: nobody plays two courts in the same round", () => {
  const players = Array.from({ length: 13 }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    skill: (i % 3) + 1,
  }));
  it("covers each player once per round, with balanced rests", () => {
    const rounds = scheduleDoubles(players, 3, 8, [], 3);
    const counts = new Map(players.map((p) => [p.id, 0]));
    for (const round of rounds) {
      const ids = round.matches.flatMap((m) => [...m.a, ...m.b]);
      expect(new Set(ids).size).toBe(ids.length);
      expect([...ids, ...round.rest].sort()).toEqual(
        players.map((p) => p.id).sort(),
      );
      ids.forEach((id) => counts.set(id, counts.get(id)! + 1));
    }
    expect(
      Math.max(...counts.values()) - Math.min(...counts.values()),
    ).toBeLessThanOrEqual(1);
  });
  it("preserves completed rounds when a player leaves", () => {
    const original = scheduleDoubles(players, 2, 3, [], 2);
    const next = scheduleDoubles(
      players.slice(1),
      2,
      5,
      original.slice(0, 2),
      2,
    );
    expect(next.slice(0, 2)).toEqual(original.slice(0, 2));
    expect(
      next.slice(2).flatMap((r) => r.matches.flatMap((m) => [...m.a, ...m.b])),
    ).not.toContain("p0");
  });
  it("refuses impossible inputs", () =>
    expect(() => scheduleDoubles(players.slice(0, 3), 1, 2, [], 1)).toThrow());
});

describe("Prove It: evidence and budget matter", () => {
  it("all five authored cases have a decisive affordable investigation", () => {
    expect(cases).toHaveLength(5);
    for (const c of cases) {
      const test = c.tests.find(
        (t) => new Set(t.outcomes).size === c.hypotheses.length,
      )!;
      expect(test).toBeTruthy();
      const state = investigate(c, { used: [], spent: 0 }, test.id);
      expect(state.spent).toBeLessThanOrEqual(c.budget);
      expect(scoreCase(c, state, c.answer, 90).correct).toBe(true);
      expect(() => investigate(c, state, test.id)).toThrow(/already/i);
    }
  });
  it("does not award a good investigation score to an unsupported guess", () => {
    const c = cases[0];
    expect(
      scoreCase(c, { used: [], spent: 0 }, c.answer, 100).score,
    ).toBeLessThan(50);
  });
});

describe("Group Lore: exports are incomplete, not mind reading", () => {
  it("reads bracketed and Android dates and joins multiline messages", () => {
    const messages = parseChat(
      "[06/09/2026, 10:30:00] Alex: hello\nsecond line\n06/09/2026, 10:35 - Bea: hello there",
    );
    expect(messages).toHaveLength(2);
    expect(messages[0].text).toContain("second line");
    expect(analyseChat(messages).participants).toHaveLength(2);
  });
  it("rejects unrecognised input and excludes system events", () => {
    expect(() => parseChat("nothing to parse")).toThrow();
    expect(
      parseChat(
        "06/09/2026, 10:00 - Messages are encrypted\n06/09/2026, 10:01 - Alex: hi",
      ),
    ).toHaveLength(1);
  });
});

describe("Pocket Redact: reverse drags and edge clipping", () => {
  it("normalises reverse drag and covers exactly the expected raster pixels", () => {
    const rect = normaliseRect(8, 9, 2, 3, 10, 10);
    expect(rect).toEqual({ x: 2, y: 3, width: 6, height: 6 });
    expect(coveredPixels(rect, 10, 10)).toBe(36);
    expect(normaliseRect(-10, -10, 20, 20, 10, 10)).toEqual({
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    });
  });
});

describe("Clear Day: calendar time, not guessed availability", () => {
  const week = Date.parse("2026-09-07T00:00:00Z");
  it("rejects an undefined timezone instead of silently treating it as local", () => {
    const ics =
      "BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:tz\nDTSTART;TZID=Mars/Olympus:20260907T100000\nDTEND;TZID=Mars/Olympus:20260907T110000\nSUMMARY:Unknown zone\nEND:VEVENT\nEND:VCALENDAR";
    expect(() => parseCalendar(ics, week, week + 86400000)).toThrow(
      /timezone/i,
    );
  });
  it("does not count cancelled or transparent events as busy", () => {
    const ics =
      "BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:cancelled\nDTSTART:20260907T100000Z\nDTEND:20260907T110000Z\nSTATUS:CANCELLED\nEND:VEVENT\nBEGIN:VEVENT\nUID:free\nDTSTART:20260907T120000Z\nDTEND:20260907T130000Z\nTRANSP:TRANSPARENT\nEND:VEVENT\nEND:VCALENDAR";
    expect(parseCalendar(ics, week, week + 86400000)).toEqual([]);
  });
  it("expands bounded weekly recurrence and honours exclusions", () => {
    const ics =
      "BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:1\nDTSTART:20260907T100000Z\nDTEND:20260907T110000Z\nRRULE:FREQ=DAILY;COUNT=3\nEXDATE:20260908T100000Z\nSUMMARY:Standup\nEND:VEVENT\nEND:VCALENDAR";
    const events = parseCalendar(ics, week, week + 7 * 86400000);
    expect(events).toHaveLength(2);
    expect(events[1].start - events[0].start).toBe(2 * 86400000);
  });
  it("merges overlapping busy periods before finding free blocks", () => {
    expect(
      freeBlocks(
        [
          { start: 20, end: 50 },
          { start: 40, end: 70 },
        ],
        0,
        100,
        0,
      ),
    ).toEqual([
      { start: 0, end: 20 },
      { start: 70, end: 100 },
    ]);
  });
  it("moves only the chosen event and creates an importable export", () => {
    const events = [
      {
        id: "a",
        title: "Meeting",
        start: week + 36000000,
        end: week + 39600000,
      },
    ];
    expect(moveEvent(events, "a", 30)[0].start).toBe(events[0].start + 1800000);
    expect(
      parseCalendar(calendarExport(events), week, week + 86400000),
    ).toHaveLength(1);
  });
});

describe("Code Atlas: measurements from actual files", () => {
  it("excludes generated/vendor paths and measures line counts", () => {
    const snap = analyseFiles([
      { path: "src/a.ts", text: "a\nb\nc" },
      { path: "node_modules/x.js", text: "huge" },
    ]);
    expect(snap.files).toHaveLength(1);
    expect(snap.files[0].lines).toBe(3);
    const next = analyseFiles([{ path: "src/a.ts", text: "a\nb\nc\nd" }]);
    expect(compareSnapshots(snap, next)[0].delta).toBe(1);
  });
  it("rejects made-up metrics and path traversal", () => {
    expect(() =>
      parseSnapshot('{"files":[{"path":"a","lines":-2}]}'),
    ).toThrow();
    expect(() => analyseFiles([{ path: "../secret", text: "x" }])).toThrow();
  });
});

describe("Resonance: the musical clock has bounded catch-up", () => {
  it("returns to the same position every full period", () => {
    expect(pendulumPosition(0, 2)).toBeCloseTo(pendulumPosition(2, 2), 10);
    expect(crossings(0, 2, 2)).toBe(2);
    expect(crossings(0, 10000, 2)).toBeLessThanOrEqual(2);
  });
  it("rejects unsafe notes and accepts a bounded patch", () => {
    expect(() =>
      parsePatch(
        '{"format":"resonance-v1","voices":[{"note":999,"period":0}]}',
      ),
    ).toThrow();
    expect(
      parsePatch('{"format":"resonance-v1","voices":[{"note":60,"period":2}]}')
        .voices,
    ).toHaveLength(1);
  });
});
