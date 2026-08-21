# PROGRESS: living project state

> Update this file as you work. It is the handoff contract: the next agent reads it first.
> Keep the status line current, tick task boxes, and append to the decision log.

**Project:** FergusOS Terminal portfolio (`C:/Dev/fergus-portfolio`)
**GitHub:** https://github.com/fergo5002/fergus-portfolio (private)

**Status (2026-08-21, latest): the site can now see itself.** PostHog is in, cookieless, and the
GEO work has instruments rather than opinions.

Everything before this was building things and arguing they would help. This is the part that
finds out. Four instruments, and the honest read is the overlap between them, because each is
blind to what the others see (`docs/measurement.md` is the standing reference).

- **PostHog, cookieless.** `cookieless_mode: "always"`: no cookies, no local storage, no banner,
  nothing to consent to. PostHog counts people with a server-side hash instead. Session replay is
  off as a **consequence** of that rather than as a preference, because replay needs somewhere to
  keep a session id. Fergus asked for both and they are mutually exclusive; PostHog's own docs say
  so, and he chose cookieless when told.
- **Events go through `/ingest`** on this site's own origin, because a developer audience runs
  blockers and unproxied numbers here would not be slightly low, they would be biased in the one
  direction that makes them useless. That needed `skipTrailingSlashRedirect: true`, which is a
  global switch, which is why `middleware.ts` now exists to put the trailing-slash redirect back
  for every path except the proxy.
- **AI crawler logging.** `middleware.ts` is the only thing on this site that can see a crawler:
  the pages an engine cites are static, so a crawl runs no server code at all. `lib/crawlers.ts`
  splits 21 agents into training, search-index and **user-fetch**, and the last of those is the
  number worth watching: it means a person asked a question seconds ago and the model came here to
  answer it.
- **AI referral attribution.** Read from the referrer and the campaign tag, matched on the parsed
  host rather than as a substring, because `referrer.includes("perplexity.ai")` counts
  `notperplexity.ai` and lets any stranger inflate the headline number from their own page.
- **Web Vitals and MCP tool calls.** The first is a ranking input and the only non-lab performance
  number this site has. The second is the only instrument that will ever see `/api/mcp`, which
  shipped on the argument that agents would use it.
- **Share of Model into PostHog.** `scripts/share-of-model/publish.mjs`, and it inherits the
  harness's absence rule: a surface marked `missing` is never published, because sending it as a
  zero would put a fabricated point on a trend line.

> [!warning] The thing that was nearly shipped, caught by measuring
> A static `import posthog from "posthog-js"` put a **248 KB** chunk into the *layout* bundle, so
> every route downloaded the entire SDK before it could hydrate. It was the largest chunk in the
> repo, bigger than the React framework chunk, measured off `app-build-manifest.json` rather than
> guessed.
>
> The irony is the point: one of the things this component reports is Core Web Vitals, so shipping
> it that way would have measurably worsened the number it exists to measure and then reported the
> worse number as if it were news. The import is now dynamic and fires on idle after mount, with a
> bounded queue so LCP and FCP (which land inside the first second, before the SDK arrives) are
> still recorded. `components/analytics/PostHogAnalytics.test.ts` fails if anybody tidies it back.

> [!danger] The site-breaker, caught by the parity container and by nothing else
> The new middleware's trailing-slash redirect answered `/writing/` with
> `308 location: /writing/`. A permanent redirect to itself. curl followed it fifty times and gave
> up. **Every trailing-slash URL on the site was unreachable**, while `next build` was clean, `tsc`
> was clean and all 903 tests were green.
>
> `NextURL` records path information when constructed, trailing slash included, and re-applies it
> when formatted, which is exactly what `skipTrailingSlashRedirect` asks it to do. Assigning
> `.pathname` does not clear that. Fixed by building the redirect from a plain `new URL(request.url)`.
>
> **The lesson is not about `NextURL`.** Every test written for this asserted the *inputs* to the
> decision: `lib/edge.test.ts` proves `trailingSlashTarget("/writing/")` returns `"/writing"`, and
> it does. Nothing asserted the *response*. The unit was right and the thing it was wired into was
> not, so the whole suite agreed with a broken site. `middleware.test.ts` now runs the real
> middleware against real `NextRequest`s and asserts the `Location` header that ships. Confirmed
> both ways: red with `clone()`, green with `new URL`.
>
> Not the build, not the type checker, not 903 tests. The Docker parity policy earned its keep.

Review then found four more, all fixed before shipping: development was reporting into the live
project because a doc claimed a gate that did not exist; the MCP telemetry wiring had no test at
all; crawler capture had no cost bound, so a forged `User-Agent` on a loop could both run up the
bill and inflate the one number the exercise exists to produce; and a **52/52 mutation figure was
quoted after three more mutations had been added**, which is logged in [[coding-mistakes]] as its
own lesson about scores having timestamps.

An intermediate run came back 59/61, and both survivors were guards of mine that did nothing: one
mutated only a module initialiser that every test overwrote in `beforeEach` (and which is an
equivalent mutant in production anyway, since `Date.now()` dwarfs the window), and one asserted a
status equality that a hard-coded `200` satisfied because every case exercised happened to return
200. Fixed by mutating both occurrences of the sentinel, and by adding a JSON-RPC notification case
that really does return 202.

> [!warning] `Mcp-Name` is not the client's name, and I asserted that it was
> The MCP telemetry took the caller's identity from the `Mcp-Name` header, with a docblock stating
> as fact that revision 2026-07-28 carries the client name there. **It does not.** `Mcp-Name` is
> per-request routing metadata that must equal `params.name`, and `lib/mcp.ts` has a
> `headerMismatch` check that rejects a disagreement. The answer was in this repo, in the module
> `AGENTS.md` tells you to read before touching that endpoint, and I used memory instead.
>
> Found by exercising production: a live `tools/call` sent with `Mcp-Name: post-deploy-verification`
> came back `400 Header mismatch`, and the PostHog row it had already written read
> `distinct_id: "mcp:post-deploy-verification"` with that value sitting in a field called `client`.
> Not a crash. A column that quietly meant something other than its label.
>
> Identity now comes from the protocol itself: a 2026-07-28 client puts `clientInfo` on `_meta` on
> **every** request and a legacy client puts it on `initialize`, so that is read first and tagged
> `client_source: "protocol"`. The `User-Agent` is the fallback, tagged `"user-agent"`, for legacy
> `tools/call` where the handshake carried the identity and the request does not.
>
> The unit test could never have caught it: it passed its own chosen string into `withMcpClient` and
> checked the string came back. **A test that supplies its own input cannot discover that the real
> input means something else.** One live call did it in one request.

> [!danger] Cookieless was silently discarding every browser event, and the endpoint said 200
> Found by loading the live site in a real browser after everything else was verified. Beacons went
> out through the proxy and returned `200 {"status":"Ok"}`. **Nothing was recorded.** No error, no
> ingestion warning, no console message. Server-side events (`ai_crawler_visit`, `mcp_tool_call`)
> were arriving perfectly throughout, so the project looked alive and only the browser half was
> missing.
>
> Cause: `cookieless_mode: "always"` in the SDK is **half** of cookieless. The PostHog *project*
> also needs `cookieless_server_hash_mode`, which is **off by default and not in PostHog's settings
> UI at all**. Without it there is no hash pipeline to resolve the `$posthog_cookieless` sentinel
> distinct id, so the events are accepted and thrown away. Set over the API to `1` (stateless: no
> per-visitor state anywhere, on the device or the server). Browser events appeared within seconds.
>
> **Verified after the fix, in a real browser against production:** `$pageview` on first load and
> again on client-side navigation (so `history_change` is doing its job), `ai_referral` with
> `ai_engine: "chatgpt"` and `ai_via: "utm"`, `web_vital`, `$pageleave`, all with
> `distinct_id: "cookieless_..."` and **zero cookies and zero PostHog storage on the device**.
>
> Two process notes. I first checked twenty seconds after sending and declared two probes dropped;
> one of them arrived later, which sent me chasing proxies and CORS when the first guess had been
> right. Logged to [[coding-mistakes]]: establish a system's latency with a known-good control
> before reading absence as evidence. And the general form is in [[coding-playbook]]: **a 200 from
> an ingestion endpoint means accepted, never recorded.** Verify telemetry by querying the store.

