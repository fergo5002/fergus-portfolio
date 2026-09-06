# FergusOS Terminal — Claude entry point

This is the concise Claude-specific kernel. **`AGENTS.md`** (598 lines, shared with Codex) is
the canonical deep-dive: stack conventions, the terminal subsystem, images pipeline, SEO/GEO
design, and a long list of traps that have bitten before. Read the relevant section before any
non-trivial change; don't try to hold all of it in context for a one-line fix. **`docs/PROGRESS.md`**
is the living handoff contract — read its latest entry first to know what's currently in flight.

## Commands

```bash
npm install        # first time
npm run dev        # http://localhost:3000
npm run build      # production build (must stay clean)
npm test           # vitest unit tests (must stay green)
npm start          # serve the production build
```

Other npm scripts exist for analytics, IndexNow, phone/arcade phone checks and share-of-model
reporting — see `package.json`. `node scripts/build-images.mjs` rebuilds everything under
`public/img/`; never hand-edit those files.

## Deploy

Git-linked to Vercel (`fergo5002/fergus-portfolio`, production branch `main`) — **a push to
main ships**, and the repo is public, which is what makes that true (see AGENTS.md § Commands
for the private-repo `BLOCKED` history if that ever resurfaces). `main` requires the `check`,
`mutation` and `phone` GitHub Actions jobs, so most changes go through a PR; **docs-only commits
may land on `main` directly**.

**Verify a deploy by reading `readyState`/`aliasAssigned` from the Vercel API**
(`https://api.vercel.com/v13/deployments/<id>?teamId=<team>`), not by trusting the CLI's exit
code or `vercel ls` (which renders `BLOCKED` as `UNKNOWN`). Every Vercel CLI call needs
`--token "$VERCEL_TOKEN_PERSONAL" --scope larry-pm` — this project stayed on the personal
Vercel account, it never moved to the Tigh Sauna team. Live host: `https://fergusoreilly.dev`.

## Traps that bite fast (full detail in AGENTS.md)

- **No backtick inside the GLSL shader template literals** — terminates the string, build fails
  hundreds of lines from the real cause. Has bitten twice.
- **Never pre-hide a scroll-revealed element with `clip-path`** — IntersectionObserver folds the
  clip into the intersection rect and the element never gets told to appear. Hide with `opacity`.
- **Retired names — Firespark, Hearth, Sauna OS — must never reach an outbound link**;
  `content/links.test.ts` fails the build if one does. They're fine in package/deploy paths.
- **A per-character or decorative text effect needs a plain contiguous copy in the server HTML**,
  or it's invisible to crawlers and answer engines. `aria-label`/`aria-hidden` do not substitute
  for this either direction.
- **PostHog is cookieless** (`cookieless_mode: "always"`, plus a PostHog-project-side toggle
  that isn't in its UI) — don't add cookies or local storage to analytics, and if pageviews go
  quiet while server events keep flowing, check the project-side toggle first.

## Working here

- All editable copy lives in `content/*.ts` — never hard-code copy in components.
- Every animation must respect `prefers-reduced-motion`.
- `cc portfolio` (or `cc personal`) from anywhere roots a shell + Claude session here.
- `.claude/settings.json` pre-approves the routine local dev loop (npm/node, non-destructive
  git) so this doesn't re-prompt every session; git push/PR already run unprompted globally.
  Deploy-triggering commands beyond an ordinary push, and anything destructive, still ask.
