/**
 * The half of the contact form that holds a key: turn a `FormData` into a
 * decision, and post it to Resend.
 *
 * **Nothing client-side may import this.** It reads `process.env` by default,
 * and the state it returns is serialised straight to the browser by React, so
 * the one invariant worth a test is that the API key never travels on it.
 *
 * **Every dependency is injectable.** `env`, `fetch` and the previous state all
 * arrive as arguments, which is the whole reason `lib/contact-server.test.ts`
 * can drive the unconfigured path, the rejected-by-Resend path and the
 * network-is-gone path without a server, a key, or a real send. The last two
 * are the ones that would otherwise only ever be exercised by a stranger who
 * has already typed a message.
 *
 * **Four outcomes, and only one of them is a dead end for the visitor:**
 *
 *  - `sent` ........... it went, or it was a bot and we are not saying so
 *  - `invalid` ........ a field is wrong; every field comes back as typed
 *  - `failed` ......... we could not send; the fields and a pre-filled
 *                       `mailto:` come back so the message is not lost
 *  - `idle` ........... nothing submitted yet
 *
 * `failed` deliberately collapses three different faults of ours (no API key,
 * Resend refused, the request never landed) into one thing the page can act on.
 * A visitor does not need to know which of our problems it was; they need their
 * message back and a way to send it.
 *
 * **There is no rate limiter here, and that is a decision rather than an
 * oversight.** This endpoint sends an email per accepted POST, so a script that
 * ignores the honeypot can burn the sending quota and fill an inbox. The reason
 * not to add a counter is that the only kind available without a shared store
 * is an in-memory one, and on serverless that is per-instance: it would stop
 * nobody who was actually trying, while reading in the code as though the
 * problem were handled. The real backstop is the provider's own quota, and it
 * degrades correctly, because a 429 is a non-`ok` response and lands on the
 * same `failed` path as everything else: the visitor still gets their message
 * back as a `mailto:`. If this ever needs closing properly, the answer is a
 * shared store or Vercel BotID, not a counter in a module variable.
 */

import {
  DEFAULT_FROM,
  ELAPSED_FIELD,
  HONEYPOT_FIELD,
  RESEND_ENDPOINT,
  filledImplausiblyFast,
  honeypotFilled,
  mailtoFallback,
  publishedEmail,
  resendPayload,
  validateContact,
  type ContactState,
  type FailureReason,
} from "@/lib/contact";

/**
 * A runtime fence, standing in for `import "server-only"`.
 *
 * The package would give a build-time error instead, which is better, but this
 * repo has seven dependencies and a standing rule about not adding an eighth
 * for something it can do itself. The pair that replaces it is this throw plus
 * a test in `lib/contact-server.test.ts` asserting no `"use client"` file in
 * the repo imports this module, which is the check that actually runs in CI.
 */
if (typeof window !== "undefined") {
  throw new Error("lib/contact-server.ts holds the API key and must never reach the browser");
}

// Re-exported so a caller needs one import rather than two, and so a client
// component is never tempted to reach into this module for the initial value.
export { INITIAL_CONTACT_STATE } from "@/lib/contact";
export type { ContactState, FailureReason } from "@/lib/contact";

type Env = Record<string, string | undefined>;

export type ContactDeps = {
  env?: Env;
  fetchImpl?: typeof fetch;
};

/**
 * Where the message goes.
 *
 * Defaults to the address already published on the site, read from `content/`
 * rather than retyped, for the same reason `lib/seo.ts` derives everything: a
 * second copy of an address is a claim that quietly stops being true. The env
 * var exists so the destination can move without a code change.
 */
export function contactTo(env: Env): string {
  return env.CONTACT_TO_EMAIL?.trim() || publishedEmail();
}

/** Who it comes from. See `DEFAULT_FROM` for why the default needs no DNS. */
function contactFrom(env: Env): string {
  return env.CONTACT_FROM_EMAIL?.trim() || DEFAULT_FROM;
}

export async function submitContact(
  prev: ContactState,
  formData: FormData,
  deps: ContactDeps = {},
): Promise<ContactState> {
  // Bumped on every answer so the form can tell a fresh reply from a repeat of
  // the last one, which is what lets it re-key its inputs and re-announce a
  // result to a screen reader.
  const seq = (prev?.seq ?? 0) + 1;

  // Checked before validation on purpose. Running the field rules first would
  // hand a bot a per-field critique of its own submission, which is a free
  // tutorial in getting past them.
  //
  // This is the ONLY thing here permitted to discard a message, and it earns
  // that by being a field a person cannot see, tab to, or have filled for them.
  // The timing signal used to sit in this branch too and no longer does: see
  // `filledImplausiblyFast` for the autofill-and-paste case that made it eat
  // real messages.
  if (honeypotFilled({ honeypot: formData.get(HONEYPOT_FIELD) })) {
    // Reported as sent. Telling a bot it was caught is telling it what to
    // change, and there is no human on the other end to mislead.
    return { status: "sent", seq };
  }

  const validation = validateContact({
    name: formData.get("name"),
    email: formData.get("email"),
    message: formData.get("message"),
  });

  if (!validation.ok) {
    return { status: "invalid", seq, errors: validation.errors, fields: validation.fields };
  }

  const fields = validation.fields;
  const env = deps.env ?? process.env;
  const to = contactTo(env);
  const failed = (reason: FailureReason): ContactState => ({
    status: "failed",
    seq,
    reason,
    fields,
    // Falls back to the published address, because a `mailto:` aimed at an
    // override that turned out to be empty is the dead button all over again.
    mailto: mailtoFallback(fields, to || publishedEmail()),
  });

  const key = env.RESEND_API_KEY?.trim();
  if (!key || !to) return failed("unconfigured");

  const send = deps.fetchImpl ?? fetch;

  let response: Response;
  try {
    response = await send(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        resendPayload(fields, {
          to,
          from: contactFrom(env),
          // Marks the email, never drops it. A real visitor who autofills two
          // fields and pastes a prepared message lands here, and they must get
          // through.
          flagged: filledImplausiblyFast({ elapsed: formData.get(ELAPSED_FIELD) }),
        }),
      ),
    });
  } catch {
    // An unhandled rejection inside a server action renders the error boundary,
    // which takes the page away and the visitor's message with it. The one
    // thing this whole module exists to prevent.
    return failed("unreachable");
  }

  if (!response.ok) return failed("rejected");

  return { status: "sent", seq };
}
