/**
 * Mutation check.
 *
 * Started as a contact-form guard and now also covers the brightness numbers,
 * because those are the ones most likely to drift back: a shader constant is
 * the least reviewable line in the repo.
 *
 * Not part of the build and not run by `npm test`. Like `Dockerfile.parity`,
 * it exists to be run deliberately before shipping a change to this feature.
 *
 * **Why it is committed rather than thrown away.** The claim "the tests would
 * catch that" is worth exactly nothing unless somebody has tried. This repo has
 * already shipped a guard whose test was the implementation restated and could
 * therefore never fail, and `docs/PROGRESS.md` used to assert a mutation count
 * that nothing in the repo could reproduce. This file is that assertion turned
 * into something anyone can re-run:
 *
 *     node scripts/mutation-check.mjs
 *
 * Each entry breaks one guard on purpose, runs the suite, and restores the file.
 * A guard that survives its own mutation is decoration, and the run says so.
 *
 * Two rules learnt the hard way, both encoded below:
 *  - **Anchors are regexes tolerant of CRLF.** `app/globals.css` uses CRLF, and
 *    an anchor written with a bare "\n" silently matched nothing.
 *  - **A missing anchor is a failure, never a skip.** A SKIP line in a column of
 *    REDs reads as a pass at a glance, which is how the first version of this
 *    hid a mutation that was never actually applied.
 *
 * Restoration writes the original text back rather than running `git checkout`,
 * so an unrelated uncommitted change in the same file cannot be destroyed by a
 * mutation run.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { selectShard } from "./mutation-shards.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Each: break one guard, expect the suite to notice. */
