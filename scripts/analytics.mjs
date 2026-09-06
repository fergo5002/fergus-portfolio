/**
 * What the site's instruments have actually recorded.
 *
 *   node scripts/analytics.mjs                 # the last 7 days
 *   node scripts/analytics.mjs --since 2026-08-21
 *   node scripts/analytics.mjs --days 30
 *
 * ## Why this exists rather than opening PostHog
 *
 * Because reading the numbers should not depend on which Chrome profile happens
 * to be open. It already did once: the PostHog session lived on one profile, a
 * later session had a different one connected, and the answer to "how is it
 * going" was blocked on browser plumbing rather than on anything real.
 *
 * ## The key
 *
 * `POSTHOG_PERSONAL_API_KEY`, read from the environment and **nowhere else**.
 * This one is a genuine secret, unlike `NEXT_PUBLIC_POSTHOG_KEY`: a personal API
 * key can read everything in the project. It lives in the DPAPI vault. Never put
 * it in `.env.local`, never commit it, never print it.
 *
 *   $env:POSTHOG_PERSONAL_API_KEY = (Get-AuthSecret -Name POSTHOG_PERSONAL_API_KEY)
 *
 * ## What it deliberately excludes
 *
 * Two classes of row that are real events and are not visitors:
 *
 * - **`localhost`.** `Dockerfile.parity` builds with the project token so the
 *   parity image exercises the same code path production will, which means
 *   running the container sends events. They are honest events about a
 *   container.
 * - **Setup and diagnostic probes.** `setup_probe`, `live_proxy_probe` and the
 *   `diag_*` events from the 2026-08-21 build were sent by hand to prove the
 *   ingestion path. Counting them as traffic would be counting the thermometer.
 *
 * Both exclusions are printed in the footer rather than applied silently, for
 * the reason in `docs/measurement.md`: a report that quietly drops rows reads as
 * a complete picture when it is not.
 */

const PROJECT = 569350;
const HOST = "https://us.posthog.com";

/** Same reason as `indexnow.mjs`: no `process.exit()` while a socket is open. */
class ReportError extends Error {}

/** Events that are instrumentation about the instruments, not traffic. */
const PROBE_EVENTS = ["setup_probe", "live_proxy_probe", "diag_cookieless", "diag_ordinary", "diag_curl_proxy", "diag_curl_direct", "diag_curl_browserish"];

const NOT_PROBE = `event NOT IN (${PROBE_EVENTS.map((e) => `'${e}'`).join(", ")})`;
const NOT_LOCAL = `coalesce(properties.$current_url, '') NOT LIKE '%localhost%'`;