Final figures, from a full run after everything above: **64/64 mutations caught, 933 tests across
32 files**, `tsc --noEmit` clean, `next build` clean, Docker prod-parity green from `npm ci` on
Node 24 and exercised in the running container.

**Open observation, cause not established.** Two `$pageview` events were recorded for `/projects`
21 seconds apart with nothing navigating in between. Nothing in this repo touches the History API
(grepped), so it is not the site's own doing, and it is recorded here as something to watch rather
than diagnosed. If pageview counts read high later, start there.

**Status (2026-08-21, earlier): the site is citable, it has original data, a tool and an MCP server,
and its own costume is out of the text.** Live on `656478c`, verified in production.

Yesterday's work made the site crawlable. This made it quotable, and then turned its own
instrument on itself and found two more of the bug it wrote about.

- **Citability.** Question-framed headings went from **0 of 46 to 32 of 46**, every section under
  one opens by answering it, and `lib/faq.ts` builds `FAQPage` from those headings so the graph
  cannot claim an answer that is not on the page. All of it is a test now, not a note:
  `content/articles.test.ts` gained a citability block that caught seven real thin sections while
  it was being written.
- **Original research.** `/writing/split-text-audit-2026`, 154 Awwwards winners fetched as server
  HTML, dataset checked in at `/data/split-text-audit-2026-08.json` and re-runnable from
  `scripts/split-text-audit.mjs`. The result is not the one it went looking for and the piece says
  so: 54 of 151 (35.8%) serve no h1 at all, exactly one fragments its h1.
- **A tool.** `/tools/headline-check`. Works with JavaScript off, refuses private and reserved
  addresses on the typed URL and every redirect hop.
- **An MCP server.** `/api/mcp`, six tools, spec revision 2026-07-28, dual-era so real clients work.
- **The costume.** Every article heading extracted as `#The actual reason`, and every page opened
  with ~150 characters of terminal chrome before the first real word. Both reproduced against live
  HTML, both fixed by drawing the text from CSS. See the rule in `AGENTS.md`.

> [!tip] Verified in production on 2026-08-21, not asserted
> `dpl_5kurKBLJx9VLXrfhPGyqXx6oWiew`, `readyState: READY`, `aliasAssigned: true`, sha `656478c`
> matching the push, `fergusoreilly.dev` in the alias list.
>
> Exercised live, not pinged: all twelve routes 200 with the right content types including
> `/.well-known/mcp.json`; MCP `tools/list` returns six tools and `tools/call get_profile` returns
> real data with `resultType: "complete"`; the checker POSTed with **no JavaScript** classified
> `brand.ivress.co.jp` as Fragmented and refused `169.254.169.254`; `FAQPage` renders with seven
> real pairs and `isPartOf` now resolves; the article's extractable text reaches its headline at
> character ~110 rather than ~240. Runtime logs across the whole test window: every request 200,
> no errors.
>
> **The one warning, and it is not a defect.** `Missing 'origin' header from a forwarded Server
> Actions request` appears twice, once per curl POST. curl does not send `Origin`; a browser
> always does. It means the no-JS proof deliberately went around Next's CSRF check, which is worth
> knowing about the test rather than about the feature.
>
> **What this did NOT verify.** Nobody has looked at the pixels: no browser ran against any of
> these pages, so the CRT styling of `/tools`, `/mcp` and the new prose table, their contrast on
> the amber and ice themes, and the reduced-motion behaviour are argued from the tokens and the
> contrast test, not seen. No real MCP client has connected. Nothing here says anything about
> whether any of it improves ranking or citation: that is what `scripts/share-of-model/` is for,
> and its first run is the "before".

> [!warning] Open, and deliberately not closed today
> **DNS rebinding beats the SSRF guard in `lib/headline-fetch.ts`.** It resolves, decides, then
> hands the hostname to `fetch`, which resolves again. The real fix is pinning the resolved
> address through a `lookup` hook. What bounds it: the content type is checked before a single
> byte of the body is read, so a rebind landing on an instance metadata endpoint gets `text/plain`,
> fails the gate, and is discarded unread. That protects the data, not the request.
>
> **`/api/mcp` has no rate limit.** Read-only, stateless, no outbound I/O, so it is a cost question
> rather than a security one. A per-instance limiter on serverless would mostly annoy legitimate
> agents.
>
> **Fergus's, off-site and 30 seconds each:** set the display name and the website field on
> `github.com/fergo5002`. The `sameAs` claim from this site is one-directional until that end links
> back. And "Tigh Sauna" collides with **Tigh'N Alluis**, a sauna venue in the Dublin mountains with
> TripAdvisor and Visit Dublin coverage: same word, same city, same market. That is a brand call.

**Status (2026-08-20): the tube is calmer, and the contact form clicks when you type.**
Three things Fergus asked for. The shell's membrane click now fires on all three contact fields
(same key filter as `Terminal.tsx`, asserted against it rather than restated). The periodic
full-screen flicker and the channel-change burst are halved in `app/globals.css`. The pointer halo
and the tap and degauss shockwaves are dimmed in the shader.

> [!warning] The shader half took two reviews to actually land
> **Round one: halving the constants did nothing.** 0.85 to 0.425 for the degauss, 0.55 to 0.275 for
> a tap. The persistence buffer is 8-bit, clamped to 1.0 every frame, and integrates ~20 frames of
> deposit at 60fps, so both the old and the new values saturated and the degauss carried on flashing
> pure white, a change of about 2%. Caught *after* tests, mutations, build, Docker parity and a live
> bundle check had all gone green. The values were re-solved backwards from the composite peak,
> which is why they are not round halves: degauss 0.06 sim / 0.05 present, tap 0.11 / 0.10, pointer
> 0.05 / 0.025.
>
> **Round two: they were only correct at 60fps.** The decay was per second, the deposits were per
> frame, so a steady emitter settled at `K / (1 - uDecay)`: ~19.9K at 60fps and ~39.2K at 120. The
> same constants ran at half strength on a 60Hz laptop and full strength on a 120Hz monitor, and at
> 165Hz the degauss clipped white again. On a fast display the change would simply not have existed.
> Fixed with a `uEmit` uniform, `(1 - uDecay) / (1 - 0.045^(1/60))`, applied to the three tuned
> emitters only. Flat within 1% from 30fps to 165fps, asserted arithmetically in
> `PhosphorScreen.test.ts` rather than grepped. The beam and the impacts are deliberately left
> unnormalised: they were not part of the ask and have never been tuned to a reference rate.
>
> **The numbers, each with its base, because two of them were cited without one and looked like a
> contradiction.**
> - *Peak green in the buffer before the clamp, at 60fps*: degauss 5.93 → 0.42, tap 3.86 → 0.38,
>   resting pointer 1.99 → 0.99. These are the figures the shader comment quotes.
> - *Peak green on screen over a lit page*, measured with `gl.readPixels` across a real route change,
>   same browser, same ~30fps: **1.000 (clipped white) → 0.624, against a 0.580 resting floor.** This
>   is the only end-to-end measurement and it predates the `uEmit` fix, so it understates the result
>   at 30fps, where normalisation now brings the ring back up to its 60fps reference.
>
> The pointer was always a true halving, because it never ran as far over the clamp: its saturated
> white core goes from roughly 115px of radius to roughly 15px.

