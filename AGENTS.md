# AGENTS.md: start here

The map for any agent or developer working on this repo. It holds what most turns need: what the site is, the rules that apply everywhere, the commands and where the detail lives. Before touching an area, read the file the map names for it. Code comments that cite an `AGENTS.md` section by name ("What the site may keep", "One frame clock", "the /contact rule") find that section in the file the map gives.

## What this is

**FergusOS Terminal**: Patrick Fergus O'Reilly's personal portfolio at `https://fergusoreilly.dev`, styled as a retro CRT computer terminal (green phosphor and amber accent, scanlines, a boot sequence, an interactive command line). Page routes live in `app/`: landing, experience, projects, the writing index and articles, contact, the tools index and one page per tool under `/tools/<slug>`, `/mcp` and `/lab`. API routes live in `app/api/`. `/robots.txt`, `/sitemap.xml`, `/llms.txt` and `/feed.xml` are generated from `content/`. A hidden arcade opens from `cd arcade`.

Stack: **Next.js 15 (App Router), React 19, TypeScript.** Server Components by default; only interactive pieces are `"use client"`. Path alias `@/*` is the repo root (e.g. `@/content/profile`).

`docs/PROGRESS.md` is the living handoff contract: read its latest entry first to know what is in flight. Known pending work is there too.

## Rules that apply everywhere

Each is stated once here; the topic file has the reason and the history.

