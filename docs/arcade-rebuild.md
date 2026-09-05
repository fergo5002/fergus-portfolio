# Arcade rebuild, 5 September 2026

Fergus authorised rebuilding and deploying the arcade, including a cinematic entrance,
distinct playable games, multiplayer and persistent leaderboards. Work belongs to
`codex/arcade-rebuild`; tools are owned by the concurrent tools task.

## Design

The terminal remains the hidden door. A full-viewport portal moves through a green
wireframe corridor into an arcade of illustrated vector cabinets. The illustration
language is also the games' actual renderer: phosphor strokes, amber hazards, dark glass.
No downloaded art, game framework, samples or second animation clock.

Six games: Breakpoint (brick breaker with a magnetic catch), Phosphor Pong (a moving
gravity well), Ouroboros (Snake with a phase charge), Under the Terminal (daily seeded,
turn-based dungeon), Dead Signal (arena survival with a rechargeable pulse), and
Circuit Poker (five-card draw, escalating targets and limited redraws).
Pong and Snake support two people at the same keyboard; direct WebRTC multiplayer
uses manual signalling so it does not depend on the unprovisioned relay store.

The old character host remains available for third-party ProgramSpec compatibility.
Known arcade IDs open the new collection. Pure deterministic game state runs at 60Hz
through SystemProvider's clock. Rendering does not cause React renders. Resizing only
changes projection, never game state. Pause, blur, hidden tabs and exit release inputs.
Reduced motion retains the current explicit refusal; the cinematic also has Skip.

Scores are casual, client-reported scores, not cheat-proof competition. Separate boards
per game, a deterministic UTC daily dungeon, three-character initials only. A dedicated
private Vercel Blob store carries one bounded board document with conditional writes,
signed short-lived run receipts, duplicate rejection and a global free-tier write cap.
The personal Hobby plan stays in use. Failures retain the player's result and
offer retry. Two-player results do not enter the solo boards.

## Delivery

- [x] Behavioural engine tests, then six complete engines and renderer.
- [x] Corridor, gallery, keyboard/touch controls, pause/retry and sound toggle.
- [x] Two-player Pong/Snake, WebRTC setup and disconnection handling.
- [x] Persistent boards, validation/concurrency tests and real-store proof.
- [x] Production build, full tests and focused mutation checks; first PR phone gate.
- [x] Final-head full mutation gate and browser checks after the release refinements.
- [x] PR, required checks, merge, Vercel READY + alias + live browser verification.
- [x] Update programme evidence and durable personal-site memory.

The new request supersedes the original character-only cabinet and the unbuilt
six-max poker label. Circuit Poker is explicitly a single-player draw game with no
money or betting, not a claim to implement six-max hold'em.

## Release evidence

