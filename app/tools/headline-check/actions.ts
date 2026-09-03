"use server";

import { headers } from "next/headers";
import { budgetKeyForIp, takeBudget, type BudgetScope } from "@/lib/budget";
import { checkUrl } from "@/lib/fence";
import { checkHtml } from "@/lib/headline";
import { fetchPage } from "@/lib/headline-fetch";
import { HEADLINE_BUDGETS, MAX_URL_LENGTH, URL_FIELD, headlineCopy, type ToolState } from "./state";

/**
 * The server action the form posts to.
 *
 * Thin on purpose. The things worth getting right live in `lib/` with tests
 * against them: refusing a URL this server should not reach (`lib/fence.ts`,
 * run here before a budget is spent and again inside `lib/headline-fetch.ts`
 * on every redirect hop), counting runs where every replica can see the count
 * (`lib/budget.ts`), and reading the heading (`lib/headline.ts`). A
 * `"use server"` module is a network boundary, and logic behind one only
 * ever gets exercised by a stranger who has already pasted a URL.
 *
 * **Every path out of here carries a message.** There is no branch that
 * returns a bare failure, because "nothing happened" is the exact bug the
 * rest of this site has a rule about. That includes the store being down:
 * `lib/budget.ts` throws rather than running unlimited, and this turns the
 * throw into a sentence rather than into the error boundary.
 */
export async function headlineCheckAction(prev: ToolState, formData: FormData): Promise<ToolState> {
  // Counts answers, so the form can re-key its input and keep the URL in it.
  const seq = (prev?.seq ?? 0) + 1;

  const raw = String(formData.get(URL_FIELD) ?? "").trim();
  if (raw === "") return { status: "invalid", seq, url: "", message: headlineCopy.emptyUrl };
  if (raw.length > MAX_URL_LENGTH) {
    return { status: "invalid", seq, url: raw.slice(0, 200), message: headlineCopy.tooLong };
  }

  // The fence's synchronous half, before any budget is spent: a URL that was
  // never going to be fetched costs the visitor nothing.
  const fence = checkUrl(raw);
  if (!fence.ok) return { status: "failed", seq, url: raw, message: fence.reason };

  // Three budgets, cheapest refusal first, so a refused visitor never spends
  // the target or global count. The keys are a salted hash of the address, a
  // hostname, and the word "all": nothing here is the URL and nothing here is
  // a person.
  const header = await headers();
  const takes: Array<{ scope: BudgetScope; key: string }> = [
    { scope: "ip", key: budgetKeyForIp(header) },
    { scope: "target", key: fence.url.hostname.toLowerCase() },
    { scope: "global", key: "all" },
  ];
  try {
    for (const { scope, key } of takes) {
      const budget = await takeBudget({ tool: "headline-check", scope, key, ...HEADLINE_BUDGETS[scope] });
      if (!budget.ok) return { status: "limited", seq, url: raw, message: budget.reason };
    }
  } catch (error) {
    // A missing or unreachable store is loud by design, and loud here means a
    // sentence on the page plus a line in the function log. A store error
    // carries no visitor data and no credential, so the message is safe to log.
    const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error(`[headline-check] budget store failed: ${text}`);
    return { status: "failed", seq, url: raw, message: headlineCopy.storeDown };
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
