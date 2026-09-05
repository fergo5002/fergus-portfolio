# AGENTS.md: start here

Onboarding for any AI agent or developer picking up this project. Read this top-to-bottom
before touching code. (Claude Code, Cursor, Copilot, and others read `AGENTS.md` by default.)

## What this is

**FergusOS Terminal**: Patrick Fergus O'Reilly's personal portfolio, styled as a retro CRT
computer terminal (green phosphor + amber accent, scanlines, boot sequence, interactive
command line). Ten routes: landing (`/`), experience (`/experience`), projects
(`/projects`), writing index (`/writing`), articles (`/writing/[slug]`), contact
(`/contact`), tools index (`/tools`), the headline checker (`/tools/headline-check`), Overlap
(`/tools/overlap`) and the MCP documentation page (`/mcp`).

Plus three API routes. **`/api/mcp` is a Model Context Protocol server**, unauthenticated because
everything it returns is already on the pages, with six tools that all read from `content/` so it
cannot say something the site does not. Read `lib/mcp.ts`'s docblock before touching it: it names
the spec revision it implements and the URL that revision was read from. That matters more than
usual here, because revision `2026-07-28` **deleted** the `initialize` handshake and moved to
per-request metadata, so anything written from memory ships the wrong protocol. It answers both
eras on purpose: modern statelessly, and the old handshake because that is what shipped clients
still open with.

**`/tools/headline-check` fetches a URL a stranger typed**, which makes it the only thing on this
site with a real attack surface. `lib/headline-fetch.ts` refuses private, loopback, link-local and
reserved addresses on the typed URL and again on every redirect hop, checks every DNS answer
rather than the first, and caps time and size. Its docblock states the gap it does not close (DNS
rebinding) and the thing that bounds it (the content type is checked before any body is read).
Do not weaken either without reading that first.

**`/tools/overlap` reads a LinkedIn connections CSV in the browser.** The file and names never
leave that browser. A peer receives salted, truncated hashes, the salt and the list count over a
direct WebRTC data channel. This is not private-set intersection: the peer learns the count, sees
the connecting IP address, and can try likely profile slugs against the salt. The optional room
service holds opaque offer/answer SDP for at most ten minutes and a daily-changing address hash for
the one-hour budget window. Manual copy and paste skips that room service but still needs WebRTC;
by default it uses Cloudflare STUN, and there is deliberately no TURN relay. Both routes can fail
on restrictive networks. Protocol unit tests use in-memory channels, and the browser proof so far
is two local Chromium contexts, not two real networks. Keep those boundaries visible in the copy.

**The site is also a search and answer-engine surface**, which is a second set of constraints on
top of the CRT premise and does not bend to it. Every route carries a canonical URL and JSON-LD;
`/robots.txt`, `/sitemap.xml`, `/llms.txt` and `/feed.xml` are generated from `content/`, never
hand-maintained. `lib/seo.ts` is the only place a URL or a schema.org object is built. Read
`docs/superpowers/specs/2026-08-20-seo-geo-growth-design.md` before touching any of it.

**The rule that keeps biting:** a visual effect that fragments text also fragments it for
crawlers. The hero name is animated one character per element, and for a while that meant the
most important string on the domain extracted as `P a t r i c k F e r g u s O ' R e i l l y`.
`HeroName` now renders **only** the plain contiguous name on the server, and swaps in the
per-character layer after mount. Rendering both at once was the first attempt and it left the
h1 saying the name twice with nothing between them (`O'ReillyPatrick`), so the swap is the
fix, not an optimisation. `aria-label` does not solve this: it is an accessibility property
rather than content, and a text extractor has no reason to read it.

Any new per-character, scrambled, typewriter or canvas-rendered text effect must leave a whole
copy of its words in the server HTML, or it is quietly costing the site the words it decorates.

**And the converse, which cost more than the first one did: decorative text belongs in CSS.**
The same rule read the other way. If a string is on the page to set a mood rather than to be
read, it must not be in the document competing with the prose. Measured against the live site
on 2026-08-21, a plain HTML-to-text extraction of any article opened like this:

```
fergus @ portfolio : /writing/why-presterly-wound-down $ cd ~ cd experience cd projects
cd writing fergus @ portfolio : ~/writing $ cat ./writing/why-presterly-wound-down.md
Why we wound Presterly down
```

Roughly 150 characters of terminal costume in front of the first real word, in the part of the
page a retrieval step reads first. On the landing page about 190 of 548 extractable words were
chrome. Separately, all 46 article headings extracted as `#The actual reason`, because the
anchor-link glyph was a real `#` text node.

`aria-hidden` does **not** fix this, for exactly the reason `aria-label` did not fix the hero
name: it is an accessibility property and a text extractor has no reason to read it. The only
thing that removes text from extraction is not putting the text in the document. `PromptLine`
now passes its parts as CSS custom properties and `app/globals.css` draws them with `content`;
the spans stay so the per-part colours stay with them. The heading anchor is drawn the same way.
`components/chrome.test.ts` is the guard.

