import { describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { DEFAULT_FROM, RESEND_ENDPOINT } from "@/lib/contact";
import { INITIAL_CONTACT_STATE, contactTo, submitContact } from "@/lib/contact-server";
import { profile } from "@/content/profile";

const good = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  message: "I read the piece on shipping with agents and I have a question about it.",
};

function form(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const values: Record<string, string> = {
    name: good.name,
    email: good.email,
    message: good.message,
    // Literal wire names, not the constants. The form and the action have to
    // agree on the exact strings, and a test that reads the constant would
    // follow a rename in lockstep and prove nothing.
    hp: "",
    elapsed: "45000",
    ...overrides,
  };
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
}

/** A fetch that always succeeds, and remembers exactly what it was handed. */
function okFetch() {
  return vi.fn(
    async (_url: Parameters<typeof fetch>[0], _init?: RequestInit) =>
      new Response(JSON.stringify({ id: "re_123" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  );
}

/** The request the action actually made, without a cast at every call site. */
function request(fetchImpl: ReturnType<typeof okFetch>) {
  const [url, init] = fetchImpl.mock.calls[0] ?? [];
  return { url, init: init ?? {}, body: JSON.parse(String(init?.body ?? "{}")) };
}

const KEY = { RESEND_API_KEY: "re_test_key" };

describe("submitContact: the happy path", () => {
  it("sends, and says so", async () => {
    const fetchImpl = okFetch();
    const state = await submitContact(INITIAL_CONTACT_STATE, form(), { env: KEY, fetchImpl });

    expect(state.status).toBe("sent");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("posts JSON to Resend with the key as a bearer token", async () => {
    const fetchImpl = okFetch();
    await submitContact(INITIAL_CONTACT_STATE, form(), { env: KEY, fetchImpl });

    const { url, init, body } = request(fetchImpl);
    expect(url).toBe(RESEND_ENDPOINT);
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer re_test_key");
    expect(headers["Content-Type"]).toBe("application/json");

    expect(body.reply_to).toBe(good.email);
    expect(body.text).toContain(good.message);
  });

  /**
   * The state object is serialised and sent to the browser by React. Anything
   * that ends up on it is public, so the key must never travel on it, however
   * the send went.
   */
  it("never puts the API key on the state that reaches the browser", async () => {
    const fetchImpl = okFetch();
    const sent = await submitContact(INITIAL_CONTACT_STATE, form(), { env: KEY, fetchImpl });
    const failed = await submitContact(INITIAL_CONTACT_STATE, form(), {
      env: KEY,
      fetchImpl: vi.fn(async () => new Response("nope", { status: 500 })),
    });

    for (const state of [sent, failed]) {
      expect(JSON.stringify(state)).not.toContain("re_test_key");
    }
  });

  it("advances a sequence number so the form knows a new answer arrived", async () => {
    const fetchImpl = okFetch();
    const first = await submitContact(INITIAL_CONTACT_STATE, form(), { env: KEY, fetchImpl });
    const second = await submitContact(first, form(), { env: KEY, fetchImpl });

    expect(first.seq).toBe(1);
    expect(second.seq).toBe(2);
  });
});

describe("submitContact: addressing", () => {
  it("delivers to the address published on the site, with no second copy of it", async () => {
    const fetchImpl = okFetch();
    await submitContact(INITIAL_CONTACT_STATE, form(), { env: KEY, fetchImpl });

    const { body } = request(fetchImpl);
    const published = profile.contact.find((c) => c.href.startsWith("mailto:"))?.value;
    expect(body.to).toEqual([published]);
    expect(contactTo({})).toBe(published);
  });

  it("lets an env var move the destination without a deploy of new code", async () => {
    const fetchImpl = okFetch();
    await submitContact(INITIAL_CONTACT_STATE, form(), {
      env: { ...KEY, CONTACT_TO_EMAIL: "elsewhere@example.com" },
      fetchImpl,
    });

    expect(request(fetchImpl).body.to).toEqual(["elsewhere@example.com"]);
  });

  it("uses the no-DNS sender until a verified domain is configured", async () => {
    const fetchImpl = okFetch();
    await submitContact(INITIAL_CONTACT_STATE, form(), { env: KEY, fetchImpl });
    expect(request(fetchImpl).body.from).toBe(DEFAULT_FROM);

    const second = okFetch();
    await submitContact(INITIAL_CONTACT_STATE, form(), {
      env: { ...KEY, CONTACT_FROM_EMAIL: "Fergus <hello@fergusoreilly.dev>" },
      fetchImpl: second,
    });
    expect(request(second).body.from).toBe("Fergus <hello@fergusoreilly.dev>");
  });
});

describe("submitContact: nothing bad reaches the network", () => {
  it("does not call Resend when the submission is invalid", async () => {
    const fetchImpl = okFetch();
    const state = await submitContact(INITIAL_CONTACT_STATE, form({ email: "nope" }), {
      env: KEY,
      fetchImpl,
    });

    expect(state.status).toBe("invalid");
    expect(fetchImpl).not.toHaveBeenCalled();
    if (state.status !== "invalid") return;
    expect(state.errors.email).toBeTruthy();
    // Everything they typed comes back, including the fields that were fine.
    expect(state.fields.message).toBe(good.message);
  });

  it("does not call Resend when the honeypot is filled", async () => {
    const fetchImpl = okFetch();
    const state = await submitContact(INITIAL_CONTACT_STATE, form({ hp: "spam" }), {
      env: KEY,
      fetchImpl,
    });

    // Reported as sent on purpose. Telling a bot it was caught is telling it
    // what to change, and there is no human on the other end to mislead.
    expect(state.status).toBe("sent");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  /**
   * The check order is load-bearing and the comment in the action says so:
   * running the field rules first would hand a bot a per-field critique of its
   * own submission.
   *
   * Every other bot test submits otherwise-valid fields, so swapping the order
   * would leave them all green. This one is the only thing that would notice,
   * because a bot with a bad address must still be told "sent" and never
   * "that doesn't look like an email address".
   */
  it("tells a bot nothing about its own mistakes, whatever else is wrong", async () => {
    const fetchImpl = okFetch();
    const state = await submitContact(
      INITIAL_CONTACT_STATE,
      form({ hp: "spam", email: "not-an-address", message: "hi" }),
      { env: KEY, fetchImpl },
    );

    expect(state.status).toBe("sent");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(JSON.stringify(state)).not.toContain("email address");
  });
});

/**
 * The correction to the worst bug in the first version of this file.
 *
 * A fast submission used to be reported as sent and thrown away, which is the
 * exact failure the whole page was built to remove, rebuilt inside its own spam
 * filter. A visitor whose browser fills two fields in one click and who pastes
 * a message they had already written gets under two seconds without doing
 * anything unusual at all.
 */
describe("submitContact: a fast submission is marked, never dropped", () => {
  it("sends it, rather than pretending to", async () => {
    const fetchImpl = okFetch();
    const state = await submitContact(INITIAL_CONTACT_STATE, form({ elapsed: "40" }), {
      env: KEY,
      fetchImpl,
    });

    expect(state.status).toBe("sent");
    // The line that matters. Before the fix this was zero.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(request(fetchImpl).body.text).toContain(good.message);
  });

  it("flags it in the subject so a human can sort it", async () => {
    const fetchImpl = okFetch();
    await submitContact(INITIAL_CONTACT_STATE, form({ elapsed: "40" }), {
      env: KEY,
      fetchImpl,
    });

    const { body } = request(fetchImpl);
    expect(body.subject).toContain("[fast]");
    // Same destination and same reply address: a marker, not a diversion.
    expect(body.to).toEqual([profile.contact.find((c) => c.href.startsWith("mailto:"))?.value]);
    expect(body.reply_to).toBe(good.email);
  });

  it("leaves an ordinary submission unmarked", async () => {
    const fetchImpl = okFetch();
    await submitContact(INITIAL_CONTACT_STATE, form(), { env: KEY, fetchImpl });
    expect(request(fetchImpl).body.subject).not.toContain("[fast]");
  });

  it("still gives a fast visitor their message back when sending is not configured", async () => {
    const state = await submitContact(INITIAL_CONTACT_STATE, form({ elapsed: "40" }), { env: {} });

    expect(state.status).toBe("failed");
    if (state.status !== "failed") return;
    expect(state.fields).toEqual(good);
    expect(state.mailto).toContain(encodeURIComponent(good.message));
  });
});

describe("submitContact: every way sending can fail", () => {
  /**
   * The three failure modes are deliberately one state, because the page does
   * the same thing for all of them: hand back a mailto that already contains
   * the message. A visitor does not care which of our problems it was.
   */
  it("says so, and keeps their message, when there is no API key", async () => {
    const fetchImpl = okFetch();
    const state = await submitContact(INITIAL_CONTACT_STATE, form(), { env: {}, fetchImpl });

    expect(state.status).toBe("failed");
    expect(fetchImpl).not.toHaveBeenCalled();
    if (state.status !== "failed") return;
    expect(state.reason).toBe("unconfigured");
    expect(state.fields).toEqual(good);
  });

  it("treats a blank key the same as a missing one", async () => {
    const fetchImpl = okFetch();
    const state = await submitContact(INITIAL_CONTACT_STATE, form(), {
      env: { RESEND_API_KEY: "   " },
      fetchImpl,
    });

    expect(state.status).toBe("failed");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("keeps their message when Resend refuses the request", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ message: "domain not verified" }), { status: 422 }),
    );
    const state = await submitContact(INITIAL_CONTACT_STATE, form(), { env: KEY, fetchImpl });

    expect(state.status).toBe("failed");
    if (state.status !== "failed") return;
    expect(state.reason).toBe("rejected");
    expect(state.fields).toEqual(good);
  });

  it("keeps their message when the network is gone, rather than throwing", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });

    // An unhandled rejection inside a server action renders the error boundary,
    // which loses the page and the message with it.
    const state = await submitContact(INITIAL_CONTACT_STATE, form(), { env: KEY, fetchImpl });

    expect(state.status).toBe("failed");
    if (state.status !== "failed") return;
    expect(state.reason).toBe("unreachable");
    expect(state.fields).toEqual(good);
  });

  it("carries a mailto that already contains the message on every failure", async () => {
    const state = await submitContact(INITIAL_CONTACT_STATE, form(), { env: {} });

    if (state.status !== "failed") throw new Error("expected a failure");
    expect(state.mailto.startsWith("mailto:")).toBe(true);
    expect(state.mailto).toContain(encodeURIComponent(good.message));
  });
});

/**
 * This module is the only file in the repo allowed to hold a secret, and the
 * only thing keeping it off the client is the import graph. `import
 * "server-only"` would turn a mistake into a build error, which is better, but
 * this repo has seven dependencies and a standing preference for not adding an
 * eighth for something it can check itself. So: a runtime throw in the module,
 * and this, which is the half that actually runs in CI.
 */
describe("the module that holds the key stays off the client", () => {
  const root = process.cwd();

  /** Every source file in the repo, minus build output and dependencies. */
  function sources(dir: string, found: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (["node_modules", ".next", ".git", "public", "docs"].includes(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) sources(full, found);
      else if (/\.(ts|tsx)$/.test(entry.name)) found.push(full);
    }
    return found;
  }

  const files = sources(root).map((path) => ({ path, text: readFileSync(path, "utf8") }));

  it("found files to check, so an empty sweep cannot pass as a clean one", () => {
    expect(files.length).toBeGreaterThan(20);
    expect(files.some((f) => f.text.includes('"use client"'))).toBe(true);
  });

  it("is imported by nothing that runs in the browser", () => {
    const offenders = files
      .filter((f) => /^\s*["']use client["']/m.test(f.text))
      .filter((f) => /from\s+["']@\/lib\/contact-server["']/.test(f.text))
      .map((f) => relative(root, f.path));

    expect(offenders).toEqual([]);
  });

  it("keeps its own runtime fence, which is the half a test cannot enforce", () => {
    const src = readFileSync(join(root, "lib", "contact-server.ts"), "utf8");
    expect(src).toMatch(/typeof window !== "undefined"/);
    expect(src).toMatch(/throw new Error\(/);
  });

  /**
   * The client-safe half must stay client-safe, because `ContactForm` imports
   * it for the field limits and the shared validator. A `process.env` read
   * landing in there is how a secret gets one import closer to the browser.
   *
   * Comments are stripped first, because that file's docblock legitimately
   * names `process.env` when explaining why the split exists, and a guard that
   * cannot tell prose from code is a guard that gets deleted the first time it
   * cries wolf.
   */
  it("keeps the shared half free of anything that reads the environment", () => {
    const raw = readFileSync(join(root, "lib", "contact.ts"), "utf8");
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, "");

    // A stripper that ate the file would pass this test on an empty string.
    expect(code.length).toBeGreaterThan(1000);
    expect(code).toContain("export function validateContact");

    expect(code).not.toMatch(/process\.env/);
    expect(code).not.toMatch(/RESEND_API_KEY/);
    expect(code).not.toMatch(/contact-server/);
  });
});
