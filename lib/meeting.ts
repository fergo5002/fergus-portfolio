/** Offered times, not a calendar feed or an inventory of confirmed bookings.
 * A stable date seed limits the offer. Nothing is stored or marked as booked.
 * All server validation rebuilds the offer against the current time.
 */
export type MeetingKind = "coffee" | "call";
export type MeetingSlot = { id: string; label: string; available: boolean };
export const MEETING_ZONE = "Europe/Dublin";
export const MEETING_DAYS = 28;
const DAY = 86_400_000;
const parts = (date: Date) => new Intl.DateTimeFormat("en-GB", {
  timeZone: MEETING_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
}).formatToParts(date);

export function irishDay(date: Date): string {
  const p = parts(date);
  const get = (key: string) => p.find((x) => x.type === key)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function meetingDays(now: Date): string[] {
  const start = Date.parse(`${irishDay(now)}T12:00:00Z`);
  return Array.from({ length: MEETING_DAYS }, (_, i) => new Date(start + i * DAY))
    .filter((d) => ![0, 6].includes(d.getUTCDay()))
    .map((d) => d.toISOString().slice(0, 10))
    .filter((d) => meetingSlots(d, now).some((s) => s.available));
}

export function meetingSlots(day: string, now: Date): MeetingSlot[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return [];
  const base = Date.parse(`${day}T12:00:00Z`);
  if (!Number.isFinite(base) || new Date(base).toISOString().slice(0, 10) !== day) return [];
  const today = Date.parse(`${irishDay(now)}T12:00:00Z`);
  if (base < today || base >= today + MEETING_DAYS * DAY || [0, 6].includes(new Date(base).getUTCDay())) return [];
  // Every offered hour is after both Irish clock transitions, so the noon
  // offset is also the offset at 10:00 to 17:00, including transition weeks.
  const localHour = Number(parts(new Date(base)).find((p) => p.type === "hour")!.value);
  const offset = localHour - 12;
  const seed = Math.floor(base / DAY);
  return Array.from({ length: 14 }, (_, i) => {
    const hour = 10 + Math.floor(i / 2);
    const label = `${hour}:${i % 2 ? "30" : "00"}`;
    const instant = Date.parse(`${day}T${label}:00Z`) - offset * 3_600_000;
    return {
      id: new Date(instant).toISOString(), label,
      available: instant >= now.getTime() + DAY && (seed * 7 + i * 5) % 11 >= 4,
    };
  });
}

export function validMeetingSlot(id: string, now: Date): boolean {
  const parsed = new Date(id);
  if (!Number.isFinite(parsed.getTime())) return false;
  return meetingSlots(irishDay(parsed), now).some((s) => s.id === id && s.available);
}

export function meetingSummary(kind: MeetingKind, slot: string): string {
  return `${kind === "coffee" ? "Coffee in Dublin" : "Video call"} · ${new Intl.DateTimeFormat("en-IE", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: MEETING_ZONE,
  }).format(new Date(slot))} (Irish time) · 30 minutes`;
}

export type MeetingFields = { kind: string; slot: string; name: string; email: string; note: string };
export type MeetingState = {
  status: "idle" | "sent" | "invalid" | "failed";
  seq: number;
  fields?: MeetingFields;
  errors?: Partial<Record<keyof MeetingFields, string>>;
  mailto?: string;
  summary?: string;
};
export const INITIAL_MEETING_STATE: MeetingState = { status: "idle", seq: 0 };