- **All editable content lives in `content/*.ts`**: never hard-code copy in components.
- **Accessibility is non-negotiable.** Every animation is gated behind `@media (prefers-reduced-motion: no-preference)` (CSS) or a `matchMedia` check (JS) with a static or instant fallback. Text contrast at least 4.5:1, alt text on images, visible focus. Detail: `docs/agents/phone-and-wide.md`.
- **Styling is hand-written CSS in `app/globals.css`. No Tailwind, no CSS-in-JS.** A tool may own `app/tools/<slug>/tool.css`, imported by its own page only. The three phosphor themes are `html[data-theme="..."]` blocks and their shader colours are `THEME_PHOSPHOR` in `lib/system.ts`: change both together.
- **Reach for CSS first, earn every dependency.** Nothing joins `package.json` without an argument on its own PR (`docs/agents/tools-and-storage.md`, rule 3). Never add a repo-wide `.npmrc` to get past a peer-dependency error (`docs/agents/text-and-search.md`, Analytics).
- **One frame clock.** `SystemProvider` owns the single `requestAnimationFrame` loop. Never start another, and never `setState` inside a frame callback.
- **No backticks inside the GLSL.** The shaders are template literals, so a backtick in a comment ends the string and the build fails hundreds of lines from the real cause. This has bitten twice.
- **Never pre-hide a scroll-revealed element with `clip-path`.** IntersectionObserver folds an element's own clip into its intersection rect, so it hides itself and is never told to appear. Hide with `opacity` (which IO ignores) and keep the clip inside the keyframes. This bit once; the rule is in `globals.css` next to `.raster`.
- **A text effect must leave the plain, contiguous words in the server HTML, and decorative text belongs in CSS `content`.** `aria-label` and `aria-hidden` substitute for neither. `docs/agents/text-and-search.md`.
- **Never disallow `/_next/` in `robots.txt`**: a rendering crawler would see an empty homepage.
- **Nothing may fail silently.** A control that can do nothing must not be rendered. `docs/agents/contact.md`.
- **Storage:** analytics is cookieless; the visitor's machine keeps only what the visitor explicitly saved, under `fergusos_settings` or a `fergusos:` key; the server keeps anonymous aggregates only. `docs/agents/tools-and-storage.md`.
- **PostHog is cookieless** (`cookieless_mode: "always"`, plus a project-side `cookieless_server_hash_mode` that is not in PostHog's UI). If pageviews go quiet while server events keep flowing, check that toggle first.
- **No audio files.** `lib/audio.ts` synthesises everything, off by default and silent at rest.
- **Retired names (Firespark, Hearth, Sauna OS) must never reach an outbound link**; `content/links.test.ts` fails the build if one does. They are fine in package or deploy paths.
- **Wide-screen rules go at the end of the stylesheet that owns the route, inside a `min-width` query of 1560px or more.** `docs/agents/phone-and-wide.md`.
- **Images in `public/img/` are built by `scripts/build-images.mjs`**: change the script, never the image. Anything in `public/` is served and indexable, and two files there are ownership proofs that must not be deleted. `docs/agents/content-and-images.md`.
- **Presterly's figures are historical**: past tense, never re-verified, rounded down. Tigh Sauna carries no traction numbers on purpose. `docs/agents/content-and-images.md`.
- **Before shipping a change to a guard, the contact feature or any brightness constant, run `node scripts/mutation-check.mjs`.** A guard that survives its own mutation is decoration. `docs/agents/shipping.md`.
- **Never tune a shader constant without measuring the pixels** (`gl.readPixels`). `docs/agents/machine.md`.

## Commands

```bash
npm install        # first time
npm run dev        # http://localhost:3000
npm run build      # production build (must stay clean)
npm test           # vitest unit tests (must stay green)
npm start          # serve the production build
```

Other npm scripts cover analytics, IndexNow, the phone and arcade phone checks, the wide check and share-of-model reporting: see `package.json`. `node scripts/build-images.mjs` rebuilds everything under `public/img/`. `npm run wide-check -- --base http://localhost:3000 --from-sitemap` measures 1600 to 5120. The verification scripts and the Docker parity build are listed in `docs/DEVELOPING.md`.

## Deploy

Git-linked to Vercel (`fergo5002/fergus-portfolio`, production branch `main`), so **a push to main ships**. The repository is public, which is what makes that true. `main` requires the `check`, `mutation` and `phone` GitHub Actions jobs, so code goes through pull requests; docs-only commits may land on `main` directly.

**Confirm every deployment by reading `readyState` and `aliasAssigned` from the Vercel API** (`https://api.vercel.com/v13/deployments/<id>?teamId=<team>`), never the CLI's exit code or `vercel ls` (which renders `BLOCKED` as `UNKNOWN`). Every Vercel CLI call passes `--token "$VERCEL_TOKEN_PERSONAL" --scope larry-pm`. Never verify a deploy by curling `/_vercel/insights/script.js`: that path 404s on a working deployment. Full detail, including the `BLOCKED` history: `docs/agents/shipping.md`.

## How to work on this project

1. Read `docs/PROGRESS.md` for current state and the active plan.
2. Open the referenced plan in `docs/superpowers/plans/` and execute it task by task: implement, test and build, commit per task.
3. **Tick the checkboxes in `docs/PROGRESS.md`** as you complete tasks and append to its decision log. This is the handoff contract: keep it current so the next agent isn't lost.
4. Commit per task with clear messages. Keep `npm run build` clean and `npm test` green.

## Map: read before touching

Old `AGENTS.md` section names are in quotes, so a comment that cites one leads here.

| Before touching | Read |
| --- | --- |
| The boot, any animation or reveal, the shader and phosphor, gravity, eject, the screensaver, the beam, the status strip, hover previews, the pixel sprites, the writing figures, the `/mcp` console, the 404 card ("The September 2026 redesign", "Two boots", "Animate only what the visitor has not seen", "One frame clock", v4 "Phosphor", v5 "Mass") | `docs/agents/machine.md` |
| Text effects, decorative strings, SEO and GEO (`lib/seo.ts`, robots, sitemap, `llms.txt`, feed), `middleware.ts`, `next.config.ts`, Vercel Analytics, PostHog, crawler detection ("the rule that keeps biting", "decorative text belongs in CSS", "Analytics") | `docs/agents/text-and-search.md` |
| `/contact`, the contact and meeting forms, spam handling, Resend and `lib/contact.ts` ("the /contact rule") | `docs/agents/contact.md`, then `docs/DEVELOPING.md` |
| Any tool under `/tools`, `/api/mcp`, headline-check's fetch fence, Overlap, local and session storage, server state, a tool's stylesheet, dependencies ("What the site may keep, and where", Drift, Relief) | `docs/agents/tools-and-storage.md` |
| The arcade, the boards, the command registry, `Terminal.tsx`, the shell drawer and the inline homepage terminal ("The arcade room sits inside the tube", "The terminal is a real subsystem") | `docs/agents/arcade-and-terminal.md` |
| Phone layout, the nav on a phone, tap targets, contrast, `(hover: none)` rules, wide screens, `scripts/phone-check.mjs`, `scripts/wide-check.mjs` ("Wide screens") | `docs/agents/phone-and-wide.md` |
| `content/`, traction figures, the Hatch105 entry, `public/`, the ownership proof files, IndexNow, `scripts/build-images.mjs` ("Keeping the numbers honest", "Images") | `docs/agents/content-and-images.md` |
| Deploying, verifying a deploy, CI, the mutation check, the repo layout ("Commands", "Layout of the repo") | `docs/agents/shipping.md` |
| Measurement and the PostHog API call | `docs/measurement.md` |
| Design specs: motion `docs/superpowers/specs/2026-08-03-phosphor-motion-system-design.md`, machine `docs/superpowers/specs/2026-08-04-mass-memory-voice-design.md`, SEO and GEO `docs/superpowers/specs/2026-08-20-seo-geo-growth-design.md` | the spec itself |
