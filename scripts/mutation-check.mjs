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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Each: break one guard, expect the suite to notice. */
const MUTATIONS = [
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
    name: "the drawer opens on the page that already has a terminal",
    file: "lib/shell.ts",
    pattern: /return state\.inline \|\| state\.open \? state : \{ \.\.\.state, open: true \};/,
    replace: "return state.open ? state : { ...state, open: true };",
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
    pattern: /(?<lead>\.statusbar__prompt \{\r?\n    align-self: flex-end;[\s\S]{0,120}min-height: )44px;/,
    replace: "$<lead>22px;",
  },

  // ── what the review of F2 found ──
  {
    // The home page's half of the backtick rule. `lib/shell.ts` declines to
    // open on the inline route, so deleting this breaks nothing loudly: the
    // key just stops doing anything on `/`.
    name: "the backtick on the home page stops reaching the inline terminal",
    file: "components/ShellDrawer.tsx",
    pattern: /  if \(shellStore\.get\(\)\.inline\) \{[\s\S]*?\r?\n  \}\r?\n/,
    replace: "",
  },
  {
    name: "the status bar writes its dollar into the document again",
    file: "components/system/StatusBar.tsx",
    pattern: /(<span className="statusbar__prompt-label">prompt<\/span>)/,
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
    name: "the headline checker stops recording a refused run, so refusals read as silence",
    file: "app/tools/headline-check/actions.ts",
    pattern: /    record\("refused", started\);\r?\n    return \{ status: "invalid", seq, url: "", message: headlineCopy\.emptyUrl \};/,
    replace: '    return { status: "invalid", seq, url: "", message: headlineCopy.emptyUrl };',
  },
];

let caught = 0;
const survived = [];

for (const mutation of MUTATIONS) {
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
    execSync("npx vitest run --silent", { cwd: ROOT, stdio: "pipe" });
  } catch {
    red = true;
  } finally {
    writeFileSync(path, original, "utf8");
  }

  if (red) caught++;
  else survived.push(mutation.name);
  console.log(`${red ? "RED  " : "GREEN"}  ${mutation.name}`);
}

console.log(`\n${caught}/${MUTATIONS.length} mutations caught.`);
if (survived.length) {
  console.log("Survived (each one is a guard that does nothing):");
  for (const name of survived) console.log(` - ${name}`);
  process.exitCode = 1;
}
