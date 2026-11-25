import { describe, expect, it, vi } from "vitest";
import { BOOKING_TAG, availability, bookMeeting, busyTimes, calendarConfig, siteBookings, resetCalendarCache } from "./calendar";

const env = {
  GOOGLE_CALENDAR_CLIENT_ID: "client-id",
  GOOGLE_CALENDAR_CLIENT_SECRET: "client-secret",
  GOOGLE_CALENDAR_REFRESH_TOKEN: "refresh-token",
  GOOGLE_CALENDAR_BUSY_IDS: "me@example.com, team@example.com",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** A fake Google: the token endpoint, free/busy and event insert. */
function google(overrides: { freebusy?: unknown; freebusyStatus?: number; insert?: unknown; insertStatus?: number; token?: number; list?: unknown; listStatus?: number } = {}) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      return overrides.token ? json({ error: "invalid_grant" }, overrides.token) : json({ access_token: "access", expires_in: 3600 });
    }
    if (url.startsWith("https://www.googleapis.com/calendar/v3/freeBusy")) {
      return json(overrides.freebusy ?? {
        calendars: {
          "me@example.com": { busy: [{ start: "2026-11-26T10:00:00Z", end: "2026-11-26T10:30:00Z" }] },
          "team@example.com": { busy: [{ start: "2026-11-27T15:30:00Z", end: "2026-11-27T18:00:00Z" }] },
        },
      }, overrides.freebusyStatus ?? 200);
    }
    if (url.startsWith("https://www.googleapis.com/calendar/v3/calendars/") && (init?.method ?? "GET") === "GET") {
      return json(overrides.list ?? { items: [] }, overrides.listStatus ?? 200);
    }
    if (url.startsWith("https://www.googleapis.com/calendar/v3/calendars/")) {
      return json(overrides.insert ?? { id: "evt", htmlLink: "https://calendar.google.com/x", hangoutLink: "https://meet.google.com/abc" }, overrides.insertStatus ?? 200);
    }
    throw new Error(`unexpected ${url} ${init?.method}`);
  });
}

describe("the calendar's configuration", () => {
  it("is absent until all three secrets are set, and reads its calendars from a list", () => {
    expect(calendarConfig({})).toBeNull();
    expect(calendarConfig({ ...env, GOOGLE_CALENDAR_REFRESH_TOKEN: "" })).toBeNull();
    expect(calendarConfig(env)).toMatchObject({ busyIds: ["me@example.com", "team@example.com"], bookId: "primary" });
  });
});

describe("busy times", () => {
  it("merges every calendar's busy times into one list", async () => {
    const busy = await busyTimes(new Date("2026-11-25T00:00Z"), new Date("2026-12-23T00:00Z"), { env, fetchImpl: google() });
    expect(busy).toEqual([
      [Date.parse("2026-11-26T10:00:00Z"), Date.parse("2026-11-26T10:30:00Z")],
      [Date.parse("2026-11-27T15:30:00Z"), Date.parse("2026-11-27T18:00:00Z")],
    ]);
  });

  it("refuses to guess when Google could not read one of the calendars", async () => {
    const fetchImpl = google({ freebusy: { calendars: { "me@example.com": { busy: [] }, "team@example.com": { errors: [{ reason: "notFound" }] } } } });
    await expect(busyTimes(new Date(), new Date(), { env, fetchImpl })).rejects.toThrow(/team@example.com/);
  });

  it("fails when the refresh token has been revoked", async () => {
    await expect(busyTimes(new Date(), new Date(), { env, fetchImpl: google({ token: 400 }) })).rejects.toThrow(/token/);
  });
});

describe("what /contact may offer", () => {
  it("is live times from the calendar when there is one", async () => {
    resetCalendarCache();
    const result = await availability(new Date("2026-11-25T09:00Z"), { env, fetchImpl: google() });
    expect(result.mode).toBe("live");
  });

  it("is nothing at all in production when the calendar is missing or down, never made-up times", async () => {
    resetCalendarCache();
    expect((await availability(new Date(), { env: { VERCEL_ENV: "production" } })).mode).toBe("down");
    resetCalendarCache();
    expect((await availability(new Date(), { env: { ...env, VERCEL_ENV: "production" }, fetchImpl: google({ freebusyStatus: 500 }) })).mode).toBe("down");
  });

  it("is a stable demo on a machine with no calendar, so the picker can be built and tested", async () => {
    resetCalendarCache();
    const result = await availability(new Date("2026-11-25T09:00Z"), { env: {} });
    expect(result.mode).toBe("demo");
  });
});

