# Toolshed programme ledger

Single source of truth for programme state. Update this file, not memory, when a task starts, finishes, blocks or is reviewed. The design is `docs/superpowers/specs/2026-09-03-toolshed-programme-design.md`; sub-project specs and plans sit beside it under `specs/` and `plans/`.

Conventions: one line per sub-project below, state in bold, then a dated log. States: `queued`, `spec`, `plan`, `building`, `review`, `pr`, `merged`, `live`, `blocked`, `dropped`. Branch names are `toolshed/<id>-<slug>`; worktrees are siblings of the repo made through `workspaces.ps1`.

## Board

| ID | Sub-project | State | Branch | PR | Live check |
|---|---|---|---|---|---|
| F0 | Ship path | **queued** | | | |
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
