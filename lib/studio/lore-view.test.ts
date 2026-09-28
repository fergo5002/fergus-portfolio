import { describe, expect, it } from "vitest";
import {
  WEEK_TRANSPOSE_QUERY,
  dateOrderOf,
  heatLevel,
  importChat,
  loreView,
  moveCell,
  peakCell,
  portraitSvg,
  pseudonymsOf,
  readChat,
  timelineBars,
} from "./lore";
import { spanOf } from "@/lib/instrument/dates";
import { loreCopy } from "@/content/studio/lore-copy";
import type { ChatMessage } from "@/lib/lab/chat";

/**
 * The rebuilt Group Lore's arithmetic: the week, the stretch of time the week
 * follows, the voice it can focus on, the timeline under it, the reading line
 * and the date order of a WhatsApp file. Every date here is built from local
 * fields, the way the parser builds them, so the tests hold in any timezone.
 */
const at = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const msg = (sender: string, time: number, text: string): ChatMessage => ({ sender, at: time, text });

// Two months. January is Ava's, in the mornings, about pints; March is Ben's, late, about the match.
const chat: ChatMessage[] = [
  msg("Ava", at(2026, 1, 5, 9), "quick pint later"),
  msg("Ava", at(2026, 1, 5, 9, 5), "quick pint yes"),
  msg("Cal", at(2026, 1, 6, 10), "quick pint maybe"),
  msg("Ben", at(2026, 3, 2, 22), "the match tonight"),
  msg("Ben", at(2026, 3, 2, 22, 4), "the match was class"),
  msg("Ben", at(2026, 3, 3, 23), "the match again"),
  msg("Ava", at(2026, 3, 3, 23, 2), "fair enough"),
];

describe("the heat scale", () => {
  it("leaves an empty hour dark and lights any message well clear of it", () => {
    expect(heatLevel(0, 10)).toBe(0);
    // The floor is the fix for a week that read as empty: one message in a
    // busy chat must still be a visible cell, not 6% of green on black.
    expect(heatLevel(1, 500)).toBeGreaterThanOrEqual(0.2);
    expect(heatLevel(10, 10)).toBe(1);
  });

  it("rises with the count on a square-root curve, so quiet hours stay distinguishable", () => {
    expect(heatLevel(25, 100)).toBeCloseTo(0.6, 5);
    const levels = [1, 2, 5, 10, 50, 100].map((n) => heatLevel(n, 100));
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
    expect(new Set(levels).size).toBe(levels.length);
  });

  it("never goes past full, whatever it is handed", () => {
    expect(heatLevel(20, 10)).toBe(1);
    expect(heatLevel(3, 0)).toBe(1);
  });
});

describe("the peak and the reading line", () => {
  it("finds the busiest hour of the week, the earliest on a tie", () => {
    const heat = Array.from({ length: 7 }, () => Array(24).fill(0) as number[]);
    heat[1][21] = 14;
    heat[4][22] = 14;
    heat[0][8] = 3;
    expect(peakCell(heat)).toEqual({ day: 1, hour: 21, count: 14 });
  });

  it("has no peak in an empty week", () => {
    expect(peakCell(Array.from({ length: 7 }, () => Array(24).fill(0) as number[]))).toBeNull();
  });

  it("reads one cell as a day, an hour and a count, in one line", () => {
    expect(loreCopy.reading({ day: 1, hour: 21 }, 14)).toBe("Tuesday 21:00 · 14 messages");
    expect(loreCopy.reading({ day: 0, hour: 8 }, 1)).toBe("Monday 08:00 · 1 message");
    expect(loreCopy.reading({ day: 6, hour: 4 }, 0)).toBe("Sunday 04:00 · no messages");
    expect(loreCopy.reading({ day: 1, hour: 21 }, 3, "Voice 2")).toBe("Voice 2 · Tuesday 21:00 · 3 messages");
  });
});

