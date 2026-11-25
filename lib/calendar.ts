import { randomUUID } from "node:crypto";
import { MEETING_DAYS, demoBusy, meetingEnd, type BusyTimes, type MeetingKind } from "./meeting";

/**
 * Fergus's Google calendars, for `/contact` (2026-11-25).
 *
 * Server only. Two calls to Google, both over plain `fetch` with no SDK:
 *
 * - **free/busy** across the calendars named in `GOOGLE_CALENDAR_BUSY_IDS`
 *   (his personal calendar, the Draft calendar shared into it, and Family), so
 *   the page offers only half hours that are free in all of them; and
 * - **insert** on his primary calendar when a visitor picks one, with the
 *   visitor as a guest and `sendUpdates=all`, so Google emails them the invite.
 *   A call gets a Google Meet link.
 *
 * The credentials are an OAuth refresh token for oreillferg@gmail.com from a
 * client of its own in his Google Cloud project, granted only free/busy and
 * events, so revoking it touches nothing else he has connected. Never the
 * workspace MCP's token.
 *
 * **Fails closed.** In production, a missing or broken calendar means the page
 * offers no times and says so, never times it made up. Off production with no
 * calendar it offers a stable demo (`demoBusy`) and can book nothing.
 */
type Env = Record<string, string | undefined>;
export type CalendarDeps = { env?: Env; fetchImpl?: typeof fetch };
export type CalendarConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  busyIds: string[];
  bookId: string;
};

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/calendar/v3";
const TIMEOUT_MS = 8_000;

export class CalendarError extends Error {}

export function calendarConfig(env: Env = process.env): CalendarConfig | null {
  const clientId = env.GOOGLE_CALENDAR_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim();
  const refreshToken = env.GOOGLE_CALENDAR_REFRESH_TOKEN?.trim();
  if (!clientId || !clientSecret || !refreshToken) return null;
  const busyIds = (env.GOOGLE_CALENDAR_BUSY_IDS ?? "primary").split(",").map((id) => id.trim()).filter(Boolean);
  return { clientId, clientSecret, refreshToken, busyIds, bookId: env.GOOGLE_CALENDAR_BOOK_ID?.trim() || "primary" };
}

function call(deps: CalendarDeps, url: string, init: RequestInit): Promise<Response> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  return fetchImpl(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
}

async function accessToken(cfg: CalendarConfig, deps: CalendarDeps): Promise<string> {
  const res = await call(deps, TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: cfg.refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });
  // The status only. Google's error body can echo the client id, and nothing
  // from this exchange belongs in a log line.
  if (!res.ok) throw new CalendarError(`calendar: token refresh refused (${res.status})`);
  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) throw new CalendarError("calendar: token refresh returned no access token");
  return body.access_token;
}

/** Every busy interval in any of the calendars between `from` and `to`, merged and sorted. */
export async function busyTimes(from: Date, to: Date, deps: CalendarDeps = {}): Promise<BusyTimes> {
  const cfg = calendarConfig(deps.env);
  if (!cfg) throw new CalendarError("calendar: not configured");
  const token = await accessToken(cfg, deps);
  const res = await call(deps, `${API}/freeBusy`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ timeMin: from.toISOString(), timeMax: to.toISOString(), items: cfg.busyIds.map((id) => ({ id })) }),
  });
  if (!res.ok) throw new CalendarError(`calendar: free/busy refused (${res.status})`);
  const body = (await res.json()) as {
    calendars?: Record<string, { busy?: { start: string; end: string }[]; errors?: unknown[] }>;
  };
  const busy: BusyTimes = [];
  for (const id of cfg.busyIds) {
    const entry = body.calendars?.[id];
    // A calendar Google could not read is not a free calendar. Offering its
    // busy afternoon as open is the one mistake this page must not make.
    if (!entry || entry.errors?.length) throw new CalendarError(`calendar: could not read ${id}`);
    for (const b of entry.busy ?? []) busy.push([Date.parse(b.start), Date.parse(b.end)]);
  }
  return busy.filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b)).sort((x, y) => x[0] - y[0]);
}

export type Availability = { mode: "live" | "demo"; busy: BusyTimes } | { mode: "down" };

/** A minute's memory per server instance, so a busy page is not a Google call per visit. */
let cached: { at: number; value: Availability } | null = null;
const CACHE_MS = 60_000;

export function resetCalendarCache(): void {
  cached = null;
}

/**
 * What `/contact` may offer right now. `fresh` skips the minute's cache, which
 * the server action always does before it books.
 */