**Status (2026-08-20): the "Email me" button goes to a real page.** It was an
`<a href="mailto:...">` with a pre-filled subject, and on a machine with no mail client registered
it did nothing whatsoever. Fergus reported it as a dead button. There is now a `/contact` route with
a working form.

> [!tip] Sending is live as of 2026-08-20
> `RESEND_API_KEY` is set on the Vercel project for production, preview and development, and a copy
> lives in the DPAPI vault (`Get-AuthSecret -Name RESEND_API_KEY`) so no future session needs to ask
> for it again. Proved end to end against production, not asserted: two submissions through the live
> form arrived in `oreillferg@gmail.com`, **in the inbox rather than spam**, with SPF, DKIM (both
> `resend.dev` and `amazonses.com`) and DMARC all passing, `Reply-To` set to the visitor's address
> rather than ours, and the fast one correctly subject-tagged `[fast]` **and still delivered**.
>
> Sender is still the shared `onboarding@resend.dev`, which needs no DNS but may only deliver to the
> address the Resend account is registered under. That is `oreillferg@gmail.com`, which is also
> where the form sends, so it works. Moving the destination anywhere else means verifying a domain
> and setting `CONTACT_FROM_EMAIL` first, or every send starts returning 403.

How it is built, and why each piece:
- `lib/contact.ts` is the client-safe half (limits, `validateContact`, `looksAutomated`,
  `messageBody`, `mailtoFallback`). `lib/contact-server.ts` is the half that holds the key.
  `app/contact/actions.ts` is a five-line wrapper, so every failure path is drivable by a test
  rather than only by a stranger who has already typed a message.
- Four outcomes: `sent`, `invalid`, `failed`, `idle`. `failed` collapses three faults of ours
  (no key, Resend refused, request never landed) into one thing the page can act on, and all three
  return the fields plus a `mailto:` that already contains them.
- Sending is plain `fetch` to `https://api.resend.com/emails`. No SDK, no new dependency. The REST
  API takes `reply_to`; only the SDKs take `replyTo`, and the camelCase spelling is accepted and
  silently ignored, so there is a test pinning it.
- The form works with JavaScript off, via `useActionState` and React's progressive enhancement.
- Spam: two signals that are deliberately **not** equals. The honeypot (named `hp`, never `website`,
  which autofill recognises and would fill) is the only thing allowed to discard a message. The
  two-second fill floor only *marks* one, with `[fast]` in the subject, and it fails open when no
  timing is present at all.

**The review caught a genuine blocker, and it was the same bug rebuilt inside the fix.** The first
version treated both spam signals as one predicate and silently discarded anything that tripped
either, reporting "Sent." either way. The reasoning attached to it, "two seconds is far below any
real typist", was true about typing and irrelevant in practice: the name and email fields carry
`autocomplete` on purpose, so a browser profile fills both in one click, and people arrive at a
contact form with the message already written and paste it. Autofill plus a paste plus a deliberate
click is comfortably under two seconds. A real visitor would have been told their message sent while
it went in the bin, which is exactly the failure this page was built to remove. The timing signal
can no longer drop anything.

Four smaller findings from the same review went with it: `lib/contact-server.ts` gained a runtime
browser fence plus a test that no `"use client"` file imports it (chosen over adding the
`server-only` package, since the repo has a standing rule about dependencies); the deliberate
check-order in the action is now tested with a bot that *also* has invalid fields, which is the only
shape that would notice a swap; the `--green-dim` contrast assertion now names each theme with its
real ratio (4.67 on green, 4.45 on amber, 4.46 on ice) instead of one loose bound that proved
nothing; and `components/ContactForm.tsx` and `components/Talk.tsx` gained `lib/boot.test.ts`-style
coupling checks.

**Verification.** 425 tests green; `npx tsc --noEmit` clean; `npm run build` clean at 30 static
pages; the `Dockerfile.parity` container built from the lockfile on Node 24 and behaved identically.
Every path was driven with JavaScript entirely absent by POSTing the multipart form with its
`$ACTION*` fields: valid, invalid address, short message, honeypot, too-fast, and no-timing. A real
request to Resend with a deliberately invalid key returned 401 and produced the fallback rather than
an error boundary. In a browser, the client-side stamp was proved to reach the action by pinning
`Date.now` so it computed a negative elapsed and watching the outcome flip.

**Verified live on production**, deployment `dpl_Aeg6B8UWwHub2dpwTvhxFGjgJ1Ft` (`d059851`, READY,
aliased). All nine routes 200. Every "Email me" on the site resolves to `/contact` with no `mailto:`
CTA left anywhere. `/sitemap.xml` lists `/contact` and `/llms.txt` carries the URL. The six no-JS
paths behave exactly as they do locally, which is the check that matters most here, because
`/contact` prerenders as a static route and server actions on a static route were the one thing
that could have behaved differently on Vercel than under `next start`. In a browser: clicking the
CTA on `/writing` lands on `/contact` with the form present, submitting renders the failure panel
with the fields kept, a pre-filled `mailto:` and a copy button, and the console is completely empty.
A live POST returns `x-vercel-cache: BYPASS` with a two-region `x-vercel-id`, so it genuinely
reaches a serverless function rather than a cached response.

One thing seen and understood rather than fixed: a POST to `/contact` **without** the `$ACTION*`
hidden fields returns 500. That is Next.js refusing a server-action request it cannot resolve, it is
not reachable from any browser interaction, and it is what a hand-rolled inline probe was
accidentally doing when it briefly appeared to show a live failure (logged in `[[coding-mistakes]]`).

**Mutation coverage: `node scripts/mutation-check.mjs`, 19 of 19 caught.** The script is committed
rather than thrown away, because an earlier version of this note claimed a mutation count that
nothing in the repo could reproduce, which is trust dressed up as evidence. It breaks each guard on
purpose and restores it, including reinstating the dropped-on-timing regression and pointing the
call to action back at a `mailto:`. The CTA mutation survived the first pass, which is how that
guard came to exist at all. Run it before shipping anything that touches this feature; a guard that
survives its own mutation is decoration.
**Status (2026-08-20, later): the boot sequence regression is fixed.** The SEO commit added an
inline failsafe that removed `booting` after 4000ms. The sequence has a 6418ms floor, so on every
first visit the landing page was revealed 2.4 seconds early and sat underneath a BIOS screen that
was still typing. Reported by Fergus, confirmed live (`booting` went false at 5333ms with the
overlay still mounted).

The fix is ownership, not a bigger number: the animation is ~430 chained `setTimeout` ticks and a
hidden tab clamps each to about a second, so no fixed delay can win that race. `BootSequence`
disarms the failsafe on mount and re-arms it on unmount. Timings and the four-row ownership table
live in `lib/boot.ts`; `lib/boot.test.ts` executes the real inline script against a stub DOM.

