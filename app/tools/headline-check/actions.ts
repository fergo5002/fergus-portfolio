"use server";

import { headers } from "next/headers";
import { checkHtml } from "@/lib/headline";
import { fetchPage } from "@/lib/headline-fetch";
import { takeToken } from "./rate-limit";
import { MAX_URL_LENGTH, URL_FIELD, headlineCopy, type ToolState } from "./state";

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
 * site has a rule about.
 */
export async function headlineCheckAction(
  prev: ToolState,
  formData: FormData,
): Promise<ToolState> {
  // Counts answers, so the form can re-key its input and keep the URL in it.
  const seq = (prev?.seq ?? 0) + 1;

  const raw = String(formData.get(URL_FIELD) ?? "").trim();
  if (raw === "") return { status: "invalid", seq, url: "", message: headlineCopy.emptyUrl };
  if (raw.length > MAX_URL_LENGTH) {
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
  if (!takeToken(ip)) {
    return { status: "limited", seq, url: raw, message: headlineCopy.limited };
  }

  const page = await fetchPage(raw);
  if (!page.ok) {
    // `detail` is written for a person and always names the actual fault: the
    // scheme, the address, the status code, the content type.
    return { status: "failed", seq, url: raw, message: page.detail };
  }

  return {
    status: "done",
    seq,
    url: raw,
    finalUrl: page.finalUrl,
    redirects: page.redirects,
    report: checkHtml(page.html),
  };
}
