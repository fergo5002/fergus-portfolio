"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { afterResponse } from "@/lib/after";
import type { ToolOutcome } from "@/lib/analytics";
import { checkHtml } from "@/lib/headline";
import { fetchPage } from "@/lib/headline-fetch";
import { trackToolRun } from "@/lib/tools/events";
import { takeToken } from "./rate-limit";
import { MAX_URL_LENGTH, URL_FIELD, headlineCopy, type ToolState } from "./state";

const TOOL = "headline-check";

/**
 * The limiter's key: a hash of the address, not the address.
 *
 * The page says "keeps a hashed IP for a day, nothing else". The "for a day"
 * half is F4's Redis budget; until it lands this bucket lives in one process's
 * memory for at most a minute, which is less retention than the line claims,
 * not more. The "hashed" half is this function, so the line is true on the day
 * it ships. Same address, same bucket, which is all the limiter needs.
 */
function limiterKey(ip: string): string {
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

/**
 * Record one run. Called exactly once on every path out of the action, after
 * the reply has been decided, and never with the URL: `toolRunProperties`
 * would drop it anyway, and this call site does not offer it.
 */
function record(outcome: ToolOutcome, started: number): void {
  afterResponse(() => trackToolRun({ tool: TOOL, outcome, ms: Date.now() - started }));
}

/**
 * The server action the form posts to.
 *
 * Thin on purpose. The two things worth getting right, extracting a heading and
 * refusing to fetch an address this server should not reach, live in
 * `lib/headline.ts` and `lib/headline-fetch.ts` with tests against them: a
 * `"use server"` module is a network boundary, and logic behind one only ever
 * gets exercised by a stranger who has already pasted a URL.
 *
 * **Every path out of here carries a message.** There is no branch that returns
 * a bare failure, because "nothing happened" is the exact bug the rest of this
 * site has a rule about. And every path out records one `tool_run`: `refused`
 * when nothing was attempted, `error` when the fetch failed or the parser threw
 * on what came back, `ok` only once a report exists.
 */
export async function headlineCheckAction(
  prev: ToolState,
  formData: FormData,
): Promise<ToolState> {
  const started = Date.now();

  // Counts answers, so the form can re-key its input and keep the URL in it.
  const seq = (prev?.seq ?? 0) + 1;

  const raw = String(formData.get(URL_FIELD) ?? "").trim();
  if (raw === "") {
    record("refused", started);
    return { status: "invalid", seq, url: "", message: headlineCopy.emptyUrl };
  }
  if (raw.length > MAX_URL_LENGTH) {
    record("refused", started);
    return { status: "invalid", seq, url: raw.slice(0, 200), message: headlineCopy.tooLong };
  }

  // Read before the fetch, so a refused visitor costs nothing outbound.
  //
  // `x-real-ip` first, and the LAST entry of `x-forwarded-for` after it. This
  // read the first entry of `x-forwarded-for` until 2026-08-21, and review was
  // right that it is the wrong end of the chain: `x-forwarded-for` accumulates
  // left to right, so the leftmost value is whatever the client sent and the
  // rightmost is what the nearest proxy appended. Keying a limiter on the
  // leftmost hands every caller a fresh bucket for the price of one header.
  //
  // Vercel does overwrite the header rather than append to it, so on this host
  // both ends are the same value. That is a fact about today's platform, not a
  // property of the code, and it is exactly the sort of assumption that stops
  // being true somewhere else.
  const header = await headers();
  const forwarded = header.get("x-forwarded-for") ?? "";
  const chain = forwarded
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const ip = header.get("x-real-ip")?.trim() || chain[chain.length - 1] || "unknown";
  if (!takeToken(limiterKey(ip))) {
    record("refused", started);
    return { status: "limited", seq, url: raw, message: headlineCopy.limited };
  }

  const page = await fetchPage(raw);
  if (!page.ok) {
    record("error", started);
    // `detail` is written for a person and always names the actual fault: the
    // scheme, the address, the status code, the content type.
    return { status: "failed", seq, url: raw, message: page.detail };
  }

  // The report is built BEFORE the run is recorded, and the order is the whole
  // point. `record("ok")` used to sit above this object literal, so a throw out
  // of `checkHtml` recorded a success and then served the visitor a 500: the
  // one outcome where the numbers and the visitor's experience disagreed
  // completely. Nothing in the suite noticed, because every test fed it HTML
  // the parser is happy with.
  //
  // The throw is re-thrown rather than dressed as a `failed` state. A fetch
  // that fails is an ordinary thing a stranger's URL does and it gets a
  // message; `checkHtml` throwing is a defect in our own parser on HTML we
  // already hold, and there is nothing true to tell a visitor about it. If that
  // is ever the wrong call, the change is a copy string in `state.ts` and a
  // `failed` return here, not a quieter recording.
  let report;
  try {
    report = checkHtml(page.html);
  } catch (thrown) {
    record("error", started);
    throw thrown;
  }

  record("ok", started);
  return {
    status: "done",
    seq,
    url: raw,
    finalUrl: page.finalUrl,
    redirects: page.redirects,
    report,
  };
}
