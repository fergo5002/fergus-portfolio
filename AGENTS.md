# AGENTS.md: start here

Onboarding for any AI agent or developer picking up this project. Read this top-to-bottom
before touching code. (Claude Code, Cursor, Copilot, and others read `AGENTS.md` by default.)

## What this is

**FergusOS Terminal**: Patrick Fergus O'Reilly's personal portfolio, styled as a retro CRT
computer terminal (green phosphor + amber accent, scanlines, boot sequence, interactive
command line). Five routes: landing (`/`), experience (`/experience`), projects
(`/projects`), writing index (`/writing`) and articles (`/writing/[slug]`).

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

**And never disallow `/_next/` in `robots.txt`.** The inline pre-paint script adds `booting` to
`<html>` on the landing page, `.booting` hides the content, and only `BootSequence` clears it.
Block the chunk it ships in and a rendering crawler sees an empty homepage while every status
code stays 200. There is a 4s failsafe in the inline script now, and it is the second line of
defence, not a licence to block scripts.

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

## Stack & conventions

- **Next.js 15 (App Router) + React 19 + TypeScript.** Server Components by default; only
  interactive pieces are `"use client"`.
- **Styling: hand-written CSS in `app/globals.css`. No Tailwind, no CSS-in-JS.** The theme is
  driven by CSS variables at the top of that file (`--green`, `--amber`, `--bg`, spacing,
  `--glow`). Three phosphor themes are defined as `html[data-theme="..."]` blocks; their
  matching shader colours live in `THEME_PHOSPHOR` in `lib/system.ts`: change both together.
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
  focus.
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

## Commands

```bash
npm install        # first time
npm run dev        # http://localhost:3000
npm run build      # production build (must stay clean)
npm test           # vitest unit tests (must stay green)
npm start          # serve the production build
```

Deploy: Vercel. The project is git-linked (`fergo5002/fergus-portfolio`, production branch `main`),
so a push normally ships. **Right now both a push and `vercel --prod` are refused, and both fail
silently.** Every deployment carries the commit author, Vercel cannot verify that address against
the account that owns `larry-pm`, and the deployment lands in `BLOCKED`: no alias, production
untouched, git exits 0 and the CLI polls forever. Until that is fixed, ship from a `git archive`
staging tree with no `.git` in it, and confirm `readyState` and `aliasAssigned` over the API
afterwards. Full procedure and the permanent account-side fix: the deploy section at the top of
`docs/PROGRESS.md`. Live host is `https://fergusoreilly.dev`.

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

`lib/commands.ts` stays **pure**. Commands that change the running site (`theme`, `crt`,
`scanlines`, `matrix`, `degauss`, `sudo rm -rf /`) return an `effect` descriptor; `Terminal.tsx`
is the only place allowed to apply one. Keep it that way: it is why the whole command surface
is unit-testable without a DOM. Add new commands to `COMMANDS`, `HELP_LINES`, the `switch`, and
`complete()`'s argument pools, and add a test.

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
- `tigh-sauna.png`: a typographic lockup in Tigh Sauna's colours, `steam #0f6472` on
  `birch #faf6f0`, with three session bars standing in for a diary. No vendored mark, so this
  is the one builder that can never skip. **Do not restyle it in the old ember orange**: ember
  only reached 3.94:1 on white, which is why it stopped being used for text.
  This replaced `firespark.png`, and the Firespark builder and its vendored spark were deleted
  with it. **Firespark, Hearth and Sauna OS are retired names for what is now Tigh Sauna.** They
  survive in package names and deploy paths and must never appear in anything a person reads;
  `content/links.test.ts` fails the build if one reaches an outbound link. Firecracker Saunas is
  a *customer*, a different thing, and is not the same as Firespark.
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