**It has come back twice since, both times as a `$`,** which is why the guard now covers three
files rather than one. `Terminal.tsx` wrote the separator and the dollar as text while the
stylesheet was already drawing them, so the live home page read `fergus@portfolio::~ $$` until
2026-09-03. Then the status bar's prompt button shipped a `<span aria-hidden="true">$</span>`,
which put a `$` in front of every page's words on every route. A one-character string still feels
too small to be content, and that instinct is the bug. The test for it: if the string is there to
set a mood, it goes in `content`, whatever its length, and whether or not it is server-rendered
decides only how much it costs. Client-only costume is fine as text, which is why `.shell__title`
("fsh") stays: the drawer renders nothing until somebody opens it.

The nav is the deliberate exception. Its links read `cd experience` rather than `Experience`,
which is weak anchor text, but they are real navigation and a crawler needs to follow them.
That is a design call, not a bug, and it is Fergus's to change if he ever wants to.

**And never disallow `/_next/` in `robots.txt`.** The inline pre-paint script adds `booting` to
`<html>` on the landing page, `.booting` hides the content, and `BootSequence` is what clears it
properly. Block the chunk it ships in and a rendering crawler sees an empty homepage while every
status code stays 200. There is a 4s failsafe in the inline script, and it bounds that exposure
rather than removing it. It is not a licence to block scripts.

**`booting` hides the whole site, so exactly one thing may own clearing it at any moment.** The
ownership table is in `lib/boot.ts` and it is four rows, not two. Read it before touching the boot
path. Two rules came out of getting it wrong, both of which shipped:

- **Never tune a delay to outlast the animation.** The sequence is ~430 chained `setTimeout` ticks
  and a hidden tab clamps each to about a second, so its wall-clock length is unbounded. A 4000ms
  failsafe against a 6418ms floor revealed the landing page underneath a still-typing BIOS screen
  on every first visit. The failsafe answers "did the JavaScript arrive", nothing else, and
  `BOOT_FLOOR_MS` is deliberately not an input to it.
- **Disarming a safety net means inheriting every path it covered.** `BootSequence` disarms the
  failsafe on mount and must re-arm it on unmount. Without that, clicking any nav link while the
  BIOS is typing unmounts `BootSequence` (it lives in `app/page.tsx`) and leaves the entire site
  `visibility: hidden` until a hard reload.

`lib/boot.test.ts` executes the real inline script against a stub DOM. Its `BootSequence` greps are
a coupling check only: vitest runs in a `node` environment here, so nothing can mount the component.
If you change the boot path, delete your fix and confirm the suite goes red before trusting it.

**Nothing on this site may fail silently, and `/contact` is where that rule was written down.** The
call to action was an `<a href="mailto:...">` labelled "Email me", and on a machine with no mail
client registered, which is most of them, clicking it does nothing at all: no error, no tab, no
feedback. Fergus reported it as a dead button. It now goes to `/contact`, and three rules came out
of building that page:

- **A control that can do nothing must not be rendered.** The copy button on the failure panel is
  rendered only once `navigator.clipboard.writeText` is known to exist, and the `mailto:` escape
  hatch is offered beside it rather than instead of it, precisely because a `mailto:` is the thing
  that cannot be relied on.
- **The form works with JavaScript off.** It is a real `<form>` posting to a server action,
  enhanced by `useActionState` rather than dependent on it. `key={state.seq}` on each input is what
  survives React's post-action form reset with the visitor's words still in it. Prove it the way it
  was proved the first time: POST the multipart form with its `$ACTION*` hidden fields against a
  production build and read the outcome off the HTML that comes back.
- **A spam filter that can misfire on a human is worse than the spam.** A caught submission is
  reported as "sent" without sending, so anything that can trip it on a real person silently eats
  their message. Two consequences, and the second one shipped as a bug before review caught it:
  the honeypot is named `hp` and not `website`, because a name a browser's autofill recognises is
  a name it will fill; and **only the honeypot may discard anything.** The timing floor merely
  marks a message with `[fast]` in the subject. It used to drop them, which meant a visitor who
  autofilled two fields and pasted a prepared message was told "Sent." while it went nowhere.
  Never give a soft signal the power to delete.

Sending goes through Resend over plain `fetch`, no SDK. `RESEND_API_KEY` is the only required
variable and it **is set** on the Vercel project (production, preview and development), with a copy
in the DPAPI vault. `CONTACT_TO_EMAIL` and `CONTACT_FROM_EMAIL` are optional overrides and neither
is set.

**Do not move the destination without reading the `DEFAULT_FROM` docblock in `lib/contact.ts`
first.** The sender is Resend's shared `onboarding@resend.dev`, which needs no DNS but may only
deliver to the address the Resend account is registered under. That happens to be the same address
the form sends to, which is the only reason the zero-config setup works. Point `CONTACT_TO_EMAIL`
anywhere else without first verifying a domain and setting `CONTACT_FROM_EMAIL`, and every send
starts coming back 403.

**Before shipping anything that touches this feature, or any of the brightness constants, run
`node scripts/mutation-check.mjs`.** It breaks each guard on purpose and expects the suite to
notice. Forty mutations, forty red at the time of writing. A guard that survives its own mutation is
decoration, and this repo has shipped one of those before. It caught one again on 2026-08-20: an
assertion for `audio.key()` matched the docblock that mentions `audio.key()`, so deleting the actual
call left 438 tests green.

