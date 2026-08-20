import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CONTACT_LIMITS,
  DEFAULT_FROM,
  EMPTY_FIELDS,
  HONEYPOT_FIELD,
  MESSAGE_MIN,
  MIN_FILL_MS,
  RESEND_ENDPOINT,
  filledImplausiblyFast,
  honeypotFilled,
  mailtoFallback,
  messageBody,
  resendPayload,
  validateContact,
} from "@/lib/contact";
import { profile } from "@/content/profile";

const good = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  message: "I read the piece on shipping with agents and I have a question about it.",
};

describe("validateContact", () => {
  it("accepts a real submission and trims every field", () => {
    const result = validateContact({
      name: "  Ada Lovelace  ",
      email: "  ADA@Example.com ",
      message: `  ${good.message}  `,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fields).toEqual({
      name: "Ada Lovelace",
      // Lower-cased so two submissions from the same person do not read as two
      // different people in a mailbox.
      email: "ada@example.com",
      message: good.message,
    });
  });

  it("names the field that is wrong rather than failing as a whole", () => {
    const result = validateContact({ name: "", email: "nope", message: "" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(["email", "message", "name"]);
    for (const message of Object.values(result.errors)) {
      expect(message).toBeTruthy();
    }
  });

  /**
   * The whole point of the page is that nothing a visitor typed is ever lost.
   * With JavaScript off there is no client state to fall back on, so the only
   * copy of the message is the one the action hands back to be re-rendered.
   */
  it("hands the submitted values back on failure so nothing typed is lost", () => {
    const result = validateContact({ name: "Ada", email: "nope", message: "too short" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fields).toEqual({ name: "Ada", email: "nope", message: "too short" });
  });

  it("rejects a message too short to be worth sending", () => {
    const short = "x".repeat(MESSAGE_MIN - 1);
    const result = validateContact({ ...good, message: short });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.message).toBeTruthy();
  });

  it("caps every field, so a paste of a novel cannot become the payload", () => {
    for (const field of ["name", "email", "message"] as const) {
      const limit = CONTACT_LIMITS[field];
      const over = validateContact({ ...good, [field]: "a".repeat(limit + 1) });
      expect(over.ok, `${field} over the cap`).toBe(false);
    }
  });

  it("wants a domain with a dot in it, not just an @", () => {
    for (const email of ["fergus@localhost", "fergus@", "@example.com", "fergus example.com"]) {
      const result = validateContact({ ...good, email });
      expect(result.ok, email).toBe(false);
    }
  });

  it("accepts the addresses real people actually have", () => {
    for (const email of [
      "first.last+portfolio@sub.example.co.uk",
      "f@a.io",
      "o'reilly@example.ie",
    ]) {
      const result = validateContact({ ...good, email });
      expect(result.ok, email).toBe(true);
    }
  });

  /**
   * The name is interpolated into the subject line. A newline in a subject is
   * the classic header-injection shape, and while the Resend REST API takes
   * JSON rather than raw headers, relying on somebody else's parser to stay
   * strict is not a reason to hand it a control character.
   */
  it("refuses control characters in the name and the address", () => {
    for (const field of ["name", "email"] as const) {
      for (const injection of ["Ada\nBcc: someone@example.com", "Ada\r\nX: y", "Ada\tB"]) {
        const result = validateContact({ ...good, [field]: injection });
        expect(result.ok, `${field}: ${JSON.stringify(injection)}`).toBe(false);
      }
    }
  });

  it("leaves newlines alone in the message, which is prose", () => {
    const result = validateContact({ ...good, message: "First line.\n\nSecond line." });
    expect(result.ok).toBe(true);
  });

  it("treats missing values the same as empty ones instead of throwing", () => {
    const result = validateContact({} as never);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fields).toEqual(EMPTY_FIELDS);
  });
});

describe("honeypotFilled", () => {
  it("catches a bot that filled the field a human cannot see", () => {
    expect(honeypotFilled({ honeypot: "https://buy-pills.example" })).toBe(true);
  });

  it("ignores a honeypot that is only whitespace", () => {
    expect(honeypotFilled({ honeypot: "   " })).toBe(false);
  });

  it("ignores an empty or absent one", () => {
    expect(honeypotFilled({ honeypot: "" })).toBe(false);
    expect(honeypotFilled({})).toBe(false);
  });

  /**
   * The failure this guards is silent and total: an autofill that recognises
   * the hidden field fills it, the submission is classed as a bot, and the
   * visitor is told their message sent when it went nowhere. Naming it after
   * anything a browser understands is what causes that. This matters more than
   * it used to, because the honeypot is now the only signal allowed to discard
   * anything.
   */
  it("does not name the honeypot after a field a browser knows how to fill", () => {
    const autofillable = [
      "website",
      "url",
      "company",
      "organization",
      "phone",
      "tel",
      "fax",
      "address",
      "city",
      "country",
      "nickname",
      "username",
    ];
    expect(autofillable).not.toContain(HONEYPOT_FIELD);
  });
});

describe("filledImplausiblyFast", () => {
  it("notices a submission faster than anyone can fill three fields", () => {
    expect(filledImplausiblyFast({ elapsed: String(MIN_FILL_MS - 1) })).toBe(true);
  });

  it("says nothing about a submission that took a normal amount of time", () => {
    expect(filledImplausiblyFast({ elapsed: String(MIN_FILL_MS + 1) })).toBe(false);
    expect(filledImplausiblyFast({ elapsed: "45000" })).toBe(false);
  });

  /**
   * `elapsed` is written by a client-side submit handler, so a visitor with
   * JavaScript off never sends one. Blocking on a missing value would break the
   * form for exactly the people the page exists to rescue, which is the same
   * mistake the mailto link was making.
   */
  it("says nothing at all when there is no timing", () => {
    expect(filledImplausiblyFast({})).toBe(false);
    expect(filledImplausiblyFast({ elapsed: "" })).toBe(false);
    expect(filledImplausiblyFast({ elapsed: "not a number" })).toBe(false);
  });

  it("treats a negative elapsed as forged, because nothing honest produces one", () => {
    expect(filledImplausiblyFast({ elapsed: "-5000" })).toBe(true);
  });

  /**
   * The line that matters, and the reason this is a separate function from
   * `honeypotFilled` rather than another branch of one predicate.
   *
   * A real visitor whose browser fills their name and email in one click and
   * who pastes a message they had already written lands under two seconds
   * without doing anything unusual. The first version of this code discarded
   * that submission and told them it had sent. Whatever else changes here, a
   * timing verdict must never be the thing that decides a message is dropped.
   */
  it("is a marker and not a verdict: it never reports the honeypot's answer", () => {
    const autofilledAndPasted = { elapsed: "900" };
    expect(filledImplausiblyFast(autofilledAndPasted)).toBe(true);
    // The two signals are separate functions on purpose. If a future change
    // merges them back into one, this stops compiling rather than quietly
    // resurrecting the bug.
    expect(honeypotFilled(autofilledAndPasted as { honeypot?: unknown })).toBe(false);
  });
});

describe("resendPayload", () => {
  const fields = { ...good };
  const payload = resendPayload(fields, { to: "me@example.com", from: DEFAULT_FROM });

  it("posts as us and replies to them", () => {
    expect(payload.from).toBe(DEFAULT_FROM);
    expect(payload.to).toEqual(["me@example.com"]);
    // The one field that decides whether hitting reply works. Sending as the
    // visitor's own address instead would be a spoof that fails SPF.
    expect(payload.reply_to).toBe("ada@example.com");
  });

  it("writes a subject that is greppable and carries the sender", () => {
    expect(payload.subject).toContain("fergusoreilly.dev");
    expect(payload.subject).toContain("Ada Lovelace");
    expect(payload.subject).not.toMatch(/[\r\n]/);
    // Unflagged by default: the marker is the exception, not the baseline.
    expect(payload.subject).not.toContain("[fast]");
  });

  /**
   * A flagged message is still a message. The marker exists so a person can
   * sort it, which only works if it arrives in the same place as everything
   * else, carrying the same prefix one filter already catches.
   */
  it("marks a suspiciously fast message without changing where it goes", () => {
    const flagged = resendPayload(fields, {
      to: "me@example.com",
      from: DEFAULT_FROM,
      flagged: true,
    });
    expect(flagged.subject).toContain("[fast]");
    expect(flagged.subject).toContain("[fergusoreilly.dev]");
    expect(flagged.subject).toContain("Ada Lovelace");
    expect(flagged.to).toEqual(payload.to);
    expect(flagged.reply_to).toBe(payload.reply_to);
    expect(flagged.text).toBe(payload.text);
  });

  it("repeats the address in the body, for clients that drop reply_to", () => {
    expect(payload.text).toContain(good.message);
    expect(payload.text).toContain("ada@example.com");
  });

  it("defaults to a sender that needs no DNS, and posts to the REST endpoint", () => {
    // Resend's shared testing sender needs no verified domain, so the form can
    // work the moment a key exists. See the DEFAULT_FROM docblock for the
    // condition attached to it: the shared sender only delivers to the address
    // the Resend account is registered under.
    expect(DEFAULT_FROM).toContain("onboarding@resend.dev");
    expect(RESEND_ENDPOINT).toBe("https://api.resend.com/emails");
  });

  /**
   * The REST API takes snake_case; only the SDKs take `replyTo`. Posting the
   * camelCase spelling with raw `fetch` is accepted and silently ignored, so
   * every reply would go to the shared sender instead of the visitor, and
   * nothing would look wrong until Fergus tried to answer one.
   */
  it("spells reply_to the way the REST API does, not the way the SDK does", () => {
    expect(Object.keys(payload)).toContain("reply_to");
    expect(Object.keys(payload)).not.toContain("replyTo");
  });
});

describe("mailtoFallback", () => {
  const href = mailtoFallback(good, "me@example.com");

  it("is a mailto that already contains everything they typed", () => {
    expect(href.startsWith("mailto:me@example.com?")).toBe(true);
    expect(href).toContain(encodeURIComponent(good.message));
    expect(href).toContain(encodeURIComponent("Ada Lovelace"));
  });

  it("encodes the parts rather than pasting them in raw", () => {
    const awkward = mailtoFallback({ ...good, message: "a&b=c #d" }, "me@example.com");
    expect(awkward).not.toContain("a&b=c #d");
    expect(awkward).toContain(encodeURIComponent("a&b=c #d"));
  });

  /**
   * The copy button puts `messageBody` on the clipboard and this link carries
   * it as a body. A visitor who tries the link, gets nothing, and copies
   * instead has to end up with the same email, so the two share one definition
   * rather than two that agree today.
   */
  it("carries exactly what the copy button would put on the clipboard", () => {
    expect(href).toContain(encodeURIComponent(messageBody(good)));
  });
});

/**
 * Source-level coupling checks on `components/ContactForm.tsx`.
 *
 * **What these cannot do.** Vitest runs in a `node` environment here, so
 * nothing can mount the component, and none of this proves any of it works.
 * They are greps. `lib/boot.test.ts` carries the same kind of block for the
 * same reason, and `AGENTS.md` records why: the inline boot script was the one
 * part of the app nothing could assert on, and that is how a two and a half
 * second error in it shipped.
 *
 * **Why they earn their place anyway.** The form leans on three tricks that are
 * each one line, each non-obvious, and each silently catastrophic to remove.
 * Nothing else in the suite would notice, and "verified by hand once" is not a
 * guard. If any of these ever needs changing, delete the assertion deliberately
 * rather than working around it.
 */
describe("ContactForm is wired the way the no-JS path needs", () => {
  const src = readFileSync(join(process.cwd(), "components", "ContactForm.tsx"), "utf8");

  it("was actually read", () => {
    expect(src).toContain("export default function ContactForm");
  });

  /**
   * React resets a form's uncontrolled fields after an action resolves. Without
   * a key that changes per answer, a rejected submission comes back with every
   * field wiped, which is a visitor losing their message to a typo in their own
   * email address.
   */
  it("re-keys its inputs on the answer counter", () => {
    const keyed = [...src.matchAll(/key=\{`\$\{field\.name\}-\$\{state\.seq\}`\}/g)];
    // One on the textarea branch, one on the input branch.
    expect(keyed.length).toBe(2);
  });

  /**
   * `null` rather than `{}`, so the server-rendered markup and the first client
   * render are identical. Seeding it with an object would make the client
   * render no errors where the server rendered some, which is a hydration
   * mismatch on the exact path that has no JavaScript to recover with.
   */
  it("starts client-side errors as null, not as an empty object", () => {
    expect(src).toMatch(/useState<FieldErrors \| null>\(null\)/);
    expect(src).toMatch(/clientErrors \?\? \(state\.status === "invalid"/);
  });

  /**
   * The copy button is the second escape hatch on a failed send, and rendering
   * one that cannot work would be the original bug again.
   */
  it("renders the copy button only once the clipboard API is known to exist", () => {
    expect(src).toMatch(/navigator\.clipboard\?\.writeText/);
    expect(src).toMatch(/\{canCopy && \(/);
  });

  /** Announced, not merely coloured. */
  it("gives field errors a role that a screen reader acts on", () => {
    expect(src).toMatch(/className="cform__error"[\s\S]{0,80}role="alert"/);
  });

  /**
   * Fail-open. If this ever becomes `String(Date.now())` or similar, a visitor
   * with no JavaScript starts sending a timestamp measured against the wrong
   * clock, and the marker stops meaning anything.
   */
  it("stamps elapsed time rather than a timestamp, and only at submit", () => {
    expect(src).toMatch(/elapsed\.current\.value = String\(Date\.now\(\) - startedAt\.current\)/);
    expect(src).toMatch(/onSubmit=\{stamp\}/);
  });

  /**
   * The membrane click.
   *
   * Every other text surface on this site clicks when you type in it, and the
   * contact form was the one that did not, which made the newest page the only
   * place the machine goes quiet. `audio.key()` is inert until sound has been
   * turned on and a gesture has started the AudioContext, so this cannot make a
   * page make noise unasked.
   *
   * The filter is asserted against `Terminal.tsx` rather than restated, because
   * two copies of a rule that agree today is how the shell and the form end up
   * sounding different. Modifiers on their own stay silent: a real keyboard's
   * shift key does not click either.
   */
  it("clicks on exactly the keys the shell clicks on", () => {
    const filter =
      /e\.key\.length === 1 \|\| e\.key === "Enter" \|\| e\.key === "Backspace" \|\| e\.key === "Tab"/;
    const terminal = readFileSync(join(process.cwd(), "components", "Terminal.tsx"), "utf8");

    expect(src).toMatch(filter);
    expect(terminal).toMatch(filter);
  });

  /**
   * Anchored to the handler's body, not to the file.
   *
   * The first version of this asserted a bare `audio.key()` against the whole
   * source, and `audio.key()` also appears in the docblock above the handler
   * explaining what it does. Deleting the actual call left the suite fully
   * green: the one line this change exists for had a test that could never
   * fail. A review caught it. `scripts/mutation-check.mjs` now empties the
   * handler as a mutation, so the guard has been shown to bite.
   */
  it("actually calls the synth from inside the handler", () => {
    const body = /const onKey = \([^)]*\) => \{([\s\S]*?)\n  \};/.exec(src)?.[1];
    expect(body, "onKey handler not found").toBeTruthy();
    expect(body).toContain("audio.key();");
  });

  it("puts the click on the fields themselves, not on the form", () => {
    // On the form it would also fire for Enter on the submit button, which is a
    // click for a keystroke that is not typing. `shared` is spread into both the
    // input and the textarea, so one line covers all three fields.
    expect(src).toMatch(/onKeyDown: onKey,/);

    // Sliced rather than measured by distance. The first version allowed 400
    // characters between `<form` and `onKeyDown`, which passed with about 400 to
    // spare and would have failed on correct code the moment anything between
    // them got shorter.
    //
    // Ended on the tag's own closing line rather than the next `>`. A `>` inside
    // an attribute, which is all it takes to write `onSubmit={(e) => stamp(e)}`,
    // would truncate the slice to a few characters and leave this passing for
    // ever afterwards, including on the day somebody hoists the handler onto the
    // form. That is an absence test quietly going green, which this repo has been
    // caught by before.
    const open = src.indexOf("<form\n");
    const close = src.indexOf("\n      >", open);
    expect(open, "opening <form tag not found").toBeGreaterThan(-1);
    expect(close, "closing bracket of the <form tag not found").toBeGreaterThan(open);
    const tag = src.slice(open, close);
    // Prove the slice really is the whole tag, so it cannot pass by being empty.
    expect(tag).toContain("action={action}");
    expect(tag).toContain("onSubmit={stamp}");
    expect(tag).not.toContain("onKeyDown");
  });
});

/**
 * The button this whole change exists for.
 *
 * `components/Talk.tsx` renders the call to action at the bottom of every page.
 * It was a `mailto:` and it did nothing on most machines. Nothing in the suite
 * noticed when a mutation pointed it somewhere else, which made it the one part
 * of the fix with no guard on it at all.
 */
describe("the call to action goes to a page", () => {
  const src = readFileSync(join(process.cwd(), "components", "Talk.tsx"), "utf8");

  it("was actually read", () => {
    expect(src).toContain("export default function Talk");
  });

  it("is an internal link to /contact", () => {
    expect(src).toMatch(/<Link className="talk__cta" href="\/contact">/);
  });

  /**
   * In the code, `mailto:` may still appear exactly once, where the published
   * address is looked up for the line printed under the button. It may never be
   * the button's own destination again.
   *
   * Comments are stripped first: the docblock in that file names `mailto:` when
   * explaining why the button changed, and counting prose would make this fail
   * for the wrong reason.
   */
  it("never makes a mailto the destination", () => {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).toContain("export default function Talk");

    expect([...code.matchAll(/mailto:/g)]).toHaveLength(1);
    expect(code).toMatch(/c\.href\.startsWith\("mailto:"\)/);
    expect(code).not.toMatch(/className="talk__cta"[\s\S]{0,120}mailto:/);
  });

  /** The booking URL still wins when set, and still opens off-site. */
  it("keeps the booking override, as an external link", () => {
    expect(src).toMatch(/profile\.booking \?/);
    expect(src).toMatch(/href=\{profile\.booking\}[\s\S]{0,120}target="_blank"/);
  });
});

describe("the published address", () => {
  it("is read from content rather than retyped", () => {
    // Same rule as lib/seo.ts: a second copy of an address is a claim that
    // quietly stops being true. This asserts the contact module has somewhere
    // to read it from at all.
    const email = profile.contact.find((c) => c.href.startsWith("mailto:"));
    expect(email?.value).toBeTruthy();
    expect(email?.href).toBe(`mailto:${email?.value}`);
  });
});
