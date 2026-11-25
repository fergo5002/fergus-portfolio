/**
 * The times `/contact` offers for a coffee or a call.
 *
 * Since 2026-11-25 they come from Fergus's real calendars: `lib/calendar.ts`
 * reads when he is busy across his personal, Draft and family calendars, and a
 * half hour is offered only if none of them has anything in it. Picking one
 * books it (`lib/meeting-server.ts`). Everything here is pure, so the page,
 * the server action and the tests all build the same offer from the same busy
 * times.
 *
 * Weekdays, 10:00 to 17:30 Irish time, in half hours, at least a day ahead and
 * at most four weeks out. All server validation rebuilds the offer against the
 * current time and fresh busy times, never trusting what the page was shown.
 */
export type MeetingKind = "coffee" | "call";
export type MeetingSlot = { id: string; label: string; available: boolean };
/** Busy intervals as [start, end) in epoch milliseconds. */
export type BusyTimes = [number, number][];
export const MEETING_ZONE = "Europe/Dublin";
export const MEETING_DAYS = 28;
export const MEETING_MINUTES = 30;
/** The first and last start times offered, in Irish hours. The last meeting ends at 17:30. */
export const FIRST_HOUR = 10;
export const LAST_START = 17;
const DAY = 86_400_000;
const SLOT_MS = MEETING_MINUTES * 60_000;
const parts = (date: Date) => new Intl.DateTimeFormat("en-GB", {
  timeZone: MEETING_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
}).formatToParts(date);

export function irishDay(date: Date): string {
  const p = parts(date);
  const get = (key: string) => p.find((x) => x.type === key)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Whether [start, end) touches any busy interval. */
export function overlapsBusy(busy: BusyTimes, start: number, end: number): boolean {
  return busy.some(([from, to]) => from < end && to > start);
}

export function meetingDays(now: Date, busy: BusyTimes = []): string[] {
  const start = Date.parse(`${irishDay(now)}T12:00:00Z`);
  return Array.from({ length: MEETING_DAYS }, (_, i) => new Date(start + i * DAY))
    .filter((d) => ![0, 6].includes(d.getUTCDay()))
    .map((d) => d.toISOString().slice(0, 10))
    .filter((d) => meetingSlots(d, now, busy).some((s) => s.available));
}

export function meetingSlots(day: string, now: Date, busy: BusyTimes = []): MeetingSlot[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return [];
  const base = Date.parse(`${day}T12:00:00Z`);
  if (!Number.isFinite(base) || new Date(base).toISOString().slice(0, 10) !== day) return [];
  const today = Date.parse(`${irishDay(now)}T12:00:00Z`);
  if (base < today || base >= today + MEETING_DAYS * DAY || [0, 6].includes(new Date(base).getUTCDay())) return [];
  // Every offered hour is after both Irish clock transitions, so the noon
  // offset is also the offset at 10:00 to 17:30, including transition weeks.
  const localHour = Number(parts(new Date(base)).find((p) => p.type === "hour")!.value);
  const offset = localHour - 12;
  const count = (LAST_START - FIRST_HOUR) * 2 + 1;
  return Array.from({ length: count }, (_, i) => {
    const hour = FIRST_HOUR + Math.floor(i / 2);
    const label = `${hour}:${i % 2 ? "30" : "00"}`;
    const instant = Date.parse(`${day}T${String(hour).padStart(2, "0")}:${i % 2 ? "30" : "00"}:00Z`) - offset * 3_600_000;
    return {
      id: new Date(instant).toISOString(), label,
      available: instant >= now.getTime() + DAY && !overlapsBusy(busy, instant, instant + SLOT_MS),
    };
  });
}

/**
 * The offered half hours that are taken, and nothing else. This is what the
 * page is sent, never the busy times themselves: those come from Fergus's
 * personal, Draft and family calendars at minute precision, evenings and
 * weekends included, and the picker needs none of that. Every interval is one
 * offered slot exactly, so the offer built from it is the same offer.
 */
export function takenSlots(now: Date, busy: BusyTimes): BusyTimes {
  const taken: BusyTimes = [];
  const start = Date.parse(`${irishDay(now)}T12:00:00Z`);
  for (let d = 0; d < MEETING_DAYS; d++) {
    const day = new Date(start + d * DAY).toISOString().slice(0, 10);
    for (const slot of meetingSlots(day, now)) {
      const at = Date.parse(slot.id);
      if (overlapsBusy(busy, at, at + SLOT_MS)) taken.push([at, at + SLOT_MS]);
    }
  }
  return taken;
}

export function validMeetingSlot(id: string, now: Date, busy: BusyTimes = []): boolean {
  const parsed = new Date(id);
  if (!Number.isFinite(parsed.getTime())) return false;
  return meetingSlots(irishDay(parsed), now, busy).some((s) => s.id === id && s.available);
}

/**
 * Made-up busy times for a machine with no calendar attached: a laptop, CI, a
 * preview. The same stable pattern the page used before it read a real
 * calendar, so the picker always has some times open and some taken. Never
 * used in production, where no calendar means no offer (`lib/calendar.ts`).
 */
export function demoBusy(now: Date): BusyTimes {
  const busy: BusyTimes = [];
  const start = Date.parse(`${irishDay(now)}T12:00:00Z`);
  for (let d = 0; d < MEETING_DAYS; d++) {
    const day = new Date(start + d * DAY).toISOString().slice(0, 10);
    const seed = Math.floor(Date.parse(`${day}T12:00:00Z`) / DAY);
    meetingSlots(day, now).forEach((slot, i) => {
      if ((seed * 7 + i * 5) % 11 < 4) {
        const at = Date.parse(slot.id);
        busy.push([at, at + SLOT_MS]);
      }
    });
  }
  return busy;
}

export function meetingEnd(slot: string): string {
  return new Date(Date.parse(slot) + SLOT_MS).toISOString();
}

export function meetingSummary(kind: MeetingKind, slot: string): string {
  return `${kind === "coffee" ? "Coffee in Dublin" : "Video call"} · ${new Intl.DateTimeFormat("en-IE", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: MEETING_ZONE,
  }).format(new Date(slot))} (Irish time) · 30 minutes`;
}

export type MeetingFields = { kind: string; slot: string; name: string; email: string; note: string };
export type MeetingState = {
  /**
   * `booked`: it is in the calendar and Google has sent the invite.
   * `sent`: it could not be booked automatically, so it went to Fergus as a
   * request he confirms by email.
   */
  status: "idle" | "booked" | "sent" | "invalid" | "failed";
  seq: number;
  fields?: MeetingFields;
  errors?: Partial<Record<keyof MeetingFields, string>>;
  mailto?: string;
  summary?: string;
};
export const INITIAL_MEETING_STATE: MeetingState = { status: "idle", seq: 0 };