**Mutate the constants you deliberately left alone, too.** Ten of the forty exist because a review
pointed out that seven asserted-unchanged numbers (the deflection offsets, the ripple, the power-on
strike) had never been shown to bite, so a full-red run was reading as complete coverage while those
guards were decoration.

**A shader constant is not a brightness. Never tune one without measuring the pixels.** The
persistence buffer in `PhosphorScreen.tsx` is 8-bit and clamped to 1.0 on every frame, and it
integrates about twenty frames of deposit at 60fps. The ring constants used to sit roughly fourteen
times over that ceiling, so on 2026-08-20 halving the degauss from 0.85 to 0.425 changed the picture
by about two percent while every test passed, the mutation run went fully red, and the new values
were confirmed live in the served bundle. Every signal said shipped and the flash was identical. The
numbers in that file are now solved backwards from the composite peak that lands on screen and are
deliberately not round. The way to check one is `gl.readPixels` on a strip of the canvas across the
event, comparing old against new in the same browser at the same frame rate: a grep only tells you
where a constant is, never what it looks like.

As of v4 ("Phosphor") the site does not merely *depict* a CRT, it *behaves* like one. Every
effect derives from one premise: an electron beam painting phosphor behind glass. Scroll
velocity is beam velocity, the cursor is a magnet near the tube, a route change is a channel
change, idle time is a burn-in risk. Read
`docs/superpowers/specs/2026-08-03-phosphor-motion-system-design.md` before adding motion,
new effects must follow from that premise or they will look like unrelated tricks.

**v5 ("Mass") extends the premise from a tube to a machine.** A real CRT has three things v4
could not express, and each one is now a subsystem:

- **Memory.** Phosphor keeps glowing after the beam has gone, and a tube that has shown the
  same nav bar for ten minutes keeps a ghost of it. `PhosphorScreen` is now two passes with a
  ping-pong persistence buffer (RGB = short decay, alpha = burn-in). Nothing else may write
  light directly to the screen: emitters deposit into the sim buffer and let it decay.
- **Mass.** The page is made of objects. `lib/physics.ts` is a real rigid-body solver and
  `GravityStage` drops the live text into it. Collisions feed the same frame the shader and
  the synth read, so an impact lights the phosphor and clicks at the same instant.
- **Voice.** `lib/audio.ts` synthesises everything at runtime; there are no audio files and
  there must not be. Off by default, every method inert until enabled, and **silent at rest**:
  it had a continuous ambient bed (flyback whine, mains hum, phosphor hiss) and that turned out
  to be a drone people mute. Nothing loops now except beam noise, which is zero until you
  scroll. Do not reintroduce a resting tone.
- **Body.** `eject` pulls the camera off the glass. `lib/eject.ts` is the single definition of
  where the screen sits, because CSS scales the DOM into a rectangle that the shader draws a
  bezel around, and they have to agree to the pixel.

Spec: `docs/superpowers/specs/2026-08-04-mass-memory-voice-design.md`.

## What the site may keep, and where (amended 2026-09-03 for the toolshed)

Three rules moved when the toolshed programme started. They are the constitution for every tool
that follows, and a reviewer checks a tool against them, not against the spec that proposed it.

**1. State the visitor asked for.** "No cookies, no local storage" was written about analytics and
it stays true for analytics: PostHog is cookieless and nothing identifies a visitor. Beyond
analytics, the site may keep on the visitor's own machine only what the visitor explicitly saved
(a Drift voice profile, arcade initials, a saved report), never anything used to recognise them.
Every such key is either `fergusos_settings` or starts with `fergusos:`, so the `forget` command
can wipe all of it without knowing their names, and it prints what it wiped. Settings equal to the
defaults are not written at all (`saveSettings` removes the key), so a visitor who changed nothing
has nothing stored. Session storage holds one flag, the boot marker, which dies with the tab.
The arcade writes exactly one key, `fergusos:arcade.initials`, and only when a visitor posts a
score. Whether the door has been found this session, and the last board it read, live at module
level in `lib/arcade/session.ts` and die with the tab: nothing about the arcade is persisted except
the three characters somebody chose. `lib/forget.test.ts` walks the tree for every `setItem` call
and fails on one it cannot vouch for, so a new key is a deliberate line in that guard.
Server-side, the site holds anonymous aggregates only: a heat map of pointer wear, three-letter
initials with a score, per-IP budgets that expire within a day. Nothing keyed to a person.

**2. Styling.** `app/globals.css` stays the shell's stylesheet. A tool may own
`app/tools/<slug>/tool.css`, imported by its own page and nowhere else. Ten tools appending to
one file would spend the programme resolving merge conflicts.

**3. Dependencies.** The "reach for CSS first, earn every dependency" rule holds. The dependencies
this programme earns, each with the reason on its own PR: `@duckdb/duckdb-wasm` (Second Visit),
`@upstash/redis` (budgets, Burn, boards), `@neondatabase/serverless` (census, Tide cache),
`@vercel/blob` (reports), `@vercel/functions` (WebSocket upgrade, if the spike passes),
`playwright-core` plus `@sparticuz/chromium` (On the glass), and `playwright` as a devDependency
for the phone check. Nothing else without an argument.

