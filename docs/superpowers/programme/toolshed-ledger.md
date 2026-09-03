# Toolshed programme ledger

Single source of truth for programme state. Update this file, not memory, when a task starts, finishes, blocks or is reviewed. The design is `docs/superpowers/specs/2026-09-03-toolshed-programme-design.md`; sub-project specs and plans sit beside it under `specs/` and `plans/`.

Conventions: one line per sub-project below, state in bold, then a dated log. States: `queued`, `spec`, `plan`, `building`, `review`, `pr`, `merged`, `live`, `blocked`, `dropped`. Branch names are `toolshed/<id>-<slug>`; worktrees are siblings of the repo made through `workspaces.ps1`.

## Board

| ID | Sub-project | State | Branch | PR | Live check |
|---|---|---|---|---|---|
| F0 | Ship path | **live** | `toolshed/f0-ship-path` (in the main checkout, F0 only; every later sub-project gets its own worktree) | [#1](https://github.com/fergo5002/fergus-portfolio/pull/1) merged 4b968c0 | `dpl_4DPMWyNeL3FKBmYfcuTqJwibyc2F` READY, aliased, /tools 200 |
| F1 | Command registry | **live** | `toolshed/f1-command-registry` | [#2](https://github.com/fergo5002/fergus-portfolio/pull/2) merged a269a1e | `dpl_Cp4p19RHXiafBDMzh3PJjG4mwuNm` READY; live `help` prints the five sections, `cd arcade` prints "arcade: no runtime yet", `top` lists arcade, console clean |
| F2 | The shell everywhere | **plan** | | | |
| F3 | Tool registry and page shell | **building** | `toolshed/f3-tool-registry` | | |
| F4 | State layer | **plan** (Tasks 1 to 4 written, rest in progress) | `toolshed/f4-state-layer` (cut, idle) | | |
| S1 | Spike: WebSocket on Hobby | **plan** (brief written, runner not started) | | | |
| S2 | Spike: WebKit in a function | **plan** (brief written, runner not started) | | | |
| S3 | Spike: DuckDB in the tab | **decided** | `toolshed/f5-spikes` | record on main | 0 mismatches at 1e-9; macros; 8.1 MB gzip, 82 s median at Slow 4G: bundle decision for Fergus |
| S4 | Spike: the .ie seed | **decided** | `toolshed/f5-spikes` | record on main | 126,214 registered .ie domains, 17 MB, under a minute, reproduced twice; 38% of the registry figure |
| T1 | Drift | **queued** | | | |
| T2 | Relief | **queued** | | | |
| T3 | Overlap | **queued** | | | |
| T4 | Second Visit | **queued** | | | |
| T5 | On the glass | **queued** | | | |
| T6 | Irish Stack Census | **queued** | | | |
| T7 | Tide | **queued** | | | |
| X1 | Burn | **queued** | | | |
| G0 | Arcade runtime | **queued** | | | |
| G1 | Phosphor Pong | **queued** | | | |
| G2 | Snake | **queued** | | | |
| G3 | Under the Terminal | **queued** | | | |
| G4 | Six-max poker | **queued** | | | |
| P1 | Play your website | **queued** | | | |
| L1 | Launch | **queued** | | | |

## Decisions that changed the design after 2026-09-03

(none yet)

## Meters

Filled in monthly from the Vercel, Upstash and Neon usage pages. Rule from the design, section 5: a meter past 60% before the 20th halves the global cap of the tool responsible.

| Month | Active CPU (of 4 h) | Memory (of 360 GB-h) | Invocations (of 1M) | Redis (of 500k) | Neon (of 100 CU-h) |
|---|---|---|---|---|---|
| 2026-09 | | | | | |

## Log

- 2026-09-03: programme designed, decisions taken, ledger opened. Nothing built yet.
- 2026-09-03: F0 Task 1 done. gitleaks over 82 commits: one finding, the IndexNow key, public by design. Verdict clean, record in `f0-sweep-2026-09-03.md`.
- 2026-09-03: found pre-existing uncommitted work in the checkout dated 2026-08-22: an `analytics` script line in `package.json` and an untracked `scripts/analytics.mjs`. Not part of F0, left untouched and unstaged. Fergus to decide whether it ships.
- 2026-09-03: F0 Task 2 observed. CI on PR #1: `check` passed in 1m20s, `mutation` passed in 10m23s (64 mutations; the 20-minute timeout I first wrote was a guess from a stale count, review caught it, now 30). Canary commit 61c0709 made `check` fail in 38s, reverted in 9619411. Vercel's preview check on the private repo failed with "Git author fergo5002 must have access to the project on Vercel to create deployments".
- 2026-09-03: F0 Task 3 observed. Repository is PUBLIC (`gh repo view`: isPrivate false). `main` protected: required checks `check` and `mutation`, strict, no force-push, no deletions, admins may still push docs. The first protection PUT got "Repository has been locked (403)" straight after the flip; it went through on the retry twenty seconds later.
- 2026-09-03: prediction before Task 4: the merge of PR #1 produces a production deployment with readyState READY and meta.githubCommitSha equal to the merge commit. If it is BLOCKED, the private-repo rule was not the whole cause and the Vercel account's GitHub connection is the next suspect.
- 2026-09-03: F0 Task 4 observed, prediction held. PR #1 squash-merged as 4b968c0; production deployment `dpl_4DPMWyNeL3FKBmYfcuTqJwibyc2F` went BUILDING then READY with `meta.githubCommitSha` 4b968c0, `aliasAssigned` true, aliases fergusoreilly.dev and www; live /tools returned 200 with the headline-check entry. On the revert run the Vercel preview check also passed for the same git author, which is the second observation that the private-repo rule was the cause. Not verified: runtime logs (no runtime code changed in this PR; the only file was the workflow). Rung: explained (the mechanism predicted the preview pass and the READY deploy, and both checked out); not "fixed" in the revert-to-confirm sense, since flipping the repo back private to watch it block again is not worth doing.
- 2026-09-03: F0 done. Wave 0 next: F1, F3, F4 and the four spikes in parallel, each in its own worktree from main at 4b968c0 or later.
- 2026-09-03 17:20: plans for F1, F2, F3 and the four spikes are on main; F4's plan has Tasks 1 to 4 and the rest is being written. Implementers running: F1, F3, and one spike runner doing S4 then S3. Four agents at once, not six: an earlier burst of six exhausted the session's usage limit at about 14:30 and every agent died with it (nothing was lost on disk; the worktrees had no commits). S2 and S1 start when a slot frees.
- 2026-09-03: a pre-existing worktree `C:\Devergus-portfolio-mobile-motion` on `feat/mobile-motion` (one month old, with changes) is not part of this programme and is left alone.
- 2026-09-03 18:30: F1 built. Implementer observed: tsc exit 0; 41 of 42 test files green, 1,066 of 1,067 tests; the one red is `lib/contact.test.ts` "puts the click on the fields themselves", red at baseline on this CRLF checkout (`indexOf("<form
")` against a CRLF file) and green in CI on Linux, so it is a Windows-checkout fragility, not F1's. Mutation check with that file temporarily LF: 71 of 71 caught, all seven F1 rows red. Not verified by the implementer: build, parity image, phone check, CI, live. Rebased onto main; reviewer dispatched.
- 2026-09-03: three implementers (F1, F3, F4) and the spike runner each stopped once while waiting on a backgrounded long run; a stopped subagent is not woken by its own monitor. Each was resumed with an instruction to poll the output file. Lesson logged in the playbook.
- 2026-09-03 18:20: F1 review (ledger-aware code-reviewer): parity confirmed, door clean, purity clean, interfaces exact; one medium finding, `help` had lost its five curated sections to a flat sorted list (my brief asked for "sorted", so the regression was mine). Fixed with `group` and `rank` on each command and a line-for-line parity test against the old text. PR #2, CI green (check 1m05s, mutation 6m28s), squash-merged as a269a1e, production `dpl_Cp4p19RHXiafBDMzh3PJjG4mwuNm` READY. Live check by real browser: `help`, `cd arcade`, `top` as above; console errors 0. Not verified: the parity Docker image (low-risk tier, skipped by policy), reduced-motion behaviour (unchanged code).
- 2026-09-03: PR #3 opened for the CRLF-fragile contact test (normalise line endings before the guard), found by the F1 implementer, reproduced by the reviewer, green on this checkout after the change.
- 2026-09-03: spikes S4 and S3 decided, records on main under `docs/superpowers/spikes/`. S3's 8 MB DuckDB bundle is a decision for Fergus before T4 starts: ship it on demand with a progress line, or port the three macros to plain JS with the Postgres comparison as the oracle (recommended, and it keeps the "same model" claim because the numbers match to 1e-13).
- 2026-09-03: S2 and S1 runner dispatched (preview deployments only). F2 worktree cut from main after F1 merged.
