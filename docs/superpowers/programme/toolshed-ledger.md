# Toolshed programme ledger

Single source of truth for programme state. Update this file, not memory, when a task starts, finishes, blocks or is reviewed. The design is `docs/superpowers/specs/2026-09-03-toolshed-programme-design.md`; sub-project specs and plans sit beside it under `specs/` and `plans/`.

Conventions: one line per sub-project below, state in bold, then a dated log. States: `queued`, `spec`, `plan`, `building`, `review`, `pr`, `merged`, `live`, `blocked`, `dropped`. Branch names are `toolshed/<id>-<slug>`; worktrees are siblings of the repo made through `workspaces.ps1`.

## Board

| ID | Sub-project | State | Branch | PR | Live check |
|---|---|---|---|---|---|
| F0 | Ship path | **live** | `toolshed/f0-ship-path` (in the main checkout, F0 only; every later sub-project gets its own worktree) | [#1](https://github.com/fergo5002/fergus-portfolio/pull/1) merged 4b968c0 | `dpl_4DPMWyNeL3FKBmYfcuTqJwibyc2F` READY, aliased, /tools 200 |
| F1 | Command registry | **queued** | | | |
| F2 | The shell everywhere | **queued** | | | |
| F3 | Tool registry and page shell | **queued** | | | |
| F4 | State layer | **queued** | | | |
| S1 | Spike: WebSocket on Hobby | **queued** | | | |
| S2 | Spike: WebKit in a function | **queued** | | | |
| S3 | Spike: DuckDB in the tab | **queued** | | | |
| S4 | Spike: the .ie seed | **queued** | | | |
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