## Stack & conventions

- **Next.js 15 (App Router) + React 19 + TypeScript.** Server Components by default; only
  interactive pieces are `"use client"`.
- **Styling: hand-written CSS in `app/globals.css`. No Tailwind, no CSS-in-JS.** The theme is
  driven by CSS variables at the top of that file (`--green`, `--amber`, `--bg`, spacing,
  `--glow`). Three phosphor themes are defined as `html[data-theme="..."]` blocks; their
  matching shader colours live in `THEME_PHOSPHOR` in `lib/system.ts`: change both together.
  Since the toolshed programme (2026-09-03) a tool may own `app/tools/<slug>/tool.css`,
  imported by its own `page.tsx`; `globals.css` stays the shell's. The tools list lives in
  `content/tools/`, one file per tool, and every tool renders through
  `components/tools/ToolPage.tsx`.
  `/tools/drift` measures Burrows's Delta against a reference population built from the visitor's
  own pieces, in the browser, by `lib/tools/drift/reference.ts`, which imports nothing but the
  tokeniser. `lib/tools/drift/corpus.ts` is the only module allowed to import `content/articles`
  and it exists only for the worked example the page renders at build time, so `page.tsx` is the
  only production file that may import it. It saves a profile, reference table included, under
  `fergusos:drift-profile`, built from `OWNED_PREFIX` so `forget` wipes it, and it writes that key
  in exactly one place, behind the save button. `app/tools/drift/page.test.ts` counts the writes.
  `/tools/relief` draws a year of dated events as contour
  ground. The marching squares in `lib/tools/relief/contour.ts` are lifted from Tigh Sauna's
  `apps/site/src/lib/survey/terrain.ts` and the file says so; the rest of
  `lib/tools/relief/` is pure and tested, and `app/tools/relief/ReliefTool.tsx` is wiring. It
  adds no dependency: the canvas is the browser's, the SVG is a string, and the binary STL is
  84 bytes plus 50 a triangle written into a `DataView`. `d3-contour`, `three` and `papaparse`
  were each considered and refused on the record in the plan. The GitHub token lives in React
  state, goes into one `Authorization` header built by `githubUrl()` behind an origin fence,
  and is never written anywhere; `lib/tools/relief/safety.test.ts` greps the whole tool for a
  storage API, for any direct `fetch` call at all (there are none: `github.ts` takes a
  `fetchImpl` and the component hands it `window.fetch.bind(window)` in one place), and for any
  URL literal outside `github.ts`. `draw.ts` holds no colour of its own and throws
  `ReliefPaletteError` when a theme token is missing, rather than painting black on black.
- **Animation libraries (changed in v4):** `lenis` (inertial scroll), `ogl` (the WebGL
  phosphor shader) and `motion` (springs). v5 added no dependencies: the physics solver and
  the synth are both hand-written, because a physics engine that ships 90 kB to drop some
  words on the floor has misjudged the trade, and every sound here has to be parameterised by
  live state rather than triggered as a sample. The previous "no libraries at all" rule is retired,
  but the spirit stands: **reach for CSS first.** Most effects here are CSS keyframes plus an
  IntersectionObserver, because a one-shot reveal gains nothing from a runtime. `motion` is
  used only for `Magnetic`, where a spring settle is genuinely hard to hand-roll.
- **One frame clock.** `SystemProvider` owns the single `requestAnimationFrame` loop; Lenis,
  the shader, the cursor trail and the status bar all subscribe via `onFrame`. Never start
  another rAF loop, and never `setState` from inside a frame callback: per-frame values are
  mutated on the `frame` ref and published as CSS variables (`--scroll-v`, `--scroll-p`).
- **All editable content lives in `content/*.ts`**: never hard-code copy in components.
- **Accessibility is non-negotiable:** every animation must be gated behind
  `@media (prefers-reduced-motion: no-preference)` (CSS) or a `matchMedia` check (JS) with a
  static/instant fallback. Under `reduce`, Lenis is never mounted, the shader draws one static
  frame, and reveals apply instantly. Keep text contrast ≥ 4.5:1, alt text on images, visible
  focus. Every live tool route is driven through WebKit at 390 and 320 and a throttled
  Chromium in CI by `scripts/phone-check.mjs`, which fails on overflow, inputs under 16px,
  tap targets under 44px and sampled contrast under 4.5:1, and also on a route that leaves
  more than two text runs unread or whose photograph is not the layout its rectangles were
  measured in. A resized desktop window does not count. Its self-test pins every floor from
  both sides and asserts three hand-computed contrast ratios, so loosening one is red rather
  than quiet; read that file's header before changing a number in it.
  **A `(hover: none)` rule is about the finger and applies on a 27" touchscreen too.** Pair it
  with a width when the rule is really about running out of room: the touch status bar block
  in `globals.css` was one block doing both and dropped a readout on any touchscreen, which
  the phone check cannot see because it only drives 320 and 390. `app/globals.test.ts` guards
  the split.
- **No backticks inside the GLSL.** The shaders are template literals, so a backtick in a
  comment terminates the string and the build fails with a syntax error hundreds of lines from
  the real cause. This has now bitten twice.