export async function availability(now: Date, deps: CalendarDeps & { fresh?: boolean } = {}): Promise<Availability> {
  const env = deps.env ?? process.env;
  const cfg = calendarConfig(env);
  if (!cfg) return env.VERCEL_ENV === "production" ? { mode: "down" } : { mode: "demo", busy: demoBusy(now) };
  if (!deps.fresh && cached && now.getTime() - cached.at < CACHE_MS) return cached.value;
  let value: Availability;
  try {
    const busy = await busyTimes(new Date(now.getTime() - 86_400_000), new Date(now.getTime() + (MEETING_DAYS + 1) * 86_400_000), { ...deps, env });
    value = { mode: "live", busy };
  } catch (error) {
    console.error(error instanceof CalendarError ? error.message : "calendar: free/busy failed");
    value = { mode: "down" };
  }
  cached = { at: now.getTime(), value };
  return value;
}

export type Booking = { kind: MeetingKind; slot: string; name: string; email: string; note: string };

/** The private property every booking from this site carries, so the caps can count them. */
export const BOOKING_TAG = "fergusoreilly.dev";

/** Puts the meeting in the calendar and has Google invite the visitor. Throws on any refusal. */
export async function bookMeeting(booking: Booking, deps: CalendarDeps = {}): Promise<{ link?: string; meet?: string }> {
  const cfg = calendarConfig(deps.env);
  if (!cfg) throw new CalendarError("calendar: not configured");
  const token = await accessToken(cfg, deps);
  const call_ = booking.kind === "call";
  const event = {
    summary: `${call_ ? "Call" : "Coffee"} with ${booking.name}`,
    // Google mails this event to whatever address was typed, so it carries
    // nothing the visitor wrote beyond their name. Their note goes to Fergus
    // in his own email (lib/meeting-server.ts).
    description: "Booked on fergusoreilly.dev.",
    ...(call_ ? {} : { location: "Dublin. I'll email you where." }),
    start: { dateTime: booking.slot, timeZone: "Europe/Dublin" },
    end: { dateTime: meetingEnd(booking.slot), timeZone: "Europe/Dublin" },
    attendees: [{ email: booking.email, displayName: booking.name }],
    extendedProperties: { private: { source: BOOKING_TAG, visitor: booking.email.toLowerCase() } },
    ...(call_
      ? { conferenceData: { createRequest: { requestId: randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } } }
      : {}),
  };
  const query = new URLSearchParams({ sendUpdates: "all", ...(call_ ? { conferenceDataVersion: "1" } : {}) });
  const res = await call(deps, `${API}/calendars/${encodeURIComponent(cfg.bookId)}/events?${query}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(event),
  });
  if (!res.ok) throw new CalendarError(`calendar: insert refused (${res.status})`);
  const body = (await res.json()) as { htmlLink?: string; hangoutLink?: string };
  return { link: body.htmlLink, meet: body.hangoutLink };
}

export type SiteBooking = { visitor: string; updated: number };

/**
 * The upcoming meetings booked through this site: who booked each (lower
 * case) and when the event last changed. The booking caps count these.
 *
 * Counted in the calendar rather than a store because the site has no store in
 * production, and the calendar is already the record of what was booked.
 * Upcoming rather than "created today" because a booking can sit four weeks
 * out, and a cap on today alone would let a script fill the month a day at a
 * time. Throws on any refusal, and the caller treats a throw as no.
 */
export async function siteBookings(now: Date, deps: CalendarDeps = {}): Promise<SiteBooking[]> {
  const cfg = calendarConfig(deps.env);
  if (!cfg) throw new CalendarError("calendar: not configured");
  const token = await accessToken(cfg, deps);
  const query = new URLSearchParams({
    privateExtendedProperty: `source=${BOOKING_TAG}`,
    timeMin: now.toISOString(),
    showDeleted: "false",
    singleEvents: "true",
    maxResults: "250",
  });
  const res = await call(deps, `${API}/calendars/${encodeURIComponent(cfg.bookId)}/events?${query}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new CalendarError(`calendar: list refused (${res.status})`);
  const body = (await res.json()) as { items?: { status?: string; updated?: string; extendedProperties?: { private?: Record<string, string> } }[] };
  return (body.items ?? [])
    .filter((e) => e.status !== "cancelled" && e.extendedProperties?.private?.source === BOOKING_TAG)
    .map((e) => ({ visitor: (e.extendedProperties?.private?.visitor ?? "").toLowerCase(), updated: Date.parse(e.updated ?? "") || 0 }));
}
