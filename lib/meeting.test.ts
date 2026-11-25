import { describe, expect, it, vi } from "vitest";
import { demoBusy, meetingDays, meetingSlots, meetingSummary, takenSlots, validMeetingSlot, type BusyTimes } from "./meeting";
import { BOOKING_LIMITS, submitMeeting, withinBookingLimits, type MeetingDeps } from "./meeting-server";

const now = new Date("2026-09-23T08:00:00Z");
const busy = demoBusy(now);
const live = (b: BusyTimes = busy) => async () => ({ mode: "live" as const, busy: b });
const demo = async () => ({ mode: "demo" as const, busy });
const down = async () => ({ mode: "down" as const });

const firstFree = () => meetingSlots(meetingDays(now, busy)[0], now, busy).find((s) => s.available)!;

function form(fields: Record<string, string>) {
  const data = new FormData();
  Object.entries(fields).forEach(([k, v]) => data.set(k, v));
  return data;
}

describe("meeting times", () => {
  it("offers weekday half-hours from 10:00 to 17:00, at least a day ahead, inside a bounded window", () => {
    const days = meetingDays(now, busy);
    expect(days.length).toBeGreaterThan(10);
    for (const day of days) {
      expect([0, 6]).not.toContain(new Date(`${day}T12:00:00Z`).getUTCDay());
      const slots = meetingSlots(day, now, busy);
      expect(slots.map((s) => s.label)[0]).toBe("10:00");
      expect(slots.map((s) => s.label).at(-1)).toBe("17:00");
      for (const slot of slots.filter((s) => s.available)) {
        expect(Date.parse(slot.id) - now.getTime()).toBeGreaterThanOrEqual(86_400_000);
        expect(validMeetingSlot(slot.id, now, busy)).toBe(true);
      }
    }
  });

  it("closes every half hour the calendar has anything in, including a meeting that only overlaps it", () => {
    const day = "2026-09-28";
    const at = (t: string) => Date.parse(`${day}T${t}:00Z`);
    // 10:15 to 11:00 Irish (summer time, so 09:15 to 10:00 UTC) takes 10:00 and 10:30.
    const slots = meetingSlots(day, now, [[at("09:15"), at("10:00")]]);
    expect(slots.filter((s) => !s.available).map((s) => s.label)).toEqual(["10:00", "10:30"]);
    expect(meetingSlots(day, now, []).every((s) => s.available)).toBe(true);
  });

  it("offers no day at all that the calendar has filled", () => {
    const day = "2026-09-28";
    const full: BusyTimes = [[Date.parse(`${day}T00:00:00Z`), Date.parse(`${day}T23:59:00Z`)]];
    expect(meetingDays(now, full)).not.toContain(day);
  });

  it("uses Irish civil time on both sides of the autumn clock change", () => {
    const before = meetingSlots("2026-10-23", new Date("2026-10-20T00:00Z"));
    const after = meetingSlots("2026-10-26", new Date("2026-10-20T00:00Z"));
    expect(before[0]).toMatchObject({ label: "10:00", id: "2026-10-23T09:00:00.000Z" });
    expect(after[0]).toMatchObject({ label: "10:00", id: "2026-10-26T10:00:00.000Z" });
  });

  it("rejects forged, busy, stale, weekend and distant slots", () => {
    const closed = meetingDays(now, busy).flatMap((d) => meetingSlots(d, now, busy)).find((s) => !s.available && Date.parse(s.id) > now.getTime() + 86_400_000)!;
    for (const id of [closed.id, "not a date", "2026-09-26T10:00:00.000Z", "2027-01-01T10:00:00.000Z", "2026-09-23T09:00:00.000Z", "2026-09-24T09:07:00.000Z"]) {
      expect(validMeetingSlot(id, now, busy), id).toBe(false);
    }
  });
});