describe("booking", () => {
  it("creates the event on the primary calendar, invites the visitor and adds a Meet link to a call", async () => {
    const fetchImpl = google();
    const booked = await bookMeeting(
      { kind: "call", slot: "2026-11-26T11:00:00.000Z", name: "Ada", email: "ada@example.com", note: "About the site" },
      { env, fetchImpl },
    );
    expect(booked.meet).toBe("https://meet.google.com/abc");
    const [url, init] = fetchImpl.mock.calls.find(([u]) => String(u).includes("/events"))!;
    expect(String(url)).toContain("/calendars/primary/events");
    expect(String(url)).toContain("sendUpdates=all");
    expect(String(url)).toContain("conferenceDataVersion=1");
    const body = JSON.parse(String(init!.body));
    expect(body.summary).toBe("Call with Ada");
    expect(body.attendees).toEqual([{ email: "ada@example.com", displayName: "Ada" }]);
    expect(body.start.dateTime).toBe("2026-11-26T11:00:00.000Z");
    expect(body.end.dateTime).toBe("2026-11-26T11:30:00.000Z");
    expect(body.conferenceData.createRequest.conferenceSolutionKey.type).toBe("hangoutsMeet");
    // Google mails the event to whatever address was typed, so nothing the
    // visitor wrote goes in it beyond their name. The note goes to Fergus only.
    expect(body.description).not.toContain("About the site");
    expect(body.description).not.toContain("ada@example.com");
    // Tagged, so the caps can count the site's own bookings in the calendar.
    expect(body.extendedProperties.private).toEqual({ source: BOOKING_TAG, visitor: "ada@example.com" });
  });

  it("tags the visitor's address in lower case, so one person is one count", async () => {
    const fetchImpl = google();
    await bookMeeting({ kind: "coffee", slot: "2026-11-26T11:00:00.000Z", name: "Ada", email: "Ada@Example.com", note: "" }, { env, fetchImpl });
    const [, init] = fetchImpl.mock.calls.find(([u, i]) => String(u).includes("/events") && i?.method === "POST")!;
    expect(JSON.parse(String(init!.body)).extendedProperties.private.visitor).toBe("ada@example.com");
  });

  it("gives a coffee a place and no video link", async () => {
    const fetchImpl = google();
    await bookMeeting({ kind: "coffee", slot: "2026-11-26T11:00:00.000Z", name: "Ada", email: "ada@example.com", note: "" }, { env, fetchImpl });
    const [url, init] = fetchImpl.mock.calls.find(([u]) => String(u).includes("/events"))!;
    const body = JSON.parse(String(init!.body));
    expect(body.summary).toBe("Coffee with Ada");
    expect(body.location).toMatch(/Dublin/);
    expect(body.conferenceData).toBeUndefined();
    expect(String(url)).not.toContain("conferenceDataVersion");
  });

  it("throws rather than pretending when Google refuses the event", async () => {
    await expect(
      bookMeeting({ kind: "call", slot: "2026-11-26T11:00:00.000Z", name: "Ada", email: "ada@example.com", note: "" }, { env, fetchImpl: google({ insertStatus: 403 }) }),
    ).rejects.toThrow(/403/);
  });

  it("will not book anything without a calendar", async () => {
    await expect(
      bookMeeting({ kind: "call", slot: "2026-11-26T11:00:00.000Z", name: "Ada", email: "ada@example.com", note: "" }, { env: {} }),
    ).rejects.toThrow(/not configured/);
  });
});

/**
 * The booking caps count in the calendar itself (2026-11-25). The site has no
 * Redis in production, and the first version counted there, so every live pick
 * would have fallen back to an emailed request without anyone noticing.
 */
describe("the site's own bookings", () => {
  const now = new Date("2026-11-25T12:00:00Z");

  it("lists the upcoming events this site tagged, with who booked each and when", async () => {
    const fetchImpl = google({
      list: { items: [
        { updated: "2026-11-25T09:00:00.000Z", extendedProperties: { private: { source: BOOKING_TAG, visitor: "ada@example.com" } } },
        { updated: "2026-11-20T09:00:00.000Z", extendedProperties: { private: { source: BOOKING_TAG, visitor: "bob@example.com" } } },
        { status: "cancelled", updated: "2026-11-25T09:00:00.000Z", extendedProperties: { private: { source: BOOKING_TAG, visitor: "cy@example.com" } } },
      ] },
    });
    expect(await siteBookings(now, { env, fetchImpl })).toEqual([
      { visitor: "ada@example.com", updated: Date.parse("2026-11-25T09:00:00.000Z") },
      { visitor: "bob@example.com", updated: Date.parse("2026-11-20T09:00:00.000Z") },
    ]);
    const [url] = fetchImpl.mock.calls.find(([u, i]) => String(u).includes("/events") && (i?.method ?? "GET") === "GET")!;
    const q = new URL(String(url)).searchParams;
    expect(String(url)).toContain("/calendars/primary/events");
    expect(q.get("privateExtendedProperty")).toBe(`source=${BOOKING_TAG}`);
    expect(q.get("timeMin")).toBe("2026-11-25T12:00:00.000Z");
  });

  it("throws when Google will not say, so the caller refuses rather than books blind", async () => {
    await expect(siteBookings(now, { env, fetchImpl: google({ listStatus: 500 }) })).rejects.toThrow(/500/);
    await expect(siteBookings(now, { env: {} })).rejects.toThrow(/not configured/);
  });
});