async function hogql(key, query) {
  const res = await fetch(`${HOST}/api/projects/${PROJECT}/query/`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
  });

  if (res.status === 401 || res.status === 403) {
    throw new ReportError(
      `PostHog refused the key (${res.status}). It needs the 'query:read' scope on project ${PROJECT}. ` +
        `A key scoped to the wrong project fails exactly like a wrong key.`,
    );
  }
  if (!res.ok) throw new ReportError(`PostHog returned ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const body = await res.json();
  return body.results ?? [];
}

/** A small aligned table, or an honest line saying there is nothing. */
function table(rows, headers) {
  if (rows.length === 0) return "    (nothing)";
  const all = [headers, ...rows.map((r) => r.map((c) => String(c ?? "")))];
  const widths = headers.map((_, i) => Math.max(...all.map((r) => (r[i] ?? "").length)));
  const line = (r) => "    " + r.map((c, i) => String(c ?? "").padEnd(widths[i])).join("  ");
  return [line(headers), line(widths.map((w) => "-".repeat(w))), ...rows.map(line)].join("\n");
}

function heading(text) {
  return `\n${text}\n${"=".repeat(text.length)}`;
}

async function main() {
  const key = process.env.POSTHOG_PERSONAL_API_KEY;
  if (!key) {
    throw new ReportError(
      "POSTHOG_PERSONAL_API_KEY is not set. It is a real secret and lives in the DPAPI vault:\n" +
        "  $env:POSTHOG_PERSONAL_API_KEY = (Get-AuthSecret -Name POSTHOG_PERSONAL_API_KEY)",
    );
  }

  const args = process.argv.slice(2);
  const sinceArg = args[args.indexOf("--since") + 1];
  const daysArg = args[args.indexOf("--days") + 1];
  const since = args.includes("--since")
    ? `toDateTime('${sinceArg} 00:00:00')`
    : `now() - INTERVAL ${args.includes("--days") ? Number(daysArg) || 7 : 7} DAY`;

  const window = `timestamp > ${since}`;
  console.log(`fergusoreilly.dev, PostHog project ${PROJECT}, since ${args.includes("--since") ? sinceArg : `${args.includes("--days") ? daysArg : 7} days ago`}`);

  // ---- everything that arrived, so a zero elsewhere can be told from a dead pipe
  const totals = await hogql(key, `
    SELECT event, count() AS n, max(timestamp) AS latest
    FROM events WHERE ${window} AND ${NOT_PROBE} AND ${NOT_LOCAL}
    GROUP BY event ORDER BY n DESC`);
  console.log(heading("Everything recorded"));
  console.log(table(totals.map((r) => [r[0], r[1], String(r[2]).slice(0, 19)]), ["event", "count", "most recent"]));

  // ---- the crawl, which moves first
  const crawlers = await hogql(key, `
    SELECT properties.purpose AS purpose, properties.crawler AS crawler, count() AS n
    FROM events WHERE event = 'ai_crawler_visit' AND ${window} AND ${NOT_LOCAL}
    GROUP BY purpose, crawler ORDER BY n DESC`);
  console.log(heading("AI crawlers, by purpose"));
  console.log("  user-fetch means a person asked a question and the model came here to answer it.");
  console.log(table(crawlers.map((r) => [r[0], r[1], r[2]]), ["purpose", "crawler", "visits"]));

  const paths = await hogql(key, `
    SELECT properties.path AS path, count() AS n, uniq(properties.crawler) AS crawlers
    FROM events WHERE event = 'ai_crawler_visit' AND ${window} AND ${NOT_LOCAL}
    GROUP BY path ORDER BY n DESC LIMIT 15`);
  console.log(heading("Which pages the engines read"));
  console.log(table(paths.map((r) => [r[0], r[1], r[2]]), ["path", "visits", "distinct crawlers"]));

  // ---- the click, which is the point
  const referrals = await hogql(key, `
    SELECT properties.ai_engine AS engine, properties.ai_via AS via, count() AS n
    FROM events WHERE event = 'ai_referral' AND ${window} AND ${NOT_LOCAL}
    GROUP BY engine, via ORDER BY n DESC`);
  console.log(heading("Arrivals from an answer engine"));
  console.log(table(referrals.map((r) => [r[0], r[1], r[2]]), ["engine", "detected via", "arrivals"]));

  // ---- humans
  const views = await hogql(key, `
    SELECT replaceRegexpOne(coalesce(properties.$pathname, properties.$current_url, '?'), '\\\\?.*$', '') AS path,
           count() AS n, uniq(distinct_id) AS people
    FROM events WHERE event = '$pageview' AND ${window} AND ${NOT_LOCAL}
    GROUP BY path ORDER BY n DESC LIMIT 15`);
  console.log(heading("Pageviews"));
  console.log("  Cookieless, so 'people' is PostHog's server-side hash, not a device id.");
  console.log(table(views.map((r) => [r[0], r[1], r[2]]), ["path", "views", "people"]));

  // ---- performance
  const vitals = await hogql(key, `
    SELECT properties.metric AS metric,
           round(quantile(0.75)(toFloat(properties.value)), 1) AS p75,
           countIf(properties.rating = 'good') AS good, count() AS n
    FROM events WHERE event = 'web_vital' AND ${window} AND ${NOT_LOCAL}
    GROUP BY metric ORDER BY metric`);
  console.log(heading("Core Web Vitals, 75th percentile"));
  console.log(table(vitals.map((r) => [r[0], r[1], `${r[2]}/${r[3]}`]), ["metric", "p75", "rated good"]));

  // ---- the machine-facing surface
  const mcp = await hogql(key, `
    SELECT coalesce(properties.tool, properties.method) AS what,
           coalesce(properties.client, 'unknown') AS client, count() AS n
    FROM events WHERE event IN ('mcp_tool_call', 'mcp_request') AND ${window}
    GROUP BY what, client ORDER BY n DESC LIMIT 15`);
  console.log(heading("MCP server"));
  console.log(table(mcp.map((r) => [r[0], r[1], r[2]]), ["tool or method", "client", "calls"]));

  console.log(heading("What this excludes"));
  console.log("  Anything whose URL contains 'localhost': those are Docker parity container runs.");
  console.log(`  Setup and diagnostic probes: ${PROBE_EVENTS.join(", ")}.`);
  console.log("  Both are real events and neither is a visitor. See docs/measurement.md.");
  console.log("\n  A zero here is not the same as an absence of interest. Read it with the caveats");
  console.log("  in docs/measurement.md, in particular that ai_referral is a floor rather than a count.");
}

try {
  await main();
} catch (err) {
  console.error(err instanceof ReportError ? err.message : err);
  process.exitCode = 1;
}