Review caught that the first version of the fix opened an equally bad hole: with the failsafe
disarmed and no re-arm, clicking a nav link during the boot unmounted `BootSequence` and left the
whole site `visibility: hidden` until a hard reload. Two smaller regressions from the same SEO
commit went with it: `finish()` now reveals the page and drops the overlay on adjacent lines, and
the pre-hydration hero name no longer glows green on the amber and ice themes.

**Status (2026-08-20): SEO + GEO surface and a writing surface shipped.** The site went from
three routes and ~1,340 words with no `robots.txt`, no sitemap, no canonicals and no structured
data, to five routes with a full crawl surface and eight long-form articles. Read
`docs/superpowers/specs/2026-08-20-seo-geo-growth-design.md` first, then the SEO paragraphs in
`AGENTS.md`.

What is new:
- `lib/seo.ts` owns every URL and every schema.org node. One `@graph` per page so `@id`
  references resolve to a single `Person` rather than several thin duplicates. Canonicals are
  built from a constant so a preview deploy can never canonicalise to its own hostname.
- `app/robots.ts`, `app/sitemap.ts`, `app/llms.txt/route.ts`, `app/feed.xml/route.ts`, all
  generated from `content/`.
- `/writing` and `/writing/[slug]`, rendered by `lib/markdown.ts` (a hand-written subset parser
  returning typed blocks, never HTML strings, so there is no injection path to sanitise).
- `next/og` share cards for the site and every article. There was no OG image at all before.
- `content/` is true again: Tigh Sauna is present tense, Presterly is past tense with its figures
  moved to the past, and the `firespark` project became `tigh-sauna`. The holding company is named
  nowhere public and the Firespark image builder was deleted.

**Three things a reviewer caught that are worth carrying:**
1. `robots.txt` briefly disallowed `/_next/static/chunks/`. The inline pre-paint script hides the
   landing page and only `BootSequence` un-hides it, so that one line would have rendered a blank
   homepage to Google while every status code stayed 200. There is now a 4s failsafe in the inline
   script as a second line of defence. **Never block JS or CSS in robots.txt.**
2. The markdown fence detector and its lookahead disagreed, so a fence like ```` ```js {1,3} ````
   would have hung `next build` and `npm test` with no error. Fixed, plus a structural guard that
   throws if the parse cursor fails to advance.
3. Article body copy was on a token measuring 3.95:1 on the amber theme. `app/globals.test.ts` now
   computes contrast from the CSS tokens per theme.

Full detail in `[[coding-mistakes]]` and `[[coding-playbook]]`, dated 2026-08-20.

**Verification.** 322 tests green, `npm run build` clean at 29 static pages, and a route-walking
HTTP check (canonical, description length, JSON-LD parsing and carrying the Person entity,
absolute `og:image`, indexable word count, the h1 extracting as contiguous text) passing against
localhost, the `Dockerfile.parity` container, and production.

---

**Status (2026-08-07):** **v5 "Mass" is LIVE, and the cursor trail and the ambient whirr are now
gone from production too.** The live host is `https://fergusoreilly.dev` (`fergus-portfolio.vercel.app`
is an alias of the same deployment; both were checked). All three routes 200, 60 fps, one canvas
on the page, and an idle tube that is silent.

Read the deploy section below before shipping anything: `vercel deploy` from inside the repo has
been silently producing BLOCKED deployments since **25 July**, which is how the 4 August fix sat
on `main` for three days without reaching anyone. Production is in step with `main` again as of
today (the live CSS hash matches this tree's production build exactly), but treat any *older*
"shipped" claim in this file as needing a look at the live site before you believe it.

**Status (2026-08-04):** v5 "Mass" verified on `https://fergus-portfolio.vercel.app`: FergusOS 5.0
serving, all three routes 200, 59.9 fps with both shader passes and WebGL up, zero console errors,
and every feature exercised against production, not a local build. Gravity dropped 120 pieces with
none landing behind the status strip and restored the page cleanly; eject pulled back to the room
and docked again with the spacer released; sound went live and persisted. The deploy took longer
than the first 13 minutes of polling suggested, which is why an earlier commit here claimed it had
not shipped.

**What v5 is.** The tube became a machine: it has memory
(a GPU persistence buffer with real burn-in), mass (a rigid-body solver that drops the live
page on the floor and lets you throw it), a voice (everything synthesised at runtime, no audio
files), and a body (an `eject` that pulls the camera back to reveal the monitor on a desk in a
dark room, with the site still running inside it). Spec:
`docs/superpowers/specs/2026-08-04-mass-memory-voice-design.md`.

---

## Deploying this project: read this first (2026-08-07)

**Both ways of shipping this project are currently broken, and both fail quietly.** The project *is*
git-linked (`fergo5002/fergus-portfolio`, production branch `main`), so a push to `main` triggers a
deployment, and `vercel deploy` from the repo creates one too. Right now both are refused. A push
looks like it worked because git succeeded; a CLI deploy looks like it is building because the CLI
keeps polling. In both cases the API records:

```
readyState       BLOCKED
readyStateReason The Deployment was blocked because there was no git user associated with the commit.
seatBlock        { blockCode: "COMMIT_AUTHOR_REQUIRED", isVerified: false }
attribution      commitMeta { email: "oreillferg@gmail.com", isVerified: false }
```

Every deployment carries the commit author, whether it came from the git integration or from the
CLI reading git metadata out of the working tree. Vercel tries to map that address to the account
and refuses the deployment when it cannot. Nothing is aliased, production keeps serving the
previous build, and there is no error anywhere a person would look.

**The address it will accept is `oreillfe@tcd.ie`, and only that one.** That is the email on the
Vercel account (`fergo5002`) that owns the `larry-pm` team. Git metadata is not the problem in
itself: plenty of READY deployments carry it. An *unverifiable* author is the problem. All 31
deployments in this project's history line up on exactly that:

| Commit author on the deployment | Result |
|---|---|
| `oreillfe@tcd.ie` | READY (7 of 7) |
| none at all | READY (5 of 6) |
| `fergus.oreilly@hatch105.com` | BLOCKED (13 of 13) |
| `oreillferg@gmail.com` | BLOCKED (4 of 4) |

So this is not a Vercel change, it is **identity drift in this repo**. The commit author has moved
twice, and each move is visible in `git log`: 18 commits as `oreillfe@tcd.ie` (deploys worked),
then 21 as `fergus.oreilly@hatch105.com` from 25 July (deploys started failing), then 10 as
`oreillferg@gmail.com` from 4 August when the auth vault's identity routing was corrected (still
failing, for the same reason). The middle stretch is also a domain-boundary slip worth noting: a
personal repo was being committed to under the Presterly identity.

This is why the cursor-trail / ambient-audio fix (`e95870b`, 4 August) sat on `main` for three days
while production served the old bundle and the status line above claimed everything was live. The
first blocked deploy was actually 25 July, so anything "shipped" between then and now deserves a
second look.

Worked example, `e95870b` on 4 August: the push fired the git integration, which was BLOCKED
(`pgp5f2qko`), and a CLI deploy was BLOCKED too (`cye01t2hj`). Two refusals, no signal, three days
of production serving the old bundle.

**How to actually ship**, until the account side is fixed: pushing is not enough, and neither is
`vercel deploy` from the repo. Deploy a clean tree with no `.git` in it, so no attribution is
attached.

```bash
STAGE=/tmp/fp-deploy && rm -rf "$STAGE" && mkdir -p "$STAGE/.vercel"
git archive HEAD | tar -x -C "$STAGE"          # tracked files only, no .git
cp .vercel/project.json "$STAGE/.vercel/"
cd "$STAGE" && vercel deploy --prod --yes --scope larry-pm --token "$VERCEL_TOKEN_PERSONAL"
```