const MUTATIONS = [
  {
    name: "meeting requests accept an unoffered slot",
    file: "lib/meeting-server.ts",
    pattern: /if \(!validMeetingSlot\(fields.slot, deps.now \?\? new Date\(\)\)\)/,
    replace: "if (false)",
    tests: "lib/meeting.test.ts",
  },
  {
    name: "meeting requests lose Irish summer time",
    file: "lib/meeting.ts",
    pattern: /export const MEETING_ZONE = "Europe\/Dublin";/,
    replace: 'export const MEETING_ZONE = "UTC";',
    tests: "lib/meeting.test.ts",
  },
  {
    name: "phone polish: arcade focus waits until after its first paint",
    file: "components/arcade/ArcadeExperience.tsx",
    pattern: /useLayoutEffect\(\(\) => \{\r?\n    roomRef.current\?\.focus/,
    replace: "useEffect(() => {\n    roomRef.current?.focus",
    tests: "components/arcade/arcade.test.ts",
  },
  ...[
    ["contact font invites iOS zoom", /(\.cform__input\s*\{\s*font-size:) 16px/, "$1 15px"],
    ["contact inputs lose their tap height", /(\.cform__input\s*\{\s*font-size: 16px;\s*min-height:) 44px/, "$1 32px"],
    ["contact labels lose their tap height", /(\.cform__label\s*\{\s*display: flex;\s*align-items: center;\s*min-height:) 44px/, "$1 20px"],
    ["the RSS link loses its tap height", /  \.writing__feed a,\r?\n/, ""],
  ].map(([name, pattern, replace]) => ({
    name: `phone polish: ${name}`, file: "app/globals.css", pattern, replace,
    tests: "app/globals.test.ts",
  })),
  ...[
    ["experience", "components/ExperienceItem.tsx", "exp__dot"],
    ["writing index", "app/writing/page.tsx", "writing__dot"],
  ].map(([name, file, selector]) => ({
    name: `phone polish: ${name} writes decorative dots into the document`, file,
    pattern: new RegExp(`<span className="${selector}" aria-hidden="true" />`),
    replace: `<span className="${selector}" aria-hidden="true"> · </span>`,
    tests: "components/chrome.test.ts",
  })),
  // The interrupted phone-polish batch and its load/rain changes. Narrow test
  // files keep each mutation attributable; the runner proves the full baseline first.
  ...["#28a846", "#c88420", "#50a0be"].map(colour => ({
    name: `phone polish: secondary text loses contrast headroom (${colour})`,
    file: "app/globals.css",
    pattern: new RegExp(`--green-dim: ${colour};`),
    replace: "--green-dim: #18351e;",
    tests: "app/globals.test.ts",
  })),
  {
    name: "phone polish: native validation loses the fixed-nav scroll inset",
    file: "app/globals.css",
    pattern: /scroll-padding-top: calc\(var\(--nav-h\) \+ var\(--sp-3\)\);/,
    replace: "scroll-padding-top: 0;",
    tests: "app/globals.test.ts",
  },
  {
    name: "phone polish: terminal chips shrink below a thumb target",
    file: "app/globals.css",
    pattern: /(\.term__hint\s*\{\s*min-height:) 44px/,
    replace: "$1 32px",
    tests: "app/globals.test.ts",
  },
  {
    name: "phone polish: the rain returns to coarse phone cells",
    file: "components/system/PhosphorScreen.tsx",
    pattern: /float cols = mix\(54\.0, 48\.0, uMobile\);/,
    replace: "float cols = mix(54.0, 32.0, uMobile);",
    tests: "components/system/PhosphorScreen.test.ts",
  },
  {
    name: "phone polish: the rain returns to full phone intensity",
    file: "components/system/PhosphorScreen.tsx",
    pattern: /float rainGain = mix\(1\.0, 0\.55, uMobile\);/,
    replace: "float rainGain = 1.0;",
    tests: "components/system/PhosphorScreen.test.ts",
  },
  {
    name: "phone polish: the phone selects the full desktop boot",
    file: "lib/boot.ts",
    pattern: /return env.coarse \|\| env.width < 768 \? PHONE_BOOT : FULL_BOOT;/,
    replace: "return FULL_BOOT;",
    tests: "lib/boot.test.ts",
  },
  {
    name: "phone polish: a block already scrolled past is hidden again",
    file: "components/motion/RasterReveal.tsx",
    pattern: /if \(rect.top < window.innerHeight\) \{/,
    replace: "if (rect.top < window.innerHeight && rect.bottom > 0) {",
    tests: "components/motion/RasterReveal.test.ts",
  },
  {
    name: "phone polish: a heading already read scrambles at hydration",
    file: "components/Scramble.tsx",
    pattern: /if \(isLateHydration\(\) && hostRef.current.getBoundingClientRect\(\).top < window.innerHeight\) return;/,
    replace: "// Already-seen guard removed by mutation.",
    tests: "components/motion/RasterReveal.test.ts",
  },
  {
    name: "Drift accepts more sample pieces than the browser workbench can safely analyse",
    file: "lib/tools/drift/readiness.ts",
    pattern: / && pieces\.length <= 50/,
    replace: "",
  },
  {
    name: "the headline fix duplicates the words it was meant to preserve",
    file: "app/tools/headline-check/state.ts",
    pattern: /return `<h1>\$\{text\}<\/h1>`;/,
    replace: "return `<h1>${text}${text}</h1>`;",
  },
  {
    name: "Second Visit ignores a failed worker and leaves the visitor waiting",
    file: "app/tools/second-visit/run-client.ts",
    pattern: /worker\.addEventListener\("error", onError\);/,
    replace: "// worker error listener removed by mutation",
  },
  {
    name: "arcade rebuild: caches an old board after a successful score post",
    file: "app/api/board/route.ts",
    pattern: /"cache-control": "no-store"/,
    replace: '"cache-control": "public, s-maxage=60"',
    tests: "app/api/board/route.test.ts",
  },
  {
    name: "arcade rebuild: accepts a tampered signed run receipt",
    file: "lib/arcade/score-service.ts",
    pattern: /if \(!timingSafeEqual\(Buffer\.from\(sig\), Buffer\.from\(expected\)\)\)/,
    replace: "if (false)",
    tests: "lib/arcade/score-service.test.ts",
  },
  {
    name: "arcade rebuild: silently accepts a fractional score",
    file: "lib/arcade/score-service.ts",
    pattern: /!Number\.isSafeInteger\(e\.score\)/,
    replace: "false",
    tests: "lib/arcade/score-service.test.ts",
  },
  {
    name: "arcade rebuild: reports success after losing an optimistic write race",
    file: "lib/arcade/score-service.ts",
    pattern: /if \(await repo\.write\(ledger, current\.version\)\) return board;/,
    replace: "await repo.write(ledger, current.version); return board;",
    tests: "lib/arcade/score-service.test.ts",
  },
  {
    name: "arcade rebuild: reads a stale cached board before an update",
    file: "lib/arcade/blob-board.ts",
    pattern: /useCache: false/,
    replace: "useCache: true",
    tests: "lib/arcade/blob-board.test.ts",
  },
  // ── the regression a code review caught: timing allowed to discard again ──
  {
    name: "THE REGRESSION: a fast submission silently dropped instead of marked",
    file: "lib/contact-server.ts",
    pattern: /(if \(honeypotFilled\(\{ honeypot: formData\.get\(HONEYPOT_FIELD\) \}\)\))/,
    replace:
      "if (honeypotFilled({ honeypot: formData.get(HONEYPOT_FIELD) }) || filledImplausiblyFast({ elapsed: formData.get(ELAPSED_FIELD) }))",
  },
  {
    name: "timing check stops failing open when no timing is present",
    file: "lib/contact.ts",
    pattern: /(  if \(value === ""\) return false;)/,
    replace: "  // $1",
  },
  {
    name: "check order swapped, so a bot gets a per-field critique",
    file: "lib/contact-server.ts",
    pattern: /if \(honeypotFilled\(\{ honeypot: formData\.get\(HONEYPOT_FIELD\) \}\)\) \{/,
    replace: "if (false) {",
  },

  // ── the module that holds the key ──
  {
    name: "the server module loses its runtime browser fence",
    file: "lib/contact-server.ts",
    pattern: /if \(typeof window !== "undefined"\) \{\r?\n  throw new Error\([^\n]*\r?\n\}/,
    replace: "// fence removed",
  },
  {
    name: "the client-safe half starts reading the environment",
    file: "lib/contact.ts",
    pattern: /(export const MESSAGE_MIN = 10;)/,
    replace: "$1\nexport const LEAK = process.env.RESEND_API_KEY;",
  },

  // ── the form's fragile tricks, none of which look load-bearing ──
  {
    name: "inputs stop re-keying, so a rejected submission wipes the form",
    file: "components/ContactForm.tsx",
    pattern: /key=\{`\$\{field\.name\}-\$\{state\.seq\}`\}/,
    replace: "key={field.name}",
  },
  {
    name: "client errors seeded as {} instead of null (hydration mismatch)",
    file: "components/ContactForm.tsx",
    pattern: /useState<FieldErrors \| null>\(null\)/,
    replace: "useState<FieldErrors | null>({})",
  },
  {
    name: "copy button rendered whether or not the clipboard API exists",
    file: "components/ContactForm.tsx",
    pattern: /\{canCopy && \(/,
    replace: "{true && (",
  },
  {
    name: "field errors lose the role a screen reader acts on",
    file: "components/ContactForm.tsx",
    pattern: /(<p className="cform__error" id=\{errorId\}) role="alert"(>)/,
    replace: "$1$2",
  },
  {
    name: "elapsed stamped as a timestamp rather than a duration",
    file: "components/ContactForm.tsx",
    pattern: /String\(Date\.now\(\) - startedAt\.current\)/,
    replace: "String(Date.now())",
  },

  // ── what actually gets posted ──
  {
    name: "reply_to spelled the SDK way, so replies go to the wrong address",
    file: "lib/contact.ts",
    pattern: /    reply_to: fields\.email,/,
    replace: "    replyTo: fields.email,",
  },
  {
    name: "the [fast] marker silently dropped from the subject",
    file: "lib/contact.ts",
    pattern: /\$\{opts\.flagged \? " \[fast\]" : ""\}/,
    replace: "",
  },
  {
    name: "honeypot renamed to something a browser autofill recognises",
    file: "lib/contact.ts",
    pattern: /export const HONEYPOT_FIELD = "hp";/,
    replace: 'export const HONEYPOT_FIELD = "website";',
  },
  {
    name: "invalid submissions posted to Resend anyway",
    file: "lib/contact-server.ts",
    pattern: /if \(!validation\.ok\) \{/,
    replace: "if (!validation.ok && false) {",
  },
  {
    name: "mailto stops sharing one definition with the copy button",
    file: "lib/contact.ts",
    pattern: /encodeURIComponent\(messageBody\(fields\)\)/,
    replace: "encodeURIComponent(fields.message)",
  },

  // ── the surfaces around it ──
  {
    name: "form labels dimmed back below the contrast floor",
    file: "app/globals.css",
    pattern: /(\.cform__label \{\r?\n  color: var\()--green(\);)/,
    replace: "$1--green-dim$2",
  },
  {
    name: "/contact dropped from the sitemap",
    file: "app/sitemap.ts",
    pattern: /\{ url: absolute\("\/contact"\)[^}]*\},\r?\n/,
    replace: "",
  },
  {
    name: "the call to action points at the wrong route",
    file: "components/Talk.tsx",
    pattern: /<Link className="talk__cta" href="\/contact">/,
    replace: '<Link className="talk__cta" href="/">',
  },
  {
    name: "the call to action reverts to a mailto, which is the original bug",
    file: "components/Talk.tsx",
    pattern: /<Link className="talk__cta" href="\/contact">/,
    replace: '<a className="talk__cta" href={`mailto:x@example.com`}>',
  },

  // ── how hard the tube flashes, and how much light follows the cursor ──
  // Halved on 2026-08-20. Each of these creeps the brightness back the way a
  // plausible-looking commit would, one number at a time.
  // Named groups, not $1/$2. `"$10.5$2"` reads as group 10 before it falls back
  // to group 1, which is fine with two groups and silently wrong with ten.
  {
    name: "the periodic flicker creeps back to full strength",
    file: "app/globals.css",
    pattern: /(?<lead>98% \{\r?\n      opacity: )0\.25(?<tail>;)/,
    replace: "$<lead>0.5$<tail>",
  },
  {
    name: "the channel-change band creeps back to full strength",
    file: "app/globals.css",
    pattern: /(?<lead>top: -26vh;\r?\n      opacity: )0\.5(?<tail>;)/,
    replace: "$<lead>1$<tail>",
  },
  {
    name: "the pointer halo brightens in the present pass only",
    file: "components/system/PhosphorScreen.tsx",
    pattern: /glow \+= exp\(-d \* 5\.0\) \* 0\.025 \* uPointerActive;/,
    replace: "glow += exp(-d * 5.0) * 0.05 * uPointerActive;",
  },
  {
    name: "the pointer halo brightens in the persistence buffer only",
    file: "components/system/PhosphorScreen.tsx",
    pattern: /add \+= exp\(-length\(toP\) \* 9\.0\) \* 0\.05 \* uEmit \* uPointerActive;/,
    replace: "add += exp(-length(toP) * 9.0) * 0.10 * uEmit * uPointerActive;",
  },
  {
    name: "the degauss deposit goes back to blinding",
    file: "components/system/PhosphorScreen.tsx",
    pattern: /add \+= dgDrag \* 0\.06 \* uEmit;/,
    replace: "add += dgDrag * 0.85 * uEmit;",
  },
  {
    name: "the degauss present-pass glow goes back up",
    file: "components/system/PhosphorScreen.tsx",
    pattern: /glow \+= band \* 0\.05;/,
    replace: "glow += band * 0.7;",
  },
  {
    name: "the tap and degauss glows are swapped over",
    file: "components/system/PhosphorScreen.tsx",
    // The reason those two are asserted inside their own brace-matched blocks:
    // against the whole pass, a straight swap satisfies both assertions.
    pattern: /glow \+= band \* 0\.10;([\s\S]*?)glow \+= band \* 0\.05;/,
    replace: "glow += band * 0.05;$1glow += band * 0.10;",
  },
  {
    name: "dimming the degauss also stops it scrubbing burn-in",
    file: "components/system/PhosphorScreen.tsx",
    pattern: /burn \*= 1\.0 - clamp\(dgDrag \* 3\.5, 0\.0, 1\.0\);/,
    replace: "burn *= 1.0 - clamp(dgDrag * 1.75, 0.0, 1.0);",
  },
  {
    name: "the contact form goes silent again",
    file: "components/ContactForm.tsx",
    pattern: /            onKeyDown: onKey,\r?\n/,
    replace: "",
  },
  {
    // The one a review had to catch by hand: the original assertion was a bare
    // `audio.key()` against the whole file, and the docblock above the handler
    // says `audio.key()` too, so emptying the handler stayed green.
    name: "the key handler is emptied but its docblock stays",
    file: "components/ContactForm.tsx",
    pattern: /      audio\.key\(\);\r?\n/,
    replace: "",
  },
  {
    name: "the form's key filter drifts away from the shell's",
    file: "components/ContactForm.tsx",
    pattern: /e\.key === "Backspace" \|\| e\.key === "Tab"/,
    replace: 'e.key === "Backspace"',
  },
  {
    // The absence test that used to pass by slicing three characters. Moving the
    // handler onto the form is the change it exists to stop.
    name: "the key handler is hoisted onto the form, so the submit button clicks",
    file: "components/ContactForm.tsx",
    pattern: /(<form\r?\n        className="cform__form")/,
    replace: "$1\n        onKeyDown={onKey}",
  },

  // ── the frame-rate normalisation a second review had to catch ──
  {
    name: "deposits go back to per frame, so brightness follows the refresh rate",
    file: "components/system/PhosphorScreen.tsx",
    pattern: /su\.uEmit\.value = \(1 - su\.uDecay\.value\) \/ \(1 - Math\.pow\(0\.045, 1 \/ 60\)\);/,
    replace: "su.uEmit.value = 1;",
  },
  {
    name: "the pointer halo drops out of the normalisation",
    file: "components/system/PhosphorScreen.tsx",
    pattern: /\* 0\.05 \* uEmit \* uPointerActive;/,
    replace: "* 0.05 * uPointerActive;",
  },

  // ── the constants this change deliberately did NOT touch ──
  // The test file calls these "just as important", so they have to bite too.
  // Without them, 30/30 RED read as full coverage while seven asserted numbers
  // had never been shown to matter.
  {
    name: "the channel-change static creeps back up",
    file: "app/globals.css",
    pattern: /(?<lead>@keyframes channel-static \{\r?\n    from \{\r?\n      opacity: )0\.425(?<tail>;)/,
    replace: "$<lead>0.85$<tail>",
  },
  {
    name: "a tap's deposit is raised on its own",
    file: "components/system/PhosphorScreen.tsx",
    pattern: /2\.2\) \* 0\.11 \* uEmit;/,
    replace: "2.2) * 0.55 * uEmit;",
  },
  {
    name: "the pointer's deflection ripple is dimmed along with its light",
    file: "components/system/PhosphorScreen.tsx",
    pattern: /\* ripple \* 0\.0045 \* uPointerActive;/,
    replace: "* ripple * 0.00225 * uPointerActive;",
  },
  {
    name: "the degauss stops dragging the persistence buffer",
    file: "components/system/PhosphorScreen.tsx",
    pattern: /src \+= normalize\(toC \+ 1e-5\) \* dgDrag \* 0\.045;/,
    replace: "src += normalize(toC + 1e-5) * dgDrag * 0.0225;",
  },
  {
    name: "a tap stops warping the picture",
    file: "components/system/PhosphorScreen.tsx",
    pattern: /uv \+= normalize\(toT \+ 1e-5\) \* band \* 0\.04;/,
    replace: "uv += normalize(toT + 1e-5) * band * 0.02;",
  },
  {
    name: "a degauss stops warping the picture",
    file: "components/system/PhosphorScreen.tsx",
    pattern: /uv \+= normalize\(toC \+ 1e-5\) \* band \* 0\.055;/,
    replace: "uv += normalize(toC + 1e-5) * band * 0.0275;",
  },
  {
    name: "the power-on strike is dimmed too, which nobody asked for",
    file: "components/system/PhosphorScreen.tsx",
    pattern: /\* strike \* 1\.4;/,
    replace: "* strike * 0.7;",
  },

  // ── the measurement layer, added 2026-08-21 with PostHog ──
  //
  // Every one of these breaks something that would still *work*. That is the
  // whole reason they are here: an analytics regression does not throw, does
  // not warn and does not change a pixel. It just makes a number quietly mean
  // something other than what the chart says it means.
  {
    name: "PRIVACY: cookieless is downgraded, so EU visitors get cookies with no banner",
    file: "lib/analytics.ts",
    pattern: /cookieless_mode: "always",/,
    replace: 'cookieless_mode: "on_reject",',
  },
  {
    name: "person profiles come back on, one per cookieless page load",
    file: "lib/analytics.ts",
    pattern: /person_profiles: "never",/,
    replace: 'person_profiles: "identified_only",',
  },
  {
    name: "events go straight to PostHog again, so blockers eat a third of them",
    file: "lib/analytics.ts",
    pattern: /api_host: INGEST_PREFIX,/,
    replace: "api_host: POSTHOG_API_HOST,",
  },
  {
    name: "SPA pageviews stop being captured, so a whole visit reads as one page",
    file: "lib/analytics.ts",
    pattern: /capture_pageview: "history_change",/,
    replace: "capture_pageview: true,",
  },
  {
    name: "referrer matching becomes a substring test anybody can forge",
    file: "lib/analytics.ts",
    pattern: /return host === domain \|\| host\.endsWith\(`\.\$\{domain\}`\);/,
    replace: "return host.includes(domain);",
  },
  {
    name: "the crawler table stops being sorted, so every Claude user-fetch reads as a training crawl",
    file: "lib/crawlers.ts",
    pattern: /export const CRAWLERS: readonly Crawler\[\] = \[\.\.\.TABLE\]\.sort\(\r?\n\s*\(a, b\) => b\.token\.length - a\.token\.length,\r?\n\);/,
    replace: "export const CRAWLERS: readonly Crawler[] = [...TABLE];",
  },
  {
    name: "the ingest exemption goes, so every analytics beacon is redirected into nothing",
    file: "lib/edge.ts",
    pattern: /  if \(isIngestPath\(pathname\)\) return null;/,
    replace: "  // exemption removed",
  },
  {
    name: "`//` strips to an empty Location, which a browser reads as a redirect loop",
    file: "lib/edge.ts",
    pattern: /return stripped === "" \? "\/" : stripped;/,
    replace: "return stripped;",
  },
  {
    name: "server events start creating person profiles named after crawlers",
    file: "lib/posthog-server.ts",
    pattern: /      \$process_person_profile: false,\r?\n      \$lib: "fergusoreilly\.dev-server",/,
    replace: '      $lib: "fergusoreilly.dev-server",',
  },
  {
    name: "a caller can now switch person creation back on by spreading one property",
    file: "lib/posthog-server.ts",
    pattern: /      \.\.\.event\.properties,/,
    replace: "",
  },
  {
    name: "THE EXPENSIVE ONE: posthog-js goes back into the layout bundle, 248 KB on every route",
    file: "components/analytics/PostHogAnalytics.tsx",
    pattern: /void import\("posthog-js"\)\.then\(\(\{ default: posthog \}\) => \{/,
    replace: 'import posthog from "posthog-js";\n      void Promise.resolve().then(() => {',
  },
  {
    name: "PRIVACY: development starts reporting into the live project again",
    file: "components/analytics/PostHogAnalytics.tsx",
    pattern: /const KEY = process\.env\.NODE_ENV === "production" \? process\.env\.NEXT_PUBLIC_POSTHOG_KEY : undefined;/,
    replace: "const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;",
  },
  {
    name: "the crawler cap is written but not wired, so a forged UA bills per request",
    file: "middleware.ts",
    pattern: /if \(crawler && shouldCaptureCrawlerVisit\(Date\.now\(\)\)\) \{/,
    replace: "if (crawler) {",
  },
  {
    name: "the cap stops counting, so the budget is never spent",
    file: "lib/edge.ts",
    pattern: /  if \(capturedInWindow >= CRAWLER_CAPTURE_CAP\) return false;/,
    replace: "  if (false) return false;",
  },
  {
    // Both occurrences, and that is the point. Mutating only the `let`
    // initialiser survived the suite, because every test calls
    // `resetCrawlerCaptureWindow()` first and that function still wrote the
    // correct sentinel. It was also an equivalent mutant in production, where
    // `Date.now()` dwarfs the window so `0` and `-Infinity` behave identically.
    // Changing both is the careless edit a person would actually make, and it
    // is observable.
    name: "the capture window anchors at the epoch again instead of at first use",
    file: "lib/edge.ts",
    pattern: /-Infinity/g,
    replace: "0",
  },
  {
    name: "the MCP route stops observing the message, so no tool call is ever recorded",
    file: "app/api/mcp/route.ts",
    pattern: /^  observe\(message\);$/m,
    replace: "  // observation removed",
  },
  {
    name: "THE REGRESSION: MCP client identity comes from Mcp-Name again, labelling every row with the tool name",
    file: "app/api/mcp/route.ts",
    pattern: /const withClient = withMcpClient\(telemetry, request\.headers\.get\("user-agent"\)\);/,
    replace: 'const withClient = withMcpClient(telemetry, request.headers.get("mcp-name"));',
  },
  {
    name: "the transport's guess overwrites the identity the client declared itself",
    file: "lib/analytics.ts",
    pattern: /  if \(telemetry\.properties\.client\) return telemetry;/,
    replace: "  // preference removed",
  },
  {
    name: "the _meta client key drifts away from the one lib/mcp.ts implements",
    file: "lib/analytics.ts",
    pattern: /const MCP_CLIENT_INFO_KEY = "io\.modelcontextprotocol\/clientInfo";/,
    replace: 'const MCP_CLIENT_INFO_KEY = "io.modelcontextprotocol/client-info";',
  },
  {
    name: "MCP telemetry reports a made-up 200 instead of the status it returned",
    file: "app/api/mcp/route.ts",
    pattern: /const telemetry = mcpCallProperties\(observed, reply\.status\);/,
    replace: "const telemetry = mcpCallProperties(observed, 200);",
  },
  {
    name: "THE SITE-BREAKER: the redirect goes back to nextUrl.clone() and points at itself",
    file: "middleware.ts",
    pattern: /const url = new URL\(request\.url\);/,
    replace: "const url = request.nextUrl.clone();",
  },
  {
    name: "the matcher's comment and its regex disagree again, this time about _vercel",
    file: "middleware.ts",
    pattern: /\|_vercel\|ingest\//,
    replace: "|ingest/",
  },
  {
    name: "robots.txt and the sitemap are excluded for looking like static files",
    file: "middleware.ts",
    pattern: /\(\?:png\|jpg/,
    replace: "(?:txt|xml|json|png|jpg",
  },
  {
    name: "the pre-init queue is dropped, so LCP and FCP are never recorded",
    file: "components/analytics/PostHogAnalytics.tsx",
    pattern: /  if \(pending\.length < PENDING_LIMIT\) pending\.push\(\{ event, properties \}\);/,
    replace: "  // dropped",
  },

  // ── the command registry (F1): guards that moved out of one switch ──
  {
    name: "gravity stops declining under reduced motion",
    file: "lib/commands/effects.ts",
    pattern: /if \(on && ctx\.reducedMotion\) return ok\(GRAVITY_DECLINED\);/,
    replace: "if (false) return ok(GRAVITY_DECLINED);",
  },
  {
    name: "eject stops declining under reduced motion",
    file: "lib/commands/effects.ts",
    pattern: /if \(on && ctx\.reducedMotion\) return ok\(EJECT_DECLINED\);/,
    replace: "if (false) return ok(EJECT_DECLINED);",
  },
  {
    name: "scanlines accepts values above 100",
    file: "lib/commands/effects.ts",
    pattern: /n < 0 \|\| n > 100\)/,
    replace: "n < 0 || n > 1000)",
  },
  {
    name: "theme fires an effect for a phosphor that does not exist",
    file: "lib/commands/effects.ts",
    pattern: /if \(!isTheme\(arg\)\)/,
    replace: "if (false)",
  },
  {
    name: "the arcade door is no longer hidden",
    file: "lib/commands/hidden.ts",
    pattern: /hidden: true,/,
    replace: "hidden: false,",
  },
  {
    name: "cd stops opening doors",
    file: "lib/commands/nav.ts",
    pattern: /if \(door\?\.hidden\) return door\.run/,
    replace: "if (false) return door.run",
  },
  {
    name: "the registry stops sorting, so help follows registration order",
    file: "lib/commands/registry.ts",
    pattern: /\.filter\(\(d\) => !d\.hidden\)\.sort\(byNameAsc\)/,
    replace: ".filter((d) => !d.hidden)",
  },

  // ── the shell everywhere (F2) ──
  {
    name: "the shared drawer stops opening",
    file: "lib/shell.ts",
    pattern: /return state\.open \? state : \{ \.\.\.state, open: true \};/,
    replace: "return state;",
    tests: "lib/shell.test.ts",
  },
  {
    name: "a backtick typed into a field summons the shell",
    file: "lib/shell.ts",
    pattern: /if \(tag === "INPUT" \|\| tag === "TEXTAREA" \|\| tag === "SELECT"\) return false;/,
    replace: "",
  },
  {
    name: "forget removes a key the site does not own",
    file: "lib/forget.ts",
    pattern: /    if \(!isOwnedKey\(key\)\) continue;/,
    replace: "",
  },
  {
    name: "the defaults are written to storage again",
    file: "lib/system.ts",
    pattern: /if \(isDefaultSettings\(settings\)\) target\.removeItem\(SETTINGS_KEY\);/,
    replace: "if (false) target.removeItem(SETTINGS_KEY);",
  },
  {
    name: "the phone tap target shrinks back under 44px",
    file: "app/globals.css",
    pattern: /(?<lead>\.statusbar__prompt \{\r?\n    min-width: 44px;\r?\n    min-height: )44px;/,
    replace: "$<lead>22px;",
  },

  // ── what the review of F2 found ──
  {
    name: "clicking outside the drawer stops dismissing it",
    file: "components/ShellDrawer.tsx",
    pattern: /    document\.addEventListener\("pointerdown", onPointerDown\);/,
    replace: "",
    tests: "components/chrome-interactions.test.ts",
  },
  {
    name: "the status bar writes its dollar into the document again",
    file: "components/system/StatusBar.tsx",
    pattern: /(<span className="statusbar__prompt-label">\{copy\.terminal\}<\/span>)/,
    replace: '<span aria-hidden="true">$ </span>\r\n        $1',
  },
  {
    name: "smooth scrolling escapes the reduced-motion gate",
    file: "app/globals.css",
    pattern:
      /@media \(prefers-reduced-motion: no-preference\) \{\r?\n  html \{\r?\n    scroll-behavior: smooth;\r?\n  \}\r?\n\}/,
    replace: "html {\r\n  scroll-behavior: smooth;\r\n}",
  },
  {
    name: "the default check hand-lists its fields, so a fifth one is ignored",
    file: "lib/system.ts",
    pattern:
      /  const keys = Object\.keys\(DEFAULT_SETTINGS\) as \(keyof SystemSettings\)\[\];\r?\n  return keys\.every\(\(k\) => s\[k\] === DEFAULT_SETTINGS\[k\]\);/,
    replace:
      "  return (\r\n    s.theme === DEFAULT_SETTINGS.theme &&\r\n    s.crtEnabled === DEFAULT_SETTINGS.crtEnabled &&\r\n    s.scanlines === DEFAULT_SETTINGS.scanlines &&\r\n    s.audio === DEFAULT_SETTINGS.audio\r\n  );",
  },
  {
    // Not a guard being broken but a future being simulated: a tool writing a
    // key `forget` has never heard of. The walk in `lib/forget.test.ts` is the
    // only thing that would ever notice.
    name: "a tool writes a key forget has never heard of",
    file: "lib/presence.ts",
    pattern: /(export const localPresence)/,
    replace: 'export function leak(): void {\r\n  window.localStorage.setItem("not-ours", "1");\r\n}\r\n\r\n$1',
  },
  {
    name: "PRIVACY: tool_run starts spreading its payload, so a careless caller ships the visitor's URL",
    file: "lib/analytics.ts",
    pattern: /  return \{ tool, outcome, ms \};/,
    replace:
      "  return { ...(payload as unknown as Record<string, unknown>), tool, outcome, ms } as { tool: string; outcome: ToolOutcome; ms: number };",
  },
  {
    name: "the touch bar hides the memory readout on any touchscreen, however wide",
    file: "app/globals.css",
    pattern: /@media \(hover: none\) and \(max-width: 768px\) \{/,
    replace: "@media (hover: none) {",
  },
  {
    name: "the headline checker records ok before the report exists, so a parser throw reads as a success",
    file: "app/tools/headline-check/actions.ts",
    pattern: /  let report;[\s\S]*?  record\("ok", started\);/,
    replace: '  record("ok", started);\n  const report = checkHtml(page.html);',
  },
  {
    name: "the headline checker stops recording a refused run, so refusals read as silence",
    file: "app/tools/headline-check/actions.ts",
    pattern: /    record\("refused", started\);\r?\n    return \{ status: "invalid", seq, url: "", message: headlineCopy\.emptyUrl \};/,
    replace: '    return { status: "invalid", seq, url: "", message: headlineCopy.emptyUrl };',
  },
  // ── the arcade runtime (G0) ──
  {
    name: "the arcade stops declining under reduced motion",
    file: "lib/commands/hidden.ts",
    pattern: /if \(ctx\.reducedMotion\) return ok\(ARCADE_DECLINED\);/,
    replace: "if (false) return ok(ARCADE_DECLINED);",
  },
  {
    name: "the door launches a game nobody has built",
    file: "lib/commands/hidden.ts",
    pattern: /if \(!isReady\(game\) \|\| !game\.spec\) \{/,
    replace: "if (false) {",
  },
  {
    name: "the loop plays back a stall instead of dropping it",
    file: "lib/arcade/loop.ts",
    pattern: /if \(steps >= MAX_TICKS_PER_FRAME\) \{/,
    replace: "if (false) {",
  },
  {
    name: "the loop throws its remainder away, so speed drifts with the frame rate",
    file: "lib/arcade/loop.ts",
    pattern: /    state\.acc -= TICK_MS;/,
    replace: "    state.acc = 0;",
  },
  {
    name: "the grid draws a glyph too small to be one",
    file: "lib/arcade/grid.ts",
    pattern: /if \(w < MIN_CELL_PX\) continue;/,
    replace: "if (false) continue;",
  },
  {
    name: "a screen with no room gets a clipped grid instead of a sentence",
    file: "components/arcade/ArcadeScreen.tsx",
    pattern: /if \(measured && !fit\) leave\(\[\.\.\.arcadeCopy\.noRoom\]\);/,
    replace: "if (false) leave([...arcadeCopy.noRoom]);",
  },
  {
    name: "the arrows scroll the page out from under the player",
    file: "components/arcade/ArcadeScreen.tsx",
    pattern: /if \(shouldCapture\(e\.key, mods\)\) e\.preventDefault\(\);/,
    replace: ";",
  },
  {
    name: "Escape stops leaving the arcade",
    file: "components/arcade/ArcadeScreen.tsx",
    pattern: /if \(e\.key === "Escape"\) \{/,
    replace: "if (false) {",
  },
  {
    name: "the arcade's keys reach the drawer, so one Escape closes both",
    file: "components/arcade/ArcadeScreen.tsx",
    pattern: /    e\.stopPropagation\(\);\r?\n    if \(e\.key === "Escape"\) \{/,
    replace: '    if (e.key === "Escape") {',
  },
  {
    name: "the grid is rewritten every frame whether or not it changed",
    file: "components/arcade/ArcadeScreen.tsx",
    pattern: /if \(next === lastDrawnRef\.current\) return;/,
    replace: ";",
  },
  {
    name: "a score is reported as posted before the server answered",
    file: "components/arcade/ArcadeScreen.tsx",
    pattern: /leave\(\[result\.ok \? arcadeCopy\.initials\.saved : result\.reason\]\);/,
    replace: "leave([arcadeCopy.initials.saved]);",
  },
  {
    name: "initials skip the blocklist",
    file: "lib/arcade/board.ts",
    pattern: /if \(BLOCKED_INITIALS\.has\(folded\)\)/,
    replace: "if (false)",
  },
  {
    name: "initials stop being folded, so 4SS gets on the board",
    file: "lib/arcade/board.ts",
    pattern: /  const folded = foldLeet\(cleaned\);/,
    replace: "  const folded = cleaned;",
  },
  {
    name: "initials are truncated rather than refused, so the site picks them for you",
    file: "lib/arcade/board.ts",
    pattern: /if \(cleaned\.length !== INITIALS_LENGTH\)/,
    replace: "if (cleaned.length < INITIALS_LENGTH)",
  },
  {
    name: "the board keeps every score ever posted",
    file: "lib/arcade/board.ts",
    pattern: /\.sort\(\(a, b\) => b\.score - a\.score\)\.slice\(0, size\)/,
    replace: ".sort((a, b) => b.score - a.score)",
  },
  {
    name: "the client trusts a body that never said it was available",
    file: "lib/arcade/board-client.ts",
    pattern: /  if \(body\.available !== true\) return UNAVAILABLE;/,
    replace: "  if (false) return UNAVAILABLE;",
  },
  {
    name: "a network failure becomes a crash instead of a sentence",
    file: "lib/arcade/board-client.ts",
    pattern: /  \} catch \{\r?\n    return UNAVAILABLE;\r?\n  \}/,
    replace: "  } catch (error) {\n    throw error;\n  }",
  },
  {
    name: "neofetch prints the boards to somebody who never found the door",
    file: "lib/commands/info.ts",
    pattern: /if \(!ctx\.arcade\?\.seen\) return \[\];/,
    replace: "if (false) return [];",
  },
  {
    name: "the cabinet launches a game with no program behind it",
    file: "lib/arcade/cabinet.ts",
    pattern: /if \(!isReady\(game\)\) return \{ state: \{ index, note: arcadeCopy\.cabinet\.notReady \}, launch: null \};/,
    replace: "if (false) return { state: { index, note: arcadeCopy.cabinet.notReady }, launch: null };",
  },
  {
    name: "the cd door is looked up on the whole argument again, so `cd arcade signal` dies",
    file: "lib/commands/nav.ts",
    pattern: /const doorName = \(args\[0\] \?\? ""\)\.toLowerCase\(\)\.replace\(\/\^\\\/\+\|\\\/\+\$\/g, ""\);/,
    replace: "const doorName = dest;",
  },
  {
    name: "the arcade starts a second animation frame loop",
    file: "components/arcade/ArcadeScreen.tsx",
    pattern: /const PROBE_LENGTH = 100;/,
    replace: "const PROBE_LENGTH = 100;\nrequestAnimationFrame(() => {});",
  },
  {
    name: "the arcade starts a timer beside the system frame clock",
    file: "components/arcade/ArcadeScreen.tsx",
    pattern: /const PROBE_LENGTH = 100;/,
    replace: "const PROBE_LENGTH = 100;\nsetInterval(() => {}, 16);",
  },
  {
    name: "the running arcade ignores a new reduced-motion preference",
    file: "components/arcade/ArcadeScreen.tsx",
    pattern: /if \(reducedMotion\) leave\(\[\.\.\.arcadeCopy\.declined\]\);/,
    replace: "if (false) leave([...arcadeCopy.declined]);",
  },
  {
    name: "the frame loop keeps ticking an instance after it exits",
    file: "components/arcade/ArcadeScreen.tsx",
    pattern: /if \(runningRef\.current\?\.instance !== instance\) return;/,
    replace: "if (false) return;",
  },
  {
    name: "the exit button also fires the running game",
    file: "components/arcade/ArcadeScreen.tsx",
    pattern: /    if \(fromControl\(e\.target\)\) return;\r?\n    const mods/,
    replace: "    const mods",
  },
  {
    name: "the font probe stops being observed after the webfont swaps in",
    file: "components/arcade/ArcadeScreen.tsx",
    pattern: /    observer\.observe\(probe\);\r?\n/,
    replace: "",
  },
  {
    name: "the arcade leaks a frame subscriber after exit",
    file: "components/arcade/ArcadeScreen.tsx",
    pattern: /      unsubscribe\(\);\r?\n/,
    replace: "",
  },
  {
    name: "a resize restarts the game instead of updating its world",
    file: "components/arcade/ArcadeScreen.tsx",
    pattern: /    host\.cols = fit\.cols;\r?\n    host\.rows = fit\.rows;/,
    replace: "    host.cols = host.cols;\n    host.rows = host.rows;",
  },
  {
    name: "leaving a program no longer restores the prompt focus",
    file: "components/Terminal.tsx",
    pattern: /    hadProgram\.current = false;\r?\n    inputRef\.current\?\.focus\(\);/,
    replace: "    hadProgram.current = false;",
  },
  {
    name: "a zero score is offered to the board",
    file: "lib/arcade/finish.ts",
    pattern: /score > 0/,
    replace: "score >= 0",
  },
  {
    name: "a board response can inject a newline through initials",
    file: "lib/arcade/board-client.ts",
    pattern: /  if \(normaliseInitials\(row\.initials\) !== row\.initials\) return null;\r?\n/,
    replace: "",
  },
  {
    name: "an absurd board score reaches exponent notation",
    file: "lib/arcade/board-client.ts",
    pattern: /  if \(row\.score < 0 \|\| row\.score > MAX_SCORE\) return null;/,
    replace: "  if (row.score < 0) return null;",
  },
  {
    name: "the board GET can hang forever",
    file: "lib/arcade/board-client.ts",
    pattern: /      signal: AbortSignal\.timeout\(FETCH_TIMEOUT_MS\),\r?\n    \}\);/,
    replace: "    });",
  },
  {
    name: "the score POST can hang forever",
    file: "lib/arcade/board-client.ts",
    pattern: /      signal: AbortSignal\.timeout\(FETCH_TIMEOUT_MS\),\r?\n      body:/,
    replace: "      body:",
  },
  {
    name: "an onExit render restarts the running program",
    file: "components/arcade/ArcadeScreen.tsx",
    pattern: /    onExitRef\.current\(lines\);\r?\n  \}, \[releaseHeld\]\);/,
    replace: "    onExit(lines);\n  }, [onExit, releaseHeld]);",
  },
  {
    name: "the probe and grid stop inheriting the same font size",
    file: "app/globals.css",
    pattern: /\.arcade \{\r?\n  \/\* Declared here[\s\S]*?  --arcade-font: 15px;/,
    replace: ".arcade {",
  },
  {
    name: "a resized game is not told its measured world changed",
    file: "components/arcade/ArcadeScreen.tsx",
    pattern: /    instance\?\.resize\?\.\(fit\.cols, fit\.rows\);\r?\n/,
    replace: "",
  },
  {
    name: "keyup remaps current modifiers instead of releasing the key that went down",
    file: "components/arcade/ArcadeScreen.tsx",
    pattern: /    const key = releaseKey\(heldKeysRef\.current, e\.code \|\| e\.key\);/,
    replace: "    const key = arcadeKey(e.key, { ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey });",
  },
  {
    name: "exit disposes a game without releasing its held controls",
    file: "components/arcade/ArcadeScreen.tsx",
    pattern: /    exitedRef\.current = true;\r?\n    releaseHeld\(\);/,
    replace: "    exitedRef.current = true;",
  },
  {
    name: "a non-finite score reaches the initials screen",
    file: "lib/arcade/finish.ts",
    pattern: /Number\.isFinite\(score\) && score > 0 && score <= MAX_PROGRAM_SCORE/,
    replace: "score > 0",
  },
  {
    name: "an out-of-contract game score reaches the board",
    file: "lib/arcade/finish.ts",
    pattern: / && score <= MAX_PROGRAM_SCORE/,
    replace: "",
  },
  // -- drift: the seven guards, each with the test that catches it --
  {
    name: "drift prints a distance under the 150-word floor",
    file: "lib/tools/drift/report.ts",
    pattern: /if \(count < MIN_DELTA_WORDS\) \{/,
    replace: "if (false) {",
  },
  {
    name: "drift prints a distance from a reference of three pieces, in units of one piece's accident",
    file: "lib/tools/drift/report.ts",
    pattern: /if \(ref\.documents < MIN_REFERENCE_DOCUMENTS \|\| ref\.markers\.length === 0\) \{/,
    replace: "if (false) {",
  },
  {
    name: "drift keeps a marker whose standard deviation is zero (every Delta becomes NaN)",
    file: "lib/tools/drift/reference.ts",
    pattern: /    if \(s === 0\) continue;/,
    replace: "    if (false) continue;",
  },
  {
    name: "drift accepts a marker from a single document, so topic reads as voice",
    file: "lib/tools/drift/reference.ts",
    pattern: />= minDocuments\)/,
    replace: ">= 0)",
  },
  {
    name: "drift lectures a writer about a word they use themselves",
    file: "lib/tools/drift/substitutions.ts",
    pattern: /    if \(counts\.formal > 0\) continue;/,
    replace: "    if (false) continue;",
  },
  {
    name: "drift blames sentences for words the draft UNDERuses",
    file: "lib/tools/drift/report.ts",
    pattern: /if \(gap > 0\) over\[marker\] = gap \/ ref\.markers\.length;/,
    replace: "over[marker] = Math.abs(gap) / ref.markers.length;",
  },
  {
    name: "drift saves a profile nobody pressed save for",
    file: "app/tools/drift/DriftTool.tsx",
    pattern: /      const stored = parseProfile\(window\.localStorage\.getItem\(DRIFT_PROFILE_KEY\)\);/,
    replace:
      "      const stored = parseProfile(window.localStorage.getItem(DRIFT_PROFILE_KEY));\n      window.localStorage.setItem(DRIFT_PROFILE_KEY, serialiseProfile(demoReference, demoProfile, demoSpread, new Date().toISOString()));",
  },
  {
    name: "drift restores a saved profile but leaves the worked-example report on screen",
    file: "app/tools/drift/DriftTool.tsx",
    pattern:
      /      setReport\(analyse\(stored\.profile, driftDemo\.draft, stored\.reference, stored\.spread\)\);\r?\n/,
    replace: "",
  },
  {
    name: "drift's marker cap disappears while its test still claims to cover it",
    file: "lib/tools/drift/reference.ts",
    pattern: /    if \(markers\.length >= MARKER_COUNT\) break;/,
    replace: "    if (false) break;",
  },
  {
    name: "drift claims a blocked profile deletion succeeded",
    file: "lib/tools/drift/storage.ts",
    pattern: /  } catch \{\r?\n    return false;\r?\n  }/,
    replace: "  } catch {\n    return true;\n  }",
  },
  {
    name: "drift lets the worked-example reference measure a visitor draft",
    file: "lib/tools/drift/session.ts",
    pattern: /  return session\.source === "visitor";/,
    replace: "  return true;",
  },
  {
    name: "drift hides an older saved profile when a new in-memory profile is built",
    file: "lib/tools/drift/session.ts",
    pattern: /  return \{ \.\.\.session, source: "visitor" \};/,
    replace: '  return { ...session, source: "visitor", savedAt: null };',
  },
  {
    name: "drift claims deletion but retains the visitor's prose in session state",
    file: "lib/tools/drift/session.ts",
    pattern: /  return succeeded \? demoSession\(demoDraft\) : session;/,
    replace: "  return session;",
  },
  {
    name: "drift accepts extra marker statistics in an exported profile",
    file: "lib/tools/drift/storage.ts",
    pattern: /  if \(!hasExactKeys\(mean, markers\) \|\| !hasExactKeys\(sd, markers\)\) return false;/,
    replace: "",
  },
  {
    name: "drift accepts rhythm buckets outside zero-to-one shares",
    file: "lib/tools/drift/storage.ts",
    pattern: /  if \(!rhythm\.buckets\.every\(isShare\)\) return false;/,
    replace: "",
  },
  {
    name: "drift accepts rhythm buckets that do not sum to one",
    file: "lib/tools/drift/storage.ts",
    pattern: /  if \(!nearlyEqual\(bucketTotal, sentences === 0 \? 0 : 1\)\) return false;/,
    replace: "",
  },
  {
    name: "drift accepts an inconsistent combined join share",
    file: "lib/tools/drift/storage.ts",
    pattern: /  if \(!nearlyEqual\(joins\.any, joins\.and \+ joins\.but \+ joins\.so\)\) return false;/,
    replace: "",
  },
  {
    name: "drift accepts a saved spread claiming more pieces than exist",
    file: "lib/tools/drift/storage.ts",
    pattern: /    \(reference === undefined \|\| pieces <= reference\.documents\) &&/,
    replace: "    true &&",
  },
  {
    name: "drift accepts a substitution count larger than the whole profile",
    file: "lib/tools/drift/storage.ts",
    pattern: /formal <= wordTotal &&\r?\n      Number\.isInteger\(plain\)/,
    replace: "true &&\n      Number.isInteger(plain)",
  },

  // ── overlap: fifteen guards, each with the test that bites on it ──
  //
  // Two of these are not in the plan that specified this tool, and both replace
  // a row that would have survived. The Bloom step guard the plan asked for
  // (`|| 1` on `h2 % bits`) cannot fire, because h2 is forced odd and the bit
  // count is always even; taking it out left the whole suite green. What was
  // actually broken there was the signedness, and that is the row below. The
  // second addition is `pairedChannels` holding a message sent before the far
  // side has a handler, which is the difference between an exchange and a hang.
  {
    name: "overlap decodes before splitting a URL, so a %23 in a slug cuts it in half",
    file: "lib/tools/overlap/slug.ts",
    pattern: /s = s\.split\("#", 1\)\[0\];/,
    replace: 's = decodeURIComponent(s).split("#", 1)[0];',
  },
  {
    name: "overlap turns an old /pub/ link into an /in/ slug, inventing matches",
    file: "lib/tools/overlap/slug.ts",
    pattern: /if \(\/\^pub\(\\\/\|\$\)\/i\.test\(s\)\) return \{ ok: false, reason: "legacy-pub" \};/,
    replace: 's = s.replace(/^pub\\//i, "");',
  },
  {
    name: "overlap stops composing accents, so one name hashes two ways",
    file: "lib/tools/overlap/slug.ts",
    pattern: /s = s\.normalize\("NFC"\)\.toLowerCase\(\);/,
    replace: "s = s.toLowerCase();",
  },
  {
    name: "overlap accepts any host, so a lookalike domain becomes a LinkedIn profile",
    file: "lib/tools/overlap/slug.ts",
    pattern: /if \(!LINKEDIN_HOST\.test\(host\)\) return \{ ok: false, reason: "not-a-profile" \};/,
    replace: 'if (false) return { ok: false, reason: "not-a-profile" };',
  },
  {
    name: "overlap strips the suffix, so two people called John Smith become one",
    file: "lib/tools/overlap/slug.ts",
    pattern: /s = s\.replace\(\/\^in\\\/\/i, ""\);/,
    replace: 's = s.replace(/^in\\//i, "").replace(/-[0-9a-z]+$/, "");',
  },
  {
    name: "overlap truncates to 48 bits, where a big pair of lists gets a wrong name",
    file: "lib/tools/overlap/hash.ts",
    pattern: /export const HASH_HEX_CHARS = 16;/,
    replace: "export const HASH_HEX_CHARS = 12;",
  },
  {
    name: "overlap hashes the slug before the salt, so the two sides still agree and the salt does nothing",
    file: "lib/tools/overlap/hash.ts",
    pattern: /buffer\.set\(salt, 0\);/,
    replace: "buffer.set(salt, text.length);",
  },
  {
    name: "overlap lets a bloom step re-sign, so half of all hashes walk off the front of the filter",
    file: "lib/tools/overlap/bloom.ts",
    pattern: /const h2 = \(\(Number\.parseInt\(hash\.slice\(8, 16\), 16\) >>> 0\) \| 1\) >>> 0;/,
    replace: "const h2 = (Number.parseInt(hash.slice(8, 16), 16) >>> 0) | 1;",
  },
  {
    name: "overlap sizes a filter at 8 bits an entry, ten thousand times its stated rate",
    file: "lib/tools/overlap/bloom.ts",
    pattern: /export const BITS_PER_ENTRY = 29;/,
    replace: "export const BITS_PER_ENTRY = 8;",
  },
  {
    name: "overlap takes the remainder without rejecting, biasing the room code towards 2, 3 and 4",
    file: "lib/tools/overlap/code.ts",
    pattern: /const REJECT_AT = 253;/,
    replace: "const REJECT_AT = 256;",
  },
  {
    name: "overlap measures an SDP in code units, so an astral blob is three times the cap",
    file: "lib/relay.ts",
    pattern: /return encoder\.encode\(value\)\.length <= MAX_SDP_BYTES;/,
    replace: "  return value.length <= MAX_SDP_BYTES;",
  },
  {
    name: "overlap dresses a missing Redis up as a server fault, so nobody is told to use copy and paste",
    file: "app/api/relay/route.ts",
    pattern: /if \(error instanceof StoreUnavailableError\) \{/,
    replace: "if (false) {",
  },
  {
    name: "overlap always sends a filter, so a small list gets false positives for nothing",
    file: "lib/tools/overlap/protocol.ts",
    pattern: /const mode: Mode = mine\.length > threshold \? "bloom" : "exact";/,
    replace: 'const mode: Mode = "bloom";',
  },
  {
    name: "overlap drops a message sent before the far side is listening, which is how a handshake hangs",
    file: "lib/tools/overlap/protocol.ts",
    pattern: /else waiting\[far\]\.push\(text\);/,
    replace: "else return;",
  },
  {
    name: "overlap softens the paragraph that says what a salted hash does not do",
    file: "content/tools/overlap.ts",
    pattern: /not a private set intersection protocol/,
    replace: "a careful way to compare lists",
  },
  {
    name: "overlap address pseudonyms stop using the server secret, so IPv4 can be enumerated offline",
    file: "lib/budget.ts",
    pattern: /createHmac\("sha256", secret\)/,
    replace: 'createHmac("sha256", "public")',
  },
  {
    name: "overlap accepts a missing address-key secret instead of failing closed",
    file: "lib/budget.ts",
    pattern: /if \(!secret \|\| new TextEncoder\(\)\.encode\(secret\)\.byteLength < 32\) \{/,
    replace: "if (false) {",
  },
  {
    name: "overlap relay requests lose their abort signal and can occupy a tab forever",
    file: "lib/tools/overlap/relay-client.ts",
    pattern: /return await fetchImpl\(url, \{ \.\.\.init, signal: controller\.signal \}\);/,
    replace: "return await fetchImpl(url, init);",
  },
  {
    name: "overlap decodes an oversized manual paste before refusing it",
    file: "lib/tools/overlap/webrtc.ts",
    pattern: /if \(text\.length > MAX_PACKED_SDP_CHARS\) \{/,
    replace: "if (false) {",
  },
  {
    name: "overlap hands decoded base64 to WebRTC without proving it is SDP",
    file: "lib/tools/overlap/webrtc.ts",
    pattern: /const sdp = new TextDecoder\(\)\.decode\(bytes\);\r?\n  if \(!validSdp\(sdp\)\)/,
    replace: "const sdp = new TextDecoder().decode(bytes);\n  if (false)",
  },
  {
    name: "overlap lets a peer grow the protocol inbox without a bound",
    file: "lib/tools/overlap/protocol.ts",
    pattern: /if \(inbox\.length >= MAX_INBOX_FRAMES\) \{/,
    replace: "if (false) {",
  },
  {
    name: "overlap calls a live ten-minute room dead when one tab stops polling",
    file: "content/tools/overlap.ts",
    pattern: /The room can still be joined until its ten minutes run out/,
    replace: "The code is dead now",
  },

  // -- relief: twenty-two guards, each with the test that bites on it --
  {
    name: "relief takes the percentile ceiling upwards into the outlier it exists to ignore",
    file: "lib/tools/relief/heightmap.ts",
    pattern: /Math\.floor\(p \* \(occupied\.length - 1\)\)/,
    replace: "Math.ceil(p * (occupied.length - 1))",
  },
  {
    name: "relief scales counts linearly, so every real hour lands under half a percent",
    file: "lib/tools/relief/heightmap.ts",
    pattern: /return Math\.min\(1, Math\.log1p\(count\) \/ Math\.log1p\(Math\.max\(1, ceiling\)\)\);/,
    replace: "  return Math.min(1, count / Math.max(1, ceiling));",
  },
  {
    name: "relief stops wrapping the hour axis, so a ridge across midnight becomes two",
    file: "lib/tools/relief/heightmap.ts",
    pattern: /const u = h\[\(r - 1 \+ rows\) % rows\]\[c\];/,
    replace: "const u = h[Math.max(0, r - 1)][c];",
  },
  {
    name: "relief wraps the week axis, so the first week of the year touches the last",
    file: "lib/tools/relief/heightmap.ts",
    pattern: /const l = row\[Math\.max\(0, c - 1\)\];/,
    replace: "const l = row[(c - 1 + cols) % cols];",
  },
  {
    name: "relief draws contours around a handful of events instead of refusing",
    file: "lib/tools/relief/heightmap.ts",
    pattern: /if \(events\.length < MIN_EVENTS\)/,
    replace: "if (false)",
  },
  {
    name: "relief draws a year piled into a dozen cells instead of refusing",
    file: "lib/tools/relief/heightmap.ts",
    pattern: /if \(cells\.size < MIN_OCCUPIED_CELLS\)/,
    replace: "if (false)",
  },
  {
    name: "relief paints black on black when a theme token is missing, instead of saying so",
    file: "lib/tools/relief/draw.ts",
    pattern: /if \(!value\) throw new ReliefPaletteError\(name\);/,
    replace: "if (!value) return value;",
  },
  {
    name: "relief lifts the skirt off the base, so the STL is no longer a closed solid",
    file: "lib/tools/relief/stl.ts",
    pattern: /const qb: Vec3 = \[b\[0\], b\[1\], 0\];/,
    replace: "const qb: Vec3 = [b[0], b[1], 0.5];",
  },
  {
    name: "relief's origin fence accepts any path it is handed",
    file: "lib/tools/relief/github.ts",
    pattern: /if \(!path\.startsWith\("\/"\) \|\| path\.startsWith\("\/\/"\)\) \{/,
    replace: "if (false) {",
  },
  {
    name: "relief gives up on GitHub's first secondary limit instead of retrying once",
    file: "lib/tools/relief/github.ts",
    pattern: /for \(let attempt = 0; attempt < 2; attempt\+\+\) \{/,
    replace: "for (let attempt = 0; attempt < 1; attempt++) {",
  },
  {
    name: "relief waits another minute on every secondary limit instead of bounding the run",
    file: "lib/tools/relief/github.ts",
    pattern: /if \(attempt === 1 \|\| rateRetryUsed\) throw new ReliefRateLimitError\(\);/,
    replace: "if (attempt === 1) throw new ReliefRateLimitError();",
  },
  {
    name: "relief paces GitHub at its advertised rate instead of the tighter limit measured live",
    file: "lib/tools/relief/github.ts",
    pattern: /export const SEARCH_INTERVAL_MS = 7000;/,
    replace: "export const SEARCH_INTERVAL_MS = 2200;",
  },
  {
    name: "relief anchors a CSV's year on today, so a two-year-old export draws 52 empty weeks",
    file: "lib/tools/relief/csv.ts",
    pattern: /const endMs = Math\.max\(\.\.\.parsed\.map\(\(p\) => p\.at\)\);/,
    replace: "  const endMs = Date.now();",
  },
  {
    name: "relief accepts impossible calendar dates after Date silently normalises them",
    file: "lib/tools/relief/csv.ts",
    pattern: /    date > days\[month - 1\] \|\|/,
    replace: "    false ||",
  },
  {
    name: "relief parses past its CSV row cap without admitting it",
    file: "lib/tools/relief/csv.ts",
    pattern: /      if \(table\.length <= maxRows\) table\.push\(row\);/,
    replace: "      if (true) table.push(row);",
  },
  {
    name: "relief reads an oversized CSV into memory before refusing it",
    file: "lib/tools/relief/csv.ts",
    pattern: /bytes <= MAX_CSV_BYTES/,
    replace: "true",
  },
  {
    name: "relief hides a CSV truncation warning after choosing the date column",
    file: "app/tools/relief/ReliefTool.tsx",
    pattern: /readColumn\(parsed\.rows, guess, parsed\.capped\);/,
    replace: "readColumn(parsed.rows, guess, false);",
  },
  {
    name: "relief leaves a token-bearing GitHub request alive after its route unmounts",
    file: "app/tools/relief/ReliefTool.tsx",
    pattern: /useEffect\(\(\) => \(\) => runRef\.current\?\.abort\(\), \[\]\);/,
    replace: "useEffect(() => undefined, []);",
  },
  {
    name: "relief swallows an export failure instead of putting it in the status line",
    file: "app/tools/relief/ReliefTool.tsx",
    pattern: /      setNote\(reliefCopy\.errors\.export\);/,
    replace: "      return;",
  },
  {
    name: "relief keeps a saturated GitHub window broad and silently loses results after 1000",
    file: "lib/tools/relief/github.ts",
    pattern: /    if \(split && saturated\) \{/,
    replace: "    if (false) {",
  },
  {
    name: "relief reports a full tenth GitHub page as a complete window",
    file: "lib/tools/relief/github.ts",
    pattern: /      if \(page === MAX_PAGES_PER_WINDOW\) truncated = true;/,
    replace: "      if (page === MAX_PAGES_PER_WINDOW) truncated = false;",
  },
  {
    name: "relief fixes every ambiguous contour saddle to one diagonal",
    file: "lib/tools/relief/contour.ts",
    pattern: /const topologyA = saddle > 0 \|\| \(saddle === 0 && k === 10\);/,
    replace: "const topologyA = k === 10;",
  },
  // -- relief's ridgeline and instrument (2026-09-27), each with the file that bites --
  {
    name: "relief draws every ridge whole, so hidden lines show through the hills in front",
    file: "lib/tools/relief/ridgeline.ts",
    pattern: /const shown = m\.r < m\.h;/,
    replace: "const shown = true;",
    tests: "lib/tools/relief/ridgeline.test.ts",
  },
  {
    name: "relief runs each visible stretch on to the next hidden sample, so ridges poke through the hills in front",
    file: "lib/tools/relief/ridgeline.ts",
    pattern: /          run\.push\(cross\);/,
    replace: "          run.push({ x: m.x, y: m.r });",
    tests: "lib/tools/relief/ridgeline.test.ts",
  },
  {
    name: "relief clips against the chord between samples instead of the true horizon, and hides what it should draw",
    file: "lib/tools/relief/ridgeline.ts",
    pattern: /    next\.push\(\{ x: m\.x, y: Math\.min\(m\.r, m\.h\) \}\);/,
    replace: "    if (m.sample) next.push({ x: m.x, y: Math.min(m.r, m.h) });",
    tests: "lib/tools/relief/ridgeline.test.ts",
  },
  {
    name: "relief reads each ridge an hour out, so a peak lands on the wrong hour",
    file: "lib/tools/relief/ridgeline.ts",
    pattern: /const p1 = at\(i\);/,
    replace: "const p1 = at(i + 1);",
    tests: "lib/tools/relief/ridgeline.test.ts",
  },
  {
    name: "relief's crosshair picks the week hidden behind a peak instead of the one in view",
    file: "lib/tools/relief/ridgeline.ts",
    pattern: /for \(let i = ridges\.length - 1; i >= 0; i--\) \{/,
    replace: "for (let i = 0; i < ridges.length; i++) {",
    tests: "lib/tools/relief/ridgeline.test.ts",
  },
  {
    name: "relief's crosshair reads the smoothed height instead of the raw count",
    file: "app/tools/relief/ReliefTool.tsx",
    pattern: /readCount\(heightmap\.counts, at\.week, at\.hour\)/,
    replace: "readCount(heightmap.field, at.week, at.hour)",
    tests: "app/tools/relief/ReliefTool.test.ts",
  },
  {
    name: "relief's ridgeline SVG writes the hidden lines a pen would draw through the hills",
    file: "lib/tools/relief/svg.ts",
    pattern: /const paths = ridge\.visible\r?\n/,
    replace: "const paths = [ridge.points]\n",
    tests: "lib/tools/relief/svg.test.ts",
  },
  {
    name: "relief fades its far weeks until they fail contrast",
    file: "lib/tools/relief/draw.ts",
    pattern: /const FAR_ALPHA = 0\.55;/,
    replace: "const FAR_ALPHA = 0.15;",
    tests: "lib/tools/relief/draw.test.ts",
  },
  {
    name: "relief draws its ridges in under reduced motion",
    file: "app/tools/relief/ReliefTool.tsx",
    pattern: /if \(!fresh \|\| reducedMotion \|\| document\.visibilityState !== "visible"\) \{/,
    replace: 'if (!fresh || document.visibilityState !== "visible") {',
    tests: "app/tools/relief/ReliefTool.test.ts",
  },
  {
    name: "relief's draw-in subscribes to the frame clock while the terrain is off screen",
    file: "app/tools/relief/ReliefTool.tsx",
    pattern: /if \(stop \|\| !entries\.some\(\(entry\) => entry\.isIntersecting\)\) return;/,
    replace: "if (stop) return;",
    tests: "app/tools/relief/ReliefTool.test.ts",
  },
  {
    name: "relief puts a sentence back above the terrain",
    file: "app/tools/relief/ReliefTool.tsx",
    pattern: /<div className="relief__screen">/,
    replace: '<p className="relief__hint">{reliefCopy.githubHelp}</p>\n      <div className="relief__screen">',
    tests: "app/tools/relief/ReliefTool.test.ts",
  },
  {
    name: "relief stops saying the demo is generated",
    file: "app/tools/relief/ReliefTool.tsx",
    pattern: /\{plateSource === "demo" \? <span className="relief__caption">\{reliefCopy\.demoCaption\}<\/span> : null\}/,
    replace: "{null}",
    tests: "app/tools/relief/ReliefTool.test.ts",
  },
  {
    name: "relief smooths the ridgeline like the contour ground, so fifty-two weeks blur into one line",
    file: "lib/tools/relief/heightmap.ts",
    pattern: /profile: ridgeProfile\(normalised\),/,
    replace: "profile: field,",
    tests: "lib/tools/relief/heightmap.test.ts",
  },
  {
    name: "relief stops smoothing the ridgeline across weeks, so every week's noise tangles with the next",
    file: "lib/tools/relief/heightmap.ts",
    pattern: /export const WEEK_PASSES = 1;/,
    replace: "export const WEEK_PASSES = 0;",
    tests: "lib/tools/relief/heightmap.test.ts lib/tools/relief/ridgeline.test.ts",
  },
  {
    name: "relief smooths the ridgeline's day only once, so each ridge is a comb of noise",
    file: "lib/tools/relief/heightmap.ts",
    pattern: /export const DAY_PASSES = 2;/,
    replace: "export const DAY_PASSES = 1;",
    tests: "lib/tools/relief/heightmap.test.ts lib/tools/relief/ridgeline.test.ts",
  },
  {
    name: "relief stands its ridges on the week-smoothed contour ground instead of each week's own day",
    file: "app/tools/relief/ReliefTool.tsx",
    pattern: /ridgelines\(heightmap\.profile, ridgeBox\)/,
    replace: "ridgelines(heightmap.field, ridgeBox)",
    tests: "app/tools/relief/ReliefTool.test.ts",
  },
  {
    name: "relief labels its plate in the root's default serif",
    file: "app/tools/relief/ReliefTool.tsx",
    pattern: /const face = window\.getComputedStyle\(canvas\)\.fontFamily;/,
    replace: "const face = style.fontFamily;",
    tests: "app/tools/relief/ReliefTool.test.ts",
  },
  {
    name: "relief crops the midnight label on a phone",
    file: "lib/tools/relief/ridgeline.ts",
    pattern: /Math\.max\(10, Math\.round\(width \* 0\.02\)\)/,
    replace: "Math.max(6, Math.round(width * 0.02))",
    tests: "lib/tools/relief/ridgeline.test.ts",
  },
  {
    name: "relief's terrain traps a phone's scroll instead of letting a vertical swipe through",
    file: "app/tools/relief/tool.css",
    pattern: /touch-action: pan-y;/,
    replace: "touch-action: none;",
    tests: "app/tools/relief/ReliefTool.test.ts",
  },
  // -- resonance's hardware face (2026-09-27), each with the file that bites --
  {
    name: "resonance's clock looks a fixed 90ms ahead, so a starved tab drops notes",
    file: "lib/studio/sequencer.ts",
    pattern: /return Math\.min\(MAX_AHEAD, Math\.max\(MIN_AHEAD, frameGap \* 1\.5\)\);/,
    replace: "return 0.09;",
    tests: "lib/studio/sequencer.test.ts",
  },
  {
    name: "resonance's clock fires a burst of stale notes after a stall",
    file: "lib/studio/sequencer.ts",
    pattern: /let next = clock\.next < now - LATE \? now \+ RESTART : clock\.next;/,
    replace: "let next = clock.next;",
    tests: "lib/studio/sequencer.test.ts",
  },
  {
    name: "resonance's playhead lights the column scheduled ahead, not the one sounding",
    file: "lib/studio/sequencer.ts",
    pattern: /if \(entry\.time <= now && \(!current \|\| entry\.time >= current\.time\)\) current = entry;/,
    replace: "if (!current || entry.time >= current.time) current = entry;",
    tests: "lib/studio/sequencer.test.ts",
  },
  {
    name: "resonance's live swing leans the other way from the WAV's",
    file: "lib/studio/sequencer.ts",
    pattern: /\(step % 2 \? 1 - swing : 1 \+ swing\)/,
    replace: "(step % 2 ? 1 + swing : 1 - swing)",
    tests: "lib/studio/sequencer.test.ts",
  },
  {
    name: "resonance fires a muted voice",
    file: "lib/studio/sequencer.ts",
    pattern: /if \(voices\[i\]\.steps\[column\] && audible\(voices as Voice\[\], i\)\) out\.push\(i\);/,
    replace: "if (voices[i].steps[column]) out.push(i);",
    tests: "lib/studio/sequencer.test.ts",
  },
  {
    name: "resonance's scope triggers on a falling edge",
    file: "lib/studio/scope.ts",
    pattern: /if \(samples\[i - 1\] < 0 && samples\[i\] >= 0\) return i;/,
    replace: "if (samples[i - 1] > 0 && samples[i] <= 0) return i;",
    tests: "lib/studio/scope.test.ts",
  },
  {
    name: "resonance's scope draws a clipped signal off the glass",
    file: "lib/studio/scope.ts",
    pattern: /const s = raw > 1 \? 1 : raw < -1 \? -1 : raw;/,
    replace: "const s = raw;",
    tests: "lib/studio/scope.test.ts",
  },
  {
    name: "resonance's scope draws a positive sample below the line",
    file: "lib/studio/scope.ts",
    pattern: /points\[x \* 2 \+ 1\] = mid - s \* reach;/,
    replace: "points[x * 2 + 1] = mid + s * reach;",
    tests: "lib/studio/scope.test.ts",
  },
  {
    name: "resonance's scope magnifies hiss without limit",
    file: "lib/studio/scope.ts",
    pattern: /return FILL \/ Math\.max\(level, GAIN_FLOOR\);/,
    replace: "return FILL / Math.max(level, 1e-6);",
    tests: "lib/studio/scope.test.ts",
  },
  {
    name: "resonance's scope listens beside the speakers instead of in line",
    file: "lib/studio/audio.ts",
    pattern: /limiter\.connect\(scope\);\r?\n  scope\.connect\(context\.destination\);/,
    replace: "limiter.connect(context.destination);\n  limiter.connect(scope);",
    tests: "lib/studio/audio.test.ts",
  },
  {
    name: "resonance's pad runs echo top to bottom",
    file: "lib/studio/pad.ts",
    pattern: /delay: Number\(\(\(1 - unit\(y\)\) \* ECHO_MAX\)\.toFixed\(3\)\),/,
    replace: "delay: Number((unit(y) * ECHO_MAX).toFixed(3)),",
    tests: "lib/studio/pad.test.ts",
  },
  {
    name: "resonance's pad spends brightness linearly, so most of it is one bright corner",
    file: "lib/studio/pad.ts",
    pattern: /cutoff: Math\.round\(CUTOFF\.min \* \(CUTOFF\.max \/ CUTOFF\.min\) \*\* unit\(x\)\),/,
    replace: "cutoff: Math.round(CUTOFF.min + (CUTOFF.max - CUTOFF.min) * unit(x)),",
    tests: "lib/studio/pad.test.ts",
  },
  {
    name: "resonance's pad trail never forgets a point",
    file: "lib/studio/pad.ts",
    pattern: /return trail\.filter\(\(p\) => now - p\.t < life\);/,
    replace: "return [...trail];",
    tests: "lib/studio/pad.test.ts",
  },
  {
    name: "resonance's Note knob turns chromatically and snaps an arrow press back",
    file: "lib/studio/knobs.ts",
    pattern: /for \(let n = LOWEST; n <= HIGHEST; n\+\+\) if \(quantise\(n, root, scale\) === n\) out\.push\(n\);/,
    replace: "for (let n = LOWEST; n <= HIGHEST; n++) out.push(n);",
    tests: "lib/studio/knobs.test.ts",
  },
  {
    name: "resonance's Key knob leaves the voices off the new key",
    file: "lib/studio/knobs.ts",
    pattern: /voices: patch\.voices\.map\(\(v\) => \(\{ \.\.\.v, note: quantise\(v\.note, root, scale\) \}\)\) \};/,
    replace: "voices: patch.voices };",
    tests: "lib/studio/knobs.test.ts",
  },
  {
    name: "resonance keeps playing in a hidden tab",
    file: "components/studio/Resonance.tsx",
    pattern: /if \(document\.hidden\) stop\(\);/,
    replace: "if (document.hidden) void 0;",
    tests: "components/studio/Resonance.test.ts",
  },
  {
    name: "resonance starts sound from a knob turn",
    file: "components/studio/Resonance.tsx",
    pattern: /    const live = engine\.current;\r?\n    if \(live\) \{/,
    replace: "    const live = await ready();\n    if (live) {",
    tests: "components/studio/Resonance.test.ts",
  },
  {
    name: "resonance subscribes to the frame clock at rest",
    file: "components/studio/Resonance.tsx",
    pattern: /    if \(!playing\) return;\r?\n    const canvas = scopeRef\.current;/,
    replace: "    const canvas = scopeRef.current;",
    tests: "components/studio/Resonance.test.ts",
  },
  {
    name: "resonance draws the scope and playhead while the face is off screen",
    file: "components/studio/Resonance.tsx",
    pattern: /if \(!seen\.current\) return;/,
    replace: "void seen;",
    tests: "components/studio/Resonance.test.ts",
  },
  {
    name: "resonance sweeps the playhead under reduced motion",
    file: "components/studio/Resonance.tsx",
    pattern: /const position = reducedMotion \? head\.column : head\.column \+ head\.phase;/,
    replace: "const position = head.column + head.phase;",
    tests: "components/studio/Resonance.test.ts",
  },
  {
    name: "resonance animates the scope under reduced motion",
    file: "components/studio/Resonance.tsx",
    pattern: /if \(!reducedMotion\) drawTrace\(e, ink\);/,
    replace: "drawTrace(e, ink);",
    tests: "components/studio/Resonance.test.ts",
  },
  {
    name: "resonance leaves the glass and the lamps lit after stop",
    file: "components/studio/Resonance.tsx",
    pattern: /    setPlaying\(false\);\r?\n    darken\(\);/,
    replace: "    setPlaying(false);",
    tests: "components/studio/Resonance.test.ts",
  },
  {
    name: "resonance keeps the pad's trail on the frame clock after it has faded",
    file: "components/studio/Resonance.tsx",
    pattern: /      if \(!live\.length\) \{\r?\n        offTrail\.current\?\.\(\);\r?\n        offTrail\.current = null;/,
    replace: "      if (!live.length) {",
    tests: "components/studio/Resonance.test.ts",
  },
  {
    name: "resonance puts a sentence back above the instrument",
    file: "components/studio/Resonance.tsx",
    pattern: /<div className="reso__face" data-playing=\{playing \|\| undefined\}>/,
    replace: '<div className="reso__face" data-playing={playing || undefined}>\n        <p className="reso__hint">{c.play}</p>',
    tests: "components/studio/Resonance.test.ts",
  },
  {
    name: "resonance puts the pendulum instructions back in its words",
    file: "content/studio/music-copy.ts",
    pattern: /  preset: "Sound worlds",/,
    replace: '  stageHelp: "Tap a pendulum to pluck it.",\n  preset: "Sound worlds",',
    tests: "components/studio/Resonance.test.ts",
  },
  {
    name: "resonance stops saying the WAV carries the release tail",
    file: "content/studio/music-copy.ts",
    pattern: /wavNote: "The WAV is eight bars plus the release tail\.",/,
    replace: 'wavNote: "The WAV is eight bars.",',
    tests: "components/studio/Resonance.test.ts",
  },
  {
    name: "resonance's lamps fade under reduced motion too",
    file: "app/tools/resonance/tool.css",
    pattern: /@media \(prefers-reduced-motion: no-preference\) \{/,
    replace: "@media all {",
    tests: "components/studio/Resonance.test.ts",
  },
  // ── the tools instrument redesign (2026-09-27) ──
  {
    // Moved with the Atlas rebuild (2026-09-27): the inspector's heading is
    // now its own component's, and the old `<h3>{node.label}</h3>` is gone.
    name: "tools: an eyebrow comes back into a studio",
    file: "components/studio/AtlasInspector.tsx",
    pattern: /<h2 className="atlas-inspector__title">\{view\.label\}<\/h2>/,
    replace: '<p className="studio-eyebrow">FILE / INSPECTOR</p>\n        <h2 className="atlas-inspector__title">{view.label}</h2>',
    tests: "components/studio/eyebrow.test.ts",
  },
  {
    name: "tools: the shell puts a second lede back between the heading and the stage",
    file: "components/tools/ToolPage.tsx",
    pattern: /<div className="bench-stage">\{children\}<\/div>/,
    replace: '<p className="tool__intro">{tool.blurb}</p>\n      <div className="bench-stage">{children}</div>',
    tests: "components/tools/ToolPage.test.ts",
  },
  {
    name: "tools: a kit knob is rebuilt as a div with a slider role",
    file: "components/instrument/Knob.tsx",
    pattern: /<input\r?\n(\s+)ref=\{inputRef\}\r?\n(\s+)id=\{id\}\r?\n(\s+)className="inst-knob__input"\r?\n(\s+)type="range"/,
    replace: '<div\n$1ref={inputRef}\n$2id={id}\n$3className="inst-knob__input"\n$4role="slider"',
    tests: "components/instrument/instrument.test.ts",
  },
  {
    name: "tools: a kit segmented control drops its native radios for divs",
    file: "components/instrument/Segmented.tsx",
    pattern: /type="radio"/,
    replace: 'role="radio"',
    tests: "components/instrument/instrument.test.ts",
  },
  {
    name: "tools: the drop slot hands a refused file to the tool anyway",
    file: "components/instrument/DropSlot.tsx",
    pattern: /if \(screened\.accepted\.length\) now\.onFiles\(screened\.accepted\);/,
    replace: "now.onFiles(files);",
    tests: "components/instrument/instrument.test.ts",
  },
  {
    name: "tools: the index previews keep animating off screen",
    file: "components/tools/ToolPreview.tsx",
    pattern: /if \(!visibleRef\.current\) return;/,
    replace: ";",
    tests: "components/tools/ToolPreview.test.ts",
  },
  {
    name: "tools: the kit select lets a long option label widen a WebKit page again",
    file: "components/instrument/instrument.css",
    pattern: /  font-size: 16px;\r?\n  overflow: hidden;\r?\n  text-overflow: ellipsis;/,
    replace: "  font-size: 16px;\n  text-overflow: ellipsis;",
    tests: "components/instrument/instrument.test.ts",
  },
  {
    name: "tools: Second Visit offers downloads from the server's rowless example",
    file: "app/tools/second-visit/SecondVisitTool.tsx",
    pattern: /disabled: busy \|\| !full,/,
    replace: "disabled: busy,",
    tests: "app/tools/second-visit/SecondVisitTool.test.ts",
  },
  {
    name: "tools: the index previews ignore reduced motion",
    file: "components/tools/ToolPreview.tsx",
    pattern: /    if \(reducedMotion\) return;\r?\n/,
    replace: "",
    tests: "components/tools/ToolPreview.test.ts",
  },
  // ── Pocket Redact: the document stage, the burn and the proof (2026-09-27) ──
  {
    name: "pocket redact: the verify pass passes a page without reading under its masks",
    file: "lib/studio/redact-verify.ts",
    pattern: /ok: textAfter === 0 && read\.every\(\(m\) => m\.solid\),/,
    replace: "ok: textAfter === 0,",
    tests: "lib/studio/redact-verify.test.ts",
  },
  {
    name: "pocket redact: the verify pass reads masks where they were drawn, not where the reopened render put them",
    file: "lib/studio/redact-verify.ts",
    pattern: /const sx = pixels\.width \/ source\.width,\r?\n\s+sy = pixels\.height \/ source\.height;/,
    replace: "const sx = 1,\n    sy = 1;",
    tests: "lib/studio/redact-verify.test.ts",
  },
  {
    name: "pocket redact: dark grey ink counts as a burned mask",
    file: "lib/studio/redact-verify.ts",
    pattern: /export const INK_MAX = 16;/,
    replace: "export const INK_MAX = 96;",
    tests: "lib/studio/redact-verify.test.ts",
  },
  {
    name: "pocket redact: the download gate forgets that every page must be inspected",
    file: "lib/studio/redact-verify.ts",
    pattern: /return seen\.size === verdicts\.length && verdicts\.every\(\(v\) => v\.ok\);/,
    replace: "return verdicts.every((v) => v.ok);",
    tests: "lib/studio/redact-verify.test.ts",
  },
  {
    name: "pocket redact: the download button skips the gate",
    file: "components/studio/PocketRedact.tsx",
    pattern: /disabled: !canDownload\(proof\.verdicts, reviewed\) \|\| busy,/,
    replace: "disabled: busy,",
    tests: "components/studio/PocketRedact.test.ts",
  },
  {
    name: "pocket redact: the proof checks the pages it drew instead of the reopened file",
    file: "components/studio/PocketRedact.tsx",
    pattern: /pixels: await readPixels\(reopened\[i\]\),/,
    replace: "pixels: await readPixels(source[i]),",
    tests: "components/studio/PocketRedact.test.ts",
  },
  {
    name: "pocket redact: the proof never looks for text left in the output",
    file: "components/studio/PocketRedact.tsx",
    pattern: /textAfter: reopened\[i\]\.text\.length,/,
    replace: "textAfter: 0,",
    tests: "components/studio/PocketRedact.test.ts",
  },
  {
    name: "pocket redact: the scan sweeps under reduced motion",
    file: "components/studio/PocketRedact.tsx",
    pattern: /if \(reducedMotion \|\| document\.visibilityState !== "visible"\) \{/,
    replace: 'if (document.visibilityState !== "visible") {',
    tests: "components/studio/PocketRedact.test.ts",
  },
  {
    name: "pocket redact: the palette renders before hydration can answer it",
    file: "components/studio/PocketRedact.tsx",
    pattern: /\{ready && <Palette/,
    replace: "{true && <Palette",
    tests: "components/studio/PocketRedact.test.ts",
  },
  {
    name: "pocket redact: the example opens with nothing covered",
    file: "components/studio/PocketRedact.tsx",
    pattern: /present: \[\[exampleMask\(SHEET\)\]\],/,
    replace: "present: [[]],",
    tests: "components/studio/PocketRedact.test.ts",
  },
  {
    name: "pocket redact: the page goes back behind the studio host's loading line",
    file: "app/tools/pocket-redact/page.tsx",
    pattern: /<PocketRedact \/>/,
    replace: '<Studio slug="pocket-redact" />',
    tests: "components/studio/PocketRedact.test.ts",
  },
  {
    name: "pocket redact: the flare outlasts the hold, so the proof cuts it off",
    file: "app/tools/pocket-redact/tool.css",
    pattern: /animation: redact-burn 900ms linear both;/,
    replace: "animation: redact-burn 1400ms linear both;",
    tests: "components/studio/PocketRedact.test.ts",
  },
  {
    name: "pocket redact: the find modes stop shrinking and push a 320px phone sideways",
    file: "app/tools/pocket-redact/tool.css",
    pattern: /\.redact__modes \{\r?\n  flex: 0 1 auto;/,
    replace: ".redact__modes {\n  flex: none;",
    tests: "components/studio/PocketRedact.test.ts",
  },
  {
    name: "pocket redact: a mask a visitor already drew stays lit as a candidate",
    file: "lib/studio/redaction.ts",
    pattern: /return boxes\.filter\(\r?\n(\s+)\(b\) =>\r?\n(\s+)!masks\.some\(/,
    replace: "return boxes;\n  boxes.filter(\n$1(b) =>\n$2!masks.some(",
    tests: "lib/studio/redaction.test.ts",
  },
  {
    name: "pocket redact: the keyboard takes the browser's own Ctrl shortcuts",
    file: "lib/studio/redact-keys.ts",
    pattern: /    if \(k === "y" && !e\.shiftKey\) return \{ kind: "redo" \};\r?\n    return null;/,
    replace: '    if (k === "y" && !e.shiftKey) return { kind: "redo" };',
    tests: "lib/studio/redact-keys.test.ts",
  },
  {
    name: "pocket redact: the arrows move a mask when none is selected",
    file: "lib/studio/redact-keys.ts",
    pattern: /  if \(!selected\) return null;/,
    replace: "",
    tests: "lib/studio/redact-keys.test.ts",
  },
  {
    name: "pocket redact: the example's burned text loses the width its lit boxes assume",
    file: "lib/studio/redact-example.ts",
    pattern: /ctx\.scale\(run\.width \/ natural, 1\);/,
    replace: "ctx.scale(1, 1);",
    tests: "lib/studio/redact-example.test.ts",
  },
  {
    name: "pocket redact: the opening mask swallows the email's label",
    file: "lib/studio/redact-example.ts",
    pattern: /x = Math\.floor\(start - 4\);/,
    replace: "x = Math.floor(line.x - 4);",
    tests: "lib/studio/redact-example.test.ts",
  },
  // ── Atlas, the map as the stage (2026-09-27) ──
  ...[
    [
      "atlas: a sentence comes back above the map",
      "components/studio/Atlas.tsx",
      /(\n\s*)<GraphCanvas\r?\n/,
      '$1<p className="atlas-lead">{line}</p>$1<GraphCanvas\n',
    ],
    [
      "atlas: the stage stops saying the example is the example",
      "components/studio/Atlas.tsx",
      /: isExample \? copy\.exampleSummary\(summary\) : copy\.summary\(summary\)/,
      ": copy.summary(summary)",
    ],
    [
      "atlas: the file list is back in the flow, open",
      "components/studio/Atlas.tsx",
      /<details className="atlas-list">/,
      '<details className="atlas-list" open>',
    ],
    [
      "atlas: media gets the browser's own controls back",
      "components/studio/AtlasInspector.tsx",
      /<audio \{\.\.\.events\} \/>/,
      "<audio controls {...events} />",
    ],
    [
      "atlas: the inspector's own scroll is eaten by the page's smooth scroll",
      "components/studio/AtlasInspector.tsx",
      /\s*data-lenis-prevent=""\r?\n(\s*)onKeyDown/,
      "\n$1onKeyDown",
    ],
    [
      "atlas: the server draws a different framing from the canvas, so the hand-over jumps",
      "components/studio/AtlasPoster.tsx",
      /viewBox=\{viewBoxFor\(bounds, WORLD_PAD\)\}/,
      "viewBox={viewBoxFor(bounds, 0)}",
    ],
    [
      "atlas: the server's picture answers to .studio, so a check counts the canvas before it exists",
      "components/studio/AtlasPoster.tsx",
      /<div className="atlas atlas--poster">/,
      '<div className="studio atlas atlas--poster">',
    ],
    [
      "atlas: the map is laid out square again and fills neither a laptop's stage nor a phone's",
      "lib/studio/atlas-scene.ts",
      /\{ wide: \{ x: 0\.022, y: 0\.1 \}, tall: \{ x: 0\.1, y: 0\.022 \} \}/,
      "{ wide: { x: 0.05, y: 0.05 }, tall: { x: 0.05, y: 0.05 } }",
    ],
    [
      "atlas: the map paints nothing until the observer has seen it (the blank phone photograph)",
      "components/studio/GraphCanvas.tsx",
      /if \(live\.current\) dirty\.current = true;\r?\n(\s*)else paint\(\);/,
      "dirty.current = true;",
    ],
    [
      "atlas: an eased camera move drags the beam across the map as a streak",
      "components/studio/GraphCanvas.tsx",
      /if \(hop\.current\) hop\.current\.last = null;/,
      ";",
    ],
    [
      "atlas: the beam walks under reduced motion",
      "components/studio/GraphCanvas.tsx",
      /if \(reducedMotion \|\| !el\) return;/,
      "if (!el) return;",
    ],
    [
      "atlas: the wheel is taken whether or not the map was chosen, so a scroll gets stuck in it",
      "components/studio/GraphCanvas.tsx",
      /if \(!\(e\.ctrlKey \|\| engagedRef\.current\)\) return;/,
      "if (false) return;",
    ],
    [
      "atlas: the bleed parts from the stage's padding",
      "app/tools/atlas/tool.css",
      /--atlas-bleed: clamp\(14px, 2\.4vw, 26px\);/,
      "--atlas-bleed: 20px;",
    ],
    [
      "atlas: find needs any term rather than every term",
      "lib/studio/atlas-view.ts",
      /else if \(terms\.every\(\(t\) => both\.includes\(t\)\)\)/,
      "else if (terms.some((t) => both.includes(t)))",
    ],
    [
      "atlas: the reading line counts a file's folder as a connection",
      "lib/studio/atlas-view.ts",
      /: l\.kind !== "folder"\),/,
      ": true),",
    ],
    [
      "atlas: the phosphor decays per frame, so a starved tab smears for seconds",
      "lib/studio/atlas-scene.ts",
      /return 0\.5 \*\* \(elapsedMs \/ halfLifeMs\);/,
      "return 0.5 ** (16.667 / halfLifeMs);",
    ],
    [
      "atlas: the phosphor is not halved on a coarse pointer",
      "lib/studio/atlas-scene.ts",
      /\(coarse \? HALF_LIFE_MS \/ 2 : HALF_LIFE_MS\)/,
      "HALF_LIFE_MS",
    ],
    [
      "atlas: a missing theme token paints black on black instead of refusing",
      "lib/studio/atlas-scene.ts",
      /if \(!value\) throw new AtlasPaletteError\(token\);/,
      "if (false) throw new AtlasPaletteError(token);",
    ],
  ].map(([name, file, pattern, replace]) => ({
    name,
    file,
    pattern,
    replace,
    tests: file.startsWith("lib/") ? file.replace(/\.ts$/, ".test.ts") : "components/studio/Atlas.test.ts",
  })),
  // ── Group Lore: the week is the stage (2026-09-28) ──
  // The browser halves (the week lit and whole on a WebKit phone, a tap that
  // reads before it opens, a date order that holds) are in
  // scripts/studio-boundaries/group-lore.mjs and scripts/studio-check/group-lore.mjs.
  ...[
    ["one message in a busy chat glows at 2% and reads as an empty hour", /export const HEAT_FLOOR = 0\.2;/, "export const HEAT_FLOOR = 0.02;"],
    ["the heat rises linearly, so the quiet hours merge", /\(1 - HEAT_FLOOR\) \* Math\.sqrt\(n \/ max\);/, "(1 - HEAT_FLOOR) * (n / max);"],
    ["the timeline lights every bar whatever the stretch", /lit: last >= from && first <= to/, "lit: true"],
    ["focusing a voice drops everyone else from the voices", /const voices = person \? analyseChat\(stretch\)\.participants : stats\.participants;/, "const voices = stats.participants;"],
    ["a WhatsApp file that only reads forwards day first is still called ambiguous", /  if \(mdyBroken && !dmyBroken\) return \{ order: "dmy", certain: true \};\r?\n/, ""],
    ["the arrow keys stop turning with the week on a phone", /return transposed \? days\(1\) : hours\(1\);/, "return hours(1);"],
    ["an iPhone export's opening bracket is taken for JSON again", /const looksLikeJson = \(text: string\) => \/\^\\s\*\(\\\{\|\\\[\\s\*\[\{\\\]\]\)\/\.test\(text\);/, "const looksLikeJson = (text: string) => /^\\s*[{[]/.test(text);"],
  ].map(([name, pattern, replace]) => ({
    name: `group lore: ${name}`, file: "lib/studio/lore.ts", pattern, replace,
    tests: "lib/studio/lore-view.test.ts",
  })),
  {
    name: "group lore: the anonymous summary names its voices",
    file: "lib/studio/lore.ts",
    pattern: /name: `Voice \$\{i \+ 1\}`,/,
    replace: "name: p.name,",
    tests: "lib/studio/lore.test.ts",
  },
  {
    name: "group lore: the example writes into a spring-forward gap, so the server and a browser draw different weeks",
    file: "lib/studio/lore-example.ts",
    pattern: /  return \(month === 2 \|\| month === 3\) && weekday >= 4 && hour < 4;/,
    replace: "  return false;",
    tests: "lib/studio/lore-example.test.ts",
  },
  ...[
    ["the page opens empty instead of on the example", "components/studio/GroupLore.tsx", /useState<Chat>\(\(\) => readChat\(exampleChat\(\)\)\)/, 'useState<Chat>(() => readChat(""))'],
    ["a line of figures goes above the week", "components/studio/GroupLore.tsx", /      <div className="lore__screen">/, '      <p className="lore__figures">{c.counts}</p>\n      <div className="lore__screen">'],
    ["pseudonyms are ranked on the stretch, so a label changes hands", "components/studio/GroupLore.tsx", /pseudonymsOf\(messages\)/, "pseudonymsOf(view.stretch)"],
    ["the downloads describe the whole export, not the week on screen", "components/studio/GroupLore.tsx", /anonymousSummary\(view\.focus\)/, "anonymousSummary(messages)"],
    ["the date order is asked even when the file settles it", "components/studio/GroupLore.tsx", /\{!certain && \(/, "{true && ("],
    ["a chosen date order snaps back until the worker answers", "components/studio/GroupLore.tsx", /value=\{asked \?\? chat\.order\}/, "value={chat.order}"],
    ["the stage stops taking a drop", "components/studio/GroupLore.tsx", / \{\.\.\.intake\.stageProps\}/, ""],
    ["a stale read replaces the chat chosen after it", "components/studio/GroupLore.tsx", /      if \(token !== generation\.current\) return;\r?\n      setBusy\(false\);\r?\n      if \("error" in e\.data\)/, '      setBusy(false);\n      if ("error" in e.data)'],
    ["a finger's first tap opens the messages and scrolls the week away", "components/studio/lore/Week.tsx", /if \(cell && \(!touch \|\| again\)\) onPick\(cell\);/, "if (cell) onPick(cell);"],
    ["the privacy line leaves the messages", "components/studio/lore/Explorer.tsx", /<p className="lore__note">\{words\.privacy\}<\/p>/, ""],
    ["the page goes back behind the studio host's loading line", "app/tools/group-lore/page.tsx", /<GroupLore \/>/, '<Studio slug="group-lore" />'],
    ["the week keeps its hours across on a phone", "app/tools/group-lore/tool.css", /(\.lore__cells \{\r?\n    grid-template-columns: repeat\(7, minmax\(0, 1fr\)\);\r?\n    grid-template-rows: repeat\(24, 10px\);\r?\n)    grid-auto-flow: column;\r?\n/, "$1"],
    ["the cells fade under reduced motion", "app/tools/group-lore/tool.css", /(\.lore__cell \{\r?\n  display: block;)/, "$1\n  transition: background-color 420ms ease-out;"],
    ["the heat is painted in a colour of its own, not the theme's", "app/tools/group-lore/tool.css", /var\(--green\) calc\(var\(--heat\) \* 100%\)/, "#33ff66 calc(var(--heat) * 100%)"],
  ].map(([name, file, pattern, replace]) => ({
    name: `group lore: ${name}`, file, pattern, replace,
    tests: "components/studio/GroupLore.test.ts",
  })),
  // ── the room inside the tube (2026-09-05 overhaul) ──
  {
    name: "the arcade room loses data-lenis-prevent, so a stopped Lenis eats every wheel event",
    file: "components/arcade/ArcadeExperience.tsx",
    pattern: /data-lenis-prevent=""/,
    replace: 'data-lenis-prevent-removed=""',
    tests: "components/arcade/arcade.test.ts",
  },
  {
    name: "the arcade room rises above the glass and stops being part of the machine",
    file: "components/arcade/arcade.css",
    pattern: /z-index: 8990;/,
    replace: "z-index: 10000;",
    tests: "components/arcade/arcade.test.ts",
  },
  {
    name: "the attract screens keep simulating off screen and in a hidden tab",
    file: "components/arcade/AttractScreen.tsx",
    pattern: /if \(!visibleRef\.current \|\| !liveRef\.current\) return;/,
    replace: ";",
    tests: "components/arcade/arcade.test.ts",
  },
  {
    name: "the entrance never powers the tube down, so the power-cycle is a fade",
    file: "components/arcade/ArcadeEntrance.tsx",
    pattern: /frame\.current\.bootTarget = 0;/,
    replace: "frame.current.bootTarget = 1;",
    tests: "components/arcade/arcade.test.ts",
  },
  {
    name: "the renderer paints a colour of its own instead of the theme",
    file: "lib/arcade/renderer.ts",
    pattern: /c\.fillStyle = p\.bg;/,
    replace: 'c.fillStyle = "#000";',
    tests: "lib/arcade/renderer.test.ts",
  },
  // ── arcade foundations (2026-09-27): three cabinets, shared chrome, Hall of Fame ──
  {
    name: "arcade foundations: the first Space on the card is also a move in the game",
    file: "lib/arcade/run.ts",
    pattern: /  if \(run\.phase === "card"\) return \(key === "action" \|\| key === "bank"\) && startRun\(run\) \? "start" : null;/,
    replace: '  if (run.phase === "card") { pressGame(run.game, key); return (key === "action" || key === "bank") && startRun(run) ? "start" : null; }',
    tests: "lib/arcade/run.test.ts",
  },
  {
    name: "arcade foundations: the countdown lets the game run underneath it",
    file: "lib/arcade/run.ts",
    pattern: /      run\.clock \+= dt;\r?\n      if \(run\.clock >= BEAT \* COUNTDOWN\.length\) \{/,
    replace: "      run.clock += dt;\n      stepGame(run.game, dt, keys);\n      if (run.clock >= BEAT * COUNTDOWN.length) {",
    tests: "lib/arcade/run.test.ts",
  },
  {
    name: "arcade foundations: pause stops freezing the game",
    file: "lib/arcade/run.ts",
    pattern: /    case "play":\r?\n      if \(run\.paused\) return;/,
    replace: '    case "play":',
    tests: "lib/arcade/run.test.ts",
  },
  {
    name: "arcade foundations: GAME OVER hands straight to the result panel",
    file: "lib/arcade/run.ts",
    pattern: /return run\.phase === "over" && run\.clock >= OVER_HOLD;/,
    replace: 'return run.phase === "over";',
    tests: "lib/arcade/run.test.ts",
  },
  {
    name: "arcade foundations: the HUD's best is kept in local storage",
    file: "lib/arcade/session.ts",
    pattern: /  bests\.set\(game, score\);/,
    replace: '  bests.set(game, score);\n  try { globalThis.localStorage?.setItem("arcade-best", String(score)); } catch { /* mutation */ }',
    tests: "lib/forget.test.ts components/arcade/arcade.test.ts",
  },
  {
    name: "arcade foundations: a typing game reads keys instead of the input's value",
    file: "components/arcade/CanvasGame.tsx",
    pattern: /    for \(const key of pressesFor\(diffInput\(typedRef\.current, value\)\)\) pressRun\(run, key\);/,
    replace: "    for (const key of [...value.slice(-1)]) pressRun(run, `char:${key}`);",
    tests: "components/arcade/arcade.test.ts",
  },
  {
    name: "arcade foundations: the value diff drops a composing keyboard's correction",
    file: "lib/arcade/text-input.ts",
    pattern: /  return \{ erase: a\.length - same, insert: b\.slice\(same\)\.join\(""\) \};/,
    replace: '  return { erase: Math.max(0, a.length - b.length), insert: b.slice(a.length).join("") };',
    tests: "lib/arcade/text-input.test.ts",
  },
  {
    name: "arcade foundations: a game's event ring grows without bound",
    file: "lib/arcade/games/types.ts",
    pattern: /  if \(s\.events\.length > EVENT_RING\) s\.events\.splice\(0, s\.events\.length - EVENT_RING\);/,
    replace: "",
    tests: "lib/arcade/games/modules.test.ts",
  },
  {
    name: "arcade foundations: a retired cabinet gets a run receipt again",
    file: "lib/arcade/score-service.ts",
    pattern: /  if \(!GAME_IDS\.includes\(game as GameId\)\) throw new ScoreError\("That cabinet does not exist\."\);\r?\n  const body/,
    replace: "  const body",
    tests: "lib/arcade/score-service.test.ts",
  },
  {
    name: "arcade foundations: a live post prunes a retired cabinet's stored rows",
    file: "lib/arcade/score-service.ts",
    pattern: /    ledger\.boards\[boardKey\] = board;/,
    replace: '    ledger.boards[boardKey] = board;\n    for (const k of Object.keys(ledger.boards)) if (k.includes(":under:") && !k.endsWith(day)) delete ledger.boards[k];',
    tests: "lib/arcade/score-service.test.ts",
  },
  {
    name: "arcade foundations: the play screen puts focus on the back button again",
    file: "components/arcade/ArcadeExperience.tsx",
    pattern: /const target = screen\.kind === "play" \? "\.arcade-stage"/,
    replace: 'const target = screen.kind === "play" ? ".arcade-back"',
    tests: "components/arcade/arcade.test.ts",
  },
  {
    name: "arcade foundations: blurring the window no longer pauses the run",
    file: "components/arcade/CanvasGame.tsx",
    pattern: /const blur = \(\) => pause\(true\);/,
    replace: "const blur = () => {};",
    tests: "components/arcade/arcade.test.ts",
  },
  {
    name: "arcade foundations: the nav's cd arcade no longer leaves an open arcade",
    file: "components/Nav.tsx",
    pattern: /  if \(shellStore\.get\(\)\.arcade !== "closed"\) \{\r?\n    if \(!requestArcadeLeave\(\)\) shellStore\.dispatch\(\{ type: "close" \}\);\r?\n    return;\r?\n  \}/,
    replace: '  if (shellStore.get().arcade !== "closed") return;',
    tests: "components/nav.test.ts",
  },
  {
    // The regression the 2026-09-28 review caught: closing the shell takes the
    // drawer with it, where Escape and the room's own leave() hand it back.
    name: "arcade foundations: the nav's cd arcade closes the shell instead of leaving the way Escape does",
    file: "components/Nav.tsx",
    pattern: /    if \(!requestArcadeLeave\(\)\) shellStore\.dispatch\(\{ type: "close" \}\);/,
    replace: '    shellStore.dispatch({ type: "close" });',
    tests: "components/nav.test.ts",
  },
  {
    name: "arcade foundations: the Hall of Fame fills empty slots with rows nobody earned",
    file: "lib/arcade/fame.ts",
    pattern: /Array<null>\(size - held\.length\)\.fill\(null\)/,
    replace: 'Array.from({ length: size - held.length }, () => ({ initials: "AAA", score: 0 }))',
    tests: "lib/arcade/fame.test.ts",
  },
  {
    name: "arcade foundations: poker's traces light every card whatever the hand",
    file: "lib/arcade/poker-rules.ts",
    pattern: /  return ranks\.map\(\(r\) => \(counts\.get\(r\) \?\? 0\) >= 2\);/,
    replace: "  return ranks.map(() => true);",
    tests: "lib/arcade/poker-rules.test.ts",
  },
  {
    name: "arcade foundations: the shared chrome paints a colour of its own",
    file: "lib/arcade/chrome.ts",
    pattern: /  c\.strokeStyle = cap\.lit \? p\.bright : p\.dim;/,
    replace: '  c.strokeStyle = cap.lit ? "#ffffff" : p.dim;',
    tests: "lib/arcade/renderer.test.ts",
  },
  // ── Kernel Panic (2026-09-27): the typing game's own rules ──
  ...[
    ["forks stop splitting", /  if \(p\.kind === "fork"\) split\(s, p\);/, ""],
    ["sudo stops clearing the screen", /    const cleared = s\.processes;\r?\n    s\.processes = \[\];/, "    const cleared: Proc[] = [];"],
    ["an idle player can no longer lose", /      s\.integrity--;/, ""],
    ["a wrong letter no longer breaks the combo", /function wrong\(s: PanicState, target: Proc \| null\) \{\r?\n  s\.chain = 0;/, "function wrong(s: PanicState, target: Proc | null) {"],
    ["a wrong letter loses the lock", /      wrong\(s, target\);\r?\n      return;/, "      wrong(s, target);\n      release(s);\n      return;"],
    ["the lock goes to the highest match", /      target = lowest\(s\.processes\.filter\(\(p\) => p\.name\[0\] === c\)\);/, "      target = s.processes.filter((p) => p.name[0] === c).sort((a, b) => a.y - b.y)[0] ?? null;"],
    ["a touch run asks a phone for symbols", /"git push force", "shutdown now"/, '"git push --force", "shutdown now"'],
    ["the panic dump never ends the run", /      if \(s\.time - s\.dump\.at >= DUMP_TIME\) s\.over = true;/, ""],
    ["the waves never advance", /      s\.wave\+\+;/, ""],
    ["a spawn rolls Math.random instead of the seed", /\(\) => 40 \+ rand\(s\) \* 820\)/, "() => 40 + Math.random() * 820)"],
    ["the attract typist never fumbles", /    if \(lock && rng\(\) < 0\.025\) \{/, "    if (false) {"],
  ].map(([name, pattern, replace]) => ({
    name: `kernel panic: ${name}`, file: "lib/arcade/games/panic.ts", pattern, replace,
    tests: "lib/arcade/games/panic.test.ts",
  })),
  {
    name: "room: the typing field stops following the game between keystrokes",
    file: "components/arcade/CanvasGame.tsx",
    pattern: /if \(typing && !composing\.current && typedOf\(state\.game\) !== typedRef\.current\) syncTyped\(\);/,
    replace: "",
    tests: "components/arcade/arcade.test.ts",
  },
  {
    name: "room: a held finger steers only when a pointer event arrives, so the ship sails past it",
    file: "components/arcade/CanvasGame.tsx",
    pattern: /for \(const k of steerKeys\(s\.player, steerTo\.current\)\) keys\.current\.add\(k\);/,
    replace: "",
    tests: "components/arcade/arcade.test.ts",
  },
  {
    name: "kernel panic: the combo meter sits full from the first sudo on",
    file: "lib/arcade/games/panic.ts",
    pattern: /return \(\(\(chain - 1\) % SUDO_EVERY\) \+ 1\) \/ SUDO_EVERY;/,
    replace: "return Math.min(1, chain / SUDO_EVERY);",
    tests: "lib/arcade/games/panic.test.ts",
  },
  {
    name: "kernel panic: the room stops passing a coarse pointer as the touch profile",
    file: "components/arcade/CanvasGame.tsx",
    pattern: /touch: window\.matchMedia\("\(pointer: coarse\)"\)\.matches/,
    replace: "touch: false",
    tests: "lib/arcade/games/panic.test.ts",
  },
  {
    name: "kernel panic: the card's demo ignores the touch profile",
    file: "lib/arcade/run.ts",
    pattern: /    demo: createAttract\(id, \(seed \^ 0x5bd1e995\) >>> 0, profile\),/,
    replace: "    demo: createAttract(id, (seed ^ 0x5bd1e995) >>> 0),",
    tests: "lib/arcade/games/panic.test.ts",
  },
  {
    name: "kernel panic: the dump forgets which process broke the kernel",
    file: "lib/arcade/draw/panic.ts",
    pattern: /    comm: dump\.comm,/,
    replace: '    comm: "init",',
    tests: "lib/arcade/draw/panic.test.ts",
  },
  // ── the card: no eyebrow, and a demo that stays clear of the call to action ──
  ...[
    ["an eyebrow label comes back above the wide title", /    glowText\(pen, face\.title, 38, 118, 78, p\.bright, p\.brightGlow, "left"\);/, '    text(pen, face.genre, 40, 52, 13, p.accent);\n    glowText(pen, face.title, 38, 118, 78, p.bright, p.brightGlow, "left");'],
    ["an eyebrow label comes back above the tall title", /  glowText\(pen, face\.title, 36, 170, 112, p\.bright, p\.brightGlow, "left"\);/, '  text(pen, face.genre, 40, 70, 24, p.accent);\n  glowText(pen, face.title, 36, 170, 112, p.bright, p.brightGlow, "left");'],
    ["the phone card's demo runs through TAP TO START again", /    c\.rect\(demo\.rect\.x, demo\.rect\.y, demo\.rect\.w, demo\.rect\.h\);\r?\n    c\.clip\(\);/, ""],
    ["the phone card's demo is allowed down to the foot of the stage", /h: cardCta\(stage\)\.y - CTA_GAP - top/, "h: stage.h - top"],
  ].map(([name, pattern, replace]) => ({
    name: `arcade card: ${name}`, file: "lib/arcade/chrome.ts", pattern, replace,
    tests: "lib/arcade/chrome.test.ts",
  })),
  // ── a typing game's demo keys are checked against what its words can contain ──
  {
    name: "demo keys: Kernel Panic's contract shrinks back to letters and digits",
    file: "lib/arcade/games/panic.ts",
    pattern: /  typeable: DESKTOP_CHARS,/,
    replace: "  typeable: /^[a-z0-9]$/,",
    tests: "lib/arcade/games/modules.test.ts lib/arcade/attract.test.ts lib/arcade/games/panic.test.ts",
  },
  {
    name: "demo keys: Kernel Panic stops declaring what it types",
    file: "lib/arcade/games/panic.ts",
    pattern: /  typeable: DESKTOP_CHARS,/,
    replace: "",
    tests: "lib/arcade/games/modules.test.ts",
  },
  // ── Kernel Panic: chips never collide near the top ──
  ...[
    ["a chip spawns without checking for room", /    if \(!clearOf\(s, c, also\)\) continue;/, "", "lib/arcade/games/panic.test.ts"],
    ["near the top a chip falls into the one below it", /      if \(p\.y < TOP_ZONE_END\) nudge\(s, p, p\.speed \* dt\);\r?\n      else p\.y \+= p\.speed \* dt;/, "      p.y += p.speed * dt;", "lib/arcade/games/panic.test.ts"],
    ["a nudge closes a gap completely (the rounding fix reverted)", / - 1e-6\)\)/g, "))", "lib/arcade/games/panic.test.ts"],
    ["a knock pushes a chip into its neighbour", /    nudge\(s, target, -KNOCK\);/, "    target.y -= KNOCK;", "lib/arcade/games/panic.test.ts"],
    ["a chip's box forgets its caption", /  const parts = \[chip, label, caption, mark\]/, "  const parts = [chip, label, mark]", "lib/arcade/games/panic.test.ts"],
    ["a fork's children land on the fork's fading image", /, \[parent\]\);/, ");", "lib/arcade/games/panic.test.ts"],
  ].map(([name, pattern, replace, tests]) => ({ name: `kernel panic: ${name}`, file: "lib/arcade/games/panic.ts", pattern, replace, tests })),
  {
    name: "kernel panic: the drawer stops fitting a name into its chip",
    file: "lib/arcade/draw/panic.ts",
    pattern: /  const fit = full > inner \? g\.size \* \(inner \/ full\) : g\.size;/,
    replace: "  const fit = g.size;",
    tests: "lib/arcade/draw/panic.test.ts",
  },
  {
    name: "kernel panic: the drawer lets the pid label run past its box",
    file: "lib/arcade/draw/panic.ts",
    pattern: /  c\.fillText\(value, x, y, max\);/,
    replace: "  c.fillText(value, x, y);",
    tests: "lib/arcade/draw/panic.test.ts",
  },
  {
    name: "kernel panic: the phone frame forgets the nav again (the flat 150px)",
    file: "components/arcade/arcade.css",
    pattern: /calc\(\(var\(--vv-h, 100dvh\) - var\(--nav-h\) - 133px\)/,
    replace: "calc((var(--vv-h, 100dvh) - 150px)",
    tests: "components/arcade/arcade.test.ts",
  },
  {
    name: "kernel panic: the room's label rule stacks the typing line again",
    file: "components/arcade/arcade.css",
    pattern: /^\.arcade-room \.arcade-type \{/m,
    replace: ".arcade-type {",
    tests: "components/arcade/arcade.test.ts",
  },
  // ── Dead Signal (2026-09-27): the rebalance that made it losable ──
  ...[
    ["unlosable again: the beam fires while standing still", /    if \(s\.moving\) \{\r?\n      s\.shotClock -= dt;/, "    if (true) {\n      s.shotClock -= dt;"],
    ["unlosable again: contact kills the enemy", /function touch\(s: SignalState, e: Enemy\) \{\r?\n  hurt\(s, s\.player\);/, "function touch(s: SignalState, e: Enemy) {\n  hurt(s, s.player);\n  e.hp = 0;"],
    ["unlosable again: touching an enemy costs nothing", /      if \(s\.invincible <= 0 && distance\(e, s\.player\) < PLAYER_R \+ KINDS\[e\.kind\]\.radius - 3\) touch\(s, e\);/, ""],
    ["the long grace after a hit comes back", /export const HIT_GRACE = 0\.6;/, "export const HIT_GRACE = 1.7;"],
    ["enemy kinds collapse to one", /  const kind = pickKind\(s\);/, '  const kind: EnemyKind = (pickKind(s), "drifter");'],
    ["the waves never advance", /        s\.level\+\+;/, ""],
    ["shooters never fire", /        fireShot\(s, e\);/, ""],
    ["a charger chases the player through its dash instead of keeping its line", /        e\.x \+= e\.vx \* v \* dt; e\.y \+= e\.vy \* v \* dt;/, "        e.x += ux * v * dt; e.y += uy * v * dt;"],
    ["a splitter dies whole", /    if \(e\.kind === "splitter"\) split\(s, e, from\);/, ""],
    ["a spawn rolls Math.random instead of the seed", /  const side = Math\.floor\(rand\(s\) \* 4\), t = rand\(s\);/, "  const side = Math.floor(Math.random() * 4), t = rand(s);"],
  ].map(([name, pattern, replace]) => ({
    name: `dead signal: ${name}`, file: "lib/arcade/games/signal.ts", pattern, replace,
    tests: "lib/arcade/games/signal.test.ts lib/arcade/games/modules.test.ts",
  })),
  ...[
    ["the drawer drops a charger's dash line", /        dashes\(pen, e, \{ x: e\.vx, y: e\.vy \}, 280, on \? p\.accentBright : p\.accent, -s\.time \* 90\);/, ""],
    ["the drawer never says MOVE TO FIRE", /    if \(s\.still >= HINT_AFTER \|\| s\.blocked\) \{/, "    if (false) {"],
    ["the MOVE TO FIRE hint runs off the glass at a wall", /      const x = Math\.min\(900 - 10 - half, Math\.max\(10 \+ half, s\.player\.x\)\);/, "      const x = s.player.x;"],
    ["the drawer captions every wave's kinds, not just the new one", /  const k = INTRODUCED\.find\(\(i\) => i\.wave === s\.level && i\.wave > 1\);/, "  const k = INTRODUCED.find((i) => i.wave <= s.level && i.wave > 1);"],
  ].map(([name, pattern, replace]) => ({
    name: `dead signal: ${name}`, file: "lib/arcade/draw/signal.ts", pattern, replace,
    tests: "lib/arcade/draw/signal.test.ts",
  })),
  // ── the ejected monitor, 2026-09-27 ──
  // One geometry for the shader and the DOM, the ways back in, and the tube
  // left switched on. Each of these would still eject and still look roughly
  // right at a glance, which is the reason each one is here.
  {
    name: "eject: a bezel size is written into the shader, so the plastic and the controls part company",
    file: "components/system/PhosphorScreen.tsx",
    pattern: /vec2 bh = vec2\(rh\.x \+ uCase\.x, /,
    replace: "vec2 bh = vec2(rh.x + 0.030, ",
    tests: "components/system/PhosphorScreen.test.ts",
  },
  {
    name: "eject: the chin handed to the shader drifts from the chin the controls are placed on",
    file: "lib/eject.ts",
    pattern: /uCase: \[side, top, L\.chin \* s, EJECT_CASE\.corner \* s\],/,
    replace: "uCase: [side, top, L.chin * s * 0.9, EJECT_CASE.corner * s],",
    tests: "lib/eject.test.ts",
  },
  {
    name: "eject: the DOM case moves by a bezel size of its own",
    file: "lib/eject.ts",
    pattern: /x: \(0\.5 \+ g\.dx - s \/ 2\) \* L\.vw - side \* L\.vh,/,
    replace: "x: (0.5 + g.dx - s / 2) * L.vw - side * 1.2 * L.vh,",
    tests: "lib/eject.test.ts",
  },
  {
    name: "eject: the shader leans by a different amount from the DOM",
    file: "components/system/PhosphorScreen.tsx",
    pattern: /ejectLean\(f\.pointerX, f\.pointerY, f\.pointerActive, coarse\)/,
    replace: "ejectLean(f.pointerX, f.pointerY, 1, coarse)",
    tests: "components/system/PhosphorScreen.test.ts",
  },
  {
    name: "eject: the LED goes back to a place of its own on the chin",
    file: "components/system/PhosphorScreen.tsx",
    pattern: /float dLed = length\(q - toQ\(uLed\.xy\)\);/,
    replace: "float dLed = length(q - vec2(rc.x + rh.x * 0.80, rc.y - rh.y - 0.030));",
    tests: "components/system/PhosphorScreen.test.ts",
  },
  {
    name: "eject: the chin stops growing, so a phone's controls fall off it",
    file: "lib/eject.ts",
    pattern: /const chinPx = Math\.max\(EJECT_CASE\.chin \* screenH, chinMin\);/,
    replace: "const chinPx = EJECT_CASE.chin * screenH;",
    tests: "lib/eject.test.ts",
  },
  {
    name: "eject: the Escape handler is dropped",
    file: "components/system/EjectHardware.tsx",
    pattern: /    window\.addEventListener\("keydown", onKey\);\r?\n/,
    replace: "",
    tests: "components/system/eject.test.ts",
  },
  {
    name: "eject: Escape closes the drawer and docks the monitor in one press",
    file: "components/system/EjectHardware.tsx",
    pattern: /if \(e\.key !== "Escape" \|\| e\.defaultPrevented \|\| shellStore\.get\(\)\.open\) return;/,
    replace: 'if (e.key !== "Escape") return;',
    tests: "components/system/eject.test.ts",
  },
  {
    name: "eject: the spacer is no longer re-measured on a route change",
    file: "components/system/EjectRig.tsx",
    pattern: /const observer = new ResizeObserver\(remeasure\);/,
    replace: "const observer = new ResizeObserver(() => {});",
    tests: "components/system/eject.test.ts",
  },
  {
    name: "eject: the spacer is never watched, so a channel change keeps the old page's scroll range",
    file: "components/system/EjectRig.tsx",
    pattern: /      observer\.observe\(screen\);\r?\n/,
    replace: "",
    tests: "components/system/eject.test.ts",
  },
  {
    name: "eject: docking leaves the tube switched off",
    file: "components/system/EjectHardware.tsx",
    pattern: /if \(!ejected\) restorePower\(\);/,
    replace: "if (false) restorePower();",
    tests: "components/system/eject.test.ts",
  },
  {
    name: "eject: unmounting the hardware leaves the tube switched off",
    file: "components/system/EjectHardware.tsx",
    pattern: /      if \(offRef\.current\) frame\.current\.bootTarget = 1;\r?\n/,
    replace: "",
    tests: "components/system/eject.test.ts",
  },
  {
    name: "eject: the channel dial docks to change route",
    file: "components/system/EjectHardware.tsx",
    pattern: /      router\.push\(ch\.href\);/,
    replace: "      setEjected(false);\n      router.push(ch.href);",
    tests: "components/system/eject.test.ts",
  },
  {
    name: "eject: the hardware starts an animation loop of its own",
    file: "components/system/EjectHardware.tsx",
    pattern: /return onFrame\(\(\) => \{/,
    replace: "return requestAnimationFrame(() => {",
    tests: "components/system/eject.test.ts",
  },
  {
    name: "eject: the dial loses a route",
    file: "lib/eject.ts",
    pattern: /\.\.\.navItems\.map\(/,
    replace: "...navItems.slice(1).map(",
    tests: "lib/eject.test.ts",
  },
  {
    name: "eject: the colour knob loses a phosphor",
    file: "lib/eject.ts",
    pattern: /export const EJECT_COLOURS: readonly Theme\[\] = THEMES;/,
    replace: 'export const EJECT_COLOURS: readonly Theme[] = ["green", "amber"];',
    tests: "lib/eject.test.ts",
  },
  {
    name: "eject: the contrast knob can turn the scanlines past full",
    file: "lib/eject.ts",
    pattern: /return Math\.min\(1, Math\.max\(0, v \/ EJECT_HARDWARE\.contrastSteps\)\);/,
    replace: "return Math.max(0, v / EJECT_HARDWARE.contrastSteps);",
    tests: "lib/eject.test.ts",
  },
  {
    name: "eject: the power switch's last line never fades",
    file: "components/system/PhosphorScreen.tsx",
    pattern: /  strike \*= strikeMask;\r?\n/,
    replace: "",
    tests: "components/system/PhosphorScreen.test.ts",
  },
  {
    name: "eject: the tube takes the pointer in viewport space again, so a cursor on the desk glows on the glass",
    file: "components/system/PhosphorScreen.tsx",
    pattern: /shared\.uPointer\.value = \[onX, 1 - onY\];/,
    replace: "shared.uPointer.value = [f.pointerX, 1 - f.pointerY];",
    tests: "components/system/PhosphorScreen.test.ts",
  },
  {
    name: "eject: the assembly becomes a scroll container again",
    file: "app/globals.css",
    pattern: /  overflow: clip;\r?\n  transform-origin: 50% 50%;/,
    replace: "  overflow: hidden;\n  transform-origin: 50% 50%;",
    tests: "components/system/eject.test.ts",
  },
  // ── the boot on the one frame clock, 2026-09-27 ──
  // Its words, its privacy, its timing and the beam it draws with. Each of
  // these would still boot, still reveal the page and still pass a glance.
  {
    name: "boot: the boot mounts the retired venture again",
    file: "lib/boot.ts",
    pattern: /"mounting   \/usr\/tighsauna ............. OK"/,
    replace: '"mounting   /usr/presterly ............. OK"',
    tests: "lib/boot.test.ts",
  },
  {
    name: "eject: a knob tap wraps past its last detent again",
    file: "components/system/EjectHardware.tsx",
    pattern: /const tapped = knobTap\(value, min, max, tapStep\);/,
    replace: "const tapped = value + tapStep > max ? min : Math.max(min, value + tapStep);",
    tests: "components/system/eject.test.ts",
  },
  {
    name: "eject: the channel dial claims channel 1 on a page that is not a channel",
    file: "components/system/EjectHardware.tsx",
    pattern: /min=\{Math\.min\(min, shown\)\}/,
    replace: "min={min}",
    tests: "components/system/eject.test.ts",
  },
  {
    name: "eject: a press on the chin's buttons rings the glass again",
    file: "components/system/PhosphorScreen.tsx",
    pattern: /if \(tapU < 0 \|\| tapU > 1 \|\| tapV < 0 \|\| tapV > 1\) shared\.uTap\.value = 999;/,
    replace: "",
    tests: "components/system/PhosphorScreen.test.ts",
  },
  {
    name: "boot: the watchdog runs from mount only, and cuts short a boot a background tab started late",
    file: "components/BootSequence.tsx",
    pattern: /struckAt = time;\r?\n\s*window\.clearTimeout\(watchdog\);\r?\n\s*watchdog = window\.setTimeout\(\(\) => finishRef\.current\(\), BOOT_WATCHDOG_MS\);/,
    replace: "struckAt = time;",
    tests: "lib/boot.test.ts",
  },
  {
    name: "saver: a stall draws one stroke across the figure again",
    file: "lib/lissajous.ts",
    pattern: /Math\.max\(joinFrom\(w\.theta, fig, env\.aspect\), target - SAVER_MAX_STROKE\)/,
    replace: "joinFrom(w.theta, fig, env.aspect)",
    tests: "lib/lissajous.test.ts",
  },
  {
    name: "saver: the figure runs on real time and creeps brighter on a slow machine",
    file: "components/system/Screensaver.tsx",
    pattern: /elapsedMs: tube,/,
    replace: "elapsedMs: performance.now(),",
    tests: "lib/lissajous.test.ts",
  },
  {
    name: "system: live eases per frame again, so the boot's picture comes up at the monitor's rate",
    file: "components/system/SystemProvider.tsx",
    pattern: /\* easeFactor\(0\.05, dt\);/,
    replace: "* 0.05;",
    tests: "lib/system.test.ts",
  },
  {
    name: "system: easeFactor ignores elapsed time",
    file: "lib/system.ts",
    pattern: /return 1 - Math\.pow\(1 - k, dtMs \/ \(1000 \/ 60\)\);/,
    replace: "return k;",
    tests: "lib/system.test.ts",
  },
  {
    name: "mcp: the console writes its send ref during render again",
    file: "components/mcp/McpPanels.tsx",
    pattern: /useEffect\(\(\) => \{\r?\n\s*sendRef\.current = send;\r?\n\s*\}\);/,
    replace: "sendRef.current = send;",
    tests: "lib/mcp-console.test.ts",
  },
  {
    name: "status: the path segment stops remounting, so a 404 keeps the prerendered ~/_not-found",
    file: "components/system/StatusBar.tsx",
    pattern: /key=\{mounted \? "client" : "server"\}/,
    replace: 'key="pwd"',
    tests: "components/statusbar.test.ts",
  },
  {
    name: "saver: idle listeners go back to bubbling, so a keyboard player in the arcade counts as idle",
    file: "components/system/Screensaver.tsx",
    pattern: /const options = \{ passive: true, capture: true \} as const;/,
    replace: "const options = { passive: true } as const;",
    tests: "lib/lissajous.test.ts",
  },
  {
    name: "saver: waking leaves the beam's last stroke on the tube",
    file: "components/system/Screensaver.tsx",
    pattern: /unsubscribe\(\);\r?\n(\s*)clearBeam\(frame\.current\);/,
    replace: "unsubscribe();",
    tests: "lib/lissajous.test.ts",
  },
  {
    name: "saver: strokes meet end to end again and bead at every frame",
    file: "lib/lissajous.ts",
    pattern: /export const SAVER_JOIN = 1\.67 \* BEAM_RADIUS;/,
    replace: "export const SAVER_JOIN = 0;",
    tests: "lib/lissajous.test.ts",
  },
  {
    name: "boot: finish() leaves the frame callback running, so a skip mid-trace keeps drawing the mark",
    file: "components/BootSequence.tsx",
    pattern: /finishedRef\.current = true;\r?\n(\s*)stopFrames\.current\(\);/,
    replace: "finishedRef.current = true;",
    tests: "lib/boot.test.ts",
  },
  {
    name: "boot: PRIVACY: the boot overlay drops ph-no-capture, so autocapture can lift the visitor's readings",
    file: "components/BootSequence.tsx",
    pattern: /className="boot ph-no-capture"/,
    replace: 'className="boot"',
    tests: "lib/boot.test.ts",
  },
  {
    name: "boot: the watchdog is shortened below the full boot's floor and cuts healthy boots short",
    file: "lib/boot.ts",
    pattern: /export const BOOT_WATCHDOG_MS = 20_000;/,
    replace: "export const BOOT_WATCHDOG_MS = 7000;",
    tests: "lib/boot.test.ts",
  },
  {
    name: "boot: the phone boot outgrows the length Fergus approved",
    file: "lib/boot.ts",
    pattern: /  traceMs: 600,/,
    replace: "  traceMs: 900,",
    tests: "lib/boot.test.ts",
  },
  {
    name: "boot: the boot starts an animation loop of its own again",
    file: "components/BootSequence.tsx",
    pattern: /const unsubscribe = onFrame\(\(time\) => \{/,
    replace: "const unsubscribe = requestAnimationFrame((time) => {",
    tests: "lib/boot.test.ts",
  },
  {
    name: "boot: the boot sets React state inside the frame callback",
    file: "components/BootSequence.tsx",
    pattern: /if \(snap\.done && !handoff\) handoff = window\.setTimeout\(\(\) => finishRef\.current\(\), 0\);/,
    replace: "if (snap.done && !handoff) { handoff = 1; setBooting(false); }",
    tests: "lib/boot.test.ts",
  },
  {
    name: "boot: a boot unmounted part-way leaves the tube switched off behind the page",
    file: "components/BootSequence.tsx",
    pattern: /        frame\.current\.bootTarget = 1;\r?\n        frame\.current\.targetLive = 1;\r?\n/,
    replace: "",
    tests: "lib/boot.test.ts",
  },
  {
    name: "boot: the page's power-on fades in again, leaving black between the fold and the page",
    file: "app/globals.css",
    pattern: /(@keyframes power-on \{\s*0% \{\s*transform: scaleY\(0\.004\);\s*filter: brightness\(3\.2\);\s*opacity: )1;/,
    replace: "$10;",
    tests: "app/globals.test.ts",
  },
  {
    name: "boot: one cache for every element, so the fold line never receives --collapse",
    file: "components/BootSequence.tsx",
    pattern: /let seen = published\.get\(el\);/,
    replace: "let seen = published.get(document.documentElement);",
    tests: "lib/boot.test.ts",
  },
  {
    name: "boot: the POST prints a refresh rate from a handful of frames",
    file: "lib/post.ts",
    pattern: /export const MIN_REFRESH_GAPS = 20;/,
    replace: "export const MIN_REFRESH_GAPS = 5;",
    tests: "lib/post.test.ts",
  },
  {
    name: "boot: the POST prints a starved frame rate as the display's refresh rate",
    file: "lib/post.ts",
    pattern: /  if \(steady\.length < usable\.length \* 0\.75\) return null;\r?\n/,
    replace: "",
    tests: "lib/post.test.ts",
  },
  {
    name: "boot: the POST reads the median gap again and prints 63 Hz for a 60Hz screen",
    file: "lib/post.ts",
    pattern: /const hz = 1000 \/ \(steady\.reduce\(\(sum, g\) => sum \+ g, 0\) \/ steady\.length\);/,
    replace: "const hz = 1000 / median;",
    tests: "lib/post.test.ts",
  },
  {
    name: "boot: the mark drifts from the site's icon",
    file: "lib/mark.ts",
    pattern: /\{ x: 27 \/ U, y: 32 \/ U, draw: true \},/,
    replace: "{ x: 28 / U, y: 32 / U, draw: true },",
    tests: "lib/mark.test.ts",
  },
  {
    name: "boot: the beam deposit is deleted from the sim pass",
    file: "components/system/PhosphorScreen.tsx",
    pattern: /    add \+= exp\(-bk \* bk\) \* uBeamGain;\r?\n/,
    replace: "",
    tests: "components/system/PhosphorScreen.test.ts",
  },
  {
    name: "boot: the beam is normalised twice, by the CPU and again by uEmit",
    file: "components/system/PhosphorScreen.tsx",
    pattern: /add \+= exp\(-bk \* bk\) \* uBeamGain;/,
    replace: "add += exp(-bk * bk) * uBeamGain * uEmit;",
    tests: "components/system/PhosphorScreen.test.ts",
  },
  {
    name: "boot: the tube never lets go of a beam path, so it keeps depositing a stale one",
    file: "components/system/PhosphorScreen.tsx",
    pattern: /      clearBeam\(f\);\r?\n/,
    replace: "",
    tests: "components/system/PhosphorScreen.test.ts",
  },
  {
    name: "boot: the beam's trail brightens with the visitor's refresh rate",
    file: "lib/beam.ts",
    pattern: /return \(BEAM_GAIN \* spanMs\) \/ \(Math\.max\(0, length\) \+ Math\.sqrt\(Math\.PI\) \* BEAM_RADIUS\);/,
    replace: "return (BEAM_GAIN * 16) / (Math.max(0, length) + Math.sqrt(Math.PI) * BEAM_RADIUS);",
    tests: "lib/beam.test.ts",
  },
  {
    name: "boot: a held stroke is topped up by a fixed amount, so it drifts with the refresh rate",
    file: "lib/beam.ts",
    pattern: /return level \* \(1 - Math\.pow\(PHOSPHOR_DECAY, periodMs \/ 1000\)\);/,
    replace: "return level * 0.05;",
    tests: "lib/beam.test.ts",
  },
  {
    name: "boot: the beam writer overwrites a path the tube has not drawn yet",
    file: "lib/boot-beam.ts",
    pattern: /if \(\(busy && !continues\) \|\| path\.length > MAX_BEAM_POINTS\) return idle\(w\);/,
    replace: "if (path.length > MAX_BEAM_POINTS) return idle(w);",
    tests: "lib/boot-beam.test.ts",
  },
  {
    name: "boot: the beam lights the move between strokes when one slow frame spans it",
    file: "lib/boot-beam.ts",
    pattern: /const run = runs\[0\];\r?\n    const pts = run\.pts\.map\(toView\);/,
    replace: "const run = { ...runs[0], pts: runs.flatMap((r) => r.pts), to: runs[runs.length - 1].to };\n    const pts = run.pts.map(toView);",
    tests: "lib/boot-beam.test.ts",
  },
];


let caught = 0;
const survived = [];
const filterIndex = process.argv.indexOf("--filter");
const filtered = filterIndex < 0 ? MUTATIONS : MUTATIONS.filter(m => m.name.includes(process.argv[filterIndex + 1] ?? ""));
const shardIndex = process.argv.indexOf("--shard");
const selected = selectShard(filtered, shardIndex < 0 ? undefined : process.argv[shardIndex + 1] ?? "");
if (!selected.length) throw new Error("No mutations matched the requested filter");

// A pre-existing failure must never be mistaken for a caught mutation.
// Bound workers so browser checks sharing a workstation do not starve protocol timers.
const testCommand = "npx vitest run --silent --maxWorkers=4 --minWorkers=2";
execSync(testCommand, { cwd: ROOT, stdio: "inherit" });

for (const mutation of selected) {
  const path = join(ROOT, mutation.file);
  const original = readFileSync(path, "utf8");
  const mutated = original.replace(mutation.pattern, mutation.replace);

  if (mutated === original) {
    // Not a skip. An anchor that no longer matches means this guard is not
    // being tested at all, and saying so quietly is how that gets missed.
    console.log(`ANCHOR-MISS  ${mutation.name}  (${mutation.file})`);
    survived.push(`${mutation.name} [anchor no longer matches]`);
    continue;
  }

  writeFileSync(path, mutated, "utf8");
  let red = false;
  try {
    execSync(`${testCommand} ${mutation.tests ?? ""}`, { cwd: ROOT, stdio: "pipe" });
  } catch {
    red = true;
  } finally {
    writeFileSync(path, original, "utf8");
  }

  if (red) caught++;
  else survived.push(mutation.name);
  console.log(`${red ? "RED  " : "GREEN"}  ${mutation.name}`);
}

console.log(`\n${caught}/${selected.length} mutations caught${filterIndex < 0 ? "" : " (filtered run)"}${shardIndex < 0 ? "" : ` (shard ${process.argv[shardIndex + 1]})`}.`);
if (survived.length) {
  console.log("Survived (each one is a guard that does nothing):");
  for (const name of survived) console.log(` - ${name}`);
  process.exitCode = 1;
}
