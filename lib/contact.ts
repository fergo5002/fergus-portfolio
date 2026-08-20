/**
 * Everything the contact form needs on both sides of the wire: what counts as a
 * valid submission, what a bot looks like, what Resend gets posted, and the
 * `mailto:` that has to work when none of the above does.
 *
 * **Why this file exists.** The call to action used to be a bare `mailto:` link
 * labelled "Email me". On a machine with no mail client registered, which is
 * most of them now, clicking it does nothing at all: no error, no new tab, no
 * feedback. Fergus reported it as a dead button and he was right. So the button
 * now goes to a page, and this module is the page's logic.
 *
 * **Client-safe by construction.** Nothing here reads an environment variable
 * or holds a secret, because `components/ContactForm.tsx` imports it for the
 * field limits and ships it to the browser. The half that needs a key lives in
 * `lib/contact-server.ts`, which nothing client-side may import.
 *
 * **The failure path is the feature.** A contact form that can only succeed is
 * the same dead button in a nicer jumper: a missing API key, a rejected domain
 * or a dropped connection all end with a visitor who typed a message and lost
 * it. Every failure in `lib/contact-server.ts` therefore returns the fields and
 * a `mailtoFallback()` that already contains them, so the worst case is a
 * pre-filled email rather than an apology.
 */

import { profile } from "@/content/profile";

export type ContactFields = {
  name: string;
  email: string;
  message: string;
};

export type FieldErrors = Partial<Record<keyof ContactFields, string>>;

export type Validation =
  | { ok: true; fields: ContactFields }
  | { ok: false; errors: FieldErrors; fields: ContactFields };

export const EMPTY_FIELDS: ContactFields = { name: "", email: "", message: "" };

export type FailureReason = "unconfigured" | "rejected" | "unreachable";

/**
 * What the action hands back, and therefore what the form renders.
 *
 * Declared on this side of the split rather than beside the code that produces
 * it, because `components/ContactForm.tsx` needs the initial value and pulling
 * it from `lib/contact-server.ts` would drag a module that reads `process.env`
 * into the browser bundle.
 *
 * `seq` counts answers. The form re-keys its inputs on it so a rejected
 * submission comes back with every field still filled, and re-announces the
 * result so a second identical outcome is not silent to a screen reader.
 */
export type ContactState =
  | { status: "idle"; seq: number }
  | { status: "sent"; seq: number }
  | { status: "invalid"; seq: number; errors: FieldErrors; fields: ContactFields }
  | {
      status: "failed";
      seq: number;
      reason: FailureReason;
      fields: ContactFields;
      mailto: string;
    };

export const INITIAL_CONTACT_STATE: ContactState = { status: "idle", seq: 0 };

/**
 * Hard caps, enforced on the server rather than trusted from `maxLength`.
 *
 * 254 is the maximum length of an email address that can be delivered at all
 * (RFC 5321), so anything longer is not a person we are turning away.
 */
export const CONTACT_LIMITS = { name: 100, email: 254, message: 4000 } as const;

/** Shorter than this is not a message, it is a mis-click or a probe. */
export const MESSAGE_MIN = 10;

/**
 * Below this, a submission is *marked* as suspiciously fast. It is never
 * discarded for it. See `filledImplausiblyFast` for why that distinction is the
 * whole point.
 */
export const MIN_FILL_MS = 2000;

/**
 * The wire names of the two fields no human ever fills in.
 *
 * `hp` is deliberately meaningless. Naming a honeypot `website`, `company` or
 * `phone` is the standard advice and it is wrong on a modern browser, because
 * those are exactly the labels a password manager or an autofill heuristic
 * recognises: it fills the invisible field, and the form silently swallows a
 * real person's message while telling them it sent.
 */
export const HONEYPOT_FIELD = "hp";
export const ELAPSED_FIELD = "elapsed";