- **Never pre-hide a scroll-revealed element with `clip-path`.** IntersectionObserver folds an
  element's own clip into its intersection rect, so the element hides itself and is then never
  told to appear. Hide with `opacity` (which IO ignores) and keep the clip inside the
  keyframes. This bit once; the rule is in `globals.css` next to `.raster`.
- **Path alias:** `@/*` → repo root (e.g. `@/content/profile`).
- **Analytics:** `@vercel/analytics` renders `<Analytics />` at the end of `<body>` in
  `app/layout.tsx`. It returns null and appends its script to `<head>`, so the placement is
  about staying mounted, not about the DOM. Development loads Vercel's debug script and
  reports nothing, so local work never lands in the numbers.
  **Never verify a deploy by curling `/_vercel/insights/script.js`.** That is only the
  package's fallback string; a real deployment serves the loader and the view beacon from a
  per-deploy hashed path, so the pretty path 404s while analytics works fine. Check the
  beacon POST returns 200 in a browser instead, and give the landing page 15 to 20 seconds,
  because the boot sequence delays hydration.
  Adding a new dependency here may need a one-off `npm install --legacy-peer-deps`:
  `@vercel/analytics` declares an optional `@sveltejs/kit` peer whose own chain wants vite@8,
  against vitest's vite@5, so a fresh resolve dies with ERESOLVE on a framework this project
  will never use. The committed lockfile installs clean under strict peers (`npm ci` and
  `npm install` both), so do **not** paper over it with a repo-wide `.npmrc`: that would
  silently disable peer checks for `next`/`react` too.
- **PostHog (added 2026-08-21) is the GEO instrument, and it is cookieless.**
  `lib/analytics.ts` holds every constant and every decision, as values, so they can be
  asserted. Four things about it are easy to break by accident:
  - **`cookieless_mode: "always"`.** No cookies, no local storage, no banner. Fergus chose it
    on 2026-08-21. Get it wrong and the site starts setting tracking cookies on EU visitors
    with nothing in front of them, everything keeps working, and no test would notice, which
    is why there is one that does.
  - **And the SDK option is only half of it.** The PostHog *project* needs
    `cookieless_server_hash_mode` on. It is off by default, it is not in PostHog's settings UI,
    and with it off the browser's events get `200 {"status":"Ok"}` and are silently dropped
    while server-side events keep arriving normally. If pageviews go quiet but crawler events
    keep flowing, that is the first thing to check. `docs/measurement.md` has the API call.
  - **Session replay is therefore off, and that is an entailment rather than a preference.**
    Replay needs somewhere to keep a session id and cookieless removes it, so PostHog would
    disable it anyway. It is set explicitly so it reads as a consequence, not a bug to fix.
  - **Events go through `/ingest`,** rewritten to PostHog in `next.config.ts`. That is what
    `skipTrailingSlashRedirect: true` is for, and **that switch is why `middleware.ts`
    exists**: it turns off Next's trailing-slash normalisation for the whole site, so the
    middleware puts it back for everything except the proxy. Remove one and you must remove
    the other, or `/writing/` starts serving a duplicate of `/writing`.
  - **`middleware.ts` is the only thing that sees an AI crawler.** The pages an engine cites
    are static, so a crawler fetching one runs no server code at all. `lib/crawlers.ts` splits
    them into training, search-index and user-fetch, and `user-fetch` (`ChatGPT-User`,
    `Claude-User`, `Perplexity-User`) is the number worth watching: it means a person asked a
    question seconds ago and the model came here to answer it. Note that `Google-Extended` and
    `Applebot-Extended` are robots.txt tokens that never appear as user agents, so they are in
    `robots.ts` and deliberately not in the detection table.

  `next.config.mjs` became `next.config.ts` in the same change, so the proxy rules could be
  imported rather than retyped. Nothing else about the config moved.

## Commands

```bash
npm install        # first time
npm run dev        # http://localhost:3000
npm run build      # production build (must stay clean)
npm test           # vitest unit tests (must stay green)
npm start          # serve the production build
```

Deploy: Vercel. The project is git-linked (`fergo5002/fergus-portfolio`, production branch `main`),
so **a push ships**. The repository is **public** since 2026-09-03, and that is what makes the
sentence true: on the Hobby plan a private repository's git deployments were landing in `BLOCKED`
("Git author fergo5002 must have access to the project on Vercel to create deployments"), with no
alias, production untouched, git exiting 0. Observed as late as 2026-09-02 on commits authored as
the account's own address. After the flip the same author's preview check passed and the merge of
PR #1 produced production deployment `dpl_4DPMWyNeL3FKBmYfcuTqJwibyc2F` as `readyState: READY`
with the commit SHA attached. The temp-directory CLI shipping that carried the site while it was
private is retired; if a git deployment ever comes back `BLOCKED`, that is a finding to report, not
a reason to reach for it.

