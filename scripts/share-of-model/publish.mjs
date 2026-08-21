/**
 * Sends a recorded share-of-model run to PostHog, so the citation trend sits
 * beside the crawler log and the referral counts instead of in a folder.
 *
 *   node scripts/share-of-model/publish.mjs results/2026-08-21.json
 *   node scripts/share-of-model/publish.mjs results/2026-08-21.json --dry-run
 *
 * ## Why this is worth doing
 *
 * The three GEO instruments on this site answer three different questions and
 * each is blind to what the others see:
 *
 * - `middleware.ts` records **crawls**: an engine came and read a page. Earliest
 *   signal, weeks ahead of anything else, and says nothing about being used.
 * - The `ai_referral` event records **arrivals**: somebody read an answer, saw
 *   this site cited, and clicked. Truest signal, and heavily filtered, because
 *   most citations are never clicked.
 * - This harness records **citations**: the site was named in an answer,
 *   clicked or not. The only one that sees a citation nobody acted on.
 *
 * Held apart they are three folders. In one place they are a funnel, and the
 * gaps between them are the finding: crawled but never cited is a content
 * problem, cited but never clicked is a snippet problem.
 *
 * ## The absence rule, carried over
 *
 * `record.mjs` refuses to let a surface that did not run store rows, because a
 * missing surface is an absence and a zero is a measurement, and they average
 * very differently. This script inherits that: **surfaces marked `missing` are
 * never published.** Sending them as zeroes would put a fabricated data point
 * on a trend line, which is exactly the failure the schema was built to stop.
 * They are reported to the console so the omission is visible rather than
 * silent.
 *
 * The instrument verdict travels with every row. A run whose probes said
 * `index-absent` is evidence about the measurement path, not about the site,
 * and a chart that has lost that distinction is worse than no chart.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const ENDPOINT = "https://us.i.posthog.com/i/v0/e/";

/**
 * Read the project token, falling back to `.env.local`.
 *
 * The fallback is not a convenience, it is the difference between the command
 * in `docs/measurement.md` working and not. `.env.local` is loaded by Next, and
 * by nothing else: a plain `node` script sees none of it, so without this the
 * documented invocation fails on a machine that is correctly configured, which
 * is the most confusing way for a script to fail.
 *
 * Parsed rather than `dotenv`-ed, because one regex is cheaper than a
 * dependency for one variable that is not even a secret.
 */
function readToken() {
  if (process.env.NEXT_PUBLIC_POSTHOG_KEY) return process.env.NEXT_PUBLIC_POSTHOG_KEY;

  const envFile = join(ROOT, ".env.local");
  if (!existsSync(envFile)) return "";
  const match = /^NEXT_PUBLIC_POSTHOG_KEY\s*=\s*(.+)$/m.exec(readFileSync(envFile, "utf8"));
  return match ? match[1].trim().replace(/^["']|["']$/g, "") : "";
}

/** Same reason as `indexnow.mjs`: no `process.exit()` while a socket is open. */
class PublishError extends Error {}

function rate(cited, answered) {
  return answered === 0 ? null : cited / answered;
}

/** Tallies one surface's rows into the numbers worth trending. */
function tally(rows) {
  const answered = rows.filter((r) => r.outcome === "answered").length;
  const cited = rows.filter((r) => r.cited).length;
  const mentioned = rows.filter((r) => r.mentioned).length;

  const bands = {};
  for (const row of rows) {
    const band = (bands[row.band] ??= { answered: 0, cited: 0 });
    if (row.outcome === "answered") band.answered += 1;
    if (row.cited) band.cited += 1;
  }

  return {
    questions: rows.length,
    answered,
    cited,
    mentioned,
    citation_share: rate(cited, answered),
    mention_share: rate(mentioned, answered),
    bands: Object.fromEntries(
      Object.entries(bands).map(([name, b]) => [name, rate(b.cited, b.answered)]),
    ),
  };
}

async function send(apiKey, event, distinctId, properties, dryRun) {
  const body = {
    api_key: apiKey,
    event,
    distinct_id: distinctId,
    properties: { ...properties, $process_person_profile: false, $lib: "share-of-model" },
  };

  if (dryRun) {
    console.log(`  would send ${event}: ${JSON.stringify(properties)}`);
    return;
  }

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new PublishError(`PostHog rejected ${event} with ${res.status}: ${await res.text()}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) {
    throw new PublishError("Usage: node scripts/share-of-model/publish.mjs <results/YYYY-MM-DD.json>");
  }

  const apiKey = readToken();
  if (!apiKey && !dryRun) {
    throw new PublishError(
      "No NEXT_PUBLIC_POSTHOG_KEY in the environment or in .env.local. It is the project's " +
        "write-only token, not a secret; pull it with `vercel env pull`.",
    );
  }

  const path = resolve(file.startsWith("results") ? HERE : process.cwd(), file);
  const run = JSON.parse(readFileSync(path, "utf8"));
  console.log(`${basename(path)}: run of ${run.date}, question set ${run.questionSetVersion}`);

  const surfaces = Object.entries(run.surfaces ?? {});
  if (surfaces.length === 0) throw new PublishError("No surfaces in this run.");

  let published = 0;

  for (const [surface, data] of surfaces) {
    if (data.status !== "run") {
      // Visible, and deliberately not sent. See the absence rule above.
      console.log(`  ${surface}: ${data.status} (${data.reason ?? "no reason given"}), NOT published`);
      continue;
    }

    const numbers = tally(data.rows ?? []);
    const verdict = data.instrument?.verdict ?? "unknown";

    await send(
      apiKey,
      "share_of_model",
      `share-of-model:${surface}`,
      {
        surface,
        run_date: run.date,
        question_set: run.questionSetVersion,
        region: run.region ?? null,
        // Carried on every row, because a run whose probes could not find the
        // site at all is evidence about the index, not about the site, and a
        // zero that has lost that label reads as a verdict on the writing.
        instrument_verdict: verdict,
        ...numbers,
      },
      dryRun,
    );

    published += 1;
    const share = numbers.citation_share;
    console.log(
      `  ${surface}: ${numbers.cited}/${numbers.answered} cited` +
        `${share === null ? "" : ` (${(share * 100).toFixed(1)}%)`}` +
        `, instrument ${verdict}`,
    );
  }

  if (published === 0) {
    throw new PublishError(
      "No surface in this run actually ran, so there is nothing to publish. That is a fact about the run, not an error in it.",
    );
  }

  console.log(dryRun ? "\n--dry-run, nothing sent." : `\nPublished ${published} surface(s).`);
}

try {
  await main();
} catch (err) {
  console.error(err instanceof PublishError ? err.message : err);
  process.exitCode = 1;
}