describe("picking a time", () => {
  const visitor = () => ({ kind: "coffee", slot: firstFree().id, name: "Test Visitor", email: "visitor@example.com", note: "A place near town?", elapsed: "5000" });
  const ok = () => vi.fn().mockResolvedValue(new Response('{"id":"test"}', { status: 200 }));

  it("books it in the calendar when the calendar is live, and tells Fergus", async () => {
    const send = ok();
    const book = vi.fn().mockResolvedValue({ meet: "https://meet.google.com/x" });
    const deps: MeetingDeps = { now, env: { RESEND_API_KEY: "test-key" }, fetchImpl: send, availability: live(), book, allowBooking: async () => true };
    const state = await submitMeeting({ status: "idle", seq: 0 }, form(visitor()), deps);
    expect(state.status).toBe("booked");
    expect(book).toHaveBeenCalledWith({ kind: "coffee", slot: firstFree().id, name: "Test Visitor", email: "visitor@example.com", note: "A place near town?" });
    expect(JSON.parse(send.mock.calls[0][1].body).text).toContain("Booked in your calendar");
  });

  it("refuses a time that went busy since the page loaded, and books nothing", async () => {
    const slot = firstFree();
    const book = vi.fn();
    const taken: BusyTimes = [[Date.parse(slot.id), Date.parse(slot.id) + 1_800_000]];
    const state = await submitMeeting({ status: "idle", seq: 0 }, form(visitor()), { now, availability: live(taken), book, allowBooking: async () => true });
    expect(state.status).toBe("invalid");
    expect(state.errors?.slot).toBeTruthy();
    expect(book).not.toHaveBeenCalled();
  });

  it("sends a request instead when the day's bookings are used up, the store is down or the form was filled by a machine", async () => {
    for (const deps of [
      { allowBooking: async () => false },
      { allowBooking: async () => { throw new Error("calendar list failed"); } },
      { allowBooking: async () => true, fast: true },
    ]) {
      const send = ok();
      const book = vi.fn();
      const fields = deps.fast ? { ...visitor(), elapsed: "100" } : visitor();
      const state = await submitMeeting({ status: "idle", seq: 0 }, form(fields), { now, env: { RESEND_API_KEY: "k" }, fetchImpl: send, availability: live(), book, allowBooking: deps.allowBooking });
      expect(state.status).toBe("sent");
      expect(book).not.toHaveBeenCalled();
      expect(JSON.parse(send.mock.calls[0][1].body).text).toContain("Request only");
    }
  });

  it("sends a request instead when Google refuses the event, keeping the visitor's words", async () => {
    const send = ok();
    const book = vi.fn().mockRejectedValue(new Error("calendar: insert refused (403)"));
    const state = await submitMeeting({ status: "idle", seq: 0 }, form(visitor()), { now, env: { RESEND_API_KEY: "k" }, fetchImpl: send, availability: live(), book, allowBooking: async () => true });
    expect(state.status).toBe("sent");
    const payload = JSON.parse(send.mock.calls[0][1].body);
    expect(payload.text).toContain("A place near town?");
    expect(payload.text).toContain(meetingSummary("coffee", firstFree().id));
  });

  it("never books from a demo or a calendar that is down", async () => {
    for (const availability of [demo, down]) {
      const book = vi.fn();
      const state = await submitMeeting({ status: "idle", seq: 0 }, form(visitor()), { now, env: { RESEND_API_KEY: "k" }, fetchImpl: ok(), availability, book, allowBooking: async () => true });
      expect(state.status).toBe("sent");
      expect(book).not.toHaveBeenCalled();
    }
  });

  it("emails a request with the reply address, marks a fast form, and never leaks the key", async () => {
    const send = ok();
    const state = await submitMeeting({ status: "idle", seq: 0 }, form({ ...visitor(), elapsed: "100" }), { now, env: { RESEND_API_KEY: "test-key" }, fetchImpl: send, availability: demo });
    expect(state.status).toBe("sent");
    const payload = JSON.parse(send.mock.calls[0][1].body);
    expect(payload.reply_to).toBe("visitor@example.com");
    expect(payload.text).toContain("30 minutes");
    expect(payload.subject).toContain("[fast]");
    expect(JSON.stringify(state)).not.toContain("test-key");
  });

  it("does not send a forged request and preserves the visitor's words on provider failure", async () => {
    const send = vi.fn().mockResolvedValue(new Response("", { status: 429 }));
    const fields = { kind: "call", slot: "2026-09-23T10:00:00.000Z", name: "Test Visitor", email: "visitor@example.com", note: "Talk about a project" };
    expect((await submitMeeting({ status: "idle", seq: 0 }, form(fields), { now, fetchImpl: send, availability: demo })).status).toBe("invalid");
    expect(send).not.toHaveBeenCalled();
    const state = await submitMeeting({ status: "idle", seq: 0 }, form({ ...fields, slot: firstFree().id }), { now, env: { RESEND_API_KEY: "test-key" }, fetchImpl: send, availability: demo });
    expect(state.status).toBe("failed");
    expect(state.fields?.note).toBe("Talk about a project");
    expect(state.mailto).toMatch(/^mailto:/);
  });

  it("discards a filled honeypot without booking or sending", async () => {
    const send = ok();
    const book = vi.fn();
    const state = await submitMeeting({ status: "idle", seq: 0 }, form({ ...visitor(), hp: "spam" }), { now, fetchImpl: send, availability: live(), book, allowBooking: async () => true });
    expect(state.status).toBe("sent");
    expect(book).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});

describe("what the page is sent (2026-11-25 review)", () => {
  it("is the offered half hours that are taken, never the calendars' own times", () => {
    const evening = Date.parse("2026-09-28T19:07:00Z");
    const lunch = Date.parse("2026-09-28T12:10:00Z");
    const raw: BusyTimes = [[evening, evening + 47 * 60_000], [lunch, lunch + 40 * 60_000]];
    const taken = takenSlots(now, raw);
    // Lunch at 13:10 to 13:50 Irish time touches the 13:00 and 13:30 slots.
    expect(taken).toEqual([
      [Date.parse("2026-09-28T12:00:00Z"), Date.parse("2026-09-28T12:30:00Z")],
      [Date.parse("2026-09-28T12:30:00Z"), Date.parse("2026-09-28T13:00:00Z")],
    ]);
  });

  it("offers exactly what the raw busy times would", () => {
    const taken = takenSlots(now, busy);
    expect(meetingDays(now, taken)).toEqual(meetingDays(now, busy));
    for (const day of meetingDays(now, busy)) expect(meetingSlots(day, now, taken)).toEqual(meetingSlots(day, now, busy));
  });
});

describe("the booking caps, counted in the calendar (2026-11-25)", () => {
  const today = now.getTime() - 3_600_000;
  const lastWeek = now.getTime() - 5 * 86_400_000;
  const many = (n: number, who = "x@example.com", updated = today) => Array.from({ length: n }, () => ({ visitor: who, updated }));

  it("allows three a visitor and eight a day, booked in the last day", () => {
    expect(BOOKING_LIMITS).toEqual({ perVisitor: 3, perDay: 8, upcoming: 12 });
    expect(withinBookingLimits(many(2, "ada@example.com"), "ada@example.com", now)).toBe(true);
    expect(withinBookingLimits(many(3, "ada@example.com"), "ada@example.com", now)).toBe(false);
    expect(withinBookingLimits(many(3, "ada@example.com"), "bob@example.com", now)).toBe(true);
    expect(withinBookingLimits(many(7), "new@example.com", now)).toBe(true);
    expect(withinBookingLimits(many(8), "new@example.com", now)).toBe(false);
    // Older bookings do not count against today.
    expect(withinBookingLimits(many(8, "x@example.com", lastWeek), "new@example.com", now)).toBe(true);
  });

  it("stops at twelve upcoming, so a script cannot fill the four weeks a day at a time", () => {
    expect(withinBookingLimits(many(11, "x@example.com", lastWeek), "new@example.com", now)).toBe(true);
    expect(withinBookingLimits(many(12, "x@example.com", lastWeek), "new@example.com", now)).toBe(false);
  });

  it("counts one person once whatever the case they type", () => {
    expect(withinBookingLimits(many(3, "ada@example.com"), "  Ada@Example.COM ", now)).toBe(false);
  });

  it("hands the cap the visitor's address and the clock", async () => {
    const seen: unknown[] = [];
    const fields = { kind: "coffee", slot: firstFree().id, name: "Test Visitor", email: "visitor@example.com", note: "", elapsed: "5000" };
    const book = vi.fn().mockResolvedValue({});
    await submitMeeting({ status: "idle", seq: 0 }, form(fields), {
      now, env: { RESEND_API_KEY: "k" }, fetchImpl: vi.fn().mockResolvedValue(new Response("{}", { status: 200 })), availability: live(), book,
      allowBooking: async (email, at) => { seen.push(email, at); return true; },
    });
    expect(seen[0]).toBe("visitor@example.com");
    expect(seen[1]).toBe(now);
    expect(book).toHaveBeenCalledOnce();
  });
});

describe("what never books itself (2026-11-25 review)", () => {
  const base = () => ({ kind: "coffee", slot: firstFree().id, name: "Test Visitor", email: "visitor@example.com", note: "", elapsed: "5000" });
  const run = async (fields: Record<string, string>) => {
    const book = vi.fn().mockResolvedValue({});
    const send = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    const state = await submitMeeting({ status: "idle", seq: 0 }, form(fields), {
      now, env: { RESEND_API_KEY: "k" }, fetchImpl: send, availability: live(), book, allowBooking: async () => true,
    });
    return { state, book, send };
  };

  it("a post with no timing field, which no page ever sends, becomes a request", async () => {
    const { elapsed: _, ...scripted } = base();
    const { state, book } = await run(scripted);
    expect(book).not.toHaveBeenCalled();
    expect(state.status).toBe("sent");
  });

  it("a link in the name or the note becomes a request, so Google never mails one out", async () => {
    for (const odd of [{ name: "Win at prize.example" }, { note: "see https://example.com" }, { note: "www.example.com" }]) {
      const { state, book } = await run({ ...base(), ...odd });
      expect(book, JSON.stringify(odd)).not.toHaveBeenCalled();
      expect(state.status).toBe("sent");
    }
  });

  it("ordinary names and notes are not mistaken for links", async () => {
    for (const plain of [{ name: "J. R. Smith" }, { note: "e.g. Thursday morning, i.e. early." }, { name: "Seán Ó Sé" }]) {
      const { book } = await run({ ...base(), ...plain });
      expect(book, JSON.stringify(plain)).toHaveBeenCalledOnce();
    }
  });

  it("an ordinary booking still books, and the note reaches Fergus", async () => {
    const { state, book, send } = await run({ ...base(), note: "Keen to chat about Hatch." });
    expect(book).toHaveBeenCalledOnce();
    expect(state.status).toBe("booked");
    expect(String(send.mock.calls[0][1]?.body)).toContain("Keen to chat about Hatch.");
  });
});