`main` requires the `check`, `mutation` and `phone` GitHub Actions jobs from `.github/workflows/ci.yml`
(types, tests, build; then the mutation check). Code goes through pull requests. Docs-only commits
may land on `main` directly. **Confirm every deployment the same way regardless**: read `readyState`
and `aliasAssigned` from `https://api.vercel.com/v13/deployments/<id>?teamId=<team>`, or list them
with `v6/deployments?projectId=...&teamId=...&target=production`. Do not trust the CLI's exit code,
and do not trust `vercel ls`, which renders `BLOCKED` as `UNKNOWN` and reads like "still building".
Every Vercel CLI call passes `--token "$VERCEL_TOKEN_PERSONAL" --scope larry-pm`; without the
token flag the CLI reads the wrong account's `VERCEL_TOKEN` and reports "The specified scope does
not exist". Live host is `https://fergusoreilly.dev`.

## Layout of the repo

```
app/            layout (fonts, metadata, CRT shell) + the 3 routes + globals.css + icon.svg
components/
  system/       SystemProvider (frame clock + settings + synth), PhosphorScreen (WebGL tube:
                persistence sim + present + room), StatusBar, MachineControls,
                Screensaver, RouteTransition, EjectRig
  physics/      GravityStage (measures the page, drops it, puts it back)
  motion/       RasterReveal (the house reveal), HeroName, TiltCard, Magnetic, TimelineSpine
  *.tsx         CrtShell, Nav, BootSequence, Typewriter, Terminal, Window, ImageFrame,
                SignalPlate, PromptLine, ProjectCard, ExperienceItem, Scramble
content/        profile.ts, experience.ts, projects.ts, skills.ts   <-- edit content here
lib/            commands.ts (pure terminal parser + tab completion), system.ts (bus types,
                themes, formatters), scramble.ts, physics.ts (rigid-body solver), audio.ts
                (runtime synth), eject.ts (pull-back geometry)  : all have .test.ts siblings
public/img/     user-supplied images (portrait + screenshots)
docs/
  superpowers/specs/    design spec(s)
  superpowers/plans/    implementation plan(s): execute these task-by-task
  PROGRESS.md           LIVING STATE: what's done, what's pending, decisions log
```

## The terminal is a real subsystem

**Arcade update, 2026-09-05.** Fergus's rebuild request supersedes the character-only
arcade presentation described below. `ArcadeExperience` loads on demand from Terminal,
opens a native modal, runs a skippable phosphor corridor and presents six illustrated
cabinets. Gameplay remains pure in `lib/arcade/engine.ts`; `renderer.ts` draws the canvas;
`CanvasGame` subscribes to the one SystemProvider clock at fixed 60Hz. CSS is isolated in
`components/arcade/arcade.css`. The old `ArcadeScreen` remains the ProgramSpec fallback.
The shared contracts still apply: Escape restores the prompt, resize preserves the run,
pause/blur releases held inputs, reduced motion declines, sound is explicit and no
game state is persisted. `content/arcade-collection.ts` owns cabinet descriptions.

Boards use the dedicated **private** Blob store through `ARCADE_READ_WRITE_TOKEN`, never
the tools' public store. `useCache: false` only gives consistent origin reads on private
Blob, a distinction proven by the failing public-store integration test. ETag writes,
signed run receipts, bounded bodies and global write budgets live in `score-service.ts`,
`score-request.ts` and `blob-board.ts`. Keep the production/preview/development namespaces
separate. Scores are casual client reports, not verified competition. Only the API exposes
board rows; replay receipts stay private. The opt-in real-store test writes development
rows only. Never use the canonical production domain for generated test scores.

Pong and Ouroboros multiplayer reuse Overlap's WebRTC primitives with manual signalling.
The host is authoritative; bounded peer packets are validated in `lib/arcade/network.ts`.
No TURN relay is promised. Two local Chromium browsers prove the connection, not arbitrary
networks. CI runs phone, multiplayer and game-over/replay/sound/forget flows.

`lib/commands.ts` stays **pure**, and since 2026-09-03 it is a thin dispatcher over a registry.
Every command is a `defineCommand({ name, aliases, help, hidden, argPool, run })` in one of the
modules under `lib/commands/` (`nav`, `info`, `effects`, `sudo`, `hidden`, and whatever a later
sub-project adds), registered from `lib/commands/index.ts`, where the lines stay alphabetical so
two pull requests rarely collide. `COMMANDS`, `HELP_LINES` and `complete()` are derived from the
registry, so a command is listed by being visible, not by being added to three lists. A
`hidden: true` command is absent from help, completion and `ls`, and is reachable only by name or
through `cd <name>`: that is the door to the arcade, and the `arcade` row in `top` is the one hint.
Since 2026-09-04 that door opens something. `lib/arcade/` is a program runtime the terminal hosts:
a fixed 30Hz tick driven by `SystemProvider`'s one rAF clock, a character grid sized from the
measured cell (48 by 20 down to 32 by 16, and a sentence rather than a clipped grid when even the
smallest will not fit), one key vocabulary for arrows, WASD and swipes, and `Escape` always exiting
to the prompt with the scrollback intact. A game is a `ProgramSpec` in `lib/arcade/<game>.ts` plus
one line in `ARCADE_GAMES`; it writes no React, no CSS and no route. The arcade declines under
`prefers-reduced-motion: reduce` the way `gravity` and `eject` do, in a sentence.

