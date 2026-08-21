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
  const header = await headers();
  const forwarded = header.get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0].trim() || header.get("x-real-ip") || "unknown";
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
