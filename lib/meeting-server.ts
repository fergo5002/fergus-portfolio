import { submitContact, type ContactDeps } from "./contact-server";
import { validateContact, HONEYPOT_FIELD, ELAPSED_FIELD, honeypotFilled } from "./contact";
import { meetingSummary, validMeetingSlot, type MeetingFields, type MeetingKind, type MeetingState } from "./meeting";
import { meetingCopy } from "@/content/meeting";

export async function submitMeeting(
  prev: MeetingState,
  data: FormData,
  deps: ContactDeps & { now?: Date } = {},
): Promise<MeetingState> {
  const seq = (prev?.seq ?? 0) + 1;
  if (honeypotFilled({ honeypot: data.get(HONEYPOT_FIELD) })) return { status: "sent", seq };
  const read = (key: string) => typeof data.get(key) === "string" ? (data.get(key) as string).trim() : "";
  const fields: MeetingFields = { kind: read("kind"), slot: read("slot"), name: read("name"), email: read("email"), note: read("note") };
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
  if (!validMeetingSlot(fields.slot, deps.now ?? new Date())) errors.slot = meetingCopy.errors.slot;
  if (Object.values(errors).some(Boolean)) return { status: "invalid", seq, fields, errors };

  const summary = meetingSummary(fields.kind as MeetingKind, fields.slot);
  const message = [summary, "", "Request only. Please confirm the time and meeting details by email.", "", fields.note].join("\n");
  const contact = new FormData();
  contact.set("name", fields.name);
  contact.set("email", fields.email);
  contact.set("message", message);
  for (const key of [HONEYPOT_FIELD, ELAPSED_FIELD]) contact.set(key, read(key));
  const result = await submitContact({ status: "idle", seq: prev?.seq ?? 0 }, contact, {
    ...deps,
    fetchImpl: deps.fetchImpl ?? ((input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(12_000) })),
  });
  if (result.status === "sent") return { status: "sent", seq, summary };
  if (result.status === "failed") return { status: "failed", seq, fields, mailto: result.mailto };
  return { status: "invalid", seq, fields, errors: result.status === "invalid" ? result.errors : {} };
}