PR [#15](https://github.com/fergo5002/fergus-portfolio/pull/15) was squash-merged on
5 September 2026 at 16:10 UTC as `347a314c610a48c3d3b733ed25ab810f338cfc95`.
Final reviewed head `da3ad6999ad81f957e1a440a3a78c391ae38672b` passed
[CI run 33976233522](https://github.com/fergo5002/fergus-portfolio/actions/runs/33976233522):
TypeScript, 2,456 tests, production build, phone/browser flows and every mutation.
The four mutation partitions caught 49 + 49 + 49 + 48 = **195/195**, with the named
`mutation` aggregation gate passing. Three Node partition tests also passed. The
default suite skips three credential-gated integration cases; real private Blob
concurrency and retry were separately exercised against the configured store.

Vercel production `dpl_BR9awzTSeN11xSrjhf7R5vR48TDF` is READY, `aliasAssigned: true`,
and its Git SHA exactly matches the merge. Its aliases include `fergusoreilly.dev`
and `www.fergusoreilly.dev`. The canonical-domain browser proof entered through
`cd arcade`, saw all six cabinets, played Breakpoint to a scored hit, paused and
returned focus to the terminal. The live board API returned all six available
boards with uncached reads. No generated scores were posted to production.
The canonical Circuit Poker result flow also passed: 110 points, six synthesis
events, replay, `forget` and zero browser exceptions, with posting disabled.

Final CI exercises all six games in WebKit at 390/320 and Chromium, including touch,
resize, pause, Escape and reduced motion. Two independent browsers connect over real
WebRTC for Pong and Ouroboros; guest inputs change the host state, pauses are shared
and disconnections are visible. A real preview browser completed Circuit Poker,
posted 160 points, immediately read the persisted score, synthesised audio, replayed
and removed saved initials through `forget`. Preview rows are isolated from production.

Limits: no physical phone or two-network/NAT pair was tested. Direct WebRTC has no
TURN relay and can fail on restrictive networks. Scores are client-reported casual
boards, not verified competitive results. Dungeon boards reset by UTC date. Storage
has bounded free-tier posting budgets, rather than an unlimited-write promise.

## Diagnosis and implementation evidence

All six cabinets exercised in Chromium. Real two-browser WebRTC matches connect,
exchange inputs, pause together and show disconnects for both Pong and Ouroboros.
The real Blob test caught the public store's stale reads, so the shipped adapter uses
private origin reads and conditional ETag writes. Two competing writes and an idempotent
retry pass against the dedicated store. Test rows live only in the development namespace.
The private store is `fergusos-arcade`, Dublin, `store_j62Tcw0BlIWpNLjm`, connected only
to the personal project through `ARCADE_READ_WRITE_TOKEN` in all three environments.
The existing tools data and public-store connection are unchanged. Strict `npm ci --dry-run` passes.

Before the production-build checks: 2,450 tests passed; three opt-in real-store tests
were skipped by the default suite. One isolated run under high browser/build load timed
out in an unchanged Overlap protocol test; the subsequent complete suite with four
workers passed. Dev-server phone measurements were discarded after hot reload invalidated
the DOM during a click. Final phone evidence must come from a fixed production build.

At the initial PR #15 head `ab223ab`, the local production build and TypeScript passed;
the baseline suite passes 2,453 tests and all four new leaderboard mutations are caught.
Vercel preview `dpl_GsBG2y3Bi4x9zCxB64nigGVZmBTG` is READY. A real browser completed a
Circuit Poker run, posted 110 points to the preview namespace, verified chosen-initial
persistence, replay and `forget`, with six synthesis events and no browser exceptions.
Preview access used the project's existing automation credential, scoped only to that
deployment; no protection setting was changed. Later final-head evidence is recorded above.

The release refinements add the Snake ready countdown, preserve the gallery's top position
when focus moves, and prevent cached HTTP board reads after a post. The updated local build
passes 2,455 tests and five focused mutations. The initial PR's complete phone gate passed
in 10m6s, including both multiplayer games. Final-head CI repeats those flows. The preview
posting check now also requires the submitted score on the immediately following API read.

The full 195-case catalogue now runs in four independent CI checkouts behind the original
named `mutation` gate. Its first complete run caught 194 cases and blocked release because
the old unfinished-game refusal no longer had an unfinished fixture once every game shipped.
An explicit future-game fixture restores that proof: the baseline passes 2,456 tests and
deleting the refusal goes red. No mutation was removed. Both multiplayer cases passed in CI;
the result driver now uses the real Enter control to avoid mouse-target races during the
result transition. Failure screenshots are retained by including the hidden output folder.

# The arcade, inside the tube: overhaul, 5 September 2026

Fergus reviewed the release above the same day: "it doesn't mimic the design of the rest of
the website, it feels very different, the loading animation should be like you're changing
electrics, it looks boxy, the games don't look as cool as they could, make the leaderboards way
better, and you can't even scroll on the arcade page." Four design forks were put to him and he
took the recommendation on each: the room lives inside the tube, the entrance is a power-cycle
(full once per page lifetime, short after), the cabinets play themselves, and the boards get an
arcade table plus a Hall of Fame. Spec: `docs/superpowers/specs/2026-09-05-arcade-overhaul-design.md`.

## What was wrong, measured

The room was a `<dialog>` at `z-index: 10000`, above the scanlines, vignette, glass and phosphor
shader, in its own hard-coded palette with Arial Black display type. It was not inside the tube.

The scroll bug, reproduced on the release build with a real Chromium wheel: a control wheel moved
the document 599px, five wheel ticks inside the room moved it 0px while `html` carried
`lenis-stopped`, and PageDown moved it 538px. The mechanism is in Lenis's source: while stopped it
calls `preventDefault()` on every wheel event unless an ancestor of the target carries
`data-lenis-prevent`. The dialog had none.

## What changed

- The room is a fixed panel at `z-index: 8990`, portaled to `<body>`, transparent between its
  panels so the tube's rain and persistence show through, on the site's tokens and typefaces,
  following the green, amber and ice phosphors. `html.arcade-open` hides the page, nav, drawer and
  status strip while it is up. The room carries `data-lenis-prevent`.
- The entrance drives `frame.bootTarget` to zero and back, fires the degauss and the channel
  static, and types an arcade BIOS by elapsed time from the one frame clock, with a watchdog. Two
  of its lines are true rather than typed: the cabinet count and the boards' real state.
- `lib/arcade/attract.ts` is a deterministic unattended player for all six engines, tested per
  game; `AttractScreen.tsx` runs it from the one clock only while on screen, and alternates with
  the cabinet's top five. The renderer draws through a persistence layer with additive glow and
  takes every colour from `lib/arcade/theme.ts`; it holds no colour literal. A running game lights
  the tube where the engine says the event happened (`state.eventAt`).
- Boards are arcade tables with the posted row lit and the rank shown; the Hall of Fame shows all
  six. Copy is in the terminal's voice; button labels changed, and the CI scripts with them.
- New guards: `components/arcade/arcade.test.ts` (room below the glass, `data-lenis-prevent`, one
  frame clock, no colour literal, no eyebrow), `lib/arcade/{attract,theme,renderer,bios}.test.ts`,
  five mutation entries, and `scripts/arcade-scroll-check.mjs` in CI.

## Evidence

All of it on the final source of `feat/arcade-overhaul`, on this machine, on 5 September 2026.

- `npx tsc --noEmit` clean. `npx vitest run`: 149 files, 2,535 tests passed, 3 skipped (the three
  credential-gated real-store cases). The new suites: `attract` (17, every game launches, hits,
  eats, scores, survives or banks within a bounded number of ticks, and restarts after game over),
  `theme` (8, the three real token blocks and the fallbacks), `renderer` (9, six games and the ghost
  layer through a recording context, no colour outside the palette, no literal in the file), `bios`
  (9, elapsed-time typing, and the bar that once threw), plus the new coupling greps in
  `components/arcade/arcade.test.ts`.
- Mutation check: the five new entries are all caught (`--filter` runs, five RED), and the working
  tree was confirmed restored after each.
- `npm run build` clean. Against `next start` on port 3210, every arcade script in one run:
  `arcade-scroll-check` (control wheel 599px, room 474px under the wheel, document held at 600px),
  `arcade-flow-check` three times in a row (Circuit Poker to a result at 160, 110 and 60 points,
  nine synthesised oscillators, replay and `forget`, no page errors), `arcade-visual-check` (all six
  games scored a hit in Chromium with no page errors), `arcade-multiplayer-check` (Pong and Ouroboros
  over real WebRTC between two Chromium browsers: linked, guest input moved host state, pause
  propagated, disconnect shown), `arcade-collection-check` (WebKit 390, WebKit 320 and a throttled
  Chromium Pixel: all six games, touch, pause, resize, Escape and reduced motion; 18 profile-and-game
  rows with 0px overflow, no target under 44px and no input under 16px), and `arcade-screens`.
- Screenshots read by eye at 1440x900 on the green and amber phosphors and at 390 on WebKit:
  the three entrance moments, the gallery with six live cabinets, the gallery later in the attract
  cycle, the hall of fame, a cabinet's detail, a running game, the pause, a result with the board,
  the site after exit, and the short re-entry.

Two things the run found and fixed before any of this passed. The BIOS typewriter, a chain of 6ms
timeouts, typed a character every 90ms under headless Chromium and never finished: a control reading
on the plain page showed the same 150 to 190ms long tasks with no arcade open, and the renderer string
was SwiftShader, so the tube's WebGL was being painted in software and starving timers. The typing now
runs by elapsed time from the one clock, with a watchdog. And one flow run out of five threw
`Invalid count value: -2`: a frame timestamp earlier than the moment the bar started, so
`"█".repeat()` got a negative count. `barText()` clamps, and its test pins the negative case.

Revert-to-confirm for the scroll fix: `data-lenis-prevent` was taken off the room in a disposable build
and `scripts/arcade-scroll-check.mjs --expect-broken` read the room at 0px under the same five wheel
ticks, then the source was restored. With the attribute the room moves 474px; without it, 0px.

Limits: no physical phone, no two-network WebRTC pair, no real board post (the local build has no
Blob token, so every board read "offline" and the BIOS line said so). The boards' online path is the
release's unchanged code. Headless Chromium runs the tube in software, so nothing here is a frame-rate
measurement.