A running program may implement `resize(cols, rows)`: the runtime updates the host first, then asks
the program to keep any live coordinates inside the new character world and redraw without a
restart. Keyboard input is paired by physical key. The logical key chosen on keydown is the one
released on keyup even if modifiers or focus changed, and blur, visibility loss, program hand-off
and exit release every held key before disposal. New games must preserve both contracts.

**The drawer sizes itself to its content, so a program must state a height.** `.shell` is
`position: fixed` with a `max-height` and no height, and an arcade set to `height: auto` inside it
wraps an empty `<pre>`, measures a box a few pixels tall and refuses a screen that is really there.
`.shell:has(.term--program)` sets `--shell-program-h` and the arcade's height is arithmetic on it.
Measured on WebKit at 390 and 320: 40 by 18 and 32 by 16, both at full size.
`scripts/arcade-phone-check.mjs` reaches it through `cd arcade`, rather than adding the hidden door
to the sitemap, and keeps that resize, layout, focus and reduced-motion flow in the required phone
CI job.

Commands that change the running site (`theme`, `crt`, `scanlines`, `matrix`, `degauss`,
`sudo rm -rf /`) return an `effect` descriptor, and a program (a game) returns
`{ type: "program", program }`. `Terminal.tsx` is the only place allowed to act on either. Keep it
that way: it is why the whole command surface is unit-testable without a DOM. To add a command,
add a `defineCommand` to the right module (or a new module with its registration line) and a test
beside it. Run `node scripts/mutation-check.mjs` if you touch a guard: the reduced-motion
refusals, the scanlines range, the theme check, the hidden flag and the door are all mutated by it.

The terminal is on every route. `app/page.tsx` renders it inline; everywhere else
`components/ShellDrawer.tsx`, mounted once in `components/CrtShell.tsx` beside the status bar,
hosts the same component in a drawer opened by the backtick (when focus is not in a field), by the
`$ prompt` button in the status bar, or by a tap on that button on a phone, and closed by Escape.
There is one scrollback and one recall list, in `lib/history.ts`, module-level and never persisted,
so `cd projects` typed in the drawer and `history` typed on the home page agree. `lib/shell.ts` is
the drawer's state machine, pure and tested, and it never opens on the route that hosts the
terminal inline. `forget` returns an effect like every other command that touches the machine; the
Terminal removes the keys.

## How to work on this project

1. Read `docs/PROGRESS.md` for current state + the active plan.
2. Open the referenced plan in `docs/superpowers/plans/` and execute it task-by-task
   (use the executing-plans workflow: implement → test/build → commit per task).
3. **Tick the checkboxes in `docs/PROGRESS.md`** as you complete tasks and append to its
   decision log. This is the handoff contract: keep it current so the next agent isn't lost.
4. Commit per task with clear messages. Keep `npm run build` clean and `npm test` green.

## Known pending work

See `docs/PROGRESS.md`.

## Content still needing the owner (Fergus)

- Nothing outstanding. (This section previously asked for a Hatch105 role and dates for a
  `hatch105` entry in `content/experience.ts`. There is no such entry and has not been for some
  time: Hatch105 is named inside the Presterly entry as the accelerator, which is what it is.)

## Keeping the numbers honest

> [!important] These are now **historical** figures, and they must stay in the past tense
> Presterly was wound down in **August 2026**. Its numbers are a snapshot of a company that no
> longer trades, so every sentence carrying one reads "reached", not "installed on", and no
> figure gets a present-tense verb. **Do not re-verify them against the Presterly database**: it
> is frozen, it is a different business's infrastructure, and a fresh query would only produce a
> more precise number for something that stopped. The 2026-08-04 snapshot below is the last word.
>
> Tigh Sauna carries **no** traction numbers on this site on purpose. It has two merchants and it
> has not been through a season, so there is nothing measured to publish. If that changes, the
> same discipline applies: scope every figure to one query, say what the query proves, and round
> down.

`content/` carries traction claims (customers under management, order value analysed, store
count) on a page whose footer invites people to check. **They are claims, not decoration, and they
go stale silently.** Last verified against the Presterly production database on **2026-08-04** via
the read-only Supabase MCP, and never to be re-verified: see the note above.

**The scoped query is the only one to publish from.** The trap, hit twice on 2026-08-04, is pairing
a filtered store count with unfiltered platform totals. Scope every figure to the same set:

```sql
with live as (
  select s.id from shops s
  where s.installed_at is not null and s.uninstalled_at is null
    and (select count(*) from customers c where c.shop_id = s.id) >= 1000
)
select (select count(*) from live),
       (select count(*) from customers where shop_id in (select id from live)),
       (select currency, sum(total_price) from orders where shop_id in (select id from live) group by currency),
       (select count(*) from predictions where shop_id in (select id from live));
```

Verified 2026-08-04: **34 stores, 423,624 customers, EUR 18,956,608 + GBP 941,244, 292,745
predictions.** Published rounded **down**, as 34 / 423,000 / nearly €19M / roughly 292,000.

Three rules that came out of getting it wrong:

1. **Never sum `orders.total_price` across shops without grouping by `currency`.** It is stored in
   each shop's own currency. The published euro figure is the EUR subtotal alone, which is true
   without the GBP and errs low. Do not pick an FX rate to make a bigger number.