Then confirm `readyState` is `READY` **and** `aliasAssigned` is `true` via
`https://api.vercel.com/v13/deployments/<id>?teamId=<team>`. Do not trust the CLI's exit, and do
not trust `vercel ls` either: it renders BLOCKED as `UNKNOWN`, which reads like "still building".

Notes on the things that do not work:
- `--no-git-metadata` is not an option in CLI 58.4.4.
- `vercel build --prod` cannot run on this machine: it needs symlink permission and dies with
  `EPERM: operation not permitted, symlink '_not-found.rsc.func'`. So `--prebuilt` is out.

**The permanent fix is Fergus's to make**, since it is an account change: add and verify
`oreillferg@gmail.com` as an email on the Vercel account `fergo5002` (Settings → Account → Email).
That is the identity the auth vault routes `fergo5002`-owned repos to, so verifying it is the fix
that matches the routing rather than fighting it. Do not "fix" this by setting the repo's commit
email back to `oreillfe@tcd.ie`: that contradicts `~/.claude/auth/ROUTING.md`, which resolves
commit identity from the remote owner on purpose.

It is worth doing rather than living with the staging-tree workaround, because verifying that
address repairs the **git** path too. Once it is verified, a push to `main` ships again on its own
and none of the above is needed.

## Cursor trail and ambient whirr: shipped 2026-08-07

The removals landed in `e95870b` on 4 August. Getting them in front of a visitor took until the
7th, for the deploy reason above. Verified against the live site, not a local build:

- **Trail.** `https://fergusoreilly.dev` serves `_next/static/css/7c90e669ee3ca4f4.css` (the hash
  the local production build produces), with zero rules matching `cursortrail`, zero elements
  matching `.cursortrail`, and exactly one `<canvas>` on the page: `phosphor__canvas`. The second
  screen-blended full-viewport canvas is gone.
- **Whirr.** With an `AnalyserNode` spliced in front of `ctx.destination` on the live page and
  sound switched on: `degauss` peaked at **-11.7 dBFS**, so the meter is genuinely on the master
  bus and would catch a drone. The ten seconds of doing nothing straight afterwards measured
  **exactly 0.0** RMS. A separate run counted node construction: 17 nodes on enable (power-on
  voices plus the silent beam bus) and **0** over six seconds of idle.
- The live JS bundles contain none of the removed bed's constants (`5200` hiss highpass, `0.27`
  wobble, `0.008`/`0.024` hum harmonics) and do still contain `1700`, the beam bandpass that
  stays. `15625` survives once, correctly: `FLYBACK_HZ` still drives the power-on ramp.
- Prod-parity container (`Dockerfile.parity`, clean `npm ci` on Node 24) built, tested 133/133,
  served all three routes 200, and its CSS matched. 

---

## v5 "Mass": 2026-08-04

Branch `feat/v5-mass-memory-voice`.

- [x] **`lib/physics.ts`**: oriented boxes, SAT with a clipped two-point manifold, sequential
      impulses with warm starting, friction, restitution, sleeping, sweep-and-prune broadphase.
      Departs from Box2D-Lite on split impulses (no landing hop at restitution 0) and fixed
      sub-stepping (a backgrounded tab cannot teleport the pile through the floor). 24 tests,
      including a twelve-box stack that must not explode over 600 steps.
- [x] **`lib/audio.ts`**: runtime synth. Key clicks, relay clunk, the degauss sweep with its
      tremolo, collision ticks, power-on ramp, and beam hiss tracking scroll velocity. Inert
      without Web Audio rather than throwing. 14 tests.
      **Revised same day:** the continuous ambient bed (flyback whine, mains hum, phosphor
      hiss) was cut. It read as whirring, which it was. Nothing loops at rest now.
- [x] **`lib/eject.ts`**: the one definition of the screen rectangle, shared by the CSS
      transform and the shader that draws the bezel around it. 14 tests.
- [x] **`PhosphorScreen`**: two passes, ping-pong persistence at half resolution, burn-in in
      alpha under the two static strips, scroll-advected smear, degauss that drags the ghost
      before scrubbing it, impact lights, the power-on strike-and-open, and the room.
- [x] **`GravityStage`**: measures words with `Range` rects (zero mutation of the live page),
      drops clones carrying the real text, grab/throw/push/shake, springs home on release.
- [x] **`MachineControls`**: sound, gravity, eject as real buttons in the status strip, which
      is no longer `aria-hidden` (its readouts are hidden individually instead).
- [x] **Terminal**: `gravity`, `eject`/`dock`, `sound on|off`, key clicks, honest refusals
      under reduced motion.
- [x] **Boot**: a genuine cold start, ~5.4s, skippable.
- [x] 66 → 132 tests; build clean; verified on an Intel Iris Xe at 60 fps with both passes live.

### Decisions

- **Hand-rolled the solver.** A library was the obvious call and the wrong one: 90 kB for a
  page-drop effect, and the split-impulse change was needed regardless. See the spec.
- **8-bit render targets, not half-float.** WebGL1 half-float needs two extensions that mobile
  GPUs advertise inconsistently. The present pass dithers instead.
- **Gravity and eject are mutually exclusive.** The pile lives in viewport coordinates.
- **Nothing under `prefers-reduced-motion`.** Refused, not degraded, and the terminal says so.
- **`CursorTrail` is deleted.** It was a second full-viewport canvas, screen-blended at 50%,
  drawing a comet tail behind the pointer. Against v5's persistence buffer it read as a grey
  smear rather than phosphor, and it was drawing the same effect twice: the sim pass already
  deposits a glow under the pointer and decays it properly. Earlier sections of this file
  reference the component; they are history, the file is gone.
- **No ambient audio.** See the audio entry above. Do not reintroduce a resting tone.
- **The canvas stays visible during boot.** v4 hid it, which was right then and became the bug
  that made the entire v5 power-on invisible.

### Still to verify

**Low-end mobile is UNVERIFIED for v5.** The only measurement recorded above is a laptop iGPU.
This project has shipped a WebKit frame-rate collapse twice from exactly that gap (see
`[[coding-mistakes]]`, "Mobile 390 clean was a resized desktop viewport"). v5 adds a second
full-screen pass and, when ejected, a non-trivial SDF room. The room's per-pixel detail (dust,
wood grain, moulding grain) is gated off on the cheap path and the persistence buffer is half
resolution, but that is reasoning, not evidence. **Check a real or CPU-throttled phone before
treating v5's mobile performance as known**, and record the numbers here.

### Trap worth remembering

`npm run build` while `npm run dev` is running overwrites `.next` and leaves the dev server
serving production chunks against development RSC. It presents as React silently failing to
hydrate, with two confusing "RSC payload" errors and no component mounting. Restart dev after
any build.

---

## Mobile motion + layout: 2026-08-03

Branch `feat/mobile-motion`. Plan:
`docs/superpowers/plans/2026-08-03-mobile-motion-and-layout.md`.

**The finding that reframed the job.** Reported as "not a single animation works on mobile". They
all worked. `document.getAnimations()` listed every one of them running, with no console errors.
The phone could not paint them: **1 fps** on an iPhone 14 Pro (WebKit), **6 fps scrolling** on a
4x-throttled Pixel 7, against a 61 fps `about:blank` control. At 1 fps a 720 ms reveal is one
frame. Two layers each saturated the budget alone: the animated `background-position` on a fixed
full-viewport gradient, and the DPR-2 fullscreen shader.