describe("the stretch of time the week follows", () => {
  it("is the whole chat until a stretch is chosen", () => {
    const view = loreView(chat, { range: {} });
    expect(view.stretch).toHaveLength(chat.length);
    expect(view.stats.count).toBe(chat.length);
  });

  it("moves the week, the voices and the phrases together", () => {
    const march = loreView(chat, { range: { start: "2026-03-01" } });
    expect(march.stats.count).toBe(4);
    // The heat is March's: late on a Monday and a Tuesday, nothing in the morning.
    expect(march.stats.heat[0][22]).toBe(2);
    expect(march.stats.heat[1][23]).toBe(2);
    expect(march.stats.heat[0][9]).toBe(0);
    expect(march.voices.map((v) => v.name)).toEqual(["Ben", "Ava"]);
    expect(march.stats.phrases.map((p) => p.phrase)).toContain("the match");
    expect(march.stats.phrases.map((p) => p.phrase)).not.toContain("quick pint");

    const january = loreView(chat, { range: { end: "2026-01-31" } });
    expect(january.voices.map((v) => v.name)).toEqual(["Ava", "Cal"]);
    expect(january.stats.phrases.map((p) => p.phrase)).toEqual(["quick pint"]);
  });

  it("focuses the week and the phrases on one voice, and keeps every voice in the stretch listed", () => {
    const ava = loreView(chat, { range: {}, person: "Ava" });
    expect(ava.stats.count).toBe(3);
    expect(ava.stats.heat[1][23]).toBe(1);
    expect(ava.stats.heat[0][22]).toBe(0);
    // Ava and Ben tie on three; the earlier speaker keeps the higher rank.
    expect(ava.voices.map((v) => v.name)).toEqual(["Ava", "Ben", "Cal"]);
    expect(ava.focus.every((m) => m.sender === "Ava")).toBe(true);
  });

  it("names voices by their rank in the whole export, so a label never changes hands with the stretch", () => {
    const names = pseudonymsOf(chat);
    expect(names.get("Ava")).toBe("Voice 1");
    expect(names.get("Ben")).toBe("Voice 2");
    expect(names.get("Cal")).toBe("Voice 3");
    // In March Ben out-talks Ava, and he is still Voice 2.
    expect(loreView(chat, { range: { start: "2026-03-01" } }).voices[0].name).toBe("Ben");
  });
});

describe("the timeline under the week", () => {
  const span = spanOf(chat.map((m) => m.at))!;

  it("counts every message once, in buckets that never outnumber the days", () => {
    const bars = timelineBars(chat, span, {}, 64);
    expect(bars.length).toBeLessThanOrEqual(span.days + 1);
    expect(bars.reduce((sum, b) => sum + b.count, 0)).toBe(chat.length);
    expect(bars[0].from).toBe(span.first);
    expect(bars.at(-1)!.to).toBe(span.last);
  });

  it("lights only the buckets inside the chosen stretch", () => {
    expect(timelineBars(chat, span, {}, 20).every((b) => b.lit)).toBe(true);
    const march = timelineBars(chat, span, { start: "2026-03-01" }, 20);
    expect(march[0].lit).toBe(false);
    expect(march.at(-1)!.lit).toBe(true);
    expect(march.filter((b) => b.lit).reduce((s, b) => s + b.count, 0)).toBe(4);
  });

  it("draws a one-day chat as one bar", () => {
    const one = [msg("A", at(2026, 5, 1, 10), "hi")];
    const bars = timelineBars(one, spanOf(one.map((m) => m.at))!, {}, 64);
    expect(bars).toEqual([{ count: 1, from: "2026-05-01", to: "2026-05-01", lit: true }]);
  });
});