2. **Say what the query proves.** It proves *installation*, so the copy says "installed on", not
   "live on". Of the 34, only **14 have any orders at all**, which is why the order value is a
   separate sentence and never sits behind a colon under the store count. Likewise a
   `count(*)` on `predictions` proves rows exist, not that any are fresh, so no freshness verb
   unless someone actually checks `updated_at`.
3. **Do not publish the raw install count.** `shops` had 105 rows marked installed, including dev
   and test installs. The 34 is the defensible floor. Checked the same day: 34 stores resolve to 34
   distinct brand roots, and none of the domains look like dev or staging stores.

Re-check before any application or outreach push, and never round upward.

## Two files in `public/` are ownership proofs. Do not delete them.

Nothing in the code imports either, which is exactly the shape a later cleanup deletes.

- **`google9622a76d3e2fd7ba.html`** verifies the `https://fergusoreilly.dev/` URL-prefix property
  in Google Search Console, owned by **`fergus@tighsauna.com`**. Google re-checks it periodically,
  so removing it un-verifies the property and the search performance data stops arriving. Its
  contents are the single line `google-site-verification: google9622a76d3e2fd7ba.html`.
- **`1e1c07d6835b43b5ae97096bb927a1ee.txt`** is the IndexNow key, used by `scripts/indexnow.mjs`.
  The file's contents ARE the key, and that is the whole ownership proof, so it is deliberately
  not a secret and is committed on purpose. Rotating it means adding a new file and changing the
  constant in that script.

**Anything in `public/` is served from the site root and is indexable**, so do not put notes,
READMEs or working files there. This section exists because the obvious place for the note above
was `public/README.md`, which would have been live at `fergusoreilly.dev/README.md`.

Run `node scripts/indexnow.mjs --dry-run` to see what would be submitted, and without the flag to
submit every sitemap URL to Bing. Worth running after publishing an article. Google has no
equivalent: its sitemap ping endpoint was retired in 2023, so new pages go through Search Console
or wait for a natural recrawl.

## Images

Everything in `public/img/` is a **derived artefact built by `scripts/build-images.mjs`**. Do not
hand-edit the images; change the script and re-run `node scripts/build-images.mjs`. Brand marks are
vendored in `assets/sources/`; the two large sources stay where they live (the photo library and the
Trinity coursework). The script skips politely with a message when a source is missing, so a fresh
clone still builds everything else.

- `portrait.jpg`: from `IMG_1018.HEIC`. **sharp cannot decode HEIC** (its libvips has no HEVC
  decoder; it reads the metadata then fails on the pixels), so the script shells out to `ffmpeg`
  to decode to PNG first and crops from that. ffmpeg on PATH is needed for this step only.
- `presterly.png`, `loira.png`: brand marks composited onto 16:9 cards.
- `tigh-sauna.png`: the Tigh Sauna house mark over the wordmark, `steam #0f6472` on
  `birch #faf6f0`. The mark is vendored at `assets/sources/tigh-house-steam.svg`, copied from
  the product's own `apps/site/src/app/icon.svg`. **Do not restyle it in the old ember orange**:
  ember only reached 3.94:1 on white, which is why it stopped being used for text.
  It previously carried a typographic lockup with three session bars and the tagline, written
  when there was no mark to copy; both went when the real house arrived, the tagline because
  the card sits directly above that same sentence and was printing it twice.
  This replaced `firespark.png`, and the Firespark builder and its vendored spark were deleted
  with it. **Firespark, Hearth and Sauna OS are retired names for what is now Tigh Sauna.** They
  survive in package names and deploy paths and must never appear in anything a person reads;
  `content/links.test.ts` fails the build if one reaches an outbound link. Firecracker Saunas is
  a *customer*, a different thing, and is not the same as Firespark.

  **The trap that cost time here, and will again:** libvips sniffs only about the first thousand
  bytes of a *file* for the SVG signature. A vendored mark whose provenance comment sits above
  its `<svg>` tag pushes that signature out of the window, and `sharp(path)` then fails with
  "Input file contains unsupported image format", which reads like a corrupt file rather than a
  long comment. Keep `<svg` on line 1 and document inside the element. Passing a Buffer hides
  the problem, because sharp sniffs those itself.
- `remand.png`, `contrabot.png`: authored SVG, rasterised. Deliberately not stock screenshots.
  In `contrabot`, **all geometry is in screen coordinates where a smaller y is a higher price**,
  getting that backwards once produced a rising chart captioned as a profitable short.
- `under-the-campanile.jpg`: real gameplay, cropped to drop the browser scrollbars. JPEG, not
  PNG: it is the one photographic card, and lossless cost ~8x the bytes for no visible gain.

Alt text lives in `content/projects.ts` as `imageAlt`, per project. Do **not** reintroduce a
blanket `"${title} screenshot"`: most of these are brand marks or authored illustrations, and
mislabelling them is a false claim about the work.

Any project whose `image` is `""` falls back to `SignalPlate`, a procedural CRT alignment card
seeded from its slug. That is deliberately a test card, never a fake screenshot.

Imagery is phosphor-duotoned at rest and resolves to full colour on hover (a light cast on touch,
where there is no hover to earn it). The duotone hue is per-theme via `--duotone-hue`.