This is the second time a "resized desktop viewport" mobile check has missed a WebKit frame-rate
collapse on one of Fergus's projects. See
`[[coding-mistakes#"Mobile 390 clean" was a resized desktop viewport]]`.

- [x] **Frame budget**: `scan-drift` composited instead of repainting; CSS scanline layer dropped
      on touch (the shader already draws them) with a static `html.no-webgl` fallback; tube at
      0.6 dpr / 30 fps on mobile (drawing buffer 780x1688 → 234x506, ~22x less fragment work per
      second); flicker, scroll-driven glass gradient, `backdrop-filter` and per-heading
      convergence all dropped on touch; `CursorTrail` no longer mounts on a coarse pointer; Lenis
      not mounted on touch
- [x] **Touch motion**: tap fires the shockwave from the point touched (`uTap`/`uTapPos`, touch
      only); press-to-tilt with tracking glare; perimeter beam runs once on release; press
      resolves an image to full colour; hero magnetism and shader ripple engage on touch and decay
      on release; every `:hover` rule gated behind `(hover: hover)`
- [x] **Mobile layout**: nav fits (was 464-539px of content in a 393px bar, so "cd projects" was
      off-screen on every route); hero name no longer breaks mid-word; terminal input 16px so iOS
      stops zooming; portrait leads the hero; tighter type and spacing; timeline spine stops
      holding a gutter
- [x] `lib/text.ts` + 6 tests for the word-grouping fix; 49 → 55 tests; build clean

**Measured after, throttled Pixel 7 (the realistic proxy):** idle 10-20 → **57-61 fps**, scrolling
6 → **27-36 fps**, all reveals firing (4/4, 3/3, 6/6), zero horizontal overflow, terminal input
16px, no console errors. Desktop unregressed. Re-verified identically against a Docker
prod-parity container.

> **Windows WebKit is a software rasteriser.** It reports 1-3 fps for this site *and* reports the
> same with every site layer forced off, so its absolute numbers are a floor, not a reading. Use
> the throttled Pixel as the proxy and verify the GPU reduction directly (canvas buffer size ×
> frame rate), which is what was done here.

> ## ✅ LIVE: deployed and verified in production 2026-08-03
>
> `https://fergus-portfolio.vercel.app` · deployment `dpl_8gj9gThbaMPhN63ZpSVsqhhWozGi` (Ready,
> no errors in build logs). Shipped with the documented CLI workaround (copy without `.git`,
> keep `.vercel/project.json`, `vercel --prod --yes`), because git-linked deploys on this repo
> are still silently Blocked: see "Why deploying was hard" below, which is unchanged.
>
> **Verified against the live URL, not localhost:** all three routes + `/icon.svg` return 200;
> the live CSS bundle contains every new marker (`webgl-ok`, `heroname__word`, `is-pressed`,
> `is-tracing`, `trace-once`, the `hover:none` block); on an emulated iPhone the canvas buffer is
> **234x506** (was 780x1688), the cursor-trail canvas is absent, Lenis is not mounted, the CSS
> scanline layer is off with `webgl-ok` set, and the nav fits (393/393). Press-and-release on a
> live project card: `is-pressed` + glare 1 + image resolving to colour, then fully cleared back
> to the resting duotone on release. Hero name occupies **one line box**. Zero console errors.
> Throttled Pixel 7 on production: **28-60 fps idle, 24-37 scrolling**, all reveals firing
> (4/4, 3/3, 6/6), zero horizontal overflow, terminal input 16px.
>
> **Honest caveat:** no physical iPhone was tested. Windows WebKit reports 1-3 fps for this site
> *and* reports the same with every layer forced off, so it is a software-rasteriser floor rather
> than a reading. The throttled Pixel is the proxy, and the GPU reduction was additionally
> verified rasteriser-independently as buffer size × frame rate (~22x less fragment work per
> second). Worth a look on Fergus's actual phone.

**Harness:** `phone-audit.mjs` (in the session scratchpad) runs the matrix. It has a hard
precondition that every referenced client chunk returns 200: a `next start` left holding the port
serves fresh HTML against a stale manifest, the page renders as static markup with nothing
running, and the harness then reports a serene 61 fps for a dead site. That happened twice during
this work before the guard was added.

## Real imagery: 2026-08-03

All six project slots and the hero portrait now carry real images, built reproducibly by
`scripts/build-images.mjs` (see the Images section of `AGENTS.md`).

- [x] Hero portrait from `IMG_1018.HEIC` (Dolomites), cropped 4:5. sharp cannot decode HEIC, so
      ffmpeg decodes to PNG first.
- [x] Presterly "P" and Loira "L" brand marks; Firespark rebuilt as its own lockup (ember spark
      + wordmark + product line) in the design language of firespark.vercel.app
- [x] Under the Campanile: real gameplay from the Trinity Front Square scene, showing the
      Campanile and the dynamic lighting Fergus wrote
- [x] Remand and ContraBot: authored SVG plates rather than stock imagery
- [x] Sauna OS entry replaced by **Firespark**, moved to second, role Co-Founder & CTO, linked
      to firespark.vercel.app
- [x] Imagery phosphor-duotoned at rest, full colour on hover, light cast on touch; hue is
      per-theme via `--duotone-hue`

## v4 "Phosphor": shipped 2026-08-03

Branch `feat/phosphor-motion-system`. Design forks were settled with Fergus up front: full
library arsenal, inertial scroll, all four set-pieces, generated placeholders.

- [x] `SystemProvider`: one rAF clock driving Lenis, shader, trail and status bar; per-frame
      state on a ref (never React state); settings persisted + restored pre-paint
- [x] `PhosphorScreen`: OGL fullscreen-quad GLSL: dot-matrix glyph rain, aperture grille,
      scanlines, barrel curve, hum bar, scroll-velocity beam smear + chromatic aberration,
      cursor magnetic ripple, degauss shockwave, three phosphor palettes, adaptive quality
- [x] `RasterReveal`: the house reveal (block paints in behind a travelling beam line)
- [x] Hero: per-character magnetic repulsion with RGB convergence loss
- [x] Boot: BIOS header, counting memory test, device list, loading bar, degauss → power-on
- [x] Terminal → mini-OS: tab completion with ghost text, ↑/↓ history, Ctrl+L, and commands
      that genuinely rewrite the site (`theme`, `crt`, `scanlines`, `matrix`, `degauss`,
      `neofetch`, `top`, `uptime`, `resume`, `open`, `sudo rm -rf /` → reboot)
- [x] Living cards: decrypt-on-scroll titles, cursor tilt + specular glare, perimeter beam
      trace, per-project signal meter; experience timeline draws its own spine
- [x] Ambient life: status bar (uptime/pwd/memory address/fps/coords), phosphor cursor trail,
      channel-change route transitions, 45s idle screensaver
- [x] `SignalPlate`: procedural per-project CRT alignment plates for empty image slots
- [x] Accessibility: skip link, focus moved to `main` on route change, full reduced-motion
      path (no Lenis, static shader, instant reveals, no trail, no screensaver)
- [x] Tests 16 → 49; `npm run build` clean; all routes still static