export const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * The default sender.
 *
 * `onboarding@resend.dev` is Resend's shared testing sender and needs no domain
 * and no DNS records, so pasting an API key into Vercel can be the entire
 * setup. **With one condition**, checked against Resend's own docs rather than
 * assumed: the shared sender may only deliver to the address the Resend account
 * itself is registered under. Anything else comes back 403.
 *
 * So this default works with zero configuration exactly when `CONTACT_TO_EMAIL`
 * (which falls back to the address published on the site) is the address the
 * account was opened with. If it is not, or if the destination ever needs to
 * move, the fix is a verified domain and `CONTACT_FROM_EMAIL`, not a change
 * here.
 *
 * A 403 is not a silent failure: it is a non-`ok` response, so
 * `lib/contact-server.ts` returns `failed` and the page hands the visitor their
 * message back as a `mailto:`.
 */
export const DEFAULT_FROM = "Portfolio <onboarding@resend.dev>";

/** Anything that is not a string is treated as an empty one, never as a throw. */
function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Control characters, excluding the ones that are legitimate in prose.
 *
 * The name is interpolated into a subject line, and a newline in a subject is
 * the classic header-injection shape. The Resend REST API takes JSON and builds
 * the headers itself, so this is not the only thing standing between a visitor
 * and a forged `Bcc`, but handing a parser a control character and trusting it
 * to stay strict is not a position worth defending.
 */
const CONTROL = /[\u0000-\u001f\u007f]/;
/** The same, minus tab, newline and carriage return, which are just formatting. */
const CONTROL_IN_PROSE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

/**
 * Deliberately not an RFC 5322 parser. The only judgement being made is "could
 * this be delivered", and the one shape worth rejecting is a domain with no dot
 * in it, because `fergus@localhost` is a typo every time on a public form.
 */
const EMAIL = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

export function validateContact(raw: {
  name?: unknown;
  email?: unknown;
  message?: unknown;
}): Validation {
  const typed: ContactFields = {
    name: str(raw?.name),
    email: str(raw?.email),
    message: str(raw?.message),
  };

  const errors: FieldErrors = {};

  if (!typed.name) errors.name = "Tell me who you are.";
  else if (typed.name.length > CONTACT_LIMITS.name)
    errors.name = `Keep it under ${CONTACT_LIMITS.name} characters.`;
  else if (CONTROL.test(typed.name)) errors.name = "That name has characters I can't send.";

  if (!typed.email) errors.email = "I need somewhere to reply to.";
  else if (typed.email.length > CONTACT_LIMITS.email)
    errors.email = "That address is longer than an address can be.";
  else if (CONTROL.test(typed.email) || !EMAIL.test(typed.email))
    errors.email = "That doesn't look like an email address.";

  if (!typed.message) errors.message = "Say something and I'll read it.";
  else if (typed.message.length < MESSAGE_MIN)
    errors.message = `A few more words than that, please.`;
  else if (typed.message.length > CONTACT_LIMITS.message)
    errors.message = `Keep it under ${CONTACT_LIMITS.message} characters.`;
  else if (CONTROL_IN_PROSE.test(typed.message))
    errors.message = "That message has characters I can't send.";

  // Echoed back exactly as typed, minus the surrounding whitespace. With
  // JavaScript off there is no client-side copy of the form, so this is the
  // only thing that stops a rejected submission from wiping the message.
  if (Object.keys(errors).length > 0) return { ok: false, errors, fields: typed };

  // Lower-cased only once it is known to be going out, so two notes from the
  // same person do not read as two different people in a mailbox.
  return { ok: true, fields: { ...typed, email: typed.email.toLowerCase() } };
}

/**
 * Two spam signals, and they are deliberately not equals. One may discard a
 * message; the other may only label it.
 *
 * That split is the correction to a real bug in the first version of this file,
 * which treated them as one predicate and dropped a submission on either. There
 * is no CAPTCHA here on purpose: a personal contact form is not worth making a
 * human solve a puzzle. If this stops being enough the answer is a real
 * service, not a harder puzzle.
 */

/**
 * The hard signal, and the only thing here allowed to discard a message.
 *
 * A field positioned off-screen, removed from the tab order, `aria-hidden` from
 * assistive tech, and named nothing an autofill heuristic recognises. Filling
 * it is not something a person does by accident, which is what earns it the
 * right to drop a submission silently.
 */
