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
- [ ] Final-head full mutation gate and browser checks after the release refinements.
- [ ] PR, required checks, merge, Vercel READY + alias + live browser verification.
- [ ] Update programme evidence and durable personal-site memory.

The new request supersedes the original character-only cabinet and the unbuilt
six-max poker label. Circuit Poker is explicitly a single-player draw game with no
money or betting, not a claim to implement six-max hold'em.

## Evidence so far

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

PR #15 is open at `ab223ab`. The final local production build and TypeScript pass;
the baseline suite passes 2,453 tests and all four new leaderboard mutations are caught.
Vercel preview `dpl_GsBG2y3Bi4x9zCxB64nigGVZmBTG` is READY. A real browser completed a
Circuit Poker run, posted 110 points to the preview namespace, verified chosen-initial
persistence, replay and `forget`, with six synthesis events and no browser exceptions.
Preview access used the project's existing automation credential, scoped only to that
deployment; no protection setting was changed. Complete phone and mutation CI remain pending.

The release refinements add the Snake ready countdown, preserve the gallery's top position
when focus moves, and prevent cached HTTP board reads after a post. The updated local build
passes 2,455 tests and five focused mutations. The initial PR's complete phone gate passed
in 10m6s, including both multiplayer games. Final-head CI repeats those flows. The preview
posting check now also requires the submitted score on the immediately following API read.
