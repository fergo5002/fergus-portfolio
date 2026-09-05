# Arcade overhaul: implementation plan

Spec: `docs/superpowers/specs/2026-09-05-arcade-overhaul-design.md`. Branch `feat/arcade-overhaul`
from `origin/main` at `6e5b7c1`, worktree `C:\Dev\_worktrees\fergus-portfolio\feat-arcade-overhaul`.

Every step lists the test that goes red first, then the code, then the proof.

## 1. Pure modules, tests first

- [x] `lib/arcade/theme.ts` + `theme.test.ts`: parse `--green`, `--green-bright`, `--green-dim`,
      `--green-line`, `--amber`, `--amber-bright`, `--bg`, `--bg-panel` from a `getPropertyValue`
      function into `{ ink, bright, dim, line, accent, accentBright, bg, panel }`. Missing or
      unparseable values fall back to the green phosphor. Test with the three real theme blocks.
- [x] `lib/arcade/attract.ts` + `attract.test.ts`: `attractKeys(state, rng)` per game;
      `createAttract(id, seed)` with `step(dt)` that restarts after `over` plus a 2.4s hold.
      Tests: bounce launches within 3s and hits a brick within 30s; pong returns a serve within
      20s; snake eats within 20s and survives 20s; under recovers the key within 400 turns; signal
      survives 15s with kills; poker banks a hand within 6s; every game restarts after game over;
      600 seconds of every game never throws and stays finite.
- [x] `lib/arcade/engine.ts`: `eventAt` set in `sound()` call sites that have a position. Test: a
      brick hit puts `eventAt` inside the brick.
- [x] `lib/arcade/session.ts`: `rememberPosted({ game, initials, score })`, read via
      `arcadeSession().lastPosted`. Test: set, read, reset.
- [x] `lib/arcade/renderer.ts`: `renderGame(ctx, state, w, h, theme, options)` with
      `options.ghost` (a second 2D context for persistence) and `options.compact`. Test with a
      recording context stub for all six games: no throw, every `fillStyle`/`strokeStyle` set is
      one of the theme's strings or an `rgba(` derived from them, and a grep that the file has no
      `#` hex literal.

## 2. Copy

- [x] `content/arcade-collection.ts`: terminal-voice rewrite, BIOS lines, hall of fame strings,
      labels used by the scripts. Keep `Cabinet` shape; drop `number` (derived from index).

## 3. Components

- [x] `arcade.css` rewritten on the site's tokens.
- [x] `AttractScreen.tsx`, `Gallery.tsx`, `CabinetDetail.tsx`, `HallOfFame.tsx`,
      `ArcadeEntrance.tsx` new. `CanvasGame.tsx`, `ScoreBoard.tsx`, `NetworkLobby.tsx`,
      `ArcadeExperience.tsx` rewritten. `CabinetArt.tsx` deleted.
- [x] `components/arcade/arcade.test.ts`: the new coupling greps.

## 4. Scripts

- [x] Update `arcade-collection-check.mjs`, `arcade-visual-check.mjs`, `arcade-flow-check.mjs`,
      `arcade-multiplayer-check.mjs` for the new labels and the entrance timing.
- [x] New `scripts/arcade-scroll-check.mjs` and wire it into `.github/workflows/ci.yml`.

## 5. Proof

- [x] `npx tsc --noEmit`, `npm test`, `npm run build`.
- [x] `node scripts/mutation-check.mjs` for the arcade catalogue entries that touch changed files.
- [x] `next start` on 3210: collection check (WebKit 390, 320, Pixel), visual check, flow check,
      multiplayer check, scroll check.
- [x] The scroll check again with the attribute removed (`--expect-broken`), the revert-to-confirm.
- [x] Screenshots read by eye at desktop and 390: entrance frames, gallery, detail, play,
      result, hall of fame, on the green theme and once on amber.
- [x] Docs: append to `docs/arcade-rebuild.md`; AGENTS.md gains the room's stacking rule.
- [ ] PR, CI green, merge, Vercel READY on the merge SHA, live check on fergusoreilly.dev.