export function honeypotFilled(raw: { honeypot?: unknown }): boolean {
  return Boolean(str(raw?.honeypot));
}

/**
 * The soft signal. **It marks a message. It must never discard one.**
 *
 * The first version of this let a fast submission be reported as sent while
 * being thrown away, and that was wrong in the worst possible place. The
 * reasoning behind it, that "two seconds is far below any real typist", was
 * true about typing and irrelevant in practice, because a real visitor does not
 * have to type:
 *
 *  - the name and email fields carry `autocomplete` on purpose, so a browser
 *    profile fills both in a single click, at effectively zero milliseconds;
 *  - people arrive at a contact form with the message already written and paste
 *    it, which is normal behaviour for anyone who sends the same opener twice.
 *
 * Autofill plus a paste plus a deliberate click is comfortably under two
 * seconds, so the exact bug this page was built to remove, a control that
 * silently does nothing, had been rebuilt inside its own spam filter. Now a
 * fast submission is delivered with a marker in the subject, so it can be
 * filtered by a human who can see it rather than by a heuristic that cannot.
 */
export function filledImplausiblyFast(raw: { elapsed?: unknown }): boolean {
  const value = str(raw?.elapsed);
  // Written by a submit handler, so a visitor with JavaScript off never sends
  // one. Absent means unknown, and unknown is never held against anyone.
  if (value === "") return false;

  const elapsed = Number(value);
  if (!Number.isFinite(elapsed)) return false;

  // Negative means the value was made up: the client measures its own clock
  // against itself, so nothing honest can produce it.
  return elapsed < MIN_FILL_MS;
}

export type ResendPayload = {
  from: string;
  to: string[];
  reply_to: string;
  subject: string;
  text: string;
};

/**
 * The body posted to Resend.
 *
 * `reply_to` is the field that makes hitting reply work. Sending *as* the
 * visitor's address instead would be a spoof: our SPF record does not authorise
 * their domain, so it would land in spam or be rejected outright.
 */
export function resendPayload(
  fields: ContactFields,
  opts: { to: string; from: string; flagged?: boolean },
): ResendPayload {
  return {
    from: opts.from,
    to: [opts.to],
    reply_to: fields.email,
    // The prefix is greppable on purpose, so one filter catches every message
    // from the site. `[fast]` goes after it rather than replacing it, because a
    // flagged message is still a message and must still land in the same place:
    // the marker is there to be sorted by a person, not to route anything into
    // a hole. See `filledImplausiblyFast` for why it is a marker at all.
    subject: `[fergusoreilly.dev]${opts.flagged ? " [fast]" : ""} ${fields.name}`,
    text: [
      fields.message,
      "",
      "--",
      `${fields.name} <${fields.email}>`,
      "Sent from https://fergusoreilly.dev/contact",
    ].join("\n"),
  };
}

/**
 * The same message as an email the visitor sends themselves.
 *
 * Offered only after a send has already failed, which is the one moment a
 * `mailto:` is the right answer rather than the wrong one: by then they have a
 * visible address to fall back on either way, so a link that does nothing costs
 * them nothing.
 */
export function mailtoFallback(fields: ContactFields, to: string): string {
  const subject = encodeURIComponent(profile.bookingSubject);
  return `mailto:${to}?subject=${subject}&body=${encodeURIComponent(messageBody(fields))}`;
}

/**
 * The message as plain text.
 *
 * One definition on purpose: it is the body of the fallback `mailto:` and it is
 * what the copy button puts on the clipboard, and those two being the same
 * thing is the point. A visitor who tries the link, gets nothing, and then
 * copies instead should end up with an identical email.
 */
export function messageBody(fields: ContactFields): string {
  return [fields.message, "", "--", fields.name, fields.email].join("\n");
}

/** The address published on the site. Read, never retyped. */
export function publishedEmail(): string {
  return profile.contact.find((c) => c.href.startsWith("mailto:"))?.value ?? "";
}
