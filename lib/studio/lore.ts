import { parseChat, type ChatMessage, analyseChat } from "@/lib/lab/chat";
import { addDays, daysBetween, isoDay, rangeIndices, type Span } from "@/lib/instrument/dates";
export function importChat(text: string, order: "dmy" | "mdy"): ChatMessage[] {
  if (text.length > 10_000_000) throw new Error("Chat limit: 10 MB.");
  if (text.trimStart().startsWith("{") || text.trimStart().startsWith("[")) {
    const data = JSON.parse(text),
      rows = Array.isArray(data) ? data : data.messages;
    if (!Array.isArray(rows))
      throw new Error(
        "JSON needs a messages array (Telegram, DiscordChatExporter or {sender, text, at}).",
      );
    const result: ChatMessage[] = [];
    for (const row of rows) {
      if (row.type && !["message", "Default", "Reply"].includes(row.type))
        continue;
      const sender =
        row.sender ?? row.from ?? row.author?.name ?? row.author?.nickname;
      const content = row.text ?? row.content;
      const at =
        typeof row.at === "number"
          ? row.at
          : Date.parse(row.date ?? row.timestamp);
      if (typeof sender !== "string" || !Number.isFinite(at)) continue;
      const body = Array.isArray(content)
        ? content
            .map((t) => (typeof t === "string" ? t : (t?.text ?? "")))
            .join("")
        : content;
      if (typeof body === "string") result.push({ sender, at, text: body });
    }
    if (!result.length)
      throw new Error("No dated messages recognised in this JSON.");
    return result.sort((a, b) => a.at - b.at);
  }
  if (order === "mdy")
    text = text.replace(
      /^(\[?)(\d{1,2})([/.])(\d{1,2})([/.]\d{2,4})/gm,
      "$1$4$3$2$5",
    );
  return parseChat(text).sort((a, b) => a.at - b.at);
}
export type LoreFilter = {
  query?: string;
  person?: string;
  start?: string;
  end?: string;
  day?: number;
  hour?: number;
};
export function filterMessages(messages: ChatMessage[], f: LoreFilter) {
  const start = f.start ? new Date(f.start + "T00:00:00").getTime() : -Infinity,
    end = f.end ? new Date(f.end + "T23:59:59.999").getTime() : Infinity,
    query = f.query?.toLocaleLowerCase();
  return messages.filter((m) => {
    const d = new Date(m.at);
    return (
      (!f.person || m.sender === f.person) &&
      m.at >= start &&
      m.at <= end &&
      (!query || m.text.toLocaleLowerCase().includes(query)) &&
      (f.day === undefined || (d.getDay() + 6) % 7 === f.day) &&
      (f.hour === undefined || d.getHours() === f.hour)
    );
  });
}
export function loreStats(messages: ChatMessage[]) {
  const base = analyseChat(messages),
    heat = Array.from({ length: 7 }, () => Array(24).fill(0) as number[]),
    days = new Set<string>();
  let sessions = 0,
    last = -Infinity,
    longest = 0,
    run = 0;
  for (const m of messages) {
    const d = new Date(m.at);
    heat[(d.getDay() + 6) % 7][d.getHours()]++;
    days.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    if (m.at - last > 30 * 60 * 1000) {
      sessions++;
      run = 0;
    }
    run++;
    longest = Math.max(longest, run);
    last = m.at;
  }
  return { ...base, heat, sessions, longest, activeDays: days.size };
}
export function anonymousSummary(messages: ChatMessage[]) {
  const s = loreStats(messages);
  return {
    format: "group-lore-v2",
    count: s.count,
    participants: s.participants.map((p, i) => ({
      name: `Voice ${i + 1}`,
      count: p.count,
    })),
    hours: s.hours,
    months: s.months,
    heat: s.heat,
    sessions: s.sessions,
    activeDays: s.activeDays,
  };
}

/* ── The rebuilt instrument (2026-09-28) ─────────────────────────────────
   Everything the page draws is decided here, where it can be tested without
   a DOM: how bright a cell is, which cell is the peak, which stretch of time
   and which voice the week follows, the timeline's bars, the date order of a
   WhatsApp file and the keyboard's way round the week. */

export type Order = "dmy" | "mdy";
/** One hour of one weekday. `day` 0 is Monday, as in `loreStats().heat`. */
export type Cell = { day: number; hour: number };
export type Stretch = { start?: string; end?: string };

/**
 * The media query under which the week turns on its side: days across,
 * hours down, so a phone draws each cell forty pixels wide instead of
 * scrolling nineteen of the twenty-four hours out of sight.
 * `app/tools/group-lore/tool.css` carries the same query, and
 * `components/studio/GroupLore.test.ts` holds the two together.
 */
export const WEEK_TRANSPOSE_QUERY = "(max-width: 640px)";

/** The lowest a cell with any message in it may glow, as a share of full. */
export const HEAT_FLOOR = 0.2;

/**
 * How brightly a cell glows, 0 to 1. An empty hour is 0; any message lifts
 * it to at least `HEAT_FLOOR`, and the rest rises on a square root, so the
 * quiet hours of a busy chat stay distinguishable from each other and from
 * nothing. The old scale was linear from 0.06, which drew a one-message hour
 * as 6% of green on black: the eye read it as an empty cell.
 */
export function heatLevel(n: number, max: number): number {
  if (n <= 0) return 0;
  if (max <= 0 || n >= max) return 1;
  return HEAT_FLOOR + (1 - HEAT_FLOOR) * Math.sqrt(n / max);
}

/** The busiest hour of the week, the earliest on a tie, or null for an empty week. */
export function peakCell(heat: readonly (readonly number[])[]): (Cell & { count: number }) | null {
  let best: (Cell & { count: number }) | null = null;
  for (let day = 0; day < heat.length; day++) {
    for (let hour = 0; hour < heat[day].length; hour++) {
      const count = heat[day][hour];
      if (count > 0 && (!best || count > best.count)) best = { day, hour, count };
    }
  }
  return best;
}

/**
 * Pseudonyms by rank in the whole export. Ranked once, on everything, so a
 * label never changes hands when the stretch changes who talks most.
 */
export function pseudonymsOf(messages: readonly ChatMessage[]): Map<string, string> {
  return new Map(analyseChat([...messages]).participants.map((p, i) => [p.name, `Voice ${i + 1}`]));
}

/**
 * What the page draws for a stretch of time and, optionally, one voice.
 * `stretch` is the messages inside the range; `voices` ranks everyone who
 * spoke in it; `focus` narrows the stretch to the chosen voice, and `stats`
 * (the week, the phrases, the figures) describe `focus`.
 */
export function loreView(messages: readonly ChatMessage[], { range, person }: { range: Stretch; person?: string }) {
  const stretch =
    range.start || range.end ? filterMessages([...messages], { start: range.start, end: range.end }) : [...messages];
  const focus = person ? stretch.filter((m) => m.sender === person) : stretch;
  const stats = loreStats(focus);
  const voices = person ? analyseChat(stretch).participants : stats.participants;
  return { stretch, focus, voices, stats };
}

export type Bar = { count: number; from: string; to: string; lit: boolean };

/**
 * The timeline under the week: messages per slice of the whole chat, never
 * more slices than days, each lit when it overlaps the chosen stretch.
 */
export function timelineBars(messages: readonly ChatMessage[], span: Span, range: Stretch, buckets: number): Bar[] {
  const days = span.days + 1;
  const count = Math.max(1, Math.min(Math.floor(buckets), days));
  const edge = (i: number) => Math.floor((i * days) / count);
  const { from, to } = rangeIndices(range, span);
  const bars: Bar[] = Array.from({ length: count }, (_, i) => {
    const first = edge(i);
    const last = edge(i + 1) - 1;
    return { count: 0, from: addDays(span.first, first), to: addDays(span.first, last), lit: last >= from && first <= to };
  });
  for (const m of messages) {
    const index = daysBetween(span.first, isoDay(m.at));
    if (index < 0 || index >= days) continue;
    bars[Math.floor((index * count) / days)].count += 1;
  }
  return bars;
}

const WHATSAPP_DATE = /^\[?(\d{1,2})[/.](\d{1,2})[/.](\d{2,4}),?\s+(\d{1,2}):(\d{2})/;

/** A WhatsApp header's date read one way, or NaN when that reading is no date. */
function readAs(a: number, b: number, year: number, hour: number, minute: number, order: Order): number {
  const [day, month] = order === "dmy" ? [a, b] : [b, a];
  const date = new Date(year, month - 1, day, hour, minute);
  return date.getMonth() === month - 1 && date.getDate() === day ? date.getTime() : NaN;
}

/**
 * Which way round a WhatsApp export writes its dates. Certain when a field
 * passes twelve, or when only one reading keeps the export in time order (an
 * export always is). Otherwise day first, and `certain: false`, which is the
 * only time the page asks. JSON carries its own dates, so it is certain.
 */
export function dateOrderOf(text: string): { order: Order; certain: boolean } {
  const start = text.trimStart();
  if (start.startsWith("{") || start.startsWith("[")) return { order: "dmy", certain: true };
  let dmyBroken = false;
  let mdyBroken = false;
  let lastDmy = -Infinity;
  let lastMdy = -Infinity;
  for (const line of text.replace(/[‎‏‪-‮]/g, "").split(/\r?\n/)) {
    const match = line.match(WHATSAPP_DATE);
    if (!match) continue;
    const [a, b, yy, hh, mm] = match.slice(1).map(Number);
    const year = yy + (match[3].length === 2 ? 2000 : 0);
    if (a > 12 && b <= 12) return { order: "dmy", certain: true };
    if (b > 12 && a <= 12) return { order: "mdy", certain: true };
    const dmy = readAs(a, b, year, hh, mm, "dmy");
    const mdy = readAs(a, b, year, hh, mm, "mdy");
    if (!(dmy >= lastDmy)) dmyBroken = true;
    if (!(mdy >= lastMdy)) mdyBroken = true;
    lastDmy = dmy;
    lastMdy = mdy;
  }
  if (mdyBroken && !dmyBroken) return { order: "dmy", certain: true };
  if (dmyBroken && !mdyBroken) return { order: "mdy", certain: true };
  return { order: "dmy", certain: false };
}

/** Read a chat, in the order asked for or the one `dateOrderOf` found. */
export function readChat(text: string, order?: Order): { messages: ChatMessage[]; order: Order; certain: boolean } {
  const found = dateOrderOf(text);
  const used = order ?? found.order;
  return { messages: importChat(text, used), order: used, certain: order ? true : found.certain };
}

/**
 * The keyboard's way round the week. Left and right move along the hours and
 * up and down move between days; on a phone, where the week is drawn on its
 * side, they swap. Home and End go to the first and last hour. Null for a key
 * that is not ours, so the page can let it through.
 */
export function moveCell(cell: Cell, key: string, transposed: boolean): Cell | null {
  const day = (d: number) => Math.min(6, Math.max(0, d));
  const hour = (h: number) => Math.min(23, Math.max(0, h));
  const hours = (step: number): Cell => ({ day: cell.day, hour: hour(cell.hour + step) });
  const days = (step: number): Cell => ({ day: day(cell.day + step), hour: cell.hour });
  switch (key) {
    case "ArrowRight":
      return transposed ? days(1) : hours(1);
    case "ArrowLeft":
      return transposed ? days(-1) : hours(-1);
    case "ArrowDown":
      return transposed ? hours(1) : days(1);
    case "ArrowUp":
      return transposed ? hours(-1) : days(-1);
    case "Home":
      return { day: cell.day, hour: 0 };
    case "End":
      return { day: cell.day, hour: 23 };
    default:
      return null;
  }
}

export type PortraitWords = {
  title: string;
  days: readonly string[];
  figures: (count: number, voices: number, days: number) => string;
  sessions: (count: number) => string;
  footer: string;
};

const escapeXml = (text: string) =>
  text.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);

/**
 * The anonymous activity portrait: the week as lit squares, and counts. It is
 * built from `anonymousSummary`, so it holds no name and no word of any message.
 */
export function portraitSvg(messages: readonly ChatMessage[], words: PortraitWords): string {
  const summary = anonymousSummary([...messages]);
  const max = Math.max(1, ...summary.heat.flat());
  const text = (x: number, y: number, size: number, fill: string, body: string) =>
    `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}">${escapeXml(body)}</text>`;
  const rows = summary.heat
    .map(
      (row, d) =>
        text(70, 338 + d * 44, 16, "#94c8a4", words.days[d]) +
        row
          .map(
            (n, h) =>
              `<rect x="${135 + h * 40}" y="${314 + d * 44}" width="31" height="31" rx="4" fill="#7bffb0" opacity="${(0.08 + 0.92 * heatLevel(n, max)).toFixed(3)}"/>`,
          )
          .join(""),
    )
    .join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">` +
    `<rect width="1200" height="900" fill="#09140f"/><g font-family="monospace">` +
    text(70, 200, 65, "#e5ffe9", words.title) +
    text(70, 260, 24, "#94c8a4", words.figures(summary.count, summary.participants.length, summary.activeDays)) +
    rows +
    text(135, 660, 16, "#94c8a4", "00:00") +
    text(565, 660, 16, "#94c8a4", "12:00") +
    text(1010, 660, 16, "#94c8a4", "23:00") +
    text(70, 760, 24, "#e5ffe9", words.sessions(summary.sessions)) +
    text(70, 835, 16, "#94c8a4", words.footer) +
    `</g></svg>`
  );
}
