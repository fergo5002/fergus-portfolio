/**
 * Submits every URL in the sitemap to IndexNow.
 *
 *   node scripts/indexnow.mjs            # submit
 *   node scripts/indexnow.mjs --dry-run  # print what would be submitted
 *
 * **Why this exists rather than "pinging Google".** Google retired its sitemap
 * ping endpoint in 2023, so the only way to tell Google about new pages is
 * Search Console. Bing did the opposite and built IndexNow, which is a single
 * unauthenticated POST and gets a URL crawled in hours rather than weeks.
 *
 * Bing is worth caring about here out of proportion to its search share, because
 * it is the index behind Copilot and ChatGPT browsing. For a site whose goal is
 * being the source an answer engine cites, getting into Bing quickly matters
 * more than the raw traffic number suggests.
 *
 * The key is a file at the site root whose contents are the key itself. That is
 * the whole ownership proof: IndexNow fetches it and checks it matches. So the
 * key is deliberately NOT a secret and it is committed on purpose.
 *
 * Worth running after publishing an article.
 */

const KEY = "1e1c07d6835b43b5ae97096bb927a1ee";
const HOST = "fergusoreilly.dev";
const ORIGIN = `https://${HOST}`;
const ENDPOINT = "https://api.indexnow.org/IndexNow";

/**
 * Note there is no `process.exit()` anywhere in this file.
 *
 * Calling it tears the event loop down while a socket from `fetch` is still
 * open, and libuv asserts on Windows (`UV_HANDLE_CLOSING`), printing a crash
 * after a run that actually succeeded. Setting `process.exitCode` and letting
 * `main()` return lets the loop drain and still gives the shell a real status.
 */
class SubmitError extends Error {}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const sitemap = await fetch(`${ORIGIN}/sitemap.xml`);
  if (!sitemap.ok) {
    throw new SubmitError(`sitemap.xml returned ${sitemap.status}. Is the deploy live?`);
  }

  const xml = await sitemap.text();
  const urlList = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

  if (urlList.length === 0) {
    throw new SubmitError("No <loc> entries in the sitemap. Refusing to submit an empty set.");
  }

  // Guard against submitting a URL for a host we do not own, which gets the key
  // rejected for every URL in the batch rather than just the offending one.
  const foreign = urlList.filter((u) => !u.startsWith(ORIGIN));
  if (foreign.length > 0) {
    throw new SubmitError(`Sitemap has URLs outside ${ORIGIN}: ${foreign.slice(0, 3).join(", ")}`);
  }

  console.log(`${urlList.length} URLs from ${ORIGIN}/sitemap.xml`);
  for (const u of urlList) console.log(`  ${u}`);

  if (dryRun) {
    console.log("\n--dry-run, nothing submitted.");
    return;
  }

  // Check the key file is reachable BEFORE submitting. Without it the API
  // returns 403 for the whole batch and the reason is not in the response.
  const keyCheck = await fetch(`${ORIGIN}/${KEY}.txt`);
  const keyBody = keyCheck.ok ? (await keyCheck.text()).trim() : "";
  if (keyBody !== KEY) {
    throw new SubmitError(
      `Key file check failed: ${ORIGIN}/${KEY}.txt returned ${keyCheck.status}` +
        (keyBody ? ` with body ${JSON.stringify(keyBody.slice(0, 40))}` : ""),
    );
  }
  console.log(`\nKey file verified at ${ORIGIN}/${KEY}.txt`);

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `${ORIGIN}/${KEY}.txt`, urlList }),
  });

  // 200 and 202 both mean accepted. 422 usually means the key file did not
  // match, 403 that it was not found, 429 that you have submitted too often.
  const body = await res.text();
  console.log(`IndexNow responded ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
  if (res.status !== 200 && res.status !== 202) {
    throw new SubmitError(`IndexNow rejected the submission with ${res.status}.`);
  }
  console.log(`Submitted ${urlList.length} URLs.`);
}

try {
  await main();
} catch (err) {
  console.error(err instanceof SubmitError ? err.message : err);
  process.exitCode = 1;
}
