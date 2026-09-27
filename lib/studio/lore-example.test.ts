import { describe, expect, it } from "vitest";
import { EXAMPLE_SEED, exampleChat } from "./lore-example";
import { dateOrderOf, importChat, loreStats } from "./lore";
import { loreCopy } from "@/content/studio/lore-copy";

/**
 * The invented chat the tool opens on. It is the first thing a visitor sees,
 * so it has to look like a real group's week: evenings bright, small hours
 * dark, a weekend that differs from a Tuesday, voices with habits of their
 * own and phrases that come round again. The old example had 84 messages at
 * five hours of the day, which left 133 of the 168 cells black and, on a
 * phone, every lit one scrolled out of sight.
 */
const text = exampleChat();
const messages = importChat(text, "dmy");
const stats = loreStats(messages);
const byHour = (hours: number[]) => hours.reduce((sum, h) => sum + stats.hours[h], 0);

describe("the example chat", () => {
  it("is the same chat every time, on the server and in the browser", () => {
    expect(exampleChat()).toBe(text);
    expect(exampleChat(EXAMPLE_SEED)).toBe(text);
    expect(exampleChat(EXAMPLE_SEED + 1)).not.toBe(text);
  });

  it("is a WhatsApp export the real parser reads, with dates nobody could misread", () => {
    expect(dateOrderOf(text)).toEqual({ order: "dmy", certain: true });
    expect(messages.length).toBeGreaterThanOrEqual(900);
    expect(messages.length).toBeLessThanOrEqual(2400);
    // In time order already, as a real export is.
    expect(messages.map((m) => m.at)).toEqual(messages.map((m) => m.at).sort((a, b) => a - b));
  });

  it("is spoken by the invented group, and by nobody else", () => {
    expect(new Set(messages.map((m) => m.sender))).toEqual(new Set(loreCopy.example.voices));
    expect(stats.participants.length).toBeGreaterThanOrEqual(4);
    // Every voice is heard, and nobody drowns the rest out.
    const shares = stats.participants.map((p) => p.count / stats.count);
    expect(Math.min(...shares)).toBeGreaterThan(0.08);
    expect(Math.max(...shares)).toBeLessThan(0.4);
  });

  it("has a week worth looking at: most hours lit, the evenings brightest, the small hours darkest", () => {
    const lit = stats.heat.flat().filter((n) => n > 0).length;
    expect(lit).toBeGreaterThanOrEqual(100);
    expect(byHour([19, 20, 21, 22])).toBeGreaterThan(3 * byHour([2, 3, 4, 5]));
    expect(byHour([12, 13])).toBeGreaterThan(byHour([10, 11]) * 0.6);
    // A Saturday morning is not a Tuesday morning (noon is lunch on a Tuesday, so it stays out).
    const morning = (day: number) => [9, 10, 11].reduce((s, h) => s + stats.heat[day][h], 0);
    expect(morning(5)).toBeGreaterThan(morning(1));
  });

  it("runs for more than half a year, with a shape to the timeline rather than a flat line", () => {
    expect(stats.activeDays).toBeGreaterThanOrEqual(150);
    const months = stats.months.map((m) => m.count);
    expect(months.length).toBeGreaterThanOrEqual(6);
    expect(Math.max(...months)).toBeGreaterThan(1.6 * Math.min(...months));
  });

  it("keeps saying things, so the phrases have something to show", () => {
    expect(stats.phrases.length).toBe(10);
    expect(stats.phrases[0].count).toBeGreaterThanOrEqual(20);
    expect(stats.phrases[9].count).toBeGreaterThanOrEqual(5);
  });
});