> ## ✅ LIVE: deployed and verified 2026-08-03
>
> `https://fergus-portfolio.vercel.app` serves v4 with the real imagery.
> Deployment `dpl_GELUnY6VoXn1xfHUamBjEg2juyty`.
>
> **Verified in production:** all three routes and `/icon.svg` return 200; all seven images
> return 200 and load in-browser at their real dimensions; the boot sequence, WebGL phosphor
> layer, Lenis, status bar (60 fps) and screensaver all run; `neofetch`, `uptime`, tab
> completion and `theme amber` → `theme green` all work against the live site and repaint the
> whole page; the projects grid is in the right order with no "Firecracker" or "Sauna OS"
> anywhere; live logs show only 200s and no errors.
>
> ### Why deploying was hard, so the next person does not lose an hour
>
> Three traps stacked on top of each other. Full detail is in `[[machine-map]]`.
>
> 1. **`.vercel/project.json` had the wrong org** (`team_MNEq2igKscCiR0E6Q2odcHCQ`); the project
>    lives in **`larry-pm`**. That made `vercel whoami` say "Not authorized" while the account
>    was perfectly logged in. Test auth with `vercel teams ls`, not `whoami`.
>    Fix: `vercel link --yes --scope larry-pm --project fergus-portfolio`.
> 2. **The repo IS git-linked, and every pushed deployment was silently Blocked**, which from
>    outside is indistinguishable from "no deploy was triggered". The dashboard gives the real
>    reason: the commit author (`fergus.oreilly@hatch105.com`) has no contributing access, and
>    the Hobby plan does not allow collaborators on private repos.
> 3. **The generated URLs are behind Vercel SSO** and 302 to a login page. Only
>    `fergus-portfolio.vercel.app` is public.
>
> **How this deploy actually shipped:** copy the repo to a temp directory **without `.git`**,
> keep `.vercel/project.json`, then `vercel --prod --yes` from there. No git metadata means no
> commit-author check.
>
> **Worth fixing properly** so `git push` just deploys: add `fergus.oreilly@hatch105.com` to the
> `fergo5002` Vercel account, or commit this repo as `oreillfe@tcd.ie` (the identity whose older
> commits deployed fine), or upgrade to Pro.

**Verified before ship:** production build served locally and exercised in a real browser,
boot, reveals on genuine wheel scroll (6/6 project cards), theme/crt/scanlines commands
mutating the live DOM and persisting, tab completion, route-change overlay + focus move,
screensaver appearing at 45s and waking on input, reduced-motion emulation, 390px mobile with
no horizontal overflow. 88–94 fps on desktop viewport.

## Done

- [x] Design spec: `docs/superpowers/specs/2026-06-02-fergusos-terminal-portfolio-design.md`
- [x] v1 build: landing + experience + projects, CRT theme, boot sequence, interactive
      terminal, content in `content/*.ts`, command parser + 13 passing tests. Build clean.

## Active plan: retro animations & boot fix  ✅ COMPLETE

Plan: `docs/superpowers/plans/2026-06-02-retro-animations-and-boot-fix.md`
(All tasks implemented on branch `feat/retro-animations`, one commit per task.)

- [x] **Task 1: boot-flash fix** (pre-paint blocking script + `.booting` hide rules)
- [x] **Task 2: CRT power-on transition** (boot → site reveal)
- [x] **Task 3: hero text scramble/decode** (`lib/scramble.ts` + `components/Scramble.tsx`)
- [x] **Task 4: ambient glyph-rain background** (`components/GlyphField.tsx`, all pages)
- [x] **Task 5: content tweak** (academic highlight → `1.1 / 4.0 GPA`)
- [x] **Task 6: verification + update this file**

## Backlog / owner-blocked

- [x] Hatch105 role + dates: resolved 2026-07-14: the entry is now Presterly
      (Co-Founder & CTO, May 2026 – Present, built inside Hatch105).
- [ ] Real images: owner drops into `public/img/` and sets paths.
- [ ] Decide whether to make the GitHub repo public (currently private).
- [x] First Vercel deploy: live at https://fergus-portfolio.vercel.app (2026-06-02).
- [x] **2026-07-14 content refresh DEPLOYED + LIVE-VERIFIED**: all three routes on
      https://fergus-portfolio.vercel.app serve the new content (Presterly highlights + bio,
      Loira AI entry, placeholder and stale dates gone; checked via compressed curl + string
      markers). The deploy ran outside the agent session (the local Vercel CLI was
      unauthorised at the time): if deploys are still CLI-based, `vercel whoami` needs a
      fresh `npx vercel login` before the next one.
- [ ] Add a favicon (prod logs a harmless `/favicon.ico` 404).
- [ ] (Optional) connect the GitHub repo to the Vercel project for auto-deploys: current
      deploy was a CLI `vercel deploy --prod`, not git-linked.

---

## Decision log

