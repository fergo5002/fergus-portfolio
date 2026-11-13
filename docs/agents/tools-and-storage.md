# Tools, APIs and what the site may keep

Read this before touching any tool under `/tools`, the API routes, local or session storage, server-side state, `app/globals.css` versus a tool's own stylesheet, or `package.json` dependencies.

## `/api/mcp`, the Model Context Protocol server

**`/api/mcp` is a Model Context Protocol server**, unauthenticated because
everything it returns is already on the pages, with six tools that all read from `content/` so it
cannot say something the site does not. Read `lib/mcp.ts`'s docblock before touching it: it names
the spec revision it implements and the URL that revision was read from. That matters more than
usual here, because revision `2026-07-28` **deleted** the `initialize` handshake and moved to
per-request metadata, so anything written from memory ships the wrong protocol. It answers both
eras on purpose: modern statelessly, and the old handshake because that is what shipped clients
still open with.

## `/tools/headline-check` fetches a URL a stranger typed

**`/tools/headline-check` fetches a URL a stranger typed**, which makes it the only thing on this
site with a real attack surface. `lib/headline-fetch.ts` refuses private, loopback, link-local and
reserved addresses on the typed URL and again on every redirect hop, checks every DNS answer
rather than the first, and caps time and size. Its docblock states the gap it does not close (DNS
rebinding) and the thing that bounds it (the content type is checked before any body is read).
Do not weaken either without reading that first.

## `/tools/overlap`

**`/tools/overlap` reads a LinkedIn connections CSV in the browser.** The file and names never
leave that browser. A peer receives salted, truncated hashes, the salt and the list count over a
direct WebRTC data channel. This is not private-set intersection: the peer learns the count, sees
the connecting IP address, and can try likely profile slugs against the salt. The optional room
service holds opaque offer/answer SDP for at most ten minutes and a daily-changing address hash for
the one-hour budget window. Manual copy and paste skips that room service but still needs WebRTC;
by default it uses Cloudflare STUN, and there is deliberately no TURN relay. Both routes can fail
on restrictive networks. Protocol unit tests use in-memory channels, and the browser proof so far
is two local Chromium contexts, not two real networks. Keep those boundaries visible in the copy.

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

## Styling, the tools list, Drift and Relief (from "Stack & conventions")

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
