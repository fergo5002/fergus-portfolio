import { submitContact, type ContactDeps } from "./contact-server";
import { validateContact, HONEYPOT_FIELD, ELAPSED_FIELD, honeypotFilled, filledImplausiblyFast } from "./contact";
import { meetingSummary, validMeetingSlot, type BusyTimes, type MeetingFields, type MeetingKind, type MeetingState } from "./meeting";
import { availability, bookMeeting, siteBookings, type Availability, type Booking, type SiteBooking } from "./calendar";
import { meetingCopy } from "@/content/meeting";

/**
 * How many meetings the site will put in Fergus's calendar by itself: per
 * visitor and for everyone together, per day. Past either, a pick still
 * reaches him, as a request he confirms by email, so a bot can fill his inbox
 * at worst and never his week.
 */
export const BOOKING_LIMITS = { perVisitor: 3, perDay: 8, upcoming: 12 } as const;

export type MeetingDeps = ContactDeps & {
  now?: Date;
  /** What the calendar says. The real one is read fresh, never from the page's cache. */
  availability?: (now: Date) => Promise<Availability>;
  /** Puts it in the calendar. */
  book?: (booking: Booking) => Promise<{ link?: string; meet?: string }>;
  /** Whether this visitor and the day still have bookings left. False refuses; a throw refuses too. */
  allowBooking?: (email: string, now: Date) => Promise<boolean>;
};

/**
 * The caps, counted in the calendar itself (`siteBookings`). The first version
 * counted in Redis, which the site does not have in production, so every live
 * pick would have become an emailed request.
 *
 * Three a visitor and eight across everyone in the last day, and twelve
 * upcoming in all, because a booking can sit four weeks out and a daily cap
 * alone lets a script fill the month a day at a time. Per visitor is by the
 * address the invite goes to, which a visitor can vary; the other two hold
 * whatever they type. Past any of them a pick becomes an emailed request.
 */
export function withinBookingLimits(bookings: SiteBooking[], email: string, now: Date): boolean {
  if (bookings.length >= BOOKING_LIMITS.upcoming) return false;
  const recent = bookings.filter((b) => b.updated > now.getTime() - 86_400_000);
  if (recent.length >= BOOKING_LIMITS.perDay) return false;
  const me = email.trim().toLowerCase();
  return recent.filter((b) => b.visitor === me).length < BOOKING_LIMITS.perVisitor;
}

/** A web address, written any of the ways people write one. */
const LINKISH = /(https?:\/\/|www\.|\b[a-z0-9-]+\.[a-z]{2,}\b)/i;

/**
 * Whether this pick may go straight into the calendar. Google mails the
 * invite to whatever address was typed, from Fergus's account, so a pick books
 * itself only when it came from the page (the timing field, which the form
 * always writes and a bare script need not) and carries no link in the name or
 * note. Anything else still reaches him, as a request.
 */
function bookable(fields: MeetingFields, data: FormData): boolean {
  const elapsed = data.get(ELAPSED_FIELD);
  if (typeof elapsed !== "string" || elapsed.trim() === "") return false;
  if (filledImplausiblyFast({ elapsed })) return false;
  return !LINKISH.test(fields.name) && !LINKISH.test(fields.note);
}

export async function submitMeeting(
  prev: MeetingState,
  data: FormData,
  deps: MeetingDeps = {},
): Promise<MeetingState> {
  const seq = (prev?.seq ?? 0) + 1;
  if (honeypotFilled({ honeypot: data.get(HONEYPOT_FIELD) })) return { status: "sent", seq };
  const read = (key: string) => typeof data.get(key) === "string" ? (data.get(key) as string).trim() : "";
  const fields: MeetingFields = { kind: read("kind"), slot: read("slot"), name: read("name"), email: read("email"), note: read("note") };
  const now = deps.now ?? new Date();

  // Fresh, so two people cannot book the same half hour off one cached view.
  // A calendar that is down validates against nothing being busy, and the
  // pick goes to Fergus as a request rather than into the calendar.
  const calendar = await (deps.availability ?? ((at: Date) => availability(at, { env: deps.env, fresh: true })))(now);
  const busy: BusyTimes = calendar.mode === "down" ? [] : calendar.busy;

  const validation = validateContact({ ...fields, message: fields.note || "Meeting request" });
  const errors: MeetingState["errors"] = {};
  if (!validation.ok) {
    errors.name = validation.errors.name;
    errors.email = validation.errors.email;
    // A short optional note is fine. Reuse the control-character boundary.
    if (fields.note.length >= 10 && validation.errors.message) errors.note = validation.errors.message;
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(fields.note)) errors.note = meetingCopy.errors.plainText;
  if (fields.note.length > 2000) errors.note = meetingCopy.errors.note;
  if (fields.kind !== "coffee" && fields.kind !== "call") errors.kind = meetingCopy.errors.kind;
  if (!validMeetingSlot(fields.slot, now, busy)) errors.slot = meetingCopy.errors.slot;
  if (Object.values(errors).some(Boolean)) return { status: "invalid", seq, fields, errors };

  const kind = fields.kind as MeetingKind;
  const summary = meetingSummary(kind, fields.slot);

  // Into the calendar, when it is real, the form was not filled by a machine
  // in under two seconds, and the day's bookings are not used up. Anything
  // that stops it drops through to the request below, which still reaches him.
  if (calendar.mode === "live" && bookable(fields, data)) {
    let allowed = false;
    const allowBooking = deps.allowBooking
      ?? (async (email: string, at: Date) => withinBookingLimits(await siteBookings(at, { env: deps.env }), email, at));
    try {
      allowed = await allowBooking(fields.email, now);
    } catch {
      allowed = false;
    }
    if (allowed) {
      try {
        await (deps.book ?? ((b: Booking) => bookMeeting(b, { env: deps.env })))({ kind, slot: fields.slot, name: fields.name, email: fields.email, note: fields.note });
        // Google tells the visitor; this tells Fergus. Best effort: the
        // meeting is booked whether or not the note arrives.
        const booked = [summary, "", `Booked in your calendar. Google has sent ${fields.email} the invite.`, "", fields.note].join("\n").trim();
        await notify(fields, booked, data, deps).catch(() => undefined);
        return { status: "booked", seq, summary };
      } catch (error) {
        console.error(error instanceof Error ? error.message : "calendar: booking failed");
      }
    }
  }

  const message = [summary, "", "Request only. Please confirm the time and meeting details by email.", "", fields.note].join("\n");
  const result = await notify(fields, message, data, deps);
  if (result.status === "sent") return { status: "sent", seq, summary };
  if (result.status === "failed") return { status: "failed", seq, fields, mailto: result.mailto };
  return { status: "invalid", seq, fields, errors: result.status === "invalid" ? result.errors : {} };
}

/** The email to Fergus, through the contact form's sender and its spam rules. */
function notify(fields: MeetingFields, message: string, data: FormData, deps: MeetingDeps) {
  const contact = new FormData();
  contact.set("name", fields.name);
  contact.set("email", fields.email);
  contact.set("message", message);
  for (const key of [HONEYPOT_FIELD, ELAPSED_FIELD]) {
    const value = data.get(key);
    contact.set(key, typeof value === "string" ? value.trim() : "");
  }
  return submitContact({ status: "idle", seq: 0 }, contact, {
    ...deps,
    fetchImpl: deps.fetchImpl ?? ((input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(12_000) })),
  });
}