describe("the date order of a WhatsApp export", () => {
  it("is day first when a first field passes twelve, and certain", () => {
    expect(dateOrderOf("03/04/2026, 10:00 - A: hi\n25/04/2026, 10:00 - B: yo")).toEqual({ order: "dmy", certain: true });
  });

  it("is month first when a second field passes twelve, and certain", () => {
    expect(dateOrderOf("04/03/2026, 10:00 - A: hi\n04/25/2026, 10:00 - B: yo")).toEqual({ order: "mdy", certain: true });
  });

  it("follows the export's own order when only one reading keeps it in time order", () => {
    // Read day first this runs 1 Feb, 1 Mar, 2 Jan: backwards. Month first it is 2 and 3 January, then 1 February.
    const text = "01/02/2026, 10:00 - A: a\n01/03/2026, 10:00 - B: b\n02/01/2026, 10:00 - A: c";
    expect(dateOrderOf(text)).toEqual({ order: "mdy", certain: true });
    const dmy = "02/01/2026, 10:00 - A: a\n03/01/2026, 10:00 - B: b\n01/02/2026, 10:00 - A: c";
    expect(dateOrderOf(dmy)).toEqual({ order: "dmy", certain: true });
  });

  it("says so when it cannot tell, and reads day first", () => {
    expect(dateOrderOf("05/05/2026, 10:00 - A: a\n05/05/2026, 11:00 - B: b")).toEqual({ order: "dmy", certain: false });
  });

  it("reads an iPhone export, whose every line opens with a bracket, as WhatsApp and not as JSON", () => {
    // Found on 2026-09-28 by dropping an iOS-format export on the page: it was
    // handed to JSON.parse and refused with "Unexpected number in JSON".
    const ios = "[03/04/2026, 20:15:03] Alex: first\n[03/04/2026, 20:17:44] Bea: second\nand a second line\n[25/04/2026, 09:00:00] Alex: third";
    const read = readChat(ios);
    expect(read.messages.map((m) => m.sender)).toEqual(["Alex", "Bea", "Alex"]);
    expect(read.messages[1].text).toBe("second\nand a second line");
    expect(new Date(read.messages[2].at).getDate()).toBe(25);
    expect(dateOrderOf(ios)).toEqual({ order: "dmy", certain: true });
    // And one that could be read either way is asked about, like any other WhatsApp file.
    expect(dateOrderOf("[03/04/2026, 20:15:03] Alex: a\n[03/04/2026, 20:17:44] Bea: b")).toEqual({ order: "dmy", certain: false });
  });

  it("still reads JSON that opens with whitespace or an empty array", () => {
    expect(importChat('\n  [ {"sender":"A","text":"x","at":1} ]', "dmy")).toHaveLength(1);
    expect(() => importChat("[]", "dmy")).toThrow(/No dated messages/);
    expect(dateOrderOf(' \n[{"sender":"A","text":"x","at":1}]')).toEqual({ order: "dmy", certain: true });
  });

  it("is certain about JSON, which carries its own dates", () => {
    expect(dateOrderOf('[{"sender":"A","text":"x","at":1}]')).toEqual({ order: "dmy", certain: true });
  });

  it("reads a file in the order it found, or the one asked for", () => {
    const text = "04/03/2026, 10:00 - A: hi\n04/25/2026, 10:00 - B: yo";
    const auto = readChat(text);
    expect(auto.order).toBe("mdy");
    expect(new Date(auto.messages[1].at).getDate()).toBe(25);
    const ambiguous = "02/03/2026, 10:00 - A: a\n02/03/2026, 11:00 - B: b";
    expect(readChat(ambiguous).certain).toBe(false);
    expect(new Date(readChat(ambiguous, "mdy").messages[0].at).getMonth()).toBe(1);
    expect(readChat(ambiguous, "mdy").order).toBe("mdy");
    // Choosing an order does not make the file less ambiguous: the choice stays offered.
    expect(readChat(ambiguous, "mdy").certain).toBe(false);
    expect(readChat(ambiguous, "mdy").messages).toEqual(importChat(ambiguous, "mdy"));
  });
});

describe("the keyboard's way round the week", () => {
  it("moves along the hours and down the days, and stops at the edges", () => {
    expect(moveCell({ day: 1, hour: 21 }, "ArrowRight", false)).toEqual({ day: 1, hour: 22 });
    expect(moveCell({ day: 1, hour: 21 }, "ArrowDown", false)).toEqual({ day: 2, hour: 21 });
    expect(moveCell({ day: 0, hour: 0 }, "ArrowUp", false)).toEqual({ day: 0, hour: 0 });
    expect(moveCell({ day: 6, hour: 23 }, "ArrowRight", false)).toEqual({ day: 6, hour: 23 });
    expect(moveCell({ day: 3, hour: 9 }, "Home", false)).toEqual({ day: 3, hour: 0 });
    expect(moveCell({ day: 3, hour: 9 }, "End", false)).toEqual({ day: 3, hour: 23 });
    expect(moveCell({ day: 3, hour: 9 }, "a", false)).toBeNull();
  });

  it("turns with the week on a phone, where the days run across and the hours down", () => {
    expect(moveCell({ day: 1, hour: 21 }, "ArrowRight", true)).toEqual({ day: 2, hour: 21 });
    expect(moveCell({ day: 1, hour: 21 }, "ArrowDown", true)).toEqual({ day: 1, hour: 22 });
    expect(WEEK_TRANSPOSE_QUERY).toMatch(/^\(max-width: \d+px\)$/);
  });
});

describe("the activity portrait", () => {
  it("draws the week with counts and no names or words", () => {
    const svg = portraitSvg(chat, loreCopy.portraitWords);
    expect(svg).toContain(loreCopy.portraitWords.title);
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(svg.match(/<rect x=/g)).toHaveLength(7 * 24);
    expect(svg).toContain("7 messages");
    expect(svg).not.toMatch(/Ava|Ben|Cal|pint|match|enough/);
  });
});
