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
