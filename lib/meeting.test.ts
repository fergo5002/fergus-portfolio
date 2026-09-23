import { describe, expect, it, vi } from "vitest";
import { meetingDays, meetingSlots, meetingSummary, validMeetingSlot } from "./meeting";
import { submitMeeting } from "./meeting-server";

const now = new Date("2026-09-23T08:00:00Z");

describe("meeting requests", () => {
  it("offers stable weekday half-hours, at least a day ahead, inside a bounded window", () => {
    const days = meetingDays(now);
    expect(days.length).toBeGreaterThan(10);
    expect(days).toEqual(meetingDays(now));
    for (const day of days) {
      expect([0, 6]).not.toContain(new Date(`${day}T12:00:00Z`).getUTCDay());
      const slots = meetingSlots(day, now);
      expect(slots.some((s) => !s.available)).toBe(true);
      expect(slots.some((s) => s.available)).toBe(true);
      for (const slot of slots.filter((s) => s.available)) {
        expect(Date.parse(slot.id) - now.getTime()).toBeGreaterThanOrEqual(86_400_000);
        expect(slot.label).toMatch(/^(1[0-6]):(00|30)$/);
        expect(validMeetingSlot(slot.id, now)).toBe(true);
      }
    }
  });

  it("uses Irish civil time on both sides of the autumn clock change", () => {
    const before = meetingSlots("2026-10-23", new Date("2026-10-20T00:00Z"));
    const after = meetingSlots("2026-10-26", new Date("2026-10-20T00:00Z"));
    expect(before[0]).toMatchObject({ label: "10:00", id: "2026-10-23T09:00:00.000Z" });
    expect(after[0]).toMatchObject({ label: "10:00", id: "2026-10-26T10:00:00.000Z" });
  });

  it("rejects forged, closed, stale, weekend and distant slots", () => {
    const closed = meetingSlots(meetingDays(now)[0], now).find((s) => !s.available)!;
    for (const id of [closed.id, "not a date", "2026-09-26T10:00:00.000Z", "2027-01-01T10:00:00.000Z", "2026-09-23T09:00:00.000Z", "2026-09-24T09:07:00.000Z"]) {
      expect(validMeetingSlot(id, now), id).toBe(false);
    }
  });

  it("emails a request, retains the reply address, and never claims a confirmed booking", async () => {
    const slot = meetingSlots(meetingDays(now)[0], now).find((s) => s.available)!;
    const form = new FormData();
    Object.entries({ kind: "coffee", slot: slot.id, name: "Test Visitor", email: "visitor@example.com", note: "A place near town?", elapsed: "100" }).forEach(([k,v]) => form.set(k,v));
    const send = vi.fn().mockResolvedValue(new Response('{"id":"test"}', { status: 200 }));
    const state = await submitMeeting({ status: "idle", seq: 0 }, form, { now, env: { RESEND_API_KEY: "test-key" }, fetchImpl: send });
    expect(state.status).toBe("sent");
    const payload = JSON.parse(send.mock.calls[0][1].body);
    expect(payload.reply_to).toBe("visitor@example.com");
    expect(payload.text).toContain(meetingSummary("coffee", slot.id));
    expect(payload.text).toContain("30 minutes");
    expect(payload.text).toContain("A place near town?");
    expect(payload.text).toContain("Request only");
    expect(payload.subject).toContain("[fast]");
    expect(JSON.stringify(state)).not.toContain("test-key");
  });

  it("does not send a forged request and preserves the visitor's words on provider failure", async () => {
    const form = new FormData();
    Object.entries({ kind: "call", slot: "2026-09-23T10:00:00.000Z", name: "Test Visitor", email: "visitor@example.com", note: "Talk about a project" }).forEach(([k,v]) => form.set(k,v));
    const send = vi.fn().mockResolvedValue(new Response("", { status: 429 }));
    expect((await submitMeeting({ status: "idle", seq: 0 }, form, { now, fetchImpl: send })).status).toBe("invalid");
    expect(send).not.toHaveBeenCalled();
    form.set("slot", meetingSlots(meetingDays(now)[0], now).find((s) => s.available)!.id);
    const state = await submitMeeting({ status: "idle", seq: 0 }, form, { now, env: { RESEND_API_KEY: "test-key" }, fetchImpl: send });
    expect(state.status).toBe("failed");
    expect(state.fields?.note).toBe("Talk about a project");
    expect(state.fields?.slot).toBe(form.get("slot"));
    expect(state.mailto).toMatch(/^mailto:/);
  });
});