- **2026-08-04 (content refresh: skills, voice, live numbers)**: Fergus asked for the skills to
  match recent work and for the prose to read more relaxed, while still coming across as ambitious.
  - **The traction numbers were stale.** Checked against the Presterly production database
    (read-only Supabase MCP) rather than trusted. The **34** is deliberately conservative: `shops`
    shows 105 installed, but that includes dev and test installs, so the published figure is
    installed-and-not-uninstalled with 1,000+ customers. Fergus picked that framing over the raw
    count. See the new AGENTS.md section.
  - **The first pass at those numbers was wrong, and code review caught it before it shipped.**
    The draft paired the filtered 34 with *unfiltered* platform totals (426,000 customers, "over
    €20M", 296,000 predictions), which reads as though all of it sits inside those 34 brands.
    Rescoped to the same 34, the real figures are **423,624 customers, €19,897,852 and 292,745
    predictions**. So "over €20M" was simply false, by 0.5%. Published as 423,000 / nearly €19M /
    roughly 292,000, each rounded **down**.
  - **The currency was wrong too.** `orders.total_price` is stored in each shop's own currency and
    was being summed across them under a euro sign. Within the 34: **EUR €18,956,608 across 335,337
    orders, plus GBP £941,244 across 37,718**. "Nearly €19M" is now the EUR figure alone, which is
    true without the GBP and errs low. Never sum `total_price` across shops without grouping by
    `currency` first.
  - **"live across" became "installed on".** The query proves installation, not activation. Two
    different claims, and only one of them was evidenced.
  - **"kept current" was dropped from the prediction count.** A `count(*)` proves rows exist, not
    that they are fresh. No refresh cadence was verified, so the verb was not earned. (The previous
    copy's "~240,000 refreshed daily" could not be substantiated either.)
  - **Killed a claim that had become false.** The Presterly experience entry said he "shipped a
    hosted tier so a merchant never has to own WhatsApp infrastructure of their own". The hosted
    tier was built, but the hosted-by-default model was **superseded on 2026-07-27** in favour of
    merchant-owned WABAs with Presterly as Tech Provider. It now describes Embedded Signup and
    merchant ownership, which is what actually ships.
  - **Skills rebuilt from the manifests, not from memory.** Shopify (App Bridge, Admin GraphQL),
    Klaviyo, WhatsApp Business Platform, Twilio, Prisma, React Router 7, Tailwind, Kysely and
    Stripe Connect were all missing while being most of the day job. Phaser 3 was listed twice.
    **Polaris was deliberately not added**: only `@shopify/polaris-types` is installed and nothing
    in `app/` imports it, and a reviewer can open the repo. Loira-era tools (Fastify, FastAPI,
    BullMQ, Redis, pgvector) stay, at Fergus's call, because he did genuinely ship with them.
  - **Voice:** light touch, keeping the existing shape. The bio now opens on how he likes to build
    rather than on Presterly, per his note. Written to `~/.claude/LANGUAGE.md`, so no em dashes.

- **2026-08-04 (contact + links)**: Fergus asked for his personal GitHub, `fergo5002`, to be on
  the site alongside the Hatch one. Both are now listed, explicitly keyed **`github (work)`**
  (`oreillyfergus`) and **`github (personal)`** (`fergo5002`): chosen over two bare `github` rows
  because two rows both reading `github` tell a reader nothing. (An earlier draft of this entry
  claimed duplicate labels would "silently drop a row in React" via `key={c.label}` in
  `app/page.tsx`. That is wrong: the list is a static Server Component that never reorders, so
  both rows render and React only warns in dev. Do not key on something else "for safety".)
  A `contact` test asserts the labels stay unique and stay within the CSS column.
  - **`.contact__row`'s key column moved from `110px` to `18ch`.** `"github (personal)"` is 17
    characters and the keys are set in JetBrains Mono, so `ch` is exactly one character and the
    column can never be too narrow for its longest label. `max-content` is wrong here: each row is
    its own grid, so the four rows would size independently and the values would not line up.
    Measured in the parity container: all four keys resolve to 173px, values aligned at x=660.
  - **Firespark's project link now points at `https://firespark.dev`**, its own domain, not
    `firespark.vercel.app`, the platform URL it happens to be hosted on. Verified 200 before
    shipping (the apex 308s to `www.firespark.dev`; the href stays on the apex because that is the
    nicer address to show, and the extra hop costs nothing). The two mentions of the old URL further up
    this file are left alone: they are historical statements about what the design was copied
    from, and rewriting them would falsify the record.
  - **The em dash guard was content-only, and the bug was in `app/`.** `app/experience/page.tsx`
    and `app/projects/page.tsx` both shipped `"…: Fergus O'Reilly"` page titles while the suite sat
    green, which is a guard that produces the feeling of coverage without the coverage.
    `content/voice.test.ts` now walks every `.ts`/`.tsx` under `app/`, `components/`, `content/`
    and `lib/`, strips comments, and reports file and line. Proven to fail by reintroducing the
    exact title it missed. Its en-dash rule was also vacuous (it never scanned `dates` or `year`,
    the only fields containing one) and its regex rejected `"Feb – Jun 2026"`, which is real data.
    It now strips valid ranges and asserts nothing survives, so one good range cannot launder a bad
    dash elsewhere in the same string.
  - **New `content/links.test.ts`** guards every outbound href in `content/*.ts`: absolute,
    parseable, `https:`/`mailto:` only, plus both GitHub accounts and the Firespark domain. Nothing
    covered these before, so a typo in a public link shipped silently. Proven to fail against the
    old URL before it was kept.

- **2026-08-03 (mobile)**: Design forks settled with Fergus up front: touch becomes a real input
  ("the finger is the beam") rather than scroll-only ambient; **no gyroscope** (iOS needs a
  permission prompt behind a gesture, which is friction on a page a recruiter opens once); a
  purpose-built mobile layout rather than bug-fixes-only; and the shader kept on mobile but at
  reduced resolution rather than removed.
  - **Deviation from the brief (deliberate):** the chosen touch package included a phosphor trail
    following the finger. Implemented in the **shader** (its existing pointer glow, re-enabled on
    mobile while a finger is down) rather than as a second canvas. A fullscreen blended canvas is
    precisely the class of layer the performance work was removing, so adding one back to draw a
    trail would have undone the fix it was bundled with.
  - **Reverted mid-flight:** project images were briefly forced to 4:3 on mobile on the reasoning
    that 16:9 wasted height. That is backwards: 4:3 is the taller frame, so it added roughly 65px
    to every card and cropped images authored as 16:9. Ratios are left as authored.

- **2026-07-14**: Content refresh for the Null Fellows application: Presterly added as lead
  experience + top project (with live traction numbers pulled from the Presterly memory notes),
  Larry → Loira AI (Founding Engineer, Feb–Jun 2026, loira.ai; the old "CTO & Co-Founder /
  Feb 2025 – Present" copy was wrong on both counts), homepage highlights now
  startup/accelerator/academic. Em dashes removed from prose copy per LANGUAGE.md; pre-existing
  em-dash title separators (layout/page titles, education line) left as shipped design.

- **2026-06-02**: BUGFIX (post-merge): the Task 1 boot-flash rule blanked the screen on a
  fresh session: `.booting .screen { visibility:hidden }` also hid the `.boot` overlay (which
  is rendered inside `.screen` via BootSequence), so the boot played invisibly and visitors saw
  only the nav on a blank screen. Fix: hide screen/nav/glyphfield as chrome while booting and
  opt `.boot` back into `visibility:visible` (it's fixed/opaque/z-9500 and covers everything);
  added `suppressHydrationWarning` to `<html>` (pre-paint script mutates its className).
  Verified with Playwright on both localhost and prod (commit bff8e06). Skills content also
  refined (dropped interests; added Railway/Docker/Playwright/Vitest etc.).
- **2026-06-02**: Deployed to Vercel via CLI under scope `fergo5002s-projects`: new project
  `fergus-portfolio`, live at https://fergus-portfolio.vercel.app. The personal scope had two
  existing projects (`sauna-os`, `barristersdirectrework`) but no project-count limit was hit,
  so `barristersdirectrework` was left untouched. Deploy is CLI-based, not git-linked.
  **Wrong, corrected 2026-08-07:** the project has a GitHub link (`fergo5002/fergus-portfolio`,
  production branch `main`) dated to its creation, so pushes have always triggered deployments too.
  This line is why later sessions, including the one that shipped the cursor-trail fix, assumed a
  push could not deploy and did not check whether one had.
- **2026-06-02**: Stack chosen: Next.js 15 + React 19 + TS, hand-written CSS (no Tailwind),
  no animation libs. Content in `content/*.ts`. Reduced-motion gating mandatory.
- **2026-06-02**: Style direction: CRT terminal (green primary `#33ff66`, amber accent
  `#ffb000`). Public email = gmail; phone omitted.
- **2026-06-02**: Retro-animation upgrade researched & planned (digital-rain background,
  CRT power-on transition, hero scramble, theme-flash-pattern boot fix). See active plan.
- **2026-06-02**: RESOLVED: owner confirmed the Scholarship reference should go everywhere.
  Removed "and sitting the Foundation Scholarship examinations" from the bio in
  `content/profile.ts`. (Academic highlight → "1.1 / 4.0 GPA" still handled by plan Task 5.)
- **2026-06-02**: Retro-animation plan EXECUTED on branch `feat/retro-animations` (commits
  9e5a2c5 → 838eac9, one per task): boot-flash fix, CRT power-on, hero scramble (+16 unit
  tests), ambient glyph-rain, academic highlight → "1.1 / 4.0 GPA". `npm test` 16/16 green,
  `npm run build` clean.
  - **Deviation from plan (approved):** Task 1's pre-paint script is gated on
    `location.pathname === "/"`. The plan added `.booting` globally, but `BootSequence` (which
    clears the flag) only mounts on the landing page: so a fresh-session direct visit to
    `/experience` or `/projects` would have stayed permanently hidden. Gating the script to the
    landing page keeps boot a landing-only intro and lets other routes render instantly.
  - **Verification note:** automated checks (tests + build) pass. The visual pass: fresh-tab
    boot (no flash) → power-on → hero scramble; glyph-rain on all 3 routes; reduced-motion
    static fallbacks; 375px mobile; tab-switch pauses the canvas: was NOT run in a browser
    here (this machine tests on deployed prod). Do this on a Vercel preview before merging.
