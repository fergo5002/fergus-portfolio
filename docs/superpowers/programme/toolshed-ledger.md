# Toolshed programme ledger

Single source of truth for programme state. Update this file, not memory, when a task starts, finishes, blocks or is reviewed. The design is `docs/superpowers/specs/2026-09-03-toolshed-programme-design.md`; sub-project specs and plans sit beside it under `specs/` and `plans/`.

Conventions: one line per sub-project below, state in bold, then a dated log. States: `queued`, `spec`, `plan`, `building`, `review`, `pr`, `merged`, `live`, `blocked`, `dropped`. Branch names are `toolshed/<id>-<slug>`; worktrees are siblings of the repo made through `workspaces.ps1`.

## Board

| ID | Sub-project | State | Branch | PR | Live check |
|---|---|---|---|---|---|
| F0 | Ship path | **live** | `toolshed/f0-ship-path` (in the main checkout, F0 only; every later sub-project gets its own worktree) | [#1](https://github.com/fergo5002/fergus-portfolio/pull/1) merged 4b968c0 | `dpl_4DPMWyNeL3FKBmYfcuTqJwibyc2F` READY, aliased, /tools 200 |
| F1 | Command registry | **live** | `toolshed/f1-command-registry` | [#2](https://github.com/fergo5002/fergus-portfolio/pull/2) merged a269a1e | `dpl_Cp4p19RHXiafBDMzh3PJjG4mwuNm` READY; live `help` prints the five sections, `cd arcade` prints "arcade: no runtime yet", `top` lists arcade, console clean |
| F2 | The shell everywhere | **review** | `toolshed/f2-shell-everywhere` (11 commits) | | |
| F3 | Tool registry and page shell | **review** | `toolshed/f3-tool-registry` (10 commits) | | |
| F4 | State layer | **done to Task 7, held unmerged** | `toolshed/f4-state-layer` (16 commits) | not opened | 82/82 mutations, cold Docker parity green; Redis and Neon wait on Fergus |
| S1 | Spike: WebSocket on Hobby | **building** | `toolshed/s1-websocket` | | |
| S2 | Spike: WebKit in a function | **building** | `toolshed/s2-webkit` | | |
| S3 | Spike: DuckDB in the tab | **decided** | `toolshed/f5-spikes` | record on main | 0 mismatches at 1e-9; 8.1 MB gzip and 82 s at Slow 4G, so DuckDB does not ship: port to TypeScript, keep the macros as the oracle |
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
- 2026-09-03: spikes S4 and S3 decided, records on main under `docs/superpowers/spikes/`. S3's 8 MB DuckDB bundle was ruled on rather than parked: DuckDB does not ship, the macros are ported to TypeScript, and the DuckDB-versus-Postgres comparison becomes T4's regression test at 1e-9. Reasoning appended to the S3 record. The design's dependency list loses `@duckdb/duckdb-wasm`.
- 2026-09-03: S2 and S1 runner dispatched (preview deployments only). F2 worktree cut from main after F1 merged.
- 2026-09-03 19:00: PR #3 (CRLF contact test) green and merged as 56affc9, production `dpl_GHGRwoTS1eXmcn8KGPK7JiQnvBRi` READY, and the file's 42 tests now pass on this Windows checkout where they were red before. Test-only change, so no user-facing flow was exercised beyond a 200 on the home page, and that is all that claim covers.
- 2026-09-03 19:00: plan-writers dispatched for T1 Drift and T2 Relief, both on Opus 5. Every agent from here runs on Opus; the four started earlier (F2, F3, F4, the S2 and S1 spikes) keep Fable until their task ends, because a model is fixed when an agent spawns and killing them would discard finished work.

## Waiting on Fergus

- **2026-09-03: two Vercel Marketplace terms acceptances, and nothing else.** Provisioning Upstash Redis and Neon Postgres on the free plan stopped with `integration_terms_acceptance_required`. No resource was created for either, so `UPSTASH_REDIS_REST_URL` and `DATABASE_URL` do not exist and every budget, board, census and cache proof is running against fakes. Vercel Blob provisioned without a prompt and is real. Accept as the `larry-pm` owner at `https://vercel.com/larry-pm/~/integrations/accept-terms/upstash?source=cli` and `.../neon?source=cli`, then the two retry commands in `docs/superpowers/programme/f4-stores-2026-09-03.md` create both on the free plan. Not automated on purpose: accepting terms is a signature, and it is his to give.

## Log
- 2026-09-03 19:40: the Fable quota ran out and killed all four remaining Fable agents (F2, F3, F4, the S2 and S1 spikes) within a few minutes of each other. Nothing was lost: every one had committed its work, and each was re-dispatched on Opus with a brief naming its exact branch state, its uncommitted files and its predecessor's last action, so none of it is redone. F2 was mid-drawer, F3 mid phone-check triage, F4 at 64 of 82 mutation rows, S2 reading the usage page.
- 2026-09-03 22:30: F4 finished everything the missing stores allow. Observed: 82 of 82 mutations caught with a clean tree afterwards; a cold `--no-cache` parity image, the first build having been thrown away because every layer returned CACHED and a build that cannot fail is not a check; inside it, a clean install under strict peers, 39 static pages built with no store variables present, 1,202 tests passed and 2 skipped, and both `/tools/headline-check` and `/api/mcp` answering 200 with all three store variables unset. Real store proven: Blob alone, and proven falsifiable first, since no token reads "not configured" and a wrong token fails loudly. Everything Redis is proven against a fake.
- 2026-09-03 22:30: **F4 is deliberately not merged**, which is my call rather than the agent's. A missing Redis throws in production by design, so merging before the stores exist risks a live headline-check submission throwing where today it uses an in-memory bucket. The container proved the page renders; nobody has proven a real submission survives, and the agent said so plainly. The branch waits, rebased as main moves, until the two terms acceptances land, which makes those two clicks the critical path for the whole state track.
- 2026-09-03 22:35: the T2 Relief plan exists on disk but stops at Task 9, killed mid-write, so it is not committed yet. Its agent is queued to finish it.
- 2026-09-03 23:00: F2 done. Observed by the agent: tsc clean, 1,127 tests, build compiled, 76 of 76 mutations caught, and the drawer driven on a real WebKit iPhone at 390 and 320 with zero overflow, a 44 by 44 prompt target, a 16px input so iOS does not zoom, Escape returning focus to the status bar, and `cd arcade` answering from a writing page. Reviewer dispatched.
- 2026-09-03 23:00: F3 done, and it caught the trap this ledger already carries: its predecessor's last green phone run was against a stale build, so every number was re-taken against a fresh one. Real page defects found and fixed, each proven by reverting: nav links were 47 by 40 inside a 44px bar, and putting 40 back brought exactly six failures per route. Also fixed: 21 by 16 machine buttons, a skiplink and call to action at 41, a 20px label, a 43px input, and Talk lines at 3.7:1 contrast. Three checker false positives were fixed in the checker rather than the page, each with a case pinned in the fixture: a 1x1 clipped visually-hidden element, a thin arrow glyph in a roomy rect, and a set of readings traced to `fullPage` capture dropping the emulated media state so hover rules stopped matching and 41 elements moved mid-capture. The docblock that had blamed the wrong cause was rewritten. Reviewer dispatched.
- 2026-09-03 23:05: PR #4 fixes a live bug the F2 agent spotted and I photographed on production: the terminal prompt read `fergus@portfolio::~ $$`. The stylesheet carries a literal colon and dollar for those two classes while the other three read variables only PromptLine sets, so Terminal writing all five as text doubled exactly two. Fixed by emptying the spans, guarded in `components/chrome.test.ts`, and the guard was proven able to fail.
