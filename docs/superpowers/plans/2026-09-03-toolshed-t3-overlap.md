# T3 Overlap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/tools/overlap`: two people about to meet find out who they both already know, by dropping a LinkedIn `Connections.csv` into two browsers that connect directly to each other and swap salted hashes, with names filled in on each side from that side's own file and never from the wire.

**Architecture:** Everything that matters is a pure function in `lib/tools/overlap/` with a test beside it. A CSV becomes rows, a row becomes a normalised profile slug, a slug becomes a truncated salted SHA-256, and a sorted list of those hashes is the only thing that crosses. The transport is behind a three-method `Channel` interface, so the whole protocol (salt, framing, chunking, Bloom fallback, intersection, safety string) is driven end to end in vitest by two in-memory channels wired to each other, and the only untested part is the `RTCPeerConnection` wiring itself. The server does one thing: `app/api/relay` holds an SDP offer and an SDP answer under a six-character code for ten minutes. It never sees a hash, a name or a list. When Redis is missing it says so in a sentence and the page falls through to copy and paste, which needs no server at all.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, vitest 2 (node environment, no jsdom), hand-written CSS, and four platform APIs the browser already has: `RTCPeerConnection`, `crypto.subtle`, `crypto.getRandomValues` and `FileReader`. On the server: `@upstash/redis` through F4's `lib/store/redis.ts`, and F4's `lib/budget.ts`. No new dependencies.

## Global Constraints

- Programme design: `docs/superpowers/specs/2026-09-03-toolshed-programme-design.md`. This plan is T3 (section 6, wave 1). Its line, verbatim: "`/tools/overlap`. Two people drop their LinkedIn `Connections.csv` into two tabs; a six-character room code from `api/relay` introduces the tabs over WebRTC; one side generates a salt, both hash every profile slug with it, only hashes cross the channel, each side sees the intersection with names only from its own file. Relay stores the offer and answer in Redis for ten minutes and nothing else, and the page offers the copy-paste route with no relay at all. Bloom filters above 10,000 rows. This relay is reused by Pong. Can't see: second-degree paths, warmth, changed slugs."
- **No new dependencies.** WebRTC, `crypto.subtle`, `crypto.getRandomValues`, `FileReader`, `CompressionStream` and `TextEncoder` are all platform. A CSV reader is one state machine, a Bloom filter is a `Uint8Array` and twenty index computations, and an SDP blob is a string. If a later reviewer thinks a package is unavoidable, the argument goes on the pull request before the install.
- vitest only, `environment: "node"`, `include: ["**/*.test.ts"]`. No jsdom, so no React component can be mounted. Every piece of logic lives in `lib/tools/overlap/*.ts` or `lib/relay.ts` as a pure or injectable function with a test beside it, and the React is wiring. Component wiring is proved by source-grep coupling tests in the pattern of `lib/boot.test.ts` and `components/chrome.test.ts`, and every one of those says in its docblock that it is a coupling check and not a render.
- **`crypto.subtle` is testable here and WebRTC is not, and the plan says so at each point.** CI runs Node 24 (`.github/workflows/ci.yml`), where `globalThis.crypto.subtle` and `globalThis.crypto.getRandomValues` are present without an import, so the hashing, the salt and the safety string are all directly under test. There is no `RTCPeerConnection` in Node and this plan does not shim one: `lib/tools/overlap/webrtc.ts` is the only module that touches it, it is thin, it is behind the `Channel` interface, and it is covered by a coupling test and by the two-browser check in Task 14. Any claim that the handshake works rests on that manual run and on Task 15's live run, never on the suite.
- F3's interfaces are frozen and this plan consumes them unchanged: `ToolEntry` (`slug, name, blurb, privacy, cantSee, status, order`), `content/tools/index.ts` exporting `tools`, `liveTools`, `toolBySlug` and `toolShellCopy`, `components/tools/ToolPage.tsx` with props `{ tool, children }` plus the optional `extraSchema` and `talk`, `TOOL_RUN_EVENT = "tool_run"` with payload `{ tool: string; outcome: "ok" | "refused" | "error"; ms: number }`, `trackToolRun(payload)` in `lib/tools/events.ts`, and `scripts/phone-check.mjs --base --routes`.
- F4's interfaces are frozen and this plan consumes them unchanged: `getRedis()` from `lib/store/redis.ts`, `StoreUnavailableError` from `lib/store/errors.ts`, and from `lib/budget.ts` the types `BudgetScope`, `BudgetRequest`, `BudgetResult` and the functions `takeBudget(req, now?)` and `budgetKeyForIp(headers)`.
- **`privacyNote?: string` is shared with T2 and whichever lands second must not add it twice.** Both plans specify the same optional field on `ToolEntry`, rendered by `ToolPage` directly after the privacy line. Task 1 Step 2 checks whether it is already there and skips its own edit if so. This is the one place T2 and T3 touch the same lines.
- All copy lives in `content/tools/overlap.ts` and passes `content/voice.test.ts`: no em dash, no en dash outside a date, British spelling. Nothing is hard-coded in a page, a component or a route handler, the relay's refusal sentences included.
- Hand-written CSS. The tool owns `app/tools/overlap/tool.css`, imported by its own `page.tsx` (design section 2, rule 2). `app/globals.css` is touched only if T2 has not already added `.tool__privacynote`.
- Every animation gated behind `@media (prefers-reduced-motion: no-preference)`. There is one on this route, a CSS opacity fade on the results block, and nothing else moves. No second `requestAnimationFrame` loop: `SystemProvider` owns the only one (AGENTS.md).
- **Nothing is written to the visitor's machine.** No `localStorage`, no `sessionStorage`, no `indexedDB`, no `document.cookie`, no Cache API, anywhere under `app/tools/overlap/` or `lib/tools/overlap/`. `lib/tools/overlap/safety.test.ts` greps both directories and fails on any of them. The page says `forget` has nothing to wipe here, and the same test asserts that sentence is in the copy, so the claim and the code are checked together.
- **`tool_run` carries the slug, the outcome and the milliseconds.** Never a name, never a hash, never a row count, never a room code. The duration is rounded to the nearest 100 ms before it is sent, because a millisecond-precise duration correlates with list size and the number is only wanted as a rough performance signal.
- **The honesty rules for the copy, which are guards rather than taste.** The page may not say "cryptographically private", "cryptographically secure", "zero knowledge", "anonymous" or "end-to-end encrypted". It must carry, in these words, the sentence "your list never leaves your browser, and the person you are comparing with sees only hashes", and the paragraph that says this is not a private set intersection protocol and why. `lib/tools/overlap/copy.test.ts` is the guard and there is a mutation row on it.
- Commit messages: lowercase `type(scope): declarative sentence`. British English, no em dashes, per `C:\Users\oreil\.claude\LANGUAGE.md`.
- Branch `toolshed/t3-overlap` in its own sibling worktree made through `workspaces.ps1`, never reused, never removed by an agent. The repository is public, so this ships as a pull request needing the `check` and `mutation` jobs green.
- Claims discipline (`C:\Users\oreil\.claude\CLAIMS.md`): every step that runs something says what the output proves and what it cannot see. Numbers that have not been measured are labelled as guesses until a run replaces them. The word for the handshake is "untested" until Task 14, and "observed on two browsers" after it, never "works".

---

## The cryptography, decided up front, and exactly what it does not do

### What crosses the wire

One side generates 32 bytes with `crypto.getRandomValues` and sends them over the established data channel. Both sides then compute, for every connection in their own file:

```
hash = first 8 bytes of SHA-256( salt_bytes || utf8(normalised_slug) )
```

written as 16 lowercase hex characters, sorted ascending, deduplicated. `crypto.subtle.digest("SHA-256", bytes)` does the work. The two sides swap those lists and each intersects locally. Names are then read out of the local file by hash, so a name only ever appears on the machine whose file already had it.

### Why 8 bytes and not 4, and not 32

A truncation is a birthday problem. Two lists of `n` entries each make `n²` cross pairs, and with `b` bits the expected number of pairs that collide by accident is about `n² / 2^b`. A collision here is not abstract: it prints a person's name under "you both know these people" when you do not both know them.

| Truncation | Bits | Expected wrong names, 5,000 by 5,000 | Expected wrong names, 30,000 by 30,000 |
|---|---|---|---|
| 4 bytes | 32 | 5.8e-3, about one run in 172 | 0.21, about one run in five |
| 6 bytes | 48 | 8.9e-8, about one run in 11 million | 3.2e-6 |
| **8 bytes** | **64** | **1.4e-12** | **4.9e-11** |
| 32 bytes | 256 | nil, and four times the bytes | nil |

LinkedIn caps a personal network at 30,000 connections, so the right-hand column is the worst case that exists. 8 bytes buys a false name about once in twenty billion runs, which is far below the rate at which a person changes their profile URL, and it costs 16 characters a connection. 32 bytes would quadruple the transfer to buy nothing anybody could ever observe. `HASH_HEX_CHARS = 16` is the decision and `lib/tools/overlap/hash.test.ts` pins the literal.

Transfer sizes at 17 bytes an entry, hash plus separator: 2,000 connections is 34 KB, 10,000 is 170 KB, 30,000 is 510 KB.

### The Bloom fallback, and the bit count it is built from

Above `BLOOM_THRESHOLD = 10_000` entries, a side sends a Bloom filter instead of its hash list. The design fixes the threshold; the arithmetic below fixes the size.

Target false-positive rate per name checked: `p = 1e-6`. From `m/n = -ln p / (ln 2)^2`:

```
m/n = 13.8155 / 0.480453 = 28.755  ->  BITS_PER_ENTRY = 29
k   = round(29 * ln 2) = round(20.10) = 20  ->  HASH_COUNT = 20
```

The rate that actually falls out of 29 bits and 20 probes is `(1 - e^(-20/29))^20 = 8.89e-7`, one in about 1.12 million per name checked. Checking a 10,000-entry list against a peer's filter therefore expects 0.0089 wrong names, about one run in 112; at 30,000 it is 0.027, about one run in 37. The page prints the number computed from the real sizes whenever a filter is in use, and says what it means in a sentence.

Size: 29 bits an entry is 3.625 bytes, so 10,000 entries is 36 KB of filter, which base64 inflates to 48 KB against the 170 KB the exact list would have cost. The saving is 3.5 times, not the ten times a filter is usually sold on, and that is worth writing down rather than implying.

Twenty indices come out of the 64-bit hash by Kirsch-Mitzenmacher double hashing: `h1` is the top 32 bits, `h2` is the bottom 32 bits forced odd, and index `i` is `(h1 + i * h2) mod m`. The one guard that matters is that `h2 mod m` can be zero, which would make all twenty probes hit the same bit and turn the filter into a one-bit filter; `|| 1` on the step is the guard and it has a mutation row.

**The exact-confirmation variant, considered and refused.** A filter exchange can be made exact by having the receiver send its matching hashes back for the sender to check against its real set. It would remove the false positives entirely and cost one extra round trip. It is refused because it leaks: the receiver would be handing back its own false positives, which are hashes of people it knows and the sender does not, and the sender holds the salt and can grind a dictionary against them. Both sides sending a filter and neither sending anything back is the version where nothing crosses that was not going to cross anyway.

### The weakness, stated plainly, in the plan and on the page

**A salted hash of a low-entropy identifier is not a commitment against the person holding the salt.** They have the salt. A LinkedIn profile slug is a person's name with a suffix, drawn from a space small enough to enumerate. So the peer can take a list of people they are curious about, hash those slugs with the same salt, and learn whether any of them are in your file, whether or not you both know them. Nothing in this design stops that and no truncation, iteration count or key derivation would: the peer is inside the protocol.

What the salt does buy is real but narrower. It stops anybody who is not in the room, including a future holder of a captured transcript, from using a precomputed table. It makes the hashes useless outside this one pairing, because the salt is thrown away when the tab closes.

So the honest claim, and the only one this page may make, is: **your list never leaves your browser, and the person you are comparing with sees only hashes.** Not "private", not "secure", not "zero knowledge". This is a tool for two people who have chosen to compare notes. It is not a protocol against an adversary, and the page says that in those words.

Two more things the other person genuinely does learn, both of which go on the page:

- **Roughly how many connections you have**, because the number of hashes is the number of names.
- **Your IP address**, because the two browsers connect directly to each other. That is what WebRTC is. There is no version of this tool that avoids it, and if either person minds, the answer is not to run it.

And one the relay learns: an SDP offer carries ICE candidates, and ICE candidates carry addresses. So the relay sees the visitor's address twice over, once from the request and once inside the blob it is holding. It holds the blob for ten minutes and the hashed address for a day, and it never sees a hash or a name.

### The safety string, and the single thing it catches

After the exchange, both sides compute four characters from `SHA-256(salt || dtls_fingerprint_of_offer || dtls_fingerprint_of_answer)`, mapped into the room-code alphabet, and print them. The two people read them to each other.

It catches exactly two failures: a relay that has put itself in the middle by substituting its own offer and answer, and two people who are in different rooms because one of them mistyped a code that happened to be live. It does not catch a stranger who guessed the code, because in that case there is only one far side and both ends compute the same string. And it catches nothing at all unless the two people actually read the characters aloud. All three of those sentences are on the page.

### The room code alphabet, and why these eleven characters

The code is read down a phone or across a table, then typed. Two different failure modes, so two filters.

Aurally, English letter and digit names cluster by vowel, and a bad line collapses each cluster. Take one member from each and the confusions go away:

| Cluster | Members | Kept |
|---|---|---|
| "ee" | B C D E G P T V Z 3 | **3** ("three", the only one with a consonant cluster in front) |
| "ay" | A H J K 8 | **K** |
| "eh" | F L M N S X | **F**, **M** (fricative coda against nasal coda, the one pair inside a cluster that survives a bad line) |
| "eye" | I Y 5 9 | **9** |
| "oo" | Q U W 2 | **W** ("double-u", three syllables), **2** |
| single | 4, 6, 7, R | **4**, **6**, **7**, **R** |
| single | 0, O, 1 | none, see below |

Visually, `0` against `O` and `1` against `I` and `l` are the two pairs people get wrong when typing from a screenshot, and both halves of each are already gone. `U` is dropped as well, on the usual grounds that a six-character code from an alphabet containing it will eventually spell something.

**`CODE_ALPHABET = "234679FKMRW"`**, eleven characters, six long, `11^6 = 1,771,561` codes. Displayed as `K4M-9F2`; the hyphen is decoration and is stripped on input, as are spaces and case. Two characters that were dropped for looking like something have exactly one surviving twin each, so typing them is a mistake with a single correct reading: `Z` maps to `2` and `G` maps to `6`. Everything else outside the alphabet is refused rather than guessed at.

1.77 million is not a large space, so it is defended rather than relied on: a room lives ten minutes, a wrong code costs a budget token against both the address and the code, and a guessed code buys an SDP offer and nothing else. Uniformity matters because a biased generator shrinks the space further, so `newCode` draws bytes and rejects any at or above 253, the largest multiple of 11 under 256, before taking the remainder. The rejection bound has a mutation row.

## The relay, and what it costs

Two routes, four handlers, one Redis key each for the offer and the answer, which is the "at most two blobs" the design asks for.

| Call | Redis commands | Notes |
|---|---|---|
| `POST /api/relay` create | 5 | ip budget 2, global budget 2, `SET relay:<code> ... EX 600 NX` 1 |
| `GET /api/relay?code=` fetch offer | 5 | ip 2, code 2, `GET` 1 |
| `POST /api/relay/answer` | 5 | ip 2, code 2, `SET relay:<code>:a ... NX` 1 |
| `GET /api/relay/answer?code=` poll | 3 | code budget 2, `GET` 1 |

The creator polls the answer key every 4 seconds for 60 seconds, so at most 15 polls, and the poll is budgeted against the code rather than the address because the code is the tighter cap and it is what a runaway client would spin on. A completed handshake is therefore about `5 + 5 + 5 + 45 = 60` commands.

At the caps below, the relay draws roughly `20 * 60 = 1,200` commands a day, near 37,000 a month, plus refusals. **This is a correction to the design's section 5 table**, which put "relay, boards, crons" together at 20,000 a month; that figure predates the polling arithmetic. The programme total moves from 206,000 to about 225,000 of the 500,000 free commands, which is 45% and still inside the rule that every meter sums to under 60%. If the meter says otherwise in the first month, the global cap halves, per the same rule.

Caps, all through F4's `takeBudget`:

| What | Scope | Limit | Window |
|---|---|---|---|
| Create a room | ip | 5 | 1 hour |
| Create a room | global | 20 | 1 day |
| Fetch an offer | ip | 20 | 1 hour |
| Fetch an offer | target (the code) | 5 | 10 minutes |
| Post an answer | ip | 20 | 1 hour |
| Post an answer | target (the code) | 3 | 10 minutes |
| Poll for an answer | target (the code) | 20 | 10 minutes |

**Redis does not exist in production yet.** The ledger has F4 held unmerged with "Redis and Neon wait on Fergus". So `getRedis()` throwing `StoreUnavailableError` is the expected state on the day this ships, not an edge case, and it is treated as one of the tool's normal answers:

- The route catches `StoreUnavailableError` and only that, and answers `503` with `{ error: "relay-unavailable", message }` where the message is a sentence a person can act on: room codes are off, use copy and paste, it needs no server.
- The client, on a 503 carrying that error code, switches to the copy-and-paste panel and prints the sentence above it. No spinner, no retry loop, no generic failure.
- Copy and paste is not a degraded mode. It is the route with no third party in it at all, and the page says it is the one to pick if you are being careful. Room codes exist because reading six characters aloud is easier than pasting a kilobyte of SDP into a message.
- Any other throw from the route is a `500` with the generic sentence, because a real fault must not be dressed up as a missing store.

---

## File structure

**Created**

| Path | Responsibility |
|---|---|
| `content/tools/overlap.ts` | The registry entry and every string the tool and the relay say. |
| `lib/tools/overlap/types.ts` | `Entry`, `SlugResult`, `Frame`, `Channel`, `ExchangeResult`, the named errors. |
| `lib/tools/overlap/slug.ts` (+ `.test.ts`) | A LinkedIn URL, or something that once was one, becomes a comparable slug. |
| `lib/tools/overlap/csv.ts` (+ `.test.ts`) | RFC 4180 parsing, the export's preamble, the header, the column, the counts. |
| `lib/tools/overlap/hash.ts` (+ `.test.ts`) | The salt, the digest, the truncation, the sort and the dedupe. |
| `lib/tools/overlap/bloom.ts` (+ `.test.ts`) | The filter, its size, its probes and its stated rate. |
| `lib/tools/overlap/code.ts` (+ `.test.ts`) | The alphabet, unbiased generation, and reading a typed code. |
| `lib/tools/overlap/protocol.ts` (+ `.test.ts`) | The frames, the chunking, the exchange, the intersection, the safety string, and `pairedChannels`. |
| `lib/tools/overlap/demo.ts` (+ `.test.ts`) | Two synthetic lists and the two CSV files they can be saved as. |
| `lib/tools/overlap/relay-client.ts` (+ `.test.ts`) | The only module in the tool that calls `fetch`. |
| `lib/tools/overlap/webrtc.ts` (+ `.test.ts`) | The only module that touches `RTCPeerConnection`. Coupling test only. |
| `lib/tools/overlap/safety.test.ts` | The greps: no storage, `fetch` only in one file, `RTCPeerConnection` only in one file. |
| `lib/tools/overlap/copy.test.ts` | The honesty guard on the page's words. |
| `lib/relay.ts` (+ `.test.ts`) | The relay's pure half: keys, TTL, SDP validation, budget shapes, reply builders. Frozen for G1. |
| `app/api/relay/route.ts` (+ `route.test.ts`) | Create a room, fetch its offer. |
| `app/api/relay/answer/route.ts` (+ `route.test.ts`) | Post an answer, poll for one. |
| `app/tools/overlap/page.tsx` (+ `page.test.ts`) | Server component: metadata, schema, the shell, the island. |
| `app/tools/overlap/OverlapTool.tsx` (+ `.test.ts`) | The one client component. |
| `app/tools/overlap/tool.css` | The tool's own rules. |

**Modified**

| Path | Change |
|---|---|
| `content/tools/types.ts` | `privacyNote?: string`, only if T2 has not already added it. |
| `content/tools/index.ts` | One import line and one array entry, alphabetical. |
| `components/tools/ToolPage.tsx` | Renders `privacyNote`, only if T2 has not already added it. |
| `content/voice.test.ts` | The relay sentences and the tool's prose join the list. |
| `app/globals.css`, `app/globals.test.ts` | `.tool__privacynote`, only if T2 has not already added it. |
| `scripts/mutation-check.mjs` | Fourteen rows for T3's guards. |
| `.github/workflows/ci.yml` | Only if the phone job names routes rather than reading the sitemap. |
| `AGENTS.md`, `docs/PROGRESS.md`, `docs/superpowers/programme/toolshed-ledger.md` | The words that match the code, and the evidence. |

## Interfaces this plan freezes

G1 (Phosphor Pong) reuses the relay, so these names are frozen the moment this merges. Additions are allowed; renames are not.

```ts
// lib/relay.ts
export const ROOM_TTL_SEC = 600;
export const MAX_SDP_BYTES = 8 * 1024;
export function offerKey(code: string): string;      // `relay:${code}`
export function answerKey(code: string): string;     // `relay:${code}:a`
export function validSdp(value: unknown): value is string;
export type RelayError = "bad-request" | "bad-code" | "no-room" | "already-joined" | "budget" | "relay-unavailable" | "failed";
export type RelayReply = { status: number; body: Record<string, unknown> };
export function errorReply(error: RelayError, message: string, retryAfterSec?: number): RelayReply;

// lib/tools/overlap/code.ts
export const CODE_ALPHABET = "234679FKMRW";
export const CODE_LENGTH = 6;
export function newCode(fill?: (bytes: Uint8Array) => void): string;
export function normaliseTypedCode(input: string): string | null;
export function displayCode(code: string): string;   // "K4M-9F2"

// HTTP, consumed by G1
// POST /api/relay            { offer: string }              -> 200 { code, ttlSec }
// GET  /api/relay?code=      -                              -> 200 { offer } | 404 { error: "no-room" }
// POST /api/relay/answer     { code: string, answer: string } -> 200 { ok: true } | 409 { error: "already-joined" }
// GET  /api/relay/answer?code= -                            -> 200 { answer: string | null }
// any handler, no Redis      -> 503 { error: "relay-unavailable", message }
```

---

### Task 0: Worktree, branch, baseline

**Files:**
- Create: nothing in the tree

**Interfaces:**
- Consumes: `main` with F3 and F4 merged
- Produces: a sibling worktree on `toolshed/t3-overlap` that every later task runs in, and a recorded baseline test count

- [ ] **Step 1: Confirm F3 and F4 have landed**

```bash
cd /c/Dev/fergus-portfolio
git fetch origin
git log origin/main --oneline -5
for f in content/tools/index.ts content/tools/types.ts components/tools/ToolPage.tsx \
         lib/tools/events.ts scripts/phone-check.mjs \
         lib/store/redis.ts lib/store/errors.ts lib/budget.ts; do
  git cat-file -e origin/main:$f 2>/dev/null && echo "present: $f" || echo "MISSING: $f"
done
```

Expected: eight `present:` lines. Any `MISSING:` means the dependency is not merged. **Stop and say so** rather than inventing the interface T3 consumes. The ledger had F3 in review and F4 held unmerged at the time this plan was written, so this check is the likely blocker, not a formality.

- [ ] **Step 2: Create the worktree through the wrapper**

```powershell
powershell -NoProfile -File C:\Users\oreil\.claude\scripts\workspaces\workspaces.ps1 create -Repository C:\Dev\fergus-portfolio -Branch toolshed/t3-overlap
powershell -NoProfile -File C:\Users\oreil\.claude\scripts\workspaces\workspaces.ps1 path -Repository C:\Dev\fergus-portfolio -Branch toolshed/t3-overlap
```

Expected: the second command prints a sibling path of `C:\Dev\fergus-portfolio`. Every `cd` below means that path; the plan writes `$WT`. Never `git worktree remove` it.

- [ ] **Step 3: Install and record the baseline**

```bash
cd "$WT"
npm ci
npx tsc --noEmit && npx vitest run --reporter=dot 2>&1 | tail -4
```

Expected: `tsc` silent, and a `Tests  N passed` line. Write `N` down. What this proves: the checkout builds and the suite is green before T3 touches anything. What it cannot see: whether `main` is green on CI, which is a different machine with a different line-ending policy.

- [ ] **Step 4: Confirm the two platform APIs this plan tests against are really there**

```bash
cd "$WT"
node -e 'console.log("node", process.version, "subtle", typeof globalThis.crypto?.subtle?.digest, "grv", typeof globalThis.crypto?.getRandomValues, "cs", typeof globalThis.CompressionStream)'
```

Expected: `subtle function`, `grv function`. `cs` is `function` on Node 18 and later and is used only by the copy-and-paste route's compression, which has a documented fallback, so `undefined` there is a finding to record rather than a blocker. If `subtle` is `undefined`, stop: half this plan's tests are unwritable and the reason is the Node version, not the code. That is CLAIMS rule 1, prove the instrument.

---

### Task 1: The registry entry, the copy, and the field T2 may already have added

**Files:**
- Create: `content/tools/overlap.ts`
- Modify: `content/tools/types.ts` (one optional field, conditionally)
- Modify: `content/tools/index.ts` (one import line, one array entry)
- Modify: `components/tools/ToolPage.tsx` (one conditional paragraph, conditionally)
- Modify: `app/globals.css`, `app/globals.test.ts` (one rule, conditionally)
- Modify: `content/voice.test.ts`
- Test: `lib/tools/overlap/copy.test.ts`

**Interfaces:**
- Consumes: `ToolEntry`, `tools`, `toolShellCopy` (F3 Task 1)
- Produces: `overlapCopy` (every string the tool and the relay say) and `overlap: ToolEntry` with `status: "live"`, `privacy: "browser"`, `order: 30`

- [ ] **Step 1: Write the failing honesty test**

```ts
// lib/tools/overlap/copy.test.ts
import { describe, expect, it } from "vitest";
import { overlap, overlapCopy } from "@/content/tools/overlap";

/**
 * The copy guard.
 *
 * Every other test in this tool checks that the code does what the page says.
 * This one checks the page says the right thing, because the central risk here
 * is not a bug, it is a sentence that oversells what a salted hash buys. A
 * salted hash of a profile slug is not a commitment against the peer, who
 * holds the salt and can grind a dictionary of plausible slugs against it.
 *
 * There is a mutation row on this file. Softening the paragraph is meant to
 * turn the suite red.
 */

const everything = [
  overlap.name,
  overlap.blurb,
  overlap.privacyNote ?? "",
  ...overlap.cantSee,
  ...JSON.stringify(overlapCopy).split('","'),
].join(" \n ");

describe("overlap copy", () => {
  it("never claims more than a salted hash buys", () => {
    for (const banned of [
      /cryptographically (private|secure)/i,
      /zero[- ]?knowledge/i,
      /end[- ]to[- ]end encrypted/i,
      /\banonymous\b/i,
      /military[- ]grade/i,
      /completely private/i,
    ]) {
      expect(everything, `banned phrase ${banned}`).not.toMatch(banned);
    }
  });

  it("makes the one claim it is allowed to make, in those words", () => {
    expect(everything).toContain(
      "your list never leaves your browser, and the person you are comparing with sees only hashes",
    );
  });

  it("says what a salted hash does not do", () => {
    expect(overlapCopy.honesty.notPsi).toContain("not a private set intersection protocol");
    expect(overlapCopy.honesty.notPsi).toContain("holds the same salt");
    expect(overlapCopy.honesty.notPsi).toContain("chosen to compare notes");
  });

  it("names the three things the other side actually learns", () => {
    expect(overlapCopy.honesty.theyLearn).toContain("IP address");
    expect(overlapCopy.honesty.theyLearn).toContain("how many connections");
  });

  it("says the safety string is useless unless it is read aloud", () => {
    expect(overlapCopy.honesty.safety).toContain("read them aloud");
  });

  it("tells the visitor that nothing is written to their machine", () => {
    expect(overlapCopy.honesty.storage).toContain("forget");
    expect(overlapCopy.honesty.storage).toContain("nothing");
  });

  it("tells the visitor how to get the file", () => {
    expect(overlapCopy.export.how).toContain("Get a copy of your data");
    expect(overlapCopy.export.link).toBe("https://www.linkedin.com/mypreferences/d/download-my-data");
  });

  it("is a browser tool with a note about the one server part", () => {
    expect(overlap.privacy).toBe("browser");
    expect(overlap.privacyNote).toContain("room code");
  });
});
```

- [ ] **Step 2: Run it, then decide whether `privacyNote` needs adding**

```bash
cd "$WT"
npx vitest run lib/tools/overlap/copy.test.ts 2>&1 | tail -5
grep -n "privacyNote" content/tools/types.ts components/tools/ToolPage.tsx app/globals.css || echo "NOT PRESENT"
```

Expected: the test fails on `Cannot find module '@/content/tools/overlap'`. The grep tells you which of two worlds you are in.

**If the grep prints `NOT PRESENT`,** T2 has not merged and T3 adds the field. In `content/tools/types.ts`, directly after `privacy`:

```ts
  /**
   * One extra sentence under the privacy line, for a tool whose two words are
   * not the whole truth. Optional and additive: the frozen `ToolEntry` block in
   * the programme design permits additions.
   */
  privacyNote?: string;
```

In `components/tools/ToolPage.tsx`, directly after the paragraph that renders the privacy line:

```tsx
      {tool.privacyNote ? <p className="tool__privacynote">{tool.privacyNote}</p> : null}
```

In `app/globals.css`, beside the `.tool__privacy` rule:

```css
.tool__privacynote {
  color: var(--green);
  font-size: 0.9rem;
  margin-top: calc(var(--sp) * -0.5);
}
```

and add `.tool__privacynote` to the list in `app/globals.test.ts` that asserts body text never uses `--green-faint`.

**If the grep finds them,** T2 landed first, change none of those four files, and record in the ledger that T3 consumed T2's field unchanged. Both plans specify the same field with the same rendering, so second place is a no-op by design, not a merge to resolve.

- [ ] **Step 3: Write the entry and the copy**

```ts
// content/tools/overlap.ts
import type { ToolEntry } from "./types";

/**
 * Everything `/tools/overlap` says, including the relay's refusals, because a
 * route handler is not allowed to build a sentence any more than a component
 * is. `content/voice.test.ts` lints the prose and
 * `lib/tools/overlap/copy.test.ts` holds the claims to what the design can
 * actually support.
 */
export const overlapCopy = {
  command: "./overlap --two-tabs",
  path: "~/tools",
  title: "overlap",

  honesty: {
    notPsi:
      "This is not a private set intersection protocol, and calling it one would be a lie. Both browsers agree a random salt and then swap salted hashes, so the person you are comparing with holds the same salt you do. They can hash a list of people they are curious about and see whether any of them come back. This is a tool for two people who have chosen to compare notes. It is not a defence against the person on the other end.",
    claim:
      "The honest version of the promise is short: your list never leaves your browser, and the person you are comparing with sees only hashes.",
    theyLearn:
      "They also learn two things that are not on the list. Roughly how many connections you have, because the number of hashes is the number of names. And your IP address, because the two browsers connect straight to each other and that is what a direct connection is. Nothing about this tool avoids either.",
    relaySees:
      "The room code service holds one connection blob from each side for ten minutes and a hashed version of your address for a day. It never sees a hash from your list, a name, or the file. The blob does carry your address inside it, because that is how two browsers find each other.",
    safety:
      "The four characters under the result are computed from the salt and both connection fingerprints. Read them aloud to each other. If they match, nobody has put themselves between you and you are in the same room. If you do not read them aloud they do nothing at all.",
    storage:
      "This tool writes nothing to your machine: no cookie, no local storage, nothing. The forget command has nothing to wipe here.",
    stun:
      "Unless you turn it off, your browser asks a public address server run by Cloudflare what your address looks like from outside. It sends one small packet and no part of your file. Turn on same network only if you are both on the same wifi and would rather it did not.",
  },

  export: {
    how: "To get the file: LinkedIn, then Settings and Privacy, then Data privacy, then Get a copy of your data. Tick Connections, ask for the archive, and LinkedIn emails you a link when it is ready.",
    link: "https://www.linkedin.com/mypreferences/d/download-my-data",
    linkLabel: "LinkedIn's download page",
  },

  demo: {
    label: "Demo. Both lists are invented, both are built in this tab, and no connection is opened.",
    aName: "Aoife's connections (made up)",
    bName: "Cormac's connections (made up)",
    save: "Save the two demo files",
    hint: "Save them, open this page in two browsers, and run the real flow with files that belong to nobody.",
  },

  file: {
    legend: "Your file",
    input: "Connections.csv",
    reading: "Reading the file.",
    read: "Read {rows} rows, using {used}.",
    skipped: "Skipped {empty} with no profile link, {legacy} old-style links and {other} that were not profile URLs.",
    pick: "Which column holds the profile URL?",
    noColumn: "No column in this file looks like a LinkedIn profile URL. Pick one and I will try it.",
    tooFew: "Under {min} usable rows, so there is nothing worth comparing. This is almost always the wrong file or the wrong column.",
  },

  connect: {
    legend: "Connect the two tabs",
    create: "Create a room",
    creating: "Making a room.",
    created: "Read this code to the other person: {code}. It works for ten minutes.",
    joinLabel: "Room code",
    join: "Join a room",
    joining: "Joining.",
    waiting: "Waiting for the other tab. {seconds}s left.",
    open: "Connected.",
    gaveUp: "Nobody joined in a minute. The code is dead now; make another one, or use copy and paste below.",
    failed: "The two browsers could not reach each other. That happens on some mobile networks, and copy and paste below always works.",
    sameNetwork: "Same network only",
    pasteLegend: "Or copy and paste, with no server at all",
    pasteStart: "Start here and send this to the other person",
    pasteReply: "Paste what they send back",
    pasteJoin: "Paste what they sent you",
    pasteAnswer: "Send this back to them",
    pasteHint: "This route has nothing of mine in it. Two blobs of text, sent however you like.",
  },

  relay: {
    unavailable:
      "The room code service is not running, so codes are off right now. Use copy and paste below instead: it needs no server at all, and it is the one I would pick anyway.",
    budget: "Room codes are capped so this stays free to run. Try again later, or use copy and paste below, which is never capped.",
    noRoom: "No room with that code. Codes last ten minutes, and they are case-insensitive but the characters have to be right.",
    alreadyJoined: "Somebody has already joined that room. If it was not the person you are expecting, make a new code.",
    badCode: "That is not a room code. Six characters from 2 3 4 6 7 9 F K M R W, and the hyphen is decoration.",
    badRequest: "That request was not the shape this service takes.",
    failed: "The room code service went wrong. Copy and paste below still works.",
  },

  result: {
    heading: "You both know",
    none: "Nobody, on these two files.",
    counts: "{mine} of yours against {theirs} of theirs.",
    exact: "Compared exactly, so there are no false matches beyond a one in twenty billion accident.",
    bloom:
      "One side sent a Bloom filter, because a list that size is a lot to push through a browser connection. That trades bytes for a small chance of a wrong name: about {rate} per name checked, so roughly {expected} wrong names in a result this size.",
    names: "Names come from your own file. Theirs never crossed.",
    safetyLabel: "Read these to each other",
  },

  errors: {
    file: "That file did not parse as a CSV.",
    protocol: "The other tab sent something this version does not understand. Both sides need the same version of the page.",
    other: "Something went wrong before the comparison finished.",
  },
} as const;

export const overlap: ToolEntry = {
  slug: "overlap",
  name: "Overlap",
  blurb:
    "Two people about to meet find out who they both already know, without either of them handing over a contact list. Both browsers hash their connections with a shared salt and swap only the hashes.",
  privacy: "browser",
  privacyNote:
    "One server part: a room code service that holds a connection blob from each side for ten minutes so the two browsers can find each other. It never sees a name or a hash, and the copy and paste route skips it entirely.",
  cantSee: [
    "Second-degree paths. It compares two lists of people you are each already connected to, so somebody you both reach through a third person is invisible to it.",
    "Warmth. A colleague you speak to weekly and a stranger who sent a request in 2019 look exactly the same in an export, and this tool does not read the connected-on date to guess between them.",
    "Anyone who has changed their profile URL since one of the two exports was taken. The slug is the identifier, so an old file and a new one hold two different people as far as the hashing is concerned, and nothing can detect that.",
    "Rows with no profile link. LinkedIn leaves the URL out when a connection has restricted it, and those rows are counted and reported rather than guessed at.",
    "Old style /pub/ links from exports taken years ago. They are a different identifier space from an /in/ slug and comparing the two would invent matches.",
  ],
  status: "live",
  order: 30,
};
```

- [ ] **Step 4: Register it**

In `content/tools/index.ts`, one import line kept alphabetical:

```ts
import { overlap } from "./overlap";
```

and one entry in the array:

```ts
const entries: ToolEntry[] = [headlineCheck, overlap];
```

- [ ] **Step 5: Put the new copy under the voice lint**

In `content/voice.test.ts`, beside the tool spread F3 added, add the relay and honesty strings, which are not on `ToolEntry` and so are not covered by it:

```ts
import { overlapCopy } from "@/content/tools/overlap";
```

```ts
    ...Object.entries(overlapCopy.honesty).map(([k, text]) => ({ where: `overlapCopy.honesty.${k}`, text })),
    ...Object.entries(overlapCopy.relay).map(([k, text]) => ({ where: `overlapCopy.relay.${k}`, text })),
```

- [ ] **Step 6: Run the copy tests and the lint**

```bash
cd "$WT"
npx vitest run lib/tools/overlap/copy.test.ts content/voice.test.ts content/tools/index.test.ts 2>&1 | tail -8
```

Expected: PASS on all three. The registry test's "has a page behind it if it is live" case will fail until Task 11 creates `app/tools/overlap/page.tsx`. That is the correct order and the correct failure: leave it red and note it, or set `status: "soon"` here and flip it in Task 11. **Flip it in Task 11** is the choice this plan makes, so nothing is registered as live before it exists. Change `status` to `"soon"` now.

- [ ] **Step 7: Commit**

```bash
cd "$WT"
git add content/tools lib/tools/overlap/copy.test.ts content/voice.test.ts components/tools/ToolPage.tsx app/globals.css app/globals.test.ts
git commit -m "feat(overlap): the registry entry, and every sentence the tool is allowed to say"
```

---

### Task 2: Identifier normalisation, which is where a real implementation fails

**Files:**
- Create: `lib/tools/overlap/types.ts`
- Create: `lib/tools/overlap/slug.ts`
- Test: `lib/tools/overlap/slug.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `type Entry = { slug: string; label: string }`, `type SlugRefusal = "empty" | "legacy-pub" | "not-a-profile"`, `type SlugResult`, `normaliseSlug(raw: string): SlugResult`

Two people can hold the same person under `https://www.linkedin.com/in/Se%C3%A1n-O-Broin-4a2b1c/?trk=contacts` and `se\u0301an-o-broin-4a2b1c`, and if the two strings do not reduce to the same bytes the tool quietly reports that they do not know the same person. This is the module the whole tool rests on and it is the one with no interesting maths in it.

**The trailing suffix is kept, and that is the decision.** LinkedIn appends a short id to a slug when the plain name is taken, so `john-smith-1a2b3c4` and `john-smith-9f8e7d6` are two different people with the same name. Stripping the suffix to "normalise" it would merge them and print a stranger's name as a mutual friend, which is the single worst thing this tool can do. So the suffix stays, verbatim, and the cost is that somebody who has edited their profile URL since one of the exports will not match. That cost is on the "can't see" list rather than hidden.

**The order of operations matters and is not arbitrary.** Query and fragment are stripped from the raw text, before any percent-decoding, because a `%23` inside a path decodes to a literal `#` and would then be read as the start of a fragment. Decoding happens after the path has been split, and case folding happens after decoding, because `%C3%A1` and `%c3%a1` are the same byte and lowercasing first would still leave two different strings once decoded. Unicode is normalised to NFC last, because a composed `á` and a decomposed `a` plus combining acute are different bytes and therefore different hashes.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/tools/overlap/slug.test.ts
import { describe, expect, it } from "vitest";
import { normaliseSlug } from "./slug";

const ok = (raw: string) => {
  const r = normaliseSlug(raw);
  if (!r.ok) throw new Error(`expected a slug from ${JSON.stringify(raw)}, got ${r.reason}`);
  return r.slug;
};
const refused = (raw: string) => {
  const r = normaliseSlug(raw);
  if (r.ok) throw new Error(`expected a refusal from ${JSON.stringify(raw)}, got ${r.slug}`);
  return r.reason;
};

describe("normaliseSlug: the shapes a real export holds", () => {
  it("reduces the ordinary case", () => {
    expect(ok("https://www.linkedin.com/in/fergus-oreilly")).toBe("fergus-oreilly");
  });

  it("drops a trailing slash", () => {
    expect(ok("https://www.linkedin.com/in/fergus-oreilly/")).toBe("fergus-oreilly");
    expect(ok("https://www.linkedin.com/in/fergus-oreilly///")).toBe("fergus-oreilly");
  });

  it("drops the query and the fragment", () => {
    expect(ok("https://www.linkedin.com/in/fergus-oreilly?trk=contacts_index")).toBe("fergus-oreilly");
    expect(ok("https://www.linkedin.com/in/fergus-oreilly/#experience")).toBe("fergus-oreilly");
    expect(ok("https://www.linkedin.com/in/fergus-oreilly/?a=1#b")).toBe("fergus-oreilly");
  });

  it("takes a country subdomain, which is how a locale reaches an export", () => {
    expect(ok("https://ie.linkedin.com/in/fergus-oreilly")).toBe("fergus-oreilly");
    expect(ok("https://de.linkedin.com/in/fergus-oreilly")).toBe("fergus-oreilly");
    expect(ok("https://uk.linkedin.com/in/fergus-oreilly/")).toBe("fergus-oreilly");
  });

  it("takes a bare slug that never had a URL around it", () => {
    expect(ok("fergus-oreilly")).toBe("fergus-oreilly");
    expect(ok("  fergus-oreilly  ")).toBe("fergus-oreilly");
    expect(ok("in/fergus-oreilly")).toBe("fergus-oreilly");
  });

  it("takes a URL with no scheme", () => {
    expect(ok("www.linkedin.com/in/fergus-oreilly")).toBe("fergus-oreilly");
    expect(ok("linkedin.com/in/fergus-oreilly")).toBe("fergus-oreilly");
    expect(ok("//www.linkedin.com/in/fergus-oreilly")).toBe("fergus-oreilly");
  });

  it("folds case, because a LinkedIn slug is case-insensitive", () => {
    expect(ok("HTTPS://WWW.LINKEDIN.COM/IN/Fergus-OReilly")).toBe("fergus-oreilly");
  });

  it("percent-decodes after the path is split, not before", () => {
    expect(ok("https://www.linkedin.com/in/se%C3%A1n-%C3%B3-broin")).toBe("seán-ó-broin");
    // %23 is a literal hash in the path. Decoding first would cut the slug here.
    expect(ok("https://www.linkedin.com/in/a%23b")).toBe("a#b");
    // Upper and lower case percent escapes are the same bytes.
    expect(ok("https://www.linkedin.com/in/se%c3%a1n")).toBe(ok("https://www.linkedin.com/in/se%C3%A1N"));
  });

  it("survives a lone percent rather than dropping the row", () => {
    expect(ok("https://www.linkedin.com/in/100%-committed")).toBe("100%-committed");
  });

  it("normalises to NFC, so a composed and a decomposed accent are one person", () => {
    const composed = "https://www.linkedin.com/in/se\u00e1n-o-broin";
    const decomposed = "https://www.linkedin.com/in/sea\u0301n-o-broin";
    expect(ok(composed)).toBe(ok(decomposed));
    expect(ok(decomposed)).toBe("seán-o-broin");
  });

  it("strips a byte order mark and a non-breaking space", () => {
    expect(ok("\ufeffhttps://www.linkedin.com/in/fergus-oreilly")).toBe("fergus-oreilly");
    expect(ok("\u00a0https://www.linkedin.com/in/fergus-oreilly\u00a0")).toBe("fergus-oreilly");
  });
});

describe("normaliseSlug: the suffix stays", () => {
  /**
   * The single worst failure this tool can produce is a stranger's name under
   * "you both know". Two people called John Smith get two slugs that differ
   * only in the suffix LinkedIn appends, so stripping it would merge them.
   */
  it("keeps two people with the same name apart", () => {
    const a = ok("https://www.linkedin.com/in/john-smith-1a2b3c4");
    const b = ok("https://www.linkedin.com/in/john-smith-9f8e7d6");
    expect(a).not.toBe(b);
    expect(a).toBe("john-smith-1a2b3c4");
  });

  it("keeps a numeric suffix too", () => {
    expect(ok("https://www.linkedin.com/in/john-smith-123456789")).toBe("john-smith-123456789");
  });

  it("leaves a slug with no suffix alone", () => {
    expect(ok("https://www.linkedin.com/in/williamhgates")).toBe("williamhgates");
  });
});

describe("normaliseSlug: what it refuses, and why each refusal is its own reason", () => {
  it("refuses an empty cell", () => {
    expect(refused("")).toBe("empty");
    expect(refused("   ")).toBe("empty");
    expect(refused("\ufeff")).toBe("empty");
  });

  it("refuses an old style /pub/ link rather than inventing an /in/ slug from it", () => {
    expect(refused("https://www.linkedin.com/pub/john-smith/1/2a/3b4")).toBe("legacy-pub");
    expect(refused("https://ie.linkedin.com/pub/dir/John/Smith")).toBe("legacy-pub");
  });

  it("refuses a URL that is not LinkedIn", () => {
    expect(refused("https://example.com/in/fergus-oreilly")).toBe("not-a-profile");
    expect(refused("https://notlinkedin.com/in/fergus-oreilly")).toBe("not-a-profile");
    expect(refused("https://linkedin.com.example.com/in/fergus-oreilly")).toBe("not-a-profile");
  });

  it("refuses a LinkedIn URL that is not a profile", () => {
    expect(refused("https://www.linkedin.com/company/anthropic")).toBe("not-a-profile");
    expect(refused("https://www.linkedin.com/in/")).toBe("not-a-profile");
    expect(refused("https://www.linkedin.com/")).toBe("not-a-profile");
  });

  it("refuses something with a path inside the slug", () => {
    expect(refused("https://www.linkedin.com/in/fergus-oreilly/detail/recent-activity")).toBe("not-a-profile");
  });
});
```

- [ ] **Step 2: Run them to watch them fail**

Run: `cd "$WT" && npx vitest run lib/tools/overlap/slug.test.ts`
Expected: FAIL with `Cannot find module './slug'`.

- [ ] **Step 3: Write the types**

```ts
// lib/tools/overlap/types.ts

/** One usable connection: the identifier that crosses, and the name that never does. */
export type Entry = {
  /** The normalised profile slug. This is the only thing that is ever hashed. */
  slug: string;
  /** What to print if this person turns out to be shared. Local to this tab, always. */
  label: string;
};

export type SlugRefusal = "empty" | "legacy-pub" | "not-a-profile";

export type SlugResult = { ok: true; slug: string } | { ok: false; reason: SlugRefusal };

/** Thrown when a peer sends a frame this version cannot read. Never shown raw. */
export class OverlapProtocolError extends Error {
  constructor(public readonly detail: string) {
    super(`overlap protocol: ${detail}`);
    this.name = "OverlapProtocolError";
  }
}

/** Thrown when a file has too little in it to be worth comparing. */
export class OverlapInputError extends Error {
  constructor(public readonly detail: string) {
    super(`overlap input: ${detail}`);
    this.name = "OverlapInputError";
  }
}
```

- [ ] **Step 4: Write the normaliser**

```ts
// lib/tools/overlap/slug.ts
import type { SlugResult } from "./types";

/**
 * A LinkedIn profile URL, or something that once was one, becomes a slug two
 * browsers can agree on.
 *
 * The order below is the whole module. Each step is here because a different
 * one would be wrong:
 *
 *  1. Trim, and lose a byte order mark and non-breaking spaces, which is what
 *     a CSV cell brings with it.
 *  2. Cut the fragment then the query **on the raw text**, before decoding.
 *     A `%23` in a path decodes to a literal `#`, and decoding first would let
 *     that cut a slug in half.
 *  3. Strip the scheme, then the host, and require the host to be linkedin.com
 *     or a subdomain of it. A country subdomain (`ie.`, `de.`, `uk.`) is how a
 *     locale reaches an export and it is the same profile.
 *  4. Refuse `/pub/`. Old public profile links are a different identifier
 *     space and mapping one onto an `/in/` slug would invent matches.
 *  5. Strip `in/`, then trailing slashes. Anything left with a slash in it is
 *     a sub-page rather than a profile.
 *  6. Percent-decode, then normalise to NFC, then lowercase. Decoding before
 *     folding because `%C3%A1` and `%c3%a1` are the same byte; NFC because a
 *     composed accent and a decomposed one hash differently and are the same
 *     person.
 *
 * **The trailing suffix is never stripped.** `john-smith-1a2b3c4` and
 * `john-smith-9f8e7d6` are two people. Merging them would print a stranger as
 * a mutual connection, which is the worst thing this tool can do. The price is
 * that somebody who edited their profile URL between the two exports will not
 * match, and that is on the "can't see" list.
 */

/** linkedin.com, or any subdomain of it, and nothing that merely ends in it. */
const LINKEDIN_HOST = /^(?:[a-z0-9-]+\.)*linkedin\.com$/;

export function normaliseSlug(raw: string): SlugResult {
  let s = raw.replace(/\ufeff/g, "").replace(/\u00a0/g, " ").trim();
  if (s === "") return { ok: false, reason: "empty" };

  // 2. Fragment, then query, on the raw text.
  s = s.split("#", 1)[0];
  s = s.split("?", 1)[0];

  // 3. Scheme, then host.
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").replace(/^\/\//, "");
  const slash = s.indexOf("/");
  if (slash === -1) {
    if (s.toLowerCase().endsWith("linkedin.com")) return { ok: false, reason: "not-a-profile" };
  } else {
    const host = s.slice(0, slash).toLowerCase();
    if (host.includes(".")) {
      if (!LINKEDIN_HOST.test(host)) return { ok: false, reason: "not-a-profile" };
      s = s.slice(slash);
    }
  }

  s = s.replace(/^\/+/, "");
  // 4. and 5.
  if (/^pub(\/|$)/i.test(s)) return { ok: false, reason: "legacy-pub" };
  s = s.replace(/^in\//i, "");
  s = s.replace(/\/+$/, "");
  if (s === "" || s.includes("/")) return { ok: false, reason: "not-a-profile" };

  // 6. Decode, compose, fold. A lone `%` throws; the raw text still identifies
  // the same person on both sides, so the row is kept rather than dropped.
  try {
    s = decodeURIComponent(s);
  } catch {
    /* keep s as it stands */
  }
  s = s.normalize("NFC").toLowerCase();

  return s === "" ? { ok: false, reason: "empty" } : { ok: true, slug: s };
}
```

- [ ] **Step 5: Run them to watch them pass**

Run: `cd "$WT" && npx tsc --noEmit && npx vitest run lib/tools/overlap/slug.test.ts`
Expected: PASS, 30-odd cases.

What this proves: the reductions in the tests hold, including the two orderings that are easy to get backwards. What it cannot see: whether LinkedIn's export in 2026 actually holds the shapes above. Four of them (`?trk=`, the country subdomain, the numeric suffix, the missing URL) are read from exports and from the profile URL format; `/pub/` is from an older era and may simply never appear. Task 15 runs a real export through it, and until then "handles a real export" is a guess.

- [ ] **Step 6: Commit**

```bash
cd "$WT"
git add lib/tools/overlap/types.ts lib/tools/overlap/slug.ts lib/tools/overlap/slug.test.ts
git commit -m "feat(overlap): reduce a LinkedIn profile URL to something two tabs can agree on"
```

---

### Task 3: The export reader, including the three lines before the header

**Files:**
- Create: `lib/tools/overlap/csv.ts`
- Test: `lib/tools/overlap/csv.test.ts`

**Interfaces:**
- Consumes: `normaliseSlug` (Task 2), `Entry`, `SlugRefusal` (Task 2)
- Produces: `parseCsv(text): string[][]`, `type ConnectionsFile`, `readConnections(text): ConnectionsFile`, `type ReadCounts`, `entriesFrom(file, urlColumn, nameColumns?): { entries: Entry[]; counts: ReadCounts }`, `MIN_USABLE_ROWS = 5`

LinkedIn's `Connections.csv` does not start with its header. It starts with a `Notes:` line, a sentence, and a blank line, and only then the header row. A parser that trusts row zero reads the notes as column names and finds no URL column, which presents as "your file is wrong" when the file is fine.

**T2 has a sibling CSV reader and this one is deliberately separate.** T1, T2 and T3 run in parallel from F3 by design (programme section 7), so a wave-1 tool may not depend on another wave-1 tool without serialising the wave. The two readers answer different questions: T2 wants a date column out of an arbitrary export, T3 wants a URL column out of a known one with a preamble. Whoever merges second may open a follow-up to pull the RFC 4180 state machine into one place, and that is a note for the pull request rather than a reason to block.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/tools/overlap/csv.test.ts
import { describe, expect, it } from "vitest";
import { MIN_USABLE_ROWS, entriesFrom, parseCsv, readConnections } from "./csv";

/** The real shape: three lines of preamble, then the header, then the rows. */
const REAL = [
  "Notes:",
  '"When exporting your connection data, you may notice that some of the email addresses are missing."',
  "",
  "First Name,Last Name,URL,Email Address,Company,Position,Connected On",
  "Aoife,Ni Bhriain,https://www.linkedin.com/in/aoife-ni-bhriain-1a2b3c,,Stripe,Engineer,01 Mar 2024",
  "Cormac,O Suilleabhain,https://www.linkedin.com/in/cormac-o-suilleabhain,,Intercom,Designer,14 Jun 2023",
  "Restricted,Member,,,,,02 Feb 2022",
].join("\r\n");

describe("parseCsv", () => {
  it("reads plain rows on both line endings", () => {
    expect(parseCsv("a,b\r\nc,d")).toEqual([["a", "b"], ["c", "d"]]);
    expect(parseCsv("a,b\nc,d")).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("reads quoted fields, embedded commas, newlines and doubled quotes", () => {
    expect(parseCsv('a,"b,c",d')).toEqual([["a", "b,c", "d"]]);
    expect(parseCsv('"line\nbreak",x')).toEqual([["line\nbreak", "x"]]);
    expect(parseCsv('"say ""hi""",x')).toEqual([['say "hi"', "x"]]);
  });

  it("keeps empty fields and ignores one trailing newline", () => {
    expect(parseCsv("a,,c\r\n")).toEqual([["a", "", "c"]]);
    expect(parseCsv("a,b\n\n")).toEqual([["a", "b"], [""]]);
  });
});

describe("readConnections", () => {
  it("skips the preamble and finds the header", () => {
    const file = readConnections(REAL);
    expect(file.headerRow).toBe(3);
    expect(file.headers[2]).toBe("URL");
    expect(file.urlColumn).toBe(2);
    expect(file.nameColumns).toEqual({ first: 0, last: 1 });
    expect(file.rows).toHaveLength(3);
  });

  it("finds a header with no preamble at all", () => {
    const file = readConnections("First Name,Last Name,URL\nA,B,https://www.linkedin.com/in/a-b");
    expect(file.headerRow).toBe(0);
    expect(file.urlColumn).toBe(2);
  });

  it("accepts the other names LinkedIn has used for the column", () => {
    expect(readConnections("Name,Profile URL\nA,https://www.linkedin.com/in/a").urlColumn).toBe(1);
    expect(readConnections("Name,profile_url\nA,https://www.linkedin.com/in/a").urlColumn).toBe(1);
  });

  it("reports no column rather than guessing when nothing looks like one", () => {
    const file = readConnections("alpha,beta\n1,2");
    expect(file.urlColumn).toBe(-1);
    expect(file.headers).toEqual(["alpha", "beta"]);
  });

  it("gives back an empty file rather than throwing on rubbish", () => {
    const file = readConnections("");
    expect(file.rows).toEqual([]);
    expect(file.urlColumn).toBe(-1);
  });
});

describe("entriesFrom", () => {
  const file = readConnections(REAL);

  it("takes the usable rows and counts the rest by reason", () => {
    const { entries, counts } = entriesFrom(file, file.urlColumn, file.nameColumns);
    expect(entries.map((e) => e.slug)).toEqual([
      "aoife-ni-bhriain-1a2b3c",
      "cormac-o-suilleabhain",
    ]);
    expect(counts).toEqual({ rows: 3, used: 2, empty: 1, legacyPub: 0, notAProfile: 0, duplicate: 0 });
  });

  it("builds the label from the name columns and never from the wire", () => {
    const { entries } = entriesFrom(file, file.urlColumn, file.nameColumns);
    expect(entries[0].label).toBe("Aoife Ni Bhriain");
  });

  it("falls back to the slug when there are no name columns", () => {
    const bare = readConnections("URL\nhttps://www.linkedin.com/in/a-b-1c");
    const { entries } = entriesFrom(bare, bare.urlColumn, bare.nameColumns);
    expect(entries[0].label).toBe("a-b-1c");
  });

  it("counts a duplicate once and keeps the first label", () => {
    const dupes = readConnections(
      [
        "First Name,Last Name,URL",
        "Aoife,One,https://www.linkedin.com/in/aoife-x",
        "Aoife,Two,https://www.linkedin.com/in/aoife-x/?trk=b",
      ].join("\n"),
    );
    const { entries, counts } = entriesFrom(dupes, dupes.urlColumn, dupes.nameColumns);
    expect(entries).toHaveLength(1);
    expect(entries[0].label).toBe("Aoife One");
    expect(counts.duplicate).toBe(1);
  });

  it("counts an old /pub/ link and a foreign URL under their own reasons", () => {
    const mixed = readConnections(
      [
        "URL",
        "https://www.linkedin.com/pub/john-smith/1/2a/3b4",
        "https://example.com/in/nope",
        "https://www.linkedin.com/in/real-one",
      ].join("\n"),
    );
    const { counts } = entriesFrom(mixed, mixed.urlColumn, mixed.nameColumns);
    expect(counts).toMatchObject({ rows: 3, used: 1, legacyPub: 1, notAProfile: 1 });
  });

  it("returns nothing at all when handed a column index that is not there", () => {
    expect(entriesFrom(file, 99, null).entries).toEqual([]);
  });

  it("names the floor a caller checks against", () => {
    expect(MIN_USABLE_ROWS).toBe(5);
  });
});
```

- [ ] **Step 2: Run them to watch them fail**

Run: `cd "$WT" && npx vitest run lib/tools/overlap/csv.test.ts`
Expected: FAIL with `Cannot find module './csv'`.

- [ ] **Step 3: Write the reader**

```ts
// lib/tools/overlap/csv.ts
import { normaliseSlug } from "./slug";
import type { Entry } from "./types";

/**
 * Reading LinkedIn's `Connections.csv`.
 *
 * The export does not begin with its header. It begins with `Notes:`, a
 * sentence about missing email addresses, and a blank line, and only then the
 * header row. A reader that trusts row zero finds no URL column and blames the
 * visitor's file, so `readConnections` looks for the header rather than
 * assuming where it is.
 *
 * The state machine below is RFC 4180 and nothing more: quotes, doubled
 * quotes, embedded commas and newlines, and CRLF or LF. It is deliberately not
 * shared with `lib/tools/relief/csv.ts`, which answers a different question and
 * ships in a parallel sub-project; see the plan for why, and for the follow-up
 * that may merge them later.
 */

/** Under this many usable rows the tool refuses rather than comparing noise. */
export const MIN_USABLE_ROWS = 5;

/** Headers that have carried the profile URL across versions of the export. */
const URL_HEADER = /^(url|profile[\s_-]*url|public[\s_-]*profile[\s_-]*url)$/i;
const FIRST_HEADER = /^first[\s_-]*name$/i;
const LAST_HEADER = /^last[\s_-]*name$/i;
/** How many rows to search before giving up on finding a header. */
const HEADER_SEARCH_ROWS = 12;

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch !== '"') { field += ch; continue; }
      if (text[i + 1] === '"') { field += '"'; i++; continue; }
      quoted = false;
      continue;
    }
    if (ch === '"' && field === "") { quoted = true; continue; }
    if (ch === ",") { row.push(field); field = ""; continue; }
    if (ch === "\r") continue;
    if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    field += ch;
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

export type ConnectionsFile = {
  /** Index of the header row in the parsed rows, or -1 when none was found. */
  headerRow: number;
  headers: string[];
  /** Index of the profile URL column, or -1 when nothing looked like one. */
  urlColumn: number;
  nameColumns: { first: number; last: number } | null;
  /** Everything after the header. */
  rows: string[][];
};

export function readConnections(text: string): ConnectionsFile {
  const all = parseCsv(text);
  const limit = Math.min(all.length, HEADER_SEARCH_ROWS);

  for (let i = 0; i < limit; i++) {
    const cells = all[i].map((c) => c.trim());
    const url = cells.findIndex((c) => URL_HEADER.test(c));
    if (url === -1) continue;
    const first = cells.findIndex((c) => FIRST_HEADER.test(c));
    const last = cells.findIndex((c) => LAST_HEADER.test(c));
    return {
      headerRow: i,
      headers: cells,
      urlColumn: url,
      nameColumns: first !== -1 && last !== -1 ? { first, last } : null,
      rows: all.slice(i + 1),
    };
  }

  // No header the reader recognises. Hand back the widest row as the headers so
  // the page can offer a column picker, and let the visitor choose.
  let widest = 0;
  for (let i = 0; i < limit; i++) if (all[i].length > all[widest]?.length) widest = i;
  const headers = (all[widest] ?? []).map((c) => c.trim());
  return {
    headerRow: all.length ? widest : -1,
    headers,
    urlColumn: -1,
    nameColumns: null,
    rows: all.length ? all.slice(widest + 1) : [],
  };
}

export type ReadCounts = {
  rows: number;
  used: number;
  empty: number;
  legacyPub: number;
  notAProfile: number;
  duplicate: number;
};

/**
 * Rows become entries. Every refusal is counted under its own reason, because
 * "skipped 812 rows" is a sentence that tells a visitor nothing, and "812 with
 * no profile link" tells them their export is normal.
 *
 * A row with fewer cells than the column index is not a fault worth stopping
 * for; the export has ragged rows when a field held a stray newline, and the
 * right answer is to count it as empty and carry on.
 */
export function entriesFrom(
  file: ConnectionsFile,
  urlColumn: number,
  nameColumns: ConnectionsFile["nameColumns"] = file.nameColumns,
): { entries: Entry[]; counts: ReadCounts } {
  const counts: ReadCounts = { rows: 0, used: 0, empty: 0, legacyPub: 0, notAProfile: 0, duplicate: 0 };
  const bySlug = new Map<string, Entry>();

  for (const row of file.rows) {
    if (row.length === 1 && row[0].trim() === "") continue; // a trailing blank line is not a row
    counts.rows += 1;

    const raw = row[urlColumn] ?? "";
    const result = normaliseSlug(raw);
    if (!result.ok) {
      if (result.reason === "empty") counts.empty += 1;
      else if (result.reason === "legacy-pub") counts.legacyPub += 1;
      else counts.notAProfile += 1;
      continue;
    }

    if (bySlug.has(result.slug)) { counts.duplicate += 1; continue; }

    const label = nameColumns
      ? [row[nameColumns.first] ?? "", row[nameColumns.last] ?? ""].map((p) => p.trim()).filter(Boolean).join(" ")
      : "";
    bySlug.set(result.slug, { slug: result.slug, label: label || result.slug });
    counts.used += 1;
  }

  return { entries: [...bySlug.values()], counts };
}
```

- [ ] **Step 4: Run them to watch them pass**

Run: `cd "$WT" && npx tsc --noEmit && npx vitest run lib/tools/overlap/csv.test.ts`
Expected: PASS.

What this proves: the preamble is skipped, the three header spellings are found, every refusal lands in its own counter, and a duplicate keeps the first label. What it cannot see: a real export. The preamble text above is written from the format rather than copied from a live file, so the header search is what carries this rather than the exact sentence; Task 15 runs a real one.

- [ ] **Step 5: Commit**

```bash
cd "$WT"
git add lib/tools/overlap/csv.ts lib/tools/overlap/csv.test.ts
git commit -m "feat(overlap): read the export, preamble and all, and count every skipped row by reason"
```

---

### Task 4: The salt, the digest and the truncation

**Files:**
- Create: `lib/tools/overlap/hash.ts`
- Test: `lib/tools/overlap/hash.test.ts`

**Interfaces:**
- Consumes: `Entry` (Task 2)
- Produces: `SALT_BYTES = 32`, `HASH_HEX_CHARS = 16`, `type SubtleLike`, `newSalt(fill?)`, `encodeSalt(salt)`, `decodeSalt(text)`, `hashSlug(salt, slug, subtle?)`, `hashAll(salt, slugs, options?)`, `toHex(bytes)`

`crypto.subtle` exists in Node 24 as `globalThis.crypto.subtle`, so this whole module is directly under test with no shim and no mock. The one thing a mock is used for is injecting a `subtle` that counts calls, so the batching can be asserted.

**The tests pin literals, not constants.** A test that asserts `hash.length === HASH_HEX_CHARS` moves with the constant and cannot fail when the constant is wrong, which is the exact trap T2 recorded on `MIN_EVENTS`. Every assertion below carries the number 16 written out, and the cross-check slices with a literal.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/tools/overlap/hash.test.ts
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  HASH_HEX_CHARS,
  SALT_BYTES,
  decodeSalt,
  encodeSalt,
  hashAll,
  hashSlug,
  newSalt,
  toHex,
} from "./hash";

/**
 * Two independent references, on purpose.
 *
 * `node:crypto`'s `createHash` is a different implementation from WebCrypto's
 * `subtle.digest`, so asserting they agree pins the concatenation order and the
 * truncation without anybody inventing a digest. The empty-input vector is the
 * published SHA-256 of nothing, which pins the algorithm itself.
 */
const reference = (salt: Uint8Array, slug: string) =>
  createHash("sha256")
    .update(Buffer.concat([Buffer.from(salt), Buffer.from(slug, "utf8")]))
    .digest("hex")
    .slice(0, 16);

describe("the salt", () => {
  it("is 32 bytes", () => {
    expect(SALT_BYTES).toBe(32);
    expect(newSalt()).toHaveLength(32);
  });

  it("is drawn from the platform's random source", () => {
    const fill = vi.fn((bytes: Uint8Array) => bytes.fill(7));
    expect([...newSalt(fill)]).toEqual(Array(32).fill(7));
    expect(fill).toHaveBeenCalledTimes(1);
  });

  it("survives a round trip through the wire encoding", () => {
    const salt = newSalt();
    expect([...decodeSalt(encodeSalt(salt))]).toEqual([...salt]);
  });

  it("refuses a salt of the wrong length rather than hashing with it", () => {
    expect(() => decodeSalt(encodeSalt(new Uint8Array(16)))).toThrow(/32 bytes/);
    expect(() => decodeSalt("not base64 at all !!")).toThrow();
  });
});

describe("hashSlug", () => {
  it("is 16 lowercase hex characters, which is 8 bytes, which is 64 bits", () => {
    expect(HASH_HEX_CHARS).toBe(16);
    return hashSlug(newSalt(), "fergus-oreilly").then((h) => {
      expect(h).toHaveLength(16);
      expect(h).toMatch(/^[0-9a-f]{16}$/);
    });
  });

  it("matches SHA-256 of salt then slug, checked against node:crypto", async () => {
    const salt = new Uint8Array(32).map((_, i) => i * 7 % 251);
    for (const slug of ["fergus-oreilly", "seán-ó-broin", "john-smith-1a2b3c4", ""]) {
      expect(await hashSlug(salt, slug)).toBe(reference(salt, slug));
    }
  });

  it("hashes the salt before the slug, not after", async () => {
    const salt = new Uint8Array(32).fill(1);
    const wrongWayRound = createHash("sha256")
      .update(Buffer.concat([Buffer.from("abc", "utf8"), Buffer.from(salt)]))
      .digest("hex")
      .slice(0, 16);
    expect(await hashSlug(salt, "abc")).not.toBe(wrongWayRound);
  });

  it("agrees with the published SHA-256 of the empty input", async () => {
    // e3b0c442 98fc1c14 9afbf4c8 996fb924 27ae41e4 649b934c a495991b 7852b855
    expect(await hashSlug(new Uint8Array(0), "")).toBe("e3b0c44298fc1c14");
  });

  it("gives a different answer under a different salt", async () => {
    const a = await hashSlug(new Uint8Array(32).fill(1), "fergus-oreilly");
    const b = await hashSlug(new Uint8Array(32).fill(2), "fergus-oreilly");
    expect(a).not.toBe(b);
  });

  it("treats the slug as UTF-8 rather than as code units", async () => {
    const salt = newSalt();
    // Four bytes in UTF-8, one astral code point. A code-unit encoding would
    // hash something different and the two sides would still agree, which is
    // why this is checked against node:crypto rather than against itself.
    expect(await hashSlug(salt, "a\u{1f600}b")).toBe(reference(salt, "a\u{1f600}b"));
  });
});

describe("hashAll", () => {
  const salt = new Uint8Array(32).fill(3);

  it("sorts ascending and deduplicates", async () => {
    const out = await hashAll(salt, ["b", "a", "c", "a"]);
    expect(out).toHaveLength(3);
    expect([...out].sort()).toEqual(out);
    expect(new Set(out).size).toBe(3);
  });

  it("agrees with hashSlug one at a time", async () => {
    const slugs = ["one", "two", "three"];
    const one = await Promise.all(slugs.map((s) => hashSlug(salt, s)));
    expect(await hashAll(salt, slugs)).toEqual([...one].sort());
  });

  it("reports progress in batches so a big file can say something", async () => {
    const onProgress = vi.fn();
    const slugs = Array.from({ length: 250 }, (_, i) => `p${i}`);
    await hashAll(salt, slugs, { onProgress, batch: 100 });
    expect(onProgress.mock.calls.map(([done]) => done)).toEqual([100, 200, 250]);
  });

  it("takes an injected subtle, which is how the exchange stays testable", async () => {
    const subtle = { digest: vi.fn(globalThis.crypto.subtle.digest.bind(globalThis.crypto.subtle)) };
    await hashAll(salt, ["a", "b"], { subtle });
    expect(subtle.digest).toHaveBeenCalledTimes(2);
  });
});

describe("toHex", () => {
  it("pads a byte under 16 rather than dropping its nibble", () => {
    expect(toHex(new Uint8Array([0, 1, 15, 16, 255]))).toBe("00010f10ff");
  });
});
```

- [ ] **Step 2: Run them to watch them fail**

Run: `cd "$WT" && npx vitest run lib/tools/overlap/hash.test.ts`
Expected: FAIL with `Cannot find module './hash'`.

- [ ] **Step 3: Write the module**

```ts
// lib/tools/overlap/hash.ts

/**
 * The one piece of cryptography in this tool, and the honest account of what
 * it buys.
 *
 * Both browsers agree a 32-byte random salt over the connection they have just
 * opened, then hash every normalised profile slug as
 * `SHA-256(salt || utf8(slug))` and keep the first 8 bytes.
 *
 * **8 bytes is a birthday decision.** Two lists of n entries make n^2 cross
 * pairs and about `n^2 / 2^64` of them collide by accident. LinkedIn caps a
 * network at 30,000, so the worst case is 9e8 pairs and 4.9e-11 expected wrong
 * names. At 4 bytes the same figure is 0.21, which is a wrong name in one run
 * in five, and a wrong name here means printing a stranger under "you both
 * know". At 32 bytes it is four times the bytes to buy nothing observable.
 *
 * **What the salt does not do.** The peer has it. A profile slug is a person's
 * name with a short suffix, which is a small enough space to enumerate, so the
 * peer can hash a dictionary of people they are curious about and learn whether
 * any of them are in your file. No truncation, iteration count or key
 * derivation changes that, because the peer is inside the protocol. The salt
 * stops anybody outside the pairing, including a later holder of a captured
 * transcript, from using a precomputed table, and it makes these hashes
 * meaningless anywhere else. That is the whole claim.
 */

export const SALT_BYTES = 32;
/** 8 bytes. See the birthday note above before changing it. */
export const HASH_HEX_CHARS = 16;

/** The slice of WebCrypto this module needs, so a test can hand it a counter. */
export type SubtleLike = { digest(algorithm: "SHA-256", data: BufferSource): Promise<ArrayBuffer> };

const encoder = new TextEncoder();

function platformSubtle(): SubtleLike {
  return globalThis.crypto.subtle as SubtleLike;
}

export function newSalt(fill: (bytes: Uint8Array) => void = (b) => globalThis.crypto.getRandomValues(b)): Uint8Array {
  const salt = new Uint8Array(SALT_BYTES);
  fill(salt);
  return salt;
}

export function encodeSalt(salt: Uint8Array): string {
  let binary = "";
  for (const byte of salt) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function decodeSalt(text: string): Uint8Array {
  const binary = atob(text);
  if (binary.length !== SALT_BYTES) {
    throw new Error(`overlap: a salt is ${SALT_BYTES} bytes, got ${binary.length}`);
  }
  const out = new Uint8Array(SALT_BYTES);
  for (let i = 0; i < SALT_BYTES; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

export async function hashSlug(salt: Uint8Array, slug: string, subtle: SubtleLike = platformSubtle()): Promise<string> {
  const text = encoder.encode(slug);
  const buffer = new Uint8Array(salt.length + text.length);
  buffer.set(salt, 0);
  buffer.set(text, salt.length);
  const digest = await subtle.digest("SHA-256", buffer);
  return toHex(new Uint8Array(digest).subarray(0, HASH_HEX_CHARS / 2));
}

export type HashAllOptions = {
  subtle?: SubtleLike;
  /** How many to hash before yielding and reporting. */
  batch?: number;
  onProgress?: (done: number, total: number) => void;
  /** Yields to the event loop so a 30,000-row file does not freeze the tab. */
  yieldTo?: () => Promise<void>;
};

/**
 * Every slug, hashed, sorted ascending and deduplicated.
 *
 * Sorted because the wire format is a sorted list and a receiver that can
 * assume order can intersect without building a set. Deduplicated because two
 * rows can reduce to the same slug and a repeated hash would say nothing new
 * while making the list longer.
 *
 * The batching is not an optimisation, it is the difference between a
 * responsive tab and a frozen one: 30,000 sequential `subtle.digest` awaits on
 * a phone is a real stretch of main thread. How long is a guess until Task 15
 * measures it.
 */
export async function hashAll(
  salt: Uint8Array,
  slugs: readonly string[],
  options: HashAllOptions = {},
): Promise<string[]> {
  const subtle = options.subtle ?? platformSubtle();
  const batch = options.batch ?? 500;
  const yieldTo = options.yieldTo ?? (() => new Promise<void>((r) => setTimeout(r, 0)));

  const seen = new Set<string>();
  for (let i = 0; i < slugs.length; i++) {
    seen.add(await hashSlug(salt, slugs[i], subtle));
    if ((i + 1) % batch === 0) {
      options.onProgress?.(i + 1, slugs.length);
      await yieldTo();
    }
  }
  if (slugs.length % batch !== 0 || slugs.length === 0) options.onProgress?.(slugs.length, slugs.length);
  return [...seen].sort();
}
```

- [ ] **Step 4: Run them to watch them pass**

Run: `cd "$WT" && npx tsc --noEmit && npx vitest run lib/tools/overlap/hash.test.ts`
Expected: PASS. The `node:crypto` cross-check is the load-bearing one: it fails if the concatenation order flips, if the truncation length moves, or if the slug is encoded as anything but UTF-8.

What this proves: the digest is SHA-256 over salt then slug, truncated to 8 bytes, and two independent implementations agree on the bytes. What it cannot see: how long 30,000 of these take in a browser on a phone, and whether `subtle.digest` in Safari behaves the same as in Node, which it should by specification and which Task 14 observes rather than assumes.

- [ ] **Step 5: Commit**

```bash
cd "$WT"
git add lib/tools/overlap/hash.ts lib/tools/overlap/hash.test.ts
git commit -m "feat(overlap): salt, digest and an 8-byte truncation argued from the birthday bound"
```

---
### Task 5: The Bloom fallback, sized from the rate it promises

**Files:**
- Create: `lib/tools/overlap/bloom.ts`
- Test: `lib/tools/overlap/bloom.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `BLOOM_THRESHOLD = 10_000`, `BITS_PER_ENTRY = 29`, `HASH_COUNT = 20`, `TARGET_RATE = 1e-6`, `type BloomFilter`, `bitsFor(n)`, `falsePositiveRate(bits, k, inserted)`, `buildFilter(hashes)`, `testFilter(filter, hash)`, `encodeFilter(filter)`, `decodeFilter(text, bits, k, inserted)`, `expectedWrongNames(filter, checked)`

The design fixes the threshold at 10,000 rows. Everything else here is derived from one number, the rate the page is willing to print.

```
p       = 1e-6                                   the target, per name checked
m / n   = -ln p / (ln 2)^2 = 28.755  ->  29      BITS_PER_ENTRY
k       = round(29 * ln 2) = 20                  HASH_COUNT
real p  = (1 - e^(-20/29))^20 = 8.89e-7          one in about 1.12 million
```

At 10,000 entries that is 36 KB of filter, 48 KB once base64 has inflated it, against 170 KB for the exact list. Three and a half times, not ten, and the page says the number rather than the ratio.

Twenty indices come out of one 64-bit hash by double hashing: `h1` is the top 32 bits, `h2` the bottom 32 forced odd, and probe `i` lands at `(h1 + i * h2) mod m`. `h2 mod m` can be zero, which would put all twenty probes on one bit; the `|| 1` is the guard and it has its own test and its own mutation row.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/tools/overlap/bloom.test.ts
import { describe, expect, it } from "vitest";
import {
  BITS_PER_ENTRY,
  BLOOM_THRESHOLD,
  HASH_COUNT,
  TARGET_RATE,
  bitsFor,
  buildFilter,
  decodeFilter,
  encodeFilter,
  expectedWrongNames,
  falsePositiveRate,
  testFilter,
} from "./bloom";

/** Deterministic 16-hex-character hashes, so the filter can be measured. */
const hashes = (n: number, offset = 0) =>
  Array.from({ length: n }, (_, i) => (BigInt(i + offset) * 0x9e3779b97f4a7c15n % (1n << 64n)).toString(16).padStart(16, "0"));

describe("the constants, and the arithmetic they come from", () => {
  it("keeps the design's threshold", () => {
    expect(BLOOM_THRESHOLD).toBe(10_000);
  });

  it("derives 29 bits an entry from a target of one in a million", () => {
    expect(TARGET_RATE).toBe(1e-6);
    expect(BITS_PER_ENTRY).toBe(29);
    expect(Math.ceil(-Math.log(TARGET_RATE) / Math.LN2 ** 2)).toBe(29);
  });

  it("derives twenty probes from those bits", () => {
    expect(HASH_COUNT).toBe(20);
    expect(Math.round(BITS_PER_ENTRY * Math.LN2)).toBe(20);
  });

  it("actually achieves the rate it was sized for", () => {
    expect(falsePositiveRate(29_000, 20, 1000)).toBeCloseTo(8.89e-7, 12);
    expect(falsePositiveRate(29_000, 20, 1000)).toBeLessThan(TARGET_RATE);
  });

  it("sizes a filter from the count and never below a floor", () => {
    expect(bitsFor(10_000)).toBe(290_000);
    expect(bitsFor(1)).toBe(512);
    expect(bitsFor(0)).toBe(512);
    expect(bitsFor(30_000) % 8).toBe(0);
  });
});

describe("buildFilter and testFilter", () => {
  it("holds everything it was given", () => {
    const f = buildFilter(hashes(2_000));
    for (const h of hashes(2_000)) expect(testFilter(f, h)).toBe(true);
  });

  it("rejects almost everything it was not given", () => {
    const f = buildFilter(hashes(2_000));
    const wrong = hashes(2_000, 1_000_000).filter((h) => testFilter(f, h));
    // 2,000 checks at 8.9e-7 expects 0.0018 hits. One would be a 1-in-560 event
    // and worth investigating; two means the probes are not independent.
    expect(wrong).toHaveLength(0);
  });

  it("spreads twenty probes rather than piling them on one bit", () => {
    const f = buildFilter([hashes(1)[0]]);
    const set = [...f.bits].reduce((n, byte) => n + byte.toString(2).replace(/0/g, "").length, 0);
    expect(set).toBe(20);
  });

  it("survives a hash whose lower half lands on a multiple of the bit count", () => {
    // The step is `h2 % bits`, which can be zero, which would collapse twenty
    // probes onto one bit. The guard forces it to 1.
    const bits = bitsFor(1); // 512
    const h = "ffffffff" + (0).toString(16).padStart(8, "0");
    const f = buildFilter([h]);
    expect(f.bits.length).toBe(bits / 8);
    const set = [...f.bits].reduce((n, byte) => n + byte.toString(2).replace(/0/g, "").length, 0);
    expect(set).toBeGreaterThan(1);
    expect(testFilter(f, h)).toBe(true);
  });

  it("is empty when nothing goes in", () => {
    const f = buildFilter([]);
    expect(f.inserted).toBe(0);
    expect([...f.bits].every((b) => b === 0)).toBe(true);
    expect(testFilter(f, hashes(1)[0])).toBe(false);
  });
});

describe("the wire encoding", () => {
  it("round trips", () => {
    const f = buildFilter(hashes(500));
    const back = decodeFilter(encodeFilter(f), f.bits.length * 8, f.k, f.inserted);
    expect([...back.bits]).toEqual([...f.bits]);
    for (const h of hashes(500)) expect(testFilter(back, h)).toBe(true);
  });

  it("refuses a payload of the wrong length rather than reading past it", () => {
    const f = buildFilter(hashes(10));
    expect(() => decodeFilter(encodeFilter(f), 64, f.k, f.inserted)).toThrow(/bits/);
  });
});

describe("what the page prints", () => {
  it("turns a filter and a check count into an expected number of wrong names", () => {
    const f = buildFilter(hashes(10_000));
    const expected = expectedWrongNames(f, 10_000);
    expect(expected).toBeGreaterThan(0.005);
    expect(expected).toBeLessThan(0.02);
  });

  it("expects nothing wrong from an empty filter", () => {
    expect(expectedWrongNames(buildFilter([]), 5_000)).toBe(0);
  });
});
```

- [ ] **Step 2: Run them to watch them fail**

Run: `cd "$WT" && npx vitest run lib/tools/overlap/bloom.test.ts`
Expected: FAIL with `Cannot find module './bloom'`.

- [ ] **Step 3: Write the module**

```ts
// lib/tools/overlap/bloom.ts

/**
 * The fallback for a big network.
 *
 * The design says filters above 10,000 rows. Everything else here is derived
 * from the one number the page is willing to print: a false-positive rate of
 * one in a million per name checked.
 *
 *   m / n = -ln(1e-6) / (ln 2)^2 = 28.755  ->  29 bits an entry
 *   k     = round(29 * ln 2)               ->  20 probes
 *   real  = (1 - e^(-20/29))^20 = 8.89e-7  ->  one in about 1.12 million
 *
 * At 10,000 entries that is 36 KB of filter, 48 KB once base64 has inflated
 * it, against 170 KB for the exact list. Three and a half times smaller, not
 * ten, which is worth stating rather than implying.
 *
 * A false positive here prints a name under "you both know" that you do not
 * both know, so the page says the computed number whenever a filter is in use
 * rather than hiding behind "approximate".
 *
 * **The refused alternative.** A filter exchange can be made exact by sending
 * the matches back for the other side to confirm against its real set. It is
 * refused because the receiver would be handing back its own false positives,
 * which are hashes of people it knows and the sender does not, and the sender
 * holds the salt.
 */

/** The design's threshold: above this many entries a side sends a filter. */
export const BLOOM_THRESHOLD = 10_000;
/** The rate every other constant here is derived from. */
export const TARGET_RATE = 1e-6;
/** ceil(-ln(TARGET_RATE) / (ln 2)^2). */
export const BITS_PER_ENTRY = 29;
/** round(BITS_PER_ENTRY * ln 2). */
export const HASH_COUNT = 20;
/** Small enough that a one-entry filter is still sparse. */
const MIN_BITS = 512;

export type BloomFilter = { bits: Uint8Array; k: number; inserted: number };

export function bitsFor(n: number): number {
  const wanted = Math.max(MIN_BITS, Math.ceil(n * BITS_PER_ENTRY));
  return Math.ceil(wanted / 8) * 8;
}

export function falsePositiveRate(bits: number, k: number, inserted: number): number {
  if (inserted <= 0 || bits <= 0) return 0;
  return (1 - Math.exp((-k * inserted) / bits)) ** k;
}

/**
 * Twenty indices from one 64-bit hash, by Kirsch-Mitzenmacher double hashing.
 * `h2 % bits` can be zero, which would put every probe on the same bit and
 * turn a 36 KB filter into a one-bit one. The `|| 1` is that guard.
 */
function probe(hash: string, bits: number, k: number, visit: (index: number) => void): void {
  const h1 = Number.parseInt(hash.slice(0, 8), 16) >>> 0;
  const h2 = (Number.parseInt(hash.slice(8, 16), 16) >>> 0) | 1;
  let at = h1 % bits;
  const step = h2 % bits || 1;
  for (let i = 0; i < k; i++) {
    visit(at);
    at = (at + step) % bits;
  }
}

export function buildFilter(hashes: readonly string[], k: number = HASH_COUNT): BloomFilter {
  const bits = bitsFor(hashes.length);
  const bytes = new Uint8Array(bits / 8);
  for (const hash of hashes) {
    probe(hash, bits, k, (index) => {
      bytes[index >>> 3] |= 1 << (index & 7);
    });
  }
  return { bits: bytes, k, inserted: hashes.length };
}

export function testFilter(filter: BloomFilter, hash: string): boolean {
  const bits = filter.bits.length * 8;
  if (filter.inserted === 0) return false;
  let hit = true;
  probe(hash, bits, filter.k, (index) => {
    if (hit && (filter.bits[index >>> 3] & (1 << (index & 7))) === 0) hit = false;
  });
  return hit;
}

export function encodeFilter(filter: BloomFilter): string {
  let binary = "";
  for (const byte of filter.bits) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function decodeFilter(text: string, bits: number, k: number, inserted: number): BloomFilter {
  const binary = atob(text);
  if (binary.length * 8 !== bits) {
    throw new Error(`overlap: filter says ${bits} bits, payload carries ${binary.length * 8}`);
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bits: bytes, k, inserted };
}

/** What to print: how many wrong names a result of this size is expected to carry. */
export function expectedWrongNames(filter: BloomFilter, checked: number): number {
  return falsePositiveRate(filter.bits.length * 8, filter.k, filter.inserted) * checked;
}
```

- [ ] **Step 4: Run them to watch them pass**

Run: `cd "$WT" && npx tsc --noEmit && npx vitest run lib/tools/overlap/bloom.test.ts`
Expected: PASS.

What this proves: the sizes come out of the target rate, every inserted hash is found, 2,000 absent hashes produced no hit, the zero-step case is guarded, and the encoding round trips. What it cannot see: the real distribution of salted SHA-256 truncations against the double-hashing scheme at 30,000 entries, which the 2,000-entry test only samples. If the "rejects almost everything" case ever fails with one hit, the honest reading is a 1-in-560 event, not a bug; two hits is a bug.

- [ ] **Step 5: Commit**

```bash
cd "$WT"
git add lib/tools/overlap/bloom.ts lib/tools/overlap/bloom.test.ts
git commit -m "feat(overlap): a bloom fallback sized from the rate the page is willing to print"
```

---

### Task 6: The room code, and an alphabet that survives a phone call

**Files:**
- Create: `lib/tools/overlap/code.ts`
- Test: `lib/tools/overlap/code.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `CODE_ALPHABET = "234679FKMRW"`, `CODE_LENGTH = 6`, `CODE_SPACE`, `newCode(fill?)`, `normaliseTypedCode(input)`, `displayCode(code)`, `isCode(value)`. Frozen for G1.

The alphabet's derivation is in the plan header. The code has two jobs and each one removes characters: it is read aloud, so no two members may share a vowel sound, and it is typed from a screen, so no two may look alike.

Eleven characters is not a power of two, so a generator that takes `byte % 11` is biased towards the first three: 256 is 23 times 11 with 3 left over. Rejection sampling fixes it, and a biased generator shrinks an already small space, so the bound is a guard with a test that bites.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/tools/overlap/code.test.ts
import { describe, expect, it } from "vitest";
import { CODE_ALPHABET, CODE_LENGTH, CODE_SPACE, displayCode, isCode, newCode, normaliseTypedCode } from "./code";

describe("the alphabet", () => {
  it("is the eleven characters the plan argues for", () => {
    expect(CODE_ALPHABET).toBe("234679FKMRW");
    expect(CODE_LENGTH).toBe(6);
    expect(CODE_SPACE).toBe(11 ** 6);
  });

  it("holds no character that looks like another", () => {
    for (const pair of ["0O", "1I", "1L", "5S", "8B", "2Z", "6G", "OQ"]) {
      const inSet = [...pair].filter((c) => CODE_ALPHABET.includes(c));
      expect(inSet.length, `${pair} has ${inSet.length} members in the alphabet`).toBeLessThan(2);
    }
  });

  it("holds no two characters that rhyme when read aloud", () => {
    // One member at most from each vowel cluster, except "eh" which keeps F and
    // M on purpose: a fricative coda against a nasal one survives a bad line.
    const clusters: Record<string, string> = {
      ee: "BCDEGPTVZ3",
      ay: "AHJK8",
      eye: "IY59",
      oo: "QUW2",
    };
    for (const [name, members] of Object.entries(clusters)) {
      const kept = [...members].filter((c) => CODE_ALPHABET.includes(c));
      expect(kept.length, `${name} keeps ${kept.join("")}`).toBeLessThanOrEqual(name === "oo" ? 2 : 1);
    }
    expect([..."FLMNSX"].filter((c) => CODE_ALPHABET.includes(c)).join("")).toBe("FM");
  });

  it("holds no duplicates and no lower case", () => {
    expect(new Set(CODE_ALPHABET).size).toBe(CODE_ALPHABET.length);
    expect(CODE_ALPHABET).toBe(CODE_ALPHABET.toUpperCase());
  });
});

describe("newCode", () => {
  it("is six characters from the alphabet", () => {
    for (let i = 0; i < 50; i++) {
      const code = newCode();
      expect(code).toHaveLength(6);
      for (const ch of code) expect(CODE_ALPHABET).toContain(ch);
    }
  });

  /**
   * 256 is 23 times 11 with 3 left over, so `byte % 11` favours 2, 3 and 4.
   * The generator rejects any byte at or above 253 and asks for another. The
   * stub below hands out the three rejected values first, so a generator that
   * did not reject them would spell them.
   */
  it("rejects the bytes that would bias it", () => {
    const source = [253, 254, 255, 0, 1, 2, 3, 4, 5, 6];
    let at = 0;
    const fill = (bytes: Uint8Array) => {
      for (let i = 0; i < bytes.length; i++) bytes[i] = source[at++ % source.length];
    };
    expect(newCode(fill)).toBe("234679");
  });

  it("asks for more bytes rather than giving up when a whole draw is rejected", () => {
    let draws = 0;
    const fill = (bytes: Uint8Array) => {
      draws += 1;
      bytes.fill(draws === 1 ? 255 : 10);
    };
    expect(newCode(fill)).toHaveLength(6);
    expect(draws).toBeGreaterThan(1);
  });
});

describe("normaliseTypedCode", () => {
  it("takes the code as printed", () => {
    expect(normaliseTypedCode("K4M-9F2")).toBe("K4M9F2");
  });

  it("takes it lower case, spaced, or with the hyphen left out", () => {
    expect(normaliseTypedCode("k4m 9f2")).toBe("K4M9F2");
    expect(normaliseTypedCode("  K4M9F2  ")).toBe("K4M9F2");
    expect(normaliseTypedCode("k4m9f2")).toBe("K4M9F2");
  });

  it("maps the two characters that were dropped for looking like something", () => {
    expect(normaliseTypedCode("Z4M9F2")).toBe("24M9F2");
    expect(normaliseTypedCode("K4M9FG")).toBe("K4M9F6");
  });

  it("refuses a character that could be anything rather than guessing", () => {
    expect(normaliseTypedCode("O4M9F2")).toBeNull();
    expect(normaliseTypedCode("14M9F2")).toBeNull();
    expect(normaliseTypedCode("B4M9F2")).toBeNull();
  });

  it("refuses the wrong length", () => {
    expect(normaliseTypedCode("K4M9F")).toBeNull();
    expect(normaliseTypedCode("K4M9F22")).toBeNull();
    expect(normaliseTypedCode("")).toBeNull();
  });
});

describe("displayCode and isCode", () => {
  it("groups a code in threes for reading aloud", () => {
    expect(displayCode("K4M9F2")).toBe("K4M-9F2");
  });

  it("accepts only a normalised code", () => {
    expect(isCode("K4M9F2")).toBe(true);
    expect(isCode("k4m9f2")).toBe(false);
    expect(isCode("K4M-9F2")).toBe(false);
    expect(isCode(42 as unknown as string)).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to watch them fail**

Run: `cd "$WT" && npx vitest run lib/tools/overlap/code.test.ts`
Expected: FAIL with `Cannot find module './code'`.

- [ ] **Step 3: Write the module**

```ts
// lib/tools/overlap/code.ts

/**
 * The room code. Six characters, read down a phone or across a table, then
 * typed. Two jobs, two filters, and each one removes characters.
 *
 * **Read aloud.** English letter and digit names cluster by vowel and a bad
 * line collapses each cluster, so at most one member of each survives: "three"
 * out of B C D E G P T V Z 3, "kay" out of A H J K 8, "nine" out of I Y 5 9,
 * and "two" and "double-u" out of Q U W 2, which is the one cluster that keeps
 * two because a one-syllable name and a three-syllable one do not collide. The
 * "eh" cluster keeps F and M on the same reasoning: a fricative coda against a
 * nasal one survives, where M against N would not.
 *
 * **Typed from a screen.** 0 against O and 1 against I and l are the pairs
 * people get wrong, and both halves of each are already gone. U is dropped as
 * well, because a six-character code from an alphabet containing it will
 * eventually spell something.
 *
 * Eleven characters, six long, is 1,771,561 codes. That is not a large space
 * and it is defended rather than relied on: a room lives ten minutes, a wrong
 * code costs a budget token against both the address and the code, and a
 * guessed code buys an SDP offer and nothing else. It is also why the
 * generator is unbiased: `byte % 11` would favour 2, 3 and 4, and a biased
 * generator shrinks a space that is already the weakest thing here.
 *
 * Frozen for G1 (Phosphor Pong), which uses the same relay.
 */

export const CODE_ALPHABET = "234679FKMRW";
export const CODE_LENGTH = 6;
export const CODE_SPACE = CODE_ALPHABET.length ** CODE_LENGTH;

/** 23 * 11. Bytes at or above this would bias the remainder, so they are redrawn. */
const REJECT_AT = 253;

/**
 * The two characters that were dropped for looking like something and have
 * exactly one surviving twin, so typing them is a mistake with a single correct
 * reading. Nothing else is guessed at.
 */
const LOOKALIKES: Record<string, string> = { Z: "2", G: "6" };

export function newCode(fill: (bytes: Uint8Array) => void = (b) => globalThis.crypto.getRandomValues(b)): string {
  let out = "";
  while (out.length < CODE_LENGTH) {
    const draw = new Uint8Array(CODE_LENGTH * 2);
    fill(draw);
    for (const byte of draw) {
      if (byte >= REJECT_AT) continue;
      out += CODE_ALPHABET[byte % CODE_ALPHABET.length];
      if (out.length === CODE_LENGTH) break;
    }
  }
  return out;
}

export function normaliseTypedCode(input: string): string | null {
  const cleaned = [...input.toUpperCase().replace(/[\s-]/g, "")]
    .map((ch) => LOOKALIKES[ch] ?? ch)
    .join("");
  return isCode(cleaned) ? cleaned : null;
}

export function displayCode(code: string): string {
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

export function isCode(value: unknown): value is string {
  return typeof value === "string" && new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`).test(value);
}
```

- [ ] **Step 4: Run them to watch them pass**

Run: `cd "$WT" && npx tsc --noEmit && npx vitest run lib/tools/overlap/code.test.ts`
Expected: PASS.

What this proves: the alphabet holds no visual pair and at most one member of each vowel cluster, the generator rejects the three biasing bytes, and a typed code is either read exactly or refused. What it cannot see: whether two people on a bad line actually get it right. That is a claim about human ears and no test here touches it.

- [ ] **Step 5: Commit**

```bash
cd "$WT"
git add lib/tools/overlap/code.ts lib/tools/overlap/code.test.ts
git commit -m "feat(overlap): a six-character room code from an alphabet that survives a phone call"
```

---

### Task 7: The wire protocol, the intersection and the safety string

**Files:**
- Create: `lib/tools/overlap/protocol.ts`
- Test: `lib/tools/overlap/protocol.test.ts`

**Interfaces:**
- Consumes: `Entry`, `OverlapProtocolError` (Task 2); `hashAll`, `encodeSalt`, `decodeSalt`, `newSalt`, `toHex`, `SubtleLike` (Task 4); the whole of `bloom.ts` (Task 5); `CODE_ALPHABET` (Task 6)
- Produces: `type Channel`, `type Frame`, `type Side`, `type Stage`, `type ExchangeInput`, `type ExchangeResult`, `runExchange(input)`, `pairedChannels()`, `safetyString(salt, offerFp, answerFp, subtle?)`, `fingerprintOf(sdp)`, `MAX_FRAME_CHARS`

**This is the task that makes the untestable part small.** The transport is three methods. Everything above it, the salt exchange, the framing, the chunking, the mode decision, the intersection and the safety string, runs inside vitest against two in-memory channels wired to each other, in one process, with the real `crypto.subtle`. What is left untested is `RTCPeerConnection` itself, which is Task 10's twenty lines and Task 14's two browsers.

`pairedChannels()` is production code, not a test helper: the demo in Task 9 runs the real exchange through it in a single tab, which means the demo is a second exercise of the same protocol rather than a mock of it.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/tools/overlap/protocol.test.ts
import { describe, expect, it, vi } from "vitest";
import { BLOOM_THRESHOLD } from "./bloom";
import { newSalt } from "./hash";
import { MAX_FRAME_CHARS, fingerprintOf, pairedChannels, runExchange, safetyString } from "./protocol";
import type { Entry } from "./types";

const person = (slug: string, label = slug): Entry => ({ slug, label });

const OFFER_FP = "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99";
const ANSWER_FP = OFFER_FP.split(":").reverse().join(":");

/** Both sides of one exchange, run to completion, in one process. */
async function meet(a: Entry[], b: Entry[], overrides: Partial<Parameters<typeof runExchange>[0]> = {}) {
  const [left, right] = pairedChannels();
  const fingerprints = { offer: OFFER_FP, answer: ANSWER_FP };
  const [ra, rb] = await Promise.all([
    runExchange({ side: "creator", entries: a, channel: left, fingerprints, ...overrides }),
    runExchange({ side: "joiner", entries: b, channel: right, fingerprints, ...overrides }),
  ]);
  return { ra, rb };
}

describe("runExchange, exact mode", () => {
  it("finds the people in both lists and nobody else", async () => {
    const { ra, rb } = await meet(
      [person("aoife-1"), person("cormac-2"), person("deirdre-3")],
      [person("cormac-2"), person("deirdre-3"), person("eoin-4"), person("fiadh-5")],
    );
    expect(ra.shared.map((e) => e.slug)).toEqual(["cormac-2", "deirdre-3"]);
    expect(rb.shared.map((e) => e.slug)).toEqual(["cormac-2", "deirdre-3"]);
  });

  it("fills every name from the local file and never from the wire", async () => {
    const { ra, rb } = await meet(
      [person("sine-ni-dhomhnaill", "Síne Ní Dhomhnaill")],
      [person("sine-ni-dhomhnaill", "Sine Ni Dhomhnaill")],
    );
    expect(ra.shared[0].label).toBe("Síne Ní Dhomhnaill");
    expect(rb.shared[0].label).toBe("Sine Ni Dhomhnaill");
  });

  it("finds nobody when there is nobody, without failing", async () => {
    const { ra, rb } = await meet([person("a")], [person("b")]);
    expect(ra.shared).toEqual([]);
    expect(rb.shared).toEqual([]);
    expect(ra.theirs).toBe(1);
  });

  it("sorts the result by label so two tabs read the same way", async () => {
    const both = ["zeta", "alpha", "mu"].map((s) => person(s, s.toUpperCase()));
    const { ra } = await meet(both, both);
    expect(ra.shared.map((e) => e.label)).toEqual(["ALPHA", "MU", "ZETA"]);
  });

  it("reports both list sizes and the mode", async () => {
    const { ra, rb } = await meet([person("a"), person("b")], [person("b")]);
    expect(ra.mine).toBe(2);
    expect(ra.theirs).toBe(1);
    expect(ra.mode).toBe("exact");
    expect(ra.falsePositives).toBeNull();
    expect(rb.mine).toBe(1);
  });

  it("agrees on a salt, and only the creator makes one", async () => {
    const fill = vi.fn((b: Uint8Array) => b.fill(9));
    const [left, right] = pairedChannels();
    const fingerprints = { offer: OFFER_FP, answer: ANSWER_FP };
    await Promise.all([
      runExchange({ side: "creator", entries: [person("a")], channel: left, fingerprints, random: fill }),
      runExchange({ side: "joiner", entries: [person("a")], channel: right, fingerprints, random: fill }),
    ]);
    expect(fill).toHaveBeenCalledTimes(1);
  });

  it("chunks a list that will not fit in one message", async () => {
    const many = Array.from({ length: 3_000 }, (_, i) => person(`p${i}`));
    const [left, right] = pairedChannels();
    const sent: string[] = [];
    const watched = { ...left, send: (t: string) => { sent.push(t); left.send(t); } };
    const fingerprints = { offer: OFFER_FP, answer: ANSWER_FP };
    const [ra] = await Promise.all([
      runExchange({ side: "creator", entries: many, channel: watched, fingerprints }),
      runExchange({ side: "joiner", entries: many, channel: right, fingerprints }),
    ]);
    expect(ra.shared).toHaveLength(3_000);
    expect(sent.filter((t) => t.includes('"part"')).length).toBeGreaterThan(1);
    for (const frame of sent) expect(frame.length).toBeLessThanOrEqual(MAX_FRAME_CHARS + 200);
  });
});

describe("runExchange, bloom mode", () => {
  it("sends a filter above the threshold and an exact list below it", async () => {
    const big = Array.from({ length: 40 }, (_, i) => person(`big${i}`));
    const small = Array.from({ length: 5 }, (_, i) => person(`big${i}`));
    // The threshold is lowered for the test rather than building 10,001 entries,
    // which would make this file slow for no extra assurance.
    const { ra, rb } = await meet(big, small, { bloomThreshold: 10 });
    expect(ra.mode).toBe("bloom");
    expect(rb.mode).toBe("exact");
    // Each side reports the mode of what it received, so the page can print the
    // right sentence. `rb` was handed a filter.
    expect(rb.theirMode).toBe("bloom");
    expect(ra.theirMode).toBe("exact");
    expect(rb.falsePositives).toBeGreaterThan(0);
    expect(rb.shared.map((e) => e.slug).sort()).toEqual(small.map((e) => e.slug).sort());
  });

  it("still keeps the design's threshold as the default", () => {
    expect(BLOOM_THRESHOLD).toBe(10_000);
  });
});

describe("the safety string", () => {
  it("is four characters from the room alphabet", async () => {
    const s = await safetyString(newSalt(), OFFER_FP, ANSWER_FP);
    expect(s).toMatch(/^[234679FKMRW]{4}$/);
  });

  it("is the same on both sides of one exchange", async () => {
    const { ra, rb } = await meet([person("a")], [person("a")]);
    expect(ra.safety).toBe(rb.safety);
  });

  it("changes when either fingerprint changes, which is the whole point", async () => {
    const salt = newSalt();
    const base = await safetyString(salt, OFFER_FP, ANSWER_FP);
    expect(await safetyString(salt, ANSWER_FP, ANSWER_FP)).not.toBe(base);
    expect(await safetyString(salt, OFFER_FP, OFFER_FP)).not.toBe(base);
    expect(await safetyString(newSalt(), OFFER_FP, ANSWER_FP)).not.toBe(base);
  });

  it("reads a DTLS fingerprint out of an SDP and says so when there is none", () => {
    expect(fingerprintOf(`v=0\r\na=fingerprint:sha-256 ${OFFER_FP}\r\n`)).toBe(OFFER_FP);
    expect(fingerprintOf("v=0\r\na=nothing\r\n")).toBe("");
  });
});

describe("what it refuses", () => {
  it("refuses a frame it cannot read rather than carrying on", async () => {
    const [left, right] = pairedChannels();
    const fingerprints = { offer: OFFER_FP, answer: ANSWER_FP };
    const run = runExchange({ side: "joiner", entries: [person("a")], channel: right, fingerprints });
    left.send("not json at all");
    await expect(run).rejects.toThrow(/protocol/);
  });

  it("refuses a salt of the wrong size", async () => {
    const [left, right] = pairedChannels();
    const fingerprints = { offer: OFFER_FP, answer: ANSWER_FP };
    const run = runExchange({ side: "joiner", entries: [person("a")], channel: right, fingerprints });
    left.send(JSON.stringify({ t: "salt", v: btoa("short") }));
    await expect(run).rejects.toThrow();
  });

  it("refuses a version it does not know", async () => {
    const [left, right] = pairedChannels();
    const fingerprints = { offer: OFFER_FP, answer: ANSWER_FP };
    const run = runExchange({ side: "joiner", entries: [person("a")], channel: right, fingerprints });
    left.send(JSON.stringify({ t: "hello", v: 99 }));
    await expect(run).rejects.toThrow(/protocol/);
  });
});

describe("what crosses the wire", () => {
  /**
   * The central promise, checked on the frames themselves. Every message is
   * captured and searched for a slug and for a label. A slug appearing here
   * would mean the tool sends the list it says it does not.
   */
  it("carries no slug and no name in any frame", async () => {
    const [left, right] = pairedChannels();
    const traffic: string[] = [];
    const tap = (c: typeof left) => ({ ...c, send: (t: string) => { traffic.push(t); c.send(t); } });
    const fingerprints = { offer: OFFER_FP, answer: ANSWER_FP };
    const a = [person("sine-ni-dhomhnaill", "Síne Ní Dhomhnaill"), person("cormac-x", "Cormac X")];
    const b = [person("cormac-x", "Cormac Ecks")];
    await Promise.all([
      runExchange({ side: "creator", entries: a, channel: tap(left), fingerprints }),
      runExchange({ side: "joiner", entries: b, channel: tap(right), fingerprints }),
    ]);
    const wire = traffic.join("\n");
    for (const secret of ["sine-ni-dhomhnaill", "cormac-x", "Síne", "Cormac", "Ecks"]) {
      expect(wire, `"${secret}" reached the wire`).not.toContain(secret);
    }
    expect(traffic.length).toBeGreaterThan(0);
  });

  it("carries only the frame kinds the protocol defines", async () => {
    const [left, right] = pairedChannels();
    const kinds = new Set<string>();
    const tap = (c: typeof left) => ({ ...c, send: (t: string) => { kinds.add(JSON.parse(t).t); c.send(t); } });
    const fingerprints = { offer: OFFER_FP, answer: ANSWER_FP };
    await Promise.all([
      runExchange({ side: "creator", entries: [person("a")], channel: tap(left), fingerprints }),
      runExchange({ side: "joiner", entries: [person("a")], channel: tap(right), fingerprints }),
    ]);
    expect([...kinds].sort()).toEqual(["done", "meta", "part", "salt"]);
  });
});
```

- [ ] **Step 2: Run them to watch them fail**

Run: `cd "$WT" && npx vitest run lib/tools/overlap/protocol.test.ts`
Expected: FAIL with `Cannot find module './protocol'`.

- [ ] **Step 3: Write the module**

```ts
// lib/tools/overlap/protocol.ts
import {
  BLOOM_THRESHOLD,
  buildFilter,
  decodeFilter,
  encodeFilter,
  expectedWrongNames,
  testFilter,
  type BloomFilter,
} from "./bloom";
import { decodeSalt, encodeSalt, hashAll, hashSlug, newSalt, type SubtleLike } from "./hash";
import { CODE_ALPHABET } from "./code";
import { OverlapProtocolError, type Entry } from "./types";

/**
 * The exchange, and the reason the untestable part of this tool is small.
 *
 * The transport is three methods. Everything else, the salt, the framing, the
 * chunking, the mode decision, the intersection and the safety string, runs
 * against two in-memory channels in one process with the real
 * `crypto.subtle`. What is not tested here is `RTCPeerConnection`, which lives
 * alone in `webrtc.ts` and is covered by the two-browser check.
 *
 * `pairedChannels` is production code, not a test helper: the demo runs the
 * real exchange through it in one tab, so the demo exercises the protocol
 * rather than imitating it.
 *
 * The wire is newline-free JSON, one object a message:
 *
 *   { t: "salt", v }                              creator only, first
 *   { t: "meta", mode, count, bits?, k? }         each side, once
 *   { t: "part", i, n, v }                        each side, one or more
 *   { t: "done" }                                 each side, last
 *
 * Only hashes travel. A test in this file captures every frame and searches it
 * for a slug and a name.
 */

/** Comfortably under the 16 KB a data channel message can be relied on to carry. */
export const MAX_FRAME_CHARS = 12_000;
const VERSION = 1;

export type Channel = {
  send(text: string): void;
  onMessage(handler: (text: string) => void): void;
  close(): void;
};

export type Side = "creator" | "joiner";
export type Mode = "exact" | "bloom";
export type Stage = "waiting-for-salt" | "hashing" | "sending" | "receiving" | "done";

export type ExchangeInput = {
  side: Side;
  entries: readonly Entry[];
  channel: Channel;
  /** The DTLS fingerprints out of the two SDPs. Both sides hold both. */
  fingerprints: { offer: string; answer: string };
  subtle?: SubtleLike;
  random?: (bytes: Uint8Array) => void;
  bloomThreshold?: number;
  onStage?: (stage: Stage) => void;
  onProgress?: (done: number, total: number) => void;
};

export type ExchangeResult = {
  /** From the local file only. Sorted by label. */
  shared: Entry[];
  mine: number;
  theirs: number;
  /** What this side sent. */
  mode: Mode;
  /** What this side received, which is what decides whether names can be wrong. */
  theirMode: Mode;
  /** Expected wrong names in `shared`, or null when the peer sent an exact list. */
  falsePositives: number | null;
  safety: string;
};

/** Two channels wired to each other. Used by the demo and by the tests. */
export function pairedChannels(): [Channel, Channel] {
  const handlers: Array<((text: string) => void) | null> = [null, null];
  const make = (self: 0 | 1): Channel => ({
    send(text) {
      const other = handlers[self === 0 ? 1 : 0];
      if (other) queueMicrotask(() => other(text));
    },
    onMessage(handler) {
      handlers[self] = handler;
    },
    close() {
      handlers[self] = null;
    },
  });
  return [make(0), make(1)];
}

/** The sha-256 DTLS fingerprint out of an SDP, or "" when there is not one. */
export function fingerprintOf(sdp: string): string {
  return /^a=fingerprint:sha-256 (.+)$/im.exec(sdp)?.[1].trim() ?? "";
}

/**
 * Four characters both sides can read to each other.
 *
 * It catches a relay that has substituted its own offer and answer, and two
 * people who are in different rooms. It does not catch a stranger who guessed
 * the code, because then there is only one far side and both ends agree. And
 * it catches nothing at all unless the characters are actually read aloud.
 */
export async function safetyString(
  salt: Uint8Array,
  offerFingerprint: string,
  answerFingerprint: string,
  subtle?: SubtleLike,
): Promise<string> {
  const digest = await hashSlug(salt, `${offerFingerprint}|${answerFingerprint}`, subtle);
  let out = "";
  for (let i = 0; i < 4; i++) {
    out += CODE_ALPHABET[Number.parseInt(digest.slice(i * 2, i * 2 + 2), 16) % CODE_ALPHABET.length];
  }
  return out;
}

type Frame =
  | { t: "salt"; v: string }
  | { t: "meta"; version: number; mode: Mode; count: number; bits?: number; k?: number }
  | { t: "part"; i: number; n: number; v: string }
  | { t: "done" };

function parseFrame(text: string): Frame {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new OverlapProtocolError("a message that was not JSON");
  }
  if (typeof value !== "object" || value === null || typeof (value as Frame).t !== "string") {
    throw new OverlapProtocolError("a message with no kind on it");
  }
  const frame = value as Frame;
  if (!["salt", "meta", "part", "done"].includes(frame.t)) {
    throw new OverlapProtocolError(`a kind this version does not know: ${frame.t}`);
  }
  if (frame.t === "meta" && frame.version !== VERSION) {
    throw new OverlapProtocolError(`version ${String(frame.version)}, this page speaks ${VERSION}`);
  }
  return frame;
}

/** Splits a joined string into frames small enough for one message. */
function partsOf(payload: string): string[] {
  if (payload.length <= MAX_FRAME_CHARS) return [payload];
  const out: string[] = [];
  for (let i = 0; i < payload.length; i += MAX_FRAME_CHARS) out.push(payload.slice(i, i + MAX_FRAME_CHARS));
  return out;
}

export async function runExchange(input: ExchangeInput): Promise<ExchangeResult> {
  const { side, entries, channel, fingerprints } = input;
  const threshold = input.bloomThreshold ?? BLOOM_THRESHOLD;

  const inbox: Frame[] = [];
  let deliver: (() => void) | null = null;
  let failure: Error | null = null;

  channel.onMessage((text) => {
    try {
      inbox.push(parseFrame(text));
    } catch (error) {
      failure = error instanceof Error ? error : new OverlapProtocolError("an unreadable message");
    }
    deliver?.();
  });

  const next = <T extends Frame["t"]>(kind: T): Promise<Extract<Frame, { t: T }>> =>
    new Promise((resolve, reject) => {
      const pump = () => {
        if (failure) return reject(failure);
        const at = inbox.findIndex((f) => f.t === kind);
        if (at === -1) { deliver = pump; return; }
        resolve(inbox.splice(at, 1)[0] as Extract<Frame, { t: T }>);
      };
      pump();
    });

  // 1. The salt. One side makes it, the other waits for it.
  input.onStage?.("waiting-for-salt");
  let salt: Uint8Array;
  if (side === "creator") {
    salt = newSalt(input.random);
    channel.send(JSON.stringify({ t: "salt", v: encodeSalt(salt) }));
  } else {
    salt = decodeSalt((await next("salt")).v);
  }

  // 2. Hash our own list.
  input.onStage?.("hashing");
  const byHash = new Map<string, Entry>();
  const mine = await hashAll(
    salt,
    entries.map((e) => e.slug),
    { subtle: input.subtle, onProgress: input.onProgress },
  );
  for (const entry of entries) {
    byHash.set(await hashSlug(salt, entry.slug, input.subtle), entry);
  }

  // 3. Send it, exactly or as a filter.
  input.onStage?.("sending");
  const mode: Mode = mine.length > threshold ? "bloom" : "exact";
  const filter = mode === "bloom" ? buildFilter(mine) : null;
  const payload = filter ? encodeFilter(filter) : mine.join(",");
  const parts = partsOf(payload);
  channel.send(JSON.stringify({
    t: "meta",
    version: VERSION,
    mode,
    count: mine.length,
    ...(filter ? { bits: filter.bits.length * 8, k: filter.k } : {}),
  }));
  parts.forEach((v, i) => channel.send(JSON.stringify({ t: "part", i, n: parts.length, v })));
  channel.send(JSON.stringify({ t: "done" }));

  // 4. Take theirs.
  input.onStage?.("receiving");
  const meta = await next("meta");
  const received: string[] = new Array(0);
  const chunks: string[] = [];
  while (chunks.length < 1 || chunks.filter(Boolean).length < (chunks.length || 1)) {
    const part = await next("part");
    chunks[part.i] = part.v;
    if (chunks.filter((c) => typeof c === "string").length === part.n) break;
  }
  await next("done");
  const theirPayload = chunks.join("");

  let shared: Entry[];
  let falsePositives: number | null = null;
  if (meta.mode === "bloom") {
    if (typeof meta.bits !== "number" || typeof meta.k !== "number") {
      throw new OverlapProtocolError("a filter with no size on it");
    }
    const theirs: BloomFilter = decodeFilter(theirPayload, meta.bits, meta.k, meta.count);
    shared = mine.filter((h) => testFilter(theirs, h)).map((h) => byHash.get(h)!);
    falsePositives = expectedWrongNames(theirs, mine.length);
  } else {
    const theirs = new Set(theirPayload === "" ? [] : theirPayload.split(","));
    shared = mine.filter((h) => theirs.has(h)).map((h) => byHash.get(h)!);
  }
  void received;

  input.onStage?.("done");
  return {
    shared: shared.filter(Boolean).sort((a, b) => a.label.localeCompare(b.label)),
    mine: mine.length,
    theirs: meta.count,
    mode,
    theirMode: meta.mode,
    falsePositives,
    safety: await safetyString(salt, fingerprints.offer, fingerprints.answer, input.subtle),
  };
}
```

- [ ] **Step 4: Run them to watch them pass**

Run: `cd "$WT" && npx tsc --noEmit && npx vitest run lib/tools/overlap/protocol.test.ts`
Expected: PASS. If the chunking test hangs, the receive loop is the suspect: it must stop when it has `part.n` chunks and not before.

What this proves: two independent runs of this code, given two lists, agree on the shared set, each fills names from its own side, the salt is made once, a 3,000-entry list is chunked, the modes are independent per side, the safety string moves with either fingerprint, and no slug or name appears in any frame. What it cannot see: a real data channel, message ordering under packet loss (SCTP in ordered reliable mode gives the same ordering these tests assume, which is a property of the transport rather than of this code), and a peer running a different version of this file.

- [ ] **Step 5: Commit**

```bash
cd "$WT"
git add lib/tools/overlap/protocol.ts lib/tools/overlap/protocol.test.ts
git commit -m "feat(overlap): the exchange, driven end to end by two channels in one process"
```

---

### Task 8: The relay, its budgets, and what it does when there is no Redis

**Files:**
- Create: `lib/relay.ts`
- Test: `lib/relay.test.ts`
- Create: `app/api/relay/route.ts`
- Test: `app/api/relay/route.test.ts`
- Create: `app/api/relay/answer/route.ts`
- Test: `app/api/relay/answer/route.test.ts`

**Interfaces:**
- Consumes: `getRedis` (F4 `lib/store/redis.ts`), `StoreUnavailableError` (F4 `lib/store/errors.ts`), `takeBudget`, `budgetKeyForIp` (F4 `lib/budget.ts`), `isCode`, `newCode` (Task 6), `overlapCopy` (Task 1)
- Produces: everything in the frozen block at the head of this plan. G1 consumes it unchanged.

**Redis is not in production yet.** The ledger has F4 held with "Redis and Neon wait on Fergus", so `getRedis()` throwing is the expected state on the day this ships. It is one of the tool's normal answers, not an error path: 503, a named error code, a sentence a person can act on, and a client that switches to copy and paste and says why.

- [ ] **Step 1: Write the failing tests for the pure half**

```ts
// lib/relay.test.ts
import { describe, expect, it } from "vitest";
import { MAX_SDP_BYTES, ROOM_TTL_SEC, answerKey, errorReply, offerKey, validSdp } from "./relay";

describe("keys and lifetime", () => {
  it("holds a room for ten minutes and no longer", () => {
    expect(ROOM_TTL_SEC).toBe(600);
  });

  it("keeps the offer and the answer under two keys and nothing else", () => {
    expect(offerKey("K4M9F2")).toBe("relay:K4M9F2");
    expect(answerKey("K4M9F2")).toBe("relay:K4M9F2:a");
    expect(offerKey("K4M9F2")).not.toBe(answerKey("K4M9F2"));
  });
});

describe("validSdp", () => {
  it("takes a session description", () => {
    expect(validSdp("v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\n")).toBe(true);
  });

  it("refuses anything that is not one", () => {
    expect(validSdp("")).toBe(false);
    expect(validSdp("   ")).toBe(false);
    expect(validSdp("hello")).toBe(false);
    expect(validSdp(42)).toBe(false);
    expect(validSdp(null)).toBe(false);
    expect(validSdp({ sdp: "v=0" })).toBe(false);
  });

  it("refuses a blob above the cap, measured in bytes and not characters", () => {
    expect(MAX_SDP_BYTES).toBe(8192);
    expect(validSdp(`v=0\r\n${"a".repeat(MAX_SDP_BYTES)}`)).toBe(false);
    // Four-byte characters must not slip through a length check on code units.
    expect(validSdp(`v=0\r\n${"\u{1f600}".repeat(MAX_SDP_BYTES / 3)}`)).toBe(false);
    expect(validSdp(`v=0\r\n${"a".repeat(100)}`)).toBe(true);
  });
});

describe("errorReply", () => {
  it("carries the code and the sentence, and a wait when there is one", () => {
    expect(errorReply("no-room", "gone", undefined)).toEqual({
      status: 404,
      body: { error: "no-room", message: "gone" },
    });
    expect(errorReply("budget", "later", 900)).toEqual({
      status: 429,
      body: { error: "budget", message: "later", retryAfterSec: 900 },
    });
    expect(errorReply("relay-unavailable", "off", undefined).status).toBe(503);
    expect(errorReply("already-joined", "taken", undefined).status).toBe(409);
    expect(errorReply("bad-code", "nope", undefined).status).toBe(400);
    expect(errorReply("failed", "broke", undefined).status).toBe(500);
  });
});
```

- [ ] **Step 2: Write the pure half**

```ts
// lib/relay.ts

/**
 * The relay's pure half.
 *
 * The relay does one thing: it holds an SDP offer and an SDP answer under a
 * six-character code for ten minutes so two browsers can find each other. It
 * never sees a hash, a name or a file, and there is nothing else in the room.
 *
 * Two keys per room, which is the "at most two blobs" the programme design
 * asks for. The offer key carries the TTL; the answer key gets its own, set to
 * whatever is left, so an answer can never outlive its room.
 *
 * Frozen for G1 (Phosphor Pong), which matches players through the same rooms.
 */

export const ROOM_TTL_SEC = 600;
/** An SDP with a full candidate list runs to a few kilobytes. This is generous. */
export const MAX_SDP_BYTES = 8 * 1024;

export function offerKey(code: string): string {
  return `relay:${code}`;
}

export function answerKey(code: string): string {
  return `relay:${code}:a`;
}

const encoder = new TextEncoder();

/**
 * Bytes, not characters. A length check on code units lets a blob of astral
 * characters through at three times the size it claims.
 */
export function validSdp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed.startsWith("v=0")) return false;
  return encoder.encode(value).length <= MAX_SDP_BYTES;
}

export type RelayError =
  | "bad-request"
  | "bad-code"
  | "no-room"
  | "already-joined"
  | "budget"
  | "relay-unavailable"
  | "failed";

export type RelayReply = { status: number; body: Record<string, unknown> };

const STATUS: Record<RelayError, number> = {
  "bad-request": 400,
  "bad-code": 400,
  "no-room": 404,
  "already-joined": 409,
  budget: 429,
  "relay-unavailable": 503,
  failed: 500,
};

export function errorReply(error: RelayError, message: string, retryAfterSec?: number): RelayReply {
  return {
    status: STATUS[error],
    body: retryAfterSec === undefined ? { error, message } : { error, message, retryAfterSec },
  };
}
```

Run: `cd "$WT" && npx vitest run lib/relay.test.ts`
Expected: PASS.

- [ ] **Step 3: Write the failing route tests**

```ts
// app/api/relay/route.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StoreUnavailableError } from "@/lib/store/errors";

const { getRedisMock, takeBudgetMock } = vi.hoisted(() => ({
  getRedisMock: vi.fn(),
  takeBudgetMock: vi.fn(),
}));
vi.mock("@/lib/store/redis", () => ({ getRedis: getRedisMock }));
vi.mock("@/lib/budget", () => ({
  takeBudget: takeBudgetMock,
  budgetKeyForIp: () => "ip-hash",
}));

import { GET, POST } from "./route";

const SDP = "v=0\r\no=- 1 2 IN IP4 0.0.0.0\r\na=fingerprint:sha-256 AA:BB\r\n";

function post(body: unknown) {
  return new Request("https://x/api/relay", { method: "POST", body: JSON.stringify(body) });
}

beforeEach(() => {
  getRedisMock.mockReset();
  takeBudgetMock.mockReset();
  takeBudgetMock.mockResolvedValue({ ok: true, remaining: 4 });
});

describe("POST /api/relay", () => {
  it("makes a room, and the code and the TTL come back", async () => {
    const set = vi.fn().mockResolvedValue("OK");
    getRedisMock.mockReturnValue({ set, get: vi.fn() });
    const res = await POST(post({ offer: SDP }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.code).toMatch(/^[234679FKMRW]{6}$/);
    expect(body.ttlSec).toBe(600);
    expect(set).toHaveBeenCalledWith(`relay:${body.code}`, SDP, { ex: 600, nx: true });
  });

  it("takes an address budget and a global one, in that order", async () => {
    getRedisMock.mockReturnValue({ set: vi.fn().mockResolvedValue("OK"), get: vi.fn() });
    await POST(post({ offer: SDP }));
    expect(takeBudgetMock.mock.calls.map(([r]) => [r.scope, r.limit, r.windowSec])).toEqual([
      ["ip", 5, 3600],
      ["global", 20, 86_400],
    ]);
  });

  it("refuses over budget with the sentence and a wait", async () => {
    getRedisMock.mockReturnValue({ set: vi.fn(), get: vi.fn() });
    takeBudgetMock.mockResolvedValueOnce({ ok: false, remaining: 0, retryAfterSec: 900, reason: "x" });
    const res = await POST(post({ offer: SDP }));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("budget");
    expect(body.retryAfterSec).toBe(900);
    expect(body.message).toContain("copy and paste");
  });

  it("refuses a body that is not an offer", async () => {
    getRedisMock.mockReturnValue({ set: vi.fn(), get: vi.fn() });
    for (const body of [{}, { offer: "" }, { offer: "hello" }, { offer: 1 }]) {
      expect((await POST(post(body))).status).toBe(400);
    }
    expect((await POST(new Request("https://x", { method: "POST", body: "{" }))).status).toBe(400);
  });

  it("retries a code collision rather than clobbering a live room", async () => {
    const set = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce("OK");
    getRedisMock.mockReturnValue({ set, get: vi.fn() });
    expect((await POST(post({ offer: SDP }))).status).toBe(200);
    expect(set).toHaveBeenCalledTimes(2);
  });

  /**
   * The state this ships in. Redis is not provisioned in production, so this
   * is the ordinary answer rather than an edge case, and the sentence has to
   * be one a person can act on.
   */
  it("says the room service is off and points at copy and paste", async () => {
    getRedisMock.mockImplementation(() => {
      throw new StoreUnavailableError("redis", "UPSTASH_REDIS_REST_URL");
    });
    const res = await POST(post({ offer: SDP }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("relay-unavailable");
    expect(body.message).toContain("copy and paste");
    expect(body.message).not.toContain("UPSTASH");
  });

  it("does not dress a real fault up as a missing store", async () => {
    getRedisMock.mockReturnValue({
      set: vi.fn().mockRejectedValue(new Error("upstream on fire")),
      get: vi.fn(),
    });
    const res = await POST(post({ offer: SDP }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("failed");
  });
});

describe("GET /api/relay", () => {
  const get = (code: string) => GET(new Request(`https://x/api/relay?code=${code}`));

  it("hands back the offer", async () => {
    getRedisMock.mockReturnValue({ get: vi.fn().mockResolvedValue(SDP), set: vi.fn() });
    const res = await get("K4M9F2");
    expect(res.status).toBe(200);
    expect((await res.json()).offer).toBe(SDP);
  });

  it("takes an address budget and a per-code one", async () => {
    getRedisMock.mockReturnValue({ get: vi.fn().mockResolvedValue(SDP), set: vi.fn() });
    await get("K4M9F2");
    expect(takeBudgetMock.mock.calls.map(([r]) => r.scope)).toEqual(["ip", "target"]);
    expect(takeBudgetMock.mock.calls[1][0].key).toBe("K4M9F2");
  });

  it("refuses a code that is not one, without touching Redis", async () => {
    const redisGet = vi.fn();
    getRedisMock.mockReturnValue({ get: redisGet, set: vi.fn() });
    expect((await get("nope")).status).toBe(400);
    expect((await GET(new Request("https://x/api/relay"))).status).toBe(400);
    expect(redisGet).not.toHaveBeenCalled();
  });

  it("says there is no room rather than returning nothing", async () => {
    getRedisMock.mockReturnValue({ get: vi.fn().mockResolvedValue(null), set: vi.fn() });
    const res = await get("K4M9F2");
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("no-room");
  });

  it("never caches", async () => {
    getRedisMock.mockReturnValue({ get: vi.fn().mockResolvedValue(SDP), set: vi.fn() });
    expect((await get("K4M9F2")).headers.get("cache-control")).toContain("no-store");
  });
});
```

- [ ] **Step 4: Write the first route**

```ts
// app/api/relay/route.ts
import { headers } from "next/headers";
import { overlapCopy } from "@/content/tools/overlap";
import { takeBudget, budgetKeyForIp } from "@/lib/budget";
import { isCode, newCode } from "@/lib/tools/overlap/code";
import { ROOM_TTL_SEC, errorReply, offerKey, validSdp, type RelayReply } from "@/lib/relay";
import { StoreUnavailableError } from "@/lib/store/errors";
import { getRedis } from "@/lib/store/redis";

/**
 * `/api/relay`: the only server part of `/tools/overlap`, and the whole of it.
 *
 * POST puts an SDP offer under a fresh six-character code for ten minutes and
 * hands the code back. GET reads the offer out again for whoever types the
 * code. That is everything the server knows: two connection blobs and a
 * hashed address. No hash from anybody's list ever reaches this file, and the
 * copy and paste route on the page skips it entirely.
 *
 * **Redis is not provisioned in production yet**, so `getRedis()` throwing
 * `StoreUnavailableError` is an ordinary answer here rather than a fault: 503,
 * a named error the client switches on, and a sentence that tells a person
 * what to do instead. Every other throw is a 500, because a real fault dressed
 * up as a missing store is a bug nobody would ever find.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store", "content-type": "application/json" };

function reply({ status, body }: RelayReply): Response {
  return new Response(JSON.stringify(body), { status, headers: NO_STORE });
}

/** How many fresh codes to try before admitting the space is busy. */
const CODE_TRIES = 5;

async function budgetOr(
  scope: "ip" | "target" | "global",
  key: string,
  limit: number,
  windowSec: number,
): Promise<RelayReply | null> {
  const result = await takeBudget({ tool: "overlap-relay", scope, key, limit, windowSec });
  return result.ok ? null : errorReply("budget", overlapCopy.relay.budget, result.retryAfterSec);
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reply(errorReply("bad-request", overlapCopy.relay.badRequest));
  }
  const offer = (body as { offer?: unknown })?.offer;
  if (!validSdp(offer)) return reply(errorReply("bad-request", overlapCopy.relay.badRequest));

  try {
    const ip = budgetKeyForIp(await headers());
    const overIp = await budgetOr("ip", ip, 5, 3600);
    if (overIp) return reply(overIp);
    const overAll = await budgetOr("global", "rooms", 20, 86_400);
    if (overAll) return reply(overAll);

    const redis = getRedis();
    for (let i = 0; i < CODE_TRIES; i++) {
      const code = newCode();
      const written = await redis.set(offerKey(code), offer, { ex: ROOM_TTL_SEC, nx: true });
      if (written === "OK") {
        return new Response(JSON.stringify({ code, ttlSec: ROOM_TTL_SEC }), { status: 200, headers: NO_STORE });
      }
    }
    return reply(errorReply("failed", overlapCopy.relay.failed));
  } catch (error) {
    if (error instanceof StoreUnavailableError) {
      return reply(errorReply("relay-unavailable", overlapCopy.relay.unavailable));
    }
    return reply(errorReply("failed", overlapCopy.relay.failed));
  }
}

export async function GET(request: Request): Promise<Response> {
  const code = new URL(request.url).searchParams.get("code") ?? "";
  if (!isCode(code)) return reply(errorReply("bad-code", overlapCopy.relay.badCode));

  try {
    const ip = budgetKeyForIp(await headers());
    const overIp = await budgetOr("ip", ip, 20, 3600);
    if (overIp) return reply(overIp);
    const overCode = await budgetOr("target", code, 5, ROOM_TTL_SEC);
    if (overCode) return reply(overCode);

    const offer = await getRedis().get<string>(offerKey(code));
    if (!offer) return reply(errorReply("no-room", overlapCopy.relay.noRoom));
    return new Response(JSON.stringify({ offer }), { status: 200, headers: NO_STORE });
  } catch (error) {
    if (error instanceof StoreUnavailableError) {
      return reply(errorReply("relay-unavailable", overlapCopy.relay.unavailable));
    }
    return reply(errorReply("failed", overlapCopy.relay.failed));
  }
}
```

- [ ] **Step 5: Write the answer route and its tests**

```ts
// app/api/relay/answer/route.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StoreUnavailableError } from "@/lib/store/errors";

const { getRedisMock, takeBudgetMock } = vi.hoisted(() => ({
  getRedisMock: vi.fn(),
  takeBudgetMock: vi.fn(),
}));
vi.mock("@/lib/store/redis", () => ({ getRedis: getRedisMock }));
vi.mock("@/lib/budget", () => ({ takeBudget: takeBudgetMock, budgetKeyForIp: () => "ip-hash" }));

import { GET, POST } from "./route";

const SDP = "v=0\r\na=fingerprint:sha-256 CC:DD\r\n";

beforeEach(() => {
  getRedisMock.mockReset();
  takeBudgetMock.mockReset();
  takeBudgetMock.mockResolvedValue({ ok: true, remaining: 1 });
});

const post = (body: unknown) =>
  POST(new Request("https://x/api/relay/answer", { method: "POST", body: JSON.stringify(body) }));

describe("POST /api/relay/answer", () => {
  it("writes the answer under its own key, with the room's remaining life", async () => {
    const set = vi.fn().mockResolvedValue("OK");
    getRedisMock.mockReturnValue({ set, ttl: vi.fn().mockResolvedValue(420), get: vi.fn() });
    const res = await post({ code: "K4M9F2", answer: SDP });
    expect(res.status).toBe(200);
    expect(set).toHaveBeenCalledWith("relay:K4M9F2:a", SDP, { ex: 420, nx: true });
  });

  it("refuses a second joiner rather than replacing the first", async () => {
    getRedisMock.mockReturnValue({
      set: vi.fn().mockResolvedValue(null),
      ttl: vi.fn().mockResolvedValue(420),
      get: vi.fn(),
    });
    const res = await post({ code: "K4M9F2", answer: SDP });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("already-joined");
  });

  it("refuses an answer for a room that has gone", async () => {
    getRedisMock.mockReturnValue({ set: vi.fn(), ttl: vi.fn().mockResolvedValue(-2), get: vi.fn() });
    expect((await post({ code: "K4M9F2", answer: SDP })).status).toBe(404);
  });

  it("refuses a bad code and a bad answer", async () => {
    getRedisMock.mockReturnValue({ set: vi.fn(), ttl: vi.fn(), get: vi.fn() });
    expect((await post({ code: "nope", answer: SDP })).status).toBe(400);
    expect((await post({ code: "K4M9F2", answer: "hello" })).status).toBe(400);
  });

  it("says the room service is off", async () => {
    getRedisMock.mockImplementation(() => {
      throw new StoreUnavailableError("redis", "UPSTASH_REDIS_REST_URL");
    });
    const res = await post({ code: "K4M9F2", answer: SDP });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("relay-unavailable");
  });
});

describe("GET /api/relay/answer", () => {
  const poll = (code: string) => GET(new Request(`https://x/api/relay/answer?code=${code}`));

  it("hands back null while nobody has joined, which is not an error", async () => {
    getRedisMock.mockReturnValue({ get: vi.fn().mockResolvedValue(null), set: vi.fn(), ttl: vi.fn() });
    const res = await poll("K4M9F2");
    expect(res.status).toBe(200);
    expect((await res.json()).answer).toBeNull();
  });

  it("hands back the answer once there is one", async () => {
    getRedisMock.mockReturnValue({ get: vi.fn().mockResolvedValue(SDP), set: vi.fn(), ttl: vi.fn() });
    expect((await (await poll("K4M9F2")).json()).answer).toBe(SDP);
  });

  /**
   * The poll is budgeted against the code and not the address, because the
   * code is the tighter cap and it is what a runaway client spins on. Twenty
   * is the fifteen the page will use plus slack.
   */
  it("is budgeted per code only, at twenty in a room's lifetime", async () => {
    getRedisMock.mockReturnValue({ get: vi.fn().mockResolvedValue(null), set: vi.fn(), ttl: vi.fn() });
    await poll("K4M9F2");
    expect(takeBudgetMock).toHaveBeenCalledTimes(1);
    expect(takeBudgetMock.mock.calls[0][0]).toMatchObject({ scope: "target", key: "K4M9F2", limit: 20, windowSec: 600 });
  });
});
```

```ts
// app/api/relay/answer/route.ts
import { headers } from "next/headers";
import { overlapCopy } from "@/content/tools/overlap";
import { budgetKeyForIp, takeBudget } from "@/lib/budget";
import { isCode } from "@/lib/tools/overlap/code";
import { ROOM_TTL_SEC, answerKey, errorReply, validSdp, type RelayReply } from "@/lib/relay";
import { StoreUnavailableError } from "@/lib/store/errors";
import { getRedis } from "@/lib/store/redis";

/**
 * The other half of the introduction: the joiner posts an answer, the creator
 * polls for it.
 *
 * The answer is a separate key with `nx`, so the first answer wins and a
 * second joiner is told the room is taken rather than silently replacing
 * somebody. Its expiry is whatever is left on the offer, so an answer can
 * never outlive its room.
 *
 * The poll is budgeted against the code alone. The address budget is the wrong
 * shape here: the creator polls fifteen times for one room and would eat an
 * hourly address allowance in a minute, while a client that ignores the window
 * is exactly what a per-code cap stops.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store", "content-type": "application/json" };
const reply = ({ status, body }: RelayReply) => new Response(JSON.stringify(body), { status, headers: NO_STORE });

const unavailable = () => reply(errorReply("relay-unavailable", overlapCopy.relay.unavailable));
const failed = () => reply(errorReply("failed", overlapCopy.relay.failed));

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reply(errorReply("bad-request", overlapCopy.relay.badRequest));
  }
  const { code, answer } = (body ?? {}) as { code?: unknown; answer?: unknown };
  if (!isCode(code)) return reply(errorReply("bad-code", overlapCopy.relay.badCode));
  if (!validSdp(answer)) return reply(errorReply("bad-request", overlapCopy.relay.badRequest));

  try {
    const ip = await takeBudget({ tool: "overlap-relay", scope: "ip", key: budgetKeyForIp(await headers()), limit: 20, windowSec: 3600 });
    if (!ip.ok) return reply(errorReply("budget", overlapCopy.relay.budget, ip.retryAfterSec));
    const perCode = await takeBudget({ tool: "overlap-relay", scope: "target", key: code, limit: 3, windowSec: ROOM_TTL_SEC });
    if (!perCode.ok) return reply(errorReply("budget", overlapCopy.relay.budget, perCode.retryAfterSec));

    const redis = getRedis();
    const left = await redis.ttl(`relay:${code}`);
    if (typeof left !== "number" || left <= 0) return reply(errorReply("no-room", overlapCopy.relay.noRoom));

    const written = await redis.set(answerKey(code), answer, { ex: left, nx: true });
    if (written !== "OK") return reply(errorReply("already-joined", overlapCopy.relay.alreadyJoined));
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: NO_STORE });
  } catch (error) {
    return error instanceof StoreUnavailableError ? unavailable() : failed();
  }
}

export async function GET(request: Request): Promise<Response> {
  const code = new URL(request.url).searchParams.get("code") ?? "";
  if (!isCode(code)) return reply(errorReply("bad-code", overlapCopy.relay.badCode));

  try {
    const perCode = await takeBudget({ tool: "overlap-relay", scope: "target", key: code, limit: 20, windowSec: ROOM_TTL_SEC });
    if (!perCode.ok) return reply(errorReply("budget", overlapCopy.relay.budget, perCode.retryAfterSec));

    const answer = (await getRedis().get<string>(answerKey(code))) ?? null;
    return new Response(JSON.stringify({ answer }), { status: 200, headers: NO_STORE });
  } catch (error) {
    return error instanceof StoreUnavailableError ? unavailable() : failed();
  }
}
```

- [ ] **Step 6: Run everything for this task**

```bash
cd "$WT"
npx tsc --noEmit && npx vitest run lib/relay.test.ts app/api/relay 2>&1 | tail -8
```

Expected: PASS.

What this proves: the two routes take the budgets in the right order and with the right scopes, refuse a bad code before touching Redis, never clobber a live room or a first answer, and answer a missing store with 503 and the copy-and-paste sentence while a genuine fault stays a 500. What it cannot see: a real Upstash database, which F4's own integration test covers and which is not provisioned in production. Until it is, the only path anybody can exercise live is the 503 one, and that is what Task 15 checks first.

- [ ] **Step 7: Commit**

```bash
cd "$WT"
git add lib/relay.ts lib/relay.test.ts app/api/relay
git commit -m "feat(relay): rooms that hold two blobs for ten minutes, and say so when redis is absent"
```

---

### Task 9: The demo, so the page is never an empty form

**Files:**
- Create: `lib/tools/overlap/demo.ts`
- Test: `lib/tools/overlap/demo.test.ts`

**Interfaces:**
- Consumes: `Entry` (Task 2), `pairedChannels`, `runExchange`, `ExchangeResult` (Task 7)
- Produces: `DEMO_SEED`, `demoLists()`, `demoCsv(list, name)`, `runDemo(options?)`, `DEMO_SHARED = 37`

The demo runs the **real** exchange, through `pairedChannels`, in one tab. It is not a canned result: both lists are hashed with a real salt, both go through the framing, and the intersection comes out of the same code path two browsers use. So a broken protocol shows on the page immediately, and the demo is a second exercise of the thing rather than a picture of it.

It also writes the two lists out as CSVs in the export's shape, preamble included, so anybody can save them and run the genuine two-tab flow with files that belong to nobody. Task 14 uses exactly that.

**One name is deliberately spelled differently in the two files.** `Síne Ní Dhomhnaill` in one and `Sine Ni Dhomhnaill` in the other, on the same slug. That is what makes "names come from your own file" visible rather than asserted: the two tabs print the same person differently.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/tools/overlap/demo.test.ts
import { describe, expect, it } from "vitest";
import { entriesFrom, readConnections } from "./csv";
import { DEMO_SEED, DEMO_SHARED, demoCsv, demoLists, runDemo } from "./demo";

describe("the two lists", () => {
  it("is the same two lists every time", () => {
    expect(JSON.stringify(demoLists())).toBe(JSON.stringify(demoLists()));
    expect(DEMO_SEED).toBe(20260903);
  });

  it("is two lists of a plausible size with a stated overlap", () => {
    const { a, b } = demoLists();
    expect(a.length).toBeGreaterThan(300);
    expect(b.length).toBeGreaterThan(300);
    const shared = new Set(a.map((e) => e.slug)).size + new Set(b.map((e) => e.slug)).size
      - new Set([...a, ...b].map((e) => e.slug)).size;
    expect(shared).toBe(DEMO_SHARED);
    expect(DEMO_SHARED).toBe(37);
  });

  it("spells one shared person differently in each file, on purpose", () => {
    const { a, b } = demoLists();
    const slug = "sine-ni-dhomhnaill-4f2a";
    expect(a.find((e) => e.slug === slug)?.label).toBe("Síne Ní Dhomhnaill");
    expect(b.find((e) => e.slug === slug)?.label).toBe("Sine Ni Dhomhnaill");
  });

  it("has no duplicate slugs inside either list", () => {
    const { a, b } = demoLists();
    for (const list of [a, b]) expect(new Set(list.map((e) => e.slug)).size).toBe(list.length);
  });
});

describe("the files it can be saved as", () => {
  it("round trips through the reader this tool ships", () => {
    const { a } = demoLists();
    const file = readConnections(demoCsv(a, "Aoife"));
    expect(file.urlColumn).toBe(2);
    const { entries, counts } = entriesFrom(file, file.urlColumn, file.nameColumns);
    expect(counts.used).toBe(a.length);
    expect(entries.map((e) => e.slug)).toEqual(a.map((e) => e.slug));
    expect(entries[0].label).toBe(a[0].label);
  });

  it("carries the preamble a real export has, so the reader is exercised", () => {
    const text = demoCsv(demoLists().a, "Aoife");
    expect(text.split("\r\n")[0]).toBe("Notes:");
    expect(text.split("\r\n")[3]).toContain("First Name,Last Name,URL");
  });

  it("carries a row with no profile link, because a real export does", () => {
    const text = demoCsv(demoLists().a, "Aoife");
    const file = readConnections(text);
    expect(entriesFrom(file, file.urlColumn, file.nameColumns).counts.empty).toBeGreaterThan(0);
  });
});

describe("runDemo", () => {
  it("runs the real exchange and finds the stated overlap", async () => {
    const { a, b } = await runDemo();
    expect(a.shared).toHaveLength(DEMO_SHARED);
    expect(b.shared).toHaveLength(DEMO_SHARED);
    expect(a.mode).toBe("exact");
    expect(a.safety).toBe(b.safety);
  });

  it("gives each side the spelling from its own file", async () => {
    const { a, b } = await runDemo();
    expect(a.shared.some((e) => e.label === "Síne Ní Dhomhnaill")).toBe(true);
    expect(b.shared.some((e) => e.label === "Sine Ni Dhomhnaill")).toBe(true);
    expect(a.shared.some((e) => e.label === "Sine Ni Dhomhnaill")).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to watch them fail**

Run: `cd "$WT" && npx vitest run lib/tools/overlap/demo.test.ts`
Expected: FAIL with `Cannot find module './demo'`.

- [ ] **Step 3: Write the demo**

```ts
// lib/tools/overlap/demo.ts
import { pairedChannels, runExchange, type ExchangeResult } from "./protocol";
import type { Entry } from "./types";

/**
 * Two invented lists, so the page is never an empty form.
 *
 * The demo runs the **real** exchange through `pairedChannels` in one tab:
 * a real salt, real hashing, real framing, real intersection. It is not a
 * canned result, so a broken protocol shows here before anybody opens a second
 * browser, and the demo doubles as an exercise of the thing it demonstrates.
 *
 * One shared person is spelled differently in the two lists, on purpose. That
 * is what turns "names come from your own file" from a claim into something a
 * visitor can see: the two sides print the same person two ways.
 *
 * `mulberry` is lifted from Tigh Sauna's `apps/site/src/lib/survey/terrain.ts`,
 * the same seeded generator T2 uses, so the lists never move between reloads.
 */

export const DEMO_SEED = 20260903;
export const DEMO_SHARED = 37;

/** Deterministic PRNG. Lifted from Tigh Sauna's terrain.ts. */
function mulberry(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = [
  "Aoife", "Cormac", "Deirdre", "Eoin", "Fiadh", "Grainne", "Hugh", "Iseult", "Jarlath", "Katie",
  "Liam", "Maire", "Niall", "Orla", "Padraig", "Roisin", "Sean", "Tadhg", "Una", "Cathal",
];
const LAST = [
  "Brennan", "Callaghan", "Doyle", "Egan", "Fitzgerald", "Gallagher", "Hayes", "Kavanagh",
  "Lynch", "Mulcahy", "Nolan", "Quinn", "Ryan", "Sheridan", "Treacy", "Walsh",
];

const slugify = (first: string, last: string, tag: string) =>
  `${first}-${last}-${tag}`.toLowerCase();

function build(rnd: () => number, count: number, offset: number): Entry[] {
  const out: Entry[] = [];
  const seen = new Set<string>();
  while (out.length < count) {
    const first = FIRST[Math.floor(rnd() * FIRST.length)];
    const last = LAST[Math.floor(rnd() * LAST.length)];
    const tag = (offset + out.length).toString(36).padStart(4, "0");
    const slug = slugify(first, last, tag);
    if (seen.has(slug)) continue;
    seen.add(slug);
    out.push({ slug, label: `${first} ${last}` });
  }
  return out;
}

/**
 * List A is 480 people, list B is 520, and 37 of them are the same. The shared
 * block is generated once and spliced into both, so the count is a fact rather
 * than an emergent property nobody checks.
 */
export function demoLists(): { a: Entry[]; b: Entry[] } {
  const rnd = mulberry(DEMO_SEED);
  const shared = build(rnd, DEMO_SHARED, 900_000);
  const onlyA = build(rnd, 480 - DEMO_SHARED, 100_000);
  const onlyB = build(rnd, 520 - DEMO_SHARED, 500_000);

  // The one person the two files disagree about how to spell.
  shared[0] = { slug: "sine-ni-dhomhnaill-4f2a", label: "Síne Ní Dhomhnaill" };
  const sharedForB = shared.map((e, i) =>
    i === 0 ? { slug: e.slug, label: "Sine Ni Dhomhnaill" } : e,
  );

  return { a: [...onlyA, ...shared], b: [...onlyB, ...sharedForB] };
}

/**
 * The list as a file in the export's shape: three lines of preamble, the real
 * header, and one row that has no profile link, because a real export has some
 * of those and a demo file that does not would hide the counter that reports
 * them.
 */
export function demoCsv(list: readonly Entry[], owner: string): string {
  const rows = list.map((e) => {
    const [first, ...rest] = e.label.split(" ");
    return [first, rest.join(" "), `https://www.linkedin.com/in/${e.slug}`, "", "", "", "01 Mar 2024"]
      .map((cell) => (cell.includes(",") ? `"${cell}"` : cell))
      .join(",");
  });
  return [
    "Notes:",
    `"Demo connections for ${owner}. Every person in this file is invented."`,
    "",
    "First Name,Last Name,URL,Email Address,Company,Position,Connected On",
    ...rows,
    "Restricted,Member,,,,,02 Feb 2022",
  ].join("\r\n");
}

const DEMO_FINGERPRINTS = {
  offer: "DE:M0:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:01",
  answer: "DE:M0:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:02",
};

export async function runDemo(): Promise<{ a: ExchangeResult; b: ExchangeResult }> {
  const { a, b } = demoLists();
  const [left, right] = pairedChannels();
  const [ra, rb] = await Promise.all([
    runExchange({ side: "creator", entries: a, channel: left, fingerprints: DEMO_FINGERPRINTS }),
    runExchange({ side: "joiner", entries: b, channel: right, fingerprints: DEMO_FINGERPRINTS }),
  ]);
  return { a: ra, b: rb };
}
```

- [ ] **Step 4: Run them to watch them pass**

Run: `cd "$WT" && npx tsc --noEmit && npx vitest run lib/tools/overlap/demo.test.ts`
Expected: PASS. If the shared count is not 37, the splice is wrong or a generated slug collided with a shared one; fix the generator, never the assertion.

What this proves: the lists are stable, the overlap is exactly the number the page prints, the CSVs round trip through this tool's own reader including the preamble and the empty row, and the real exchange finds the overlap with each side keeping its own spelling. What it cannot see: whether 480 and 520 are realistic list sizes, which is a guess about other people's networks and is labelled as invented on the page.

- [ ] **Step 5: Commit**

```bash
cd "$WT"
git add lib/tools/overlap/demo.ts lib/tools/overlap/demo.test.ts
git commit -m "feat(overlap): a demo that runs the real exchange rather than showing a picture of one"
```

---

### Task 10: The transport and the relay client, with fetch as a tripwire

**Files:**
- Create: `lib/tools/overlap/relay-client.ts`
- Test: `lib/tools/overlap/relay-client.test.ts`
- Create: `lib/tools/overlap/webrtc.ts`
- Test: `lib/tools/overlap/webrtc.test.ts`

**Interfaces:**
- Consumes: `Channel` (Task 7), `normaliseTypedCode` (Task 6), `overlapCopy` (Task 1)
- Produces: `POLL_INTERVAL_MS = 4000`, `POLL_WINDOW_MS = 60000`, `type RelayFetch`, `createRoom(fetchImpl)`, `fetchOffer(code, fetchImpl)`, `sendAnswer(code, answer, fetchImpl)`, `pollForAnswer(code, fetchImpl, options)`, `type RelayOutcome`; and in `webrtc.ts`: `ICE_SERVERS`, `openAsCreator(options)`, `openAsJoiner(options)`, `channelFrom(dataChannel)`, `packSdp(sdp)`, `unpackSdp(text)`

`relay-client.ts` is the only file in the whole tool that calls `fetch`, and `webrtc.ts` is the only one that touches `RTCPeerConnection`. Both facts are held by greps in Task 11, and both exist so that "nothing but hashes leaves the tab" is checkable by reading two short files rather than the whole tool.

**The tripwire test, and what it cannot see.** The relay client's tests replace `fetch` with a recorder that captures every URL, method, header and body. A separate test runs a whole exchange with that recorder installed and asserts that no slug, no label and no hash from either side appears anywhere in the traffic. What that cannot see is the SDP: a real `RTCPeerConnection` puts ICE candidates in it, and ICE candidates carry addresses. So the test proves the tool does not send a list to the relay; it does not and cannot prove the relay learns nothing about you. The page says what the relay does learn, and Task 14 reads a real offer with its own eyes.

- [ ] **Step 1: Write the failing relay-client tests**

```ts
// lib/tools/overlap/relay-client.test.ts
import { describe, expect, it, vi } from "vitest";
import { POLL_INTERVAL_MS, POLL_WINDOW_MS, createRoom, fetchOffer, pollForAnswer, sendAnswer } from "./relay-client";

const SDP = "v=0\r\no=- 1 2 IN IP4 0.0.0.0\r\na=fingerprint:sha-256 AA:BB\r\n";

/** A fetch that records everything and answers from a queue. */
function recorder(replies: Array<{ status: number; body: unknown }>) {
  const calls: Array<{ url: string; method: string; body: string }> = [];
  let at = 0;
  const impl = async (input: string, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method ?? "GET", body: String(init?.body ?? "") });
    const reply = replies[Math.min(at++, replies.length - 1)];
    return new Response(JSON.stringify(reply.body), {
      status: reply.status,
      headers: { "content-type": "application/json" },
    });
  };
  return { impl, calls };
}

describe("createRoom", () => {
  it("posts the offer and gives back the code", async () => {
    const { impl, calls } = recorder([{ status: 200, body: { code: "K4M9F2", ttlSec: 600 } }]);
    await expect(createRoom(SDP, impl)).resolves.toEqual({ ok: true, code: "K4M9F2", ttlSec: 600 });
    expect(calls[0].url).toBe("/api/relay");
    expect(calls[0].method).toBe("POST");
    expect(JSON.parse(calls[0].body)).toEqual({ offer: SDP });
  });

  it("turns a 503 into the outcome the page switches on", async () => {
    const { impl } = recorder([{ status: 503, body: { error: "relay-unavailable", message: "off" } }]);
    await expect(createRoom(SDP, impl)).resolves.toEqual({ ok: false, error: "relay-unavailable", message: "off" });
  });

  it("turns a 429 into a budget outcome with its wait", async () => {
    const { impl } = recorder([{ status: 429, body: { error: "budget", message: "later", retryAfterSec: 900 } }]);
    await expect(createRoom(SDP, impl)).resolves.toMatchObject({ ok: false, error: "budget", retryAfterSec: 900 });
  });

  it("turns a network failure into an outcome rather than a throw", async () => {
    const impl = vi.fn().mockRejectedValue(new TypeError("offline"));
    await expect(createRoom(SDP, impl)).resolves.toMatchObject({ ok: false, error: "failed" });
  });

  it("turns a reply that is not JSON into an outcome", async () => {
    const impl = async () => new Response("<html>", { status: 200 });
    await expect(createRoom(SDP, impl)).resolves.toMatchObject({ ok: false, error: "failed" });
  });
});

describe("fetchOffer and sendAnswer", () => {
  it("asks for the offer by code in the query", async () => {
    const { impl, calls } = recorder([{ status: 200, body: { offer: SDP } }]);
    await expect(fetchOffer("K4M9F2", impl)).resolves.toEqual({ ok: true, offer: SDP });
    expect(calls[0].url).toBe("/api/relay?code=K4M9F2");
    expect(calls[0].method).toBe("GET");
  });

  it("reports a room that has gone", async () => {
    const { impl } = recorder([{ status: 404, body: { error: "no-room", message: "gone" } }]);
    await expect(fetchOffer("K4M9F2", impl)).resolves.toMatchObject({ ok: false, error: "no-room" });
  });

  it("posts the answer with the code beside it", async () => {
    const { impl, calls } = recorder([{ status: 200, body: { ok: true } }]);
    await expect(sendAnswer("K4M9F2", SDP, impl)).resolves.toEqual({ ok: true });
    expect(JSON.parse(calls[0].body)).toEqual({ code: "K4M9F2", answer: SDP });
  });

  it("reports a room somebody else already joined", async () => {
    const { impl } = recorder([{ status: 409, body: { error: "already-joined", message: "taken" } }]);
    await expect(sendAnswer("K4M9F2", SDP, impl)).resolves.toMatchObject({ ok: false, error: "already-joined" });
  });
});

describe("pollForAnswer", () => {
  it("polls on the interval and stops the moment an answer lands", async () => {
    const { impl, calls } = recorder([
      { status: 200, body: { answer: null } },
      { status: 200, body: { answer: null } },
      { status: 200, body: { answer: SDP } },
    ]);
    const waits: number[] = [];
    const result = await pollForAnswer("K4M9F2", impl, { wait: async (ms) => { waits.push(ms); } });
    expect(result).toEqual({ ok: true, answer: SDP });
    expect(calls).toHaveLength(3);
    expect(waits).toEqual([POLL_INTERVAL_MS, POLL_INTERVAL_MS]);
  });

  it("gives up after the window rather than polling for ever", async () => {
    const { impl, calls } = recorder([{ status: 200, body: { answer: null } }]);
    let clock = 0;
    const result = await pollForAnswer("K4M9F2", impl, {
      wait: async () => { clock += POLL_INTERVAL_MS; },
      now: () => clock,
    });
    expect(result).toMatchObject({ ok: false, error: "gave-up" });
    expect(calls.length).toBeLessThanOrEqual(POLL_WINDOW_MS / POLL_INTERVAL_MS + 1);
  });

  it("stops on a refusal instead of hammering it", async () => {
    const { impl, calls } = recorder([{ status: 429, body: { error: "budget", message: "later" } }]);
    await expect(pollForAnswer("K4M9F2", impl, { wait: async () => {} })).resolves.toMatchObject({ error: "budget" });
    expect(calls).toHaveLength(1);
  });

  it("keeps the arithmetic the plan budgeted for", () => {
    expect(POLL_INTERVAL_MS).toBe(4000);
    expect(POLL_WINDOW_MS).toBe(60_000);
    expect(POLL_WINDOW_MS / POLL_INTERVAL_MS).toBe(15);
  });
});

describe("the tripwire", () => {
  /**
   * The promise, checked on the wire the tool actually writes to.
   *
   * Every request the relay client makes is captured and searched for the
   * things that must never be in it. What this cannot see: the SDP itself. A
   * real `RTCPeerConnection` puts ICE candidates in there and those carry
   * addresses, so this proves the tool does not send a list to the relay, and
   * it does not prove the relay learns nothing. The page says what it does
   * learn.
   */
  it("never sends a slug, a name or a hash to the relay", async () => {
    const { impl, calls } = recorder([
      { status: 200, body: { code: "K4M9F2", ttlSec: 600 } },
      { status: 200, body: { answer: SDP } },
    ]);
    await createRoom(SDP, impl);
    await pollForAnswer("K4M9F2", impl, { wait: async () => {} });

    const traffic = JSON.stringify(calls);
    for (const secret of ["sine-ni-dhomhnaill", "Síne", "Dhomhnaill", "e3b0c44298fc1c14"]) {
      expect(traffic, `"${secret}" reached the relay`).not.toContain(secret);
    }
    for (const call of calls) {
      const keys = call.body === "" ? [] : Object.keys(JSON.parse(call.body));
      expect(keys.every((k) => ["offer", "answer", "code"].includes(k)), `keys ${keys}`).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Write the relay client**

```ts
// lib/tools/overlap/relay-client.ts

/**
 * The only file in this tool that calls `fetch`.
 *
 * That is a design constraint rather than an accident: `safety.test.ts` greps
 * the whole tool for `fetch(` and fails if it appears anywhere else, so
 * "nothing but hashes leaves the tab" can be checked by reading one short
 * file. The `fetchImpl` argument is what lets a test replace it with a
 * recorder and search the traffic.
 *
 * The polling arithmetic is a cost decision, not a feel decision. A poll is
 * three Redis commands, and at four seconds across a sixty-second window a
 * completed handshake costs about sixty commands. That is what keeps the
 * relay inside the free tier at twenty rooms a day.
 */

export const POLL_INTERVAL_MS = 4_000;
export const POLL_WINDOW_MS = 60_000;

export type RelayFetch = (input: string, init?: RequestInit) => Promise<Response>;

export type RelayFailure = {
  ok: false;
  error: "relay-unavailable" | "budget" | "no-room" | "already-joined" | "bad-code" | "gave-up" | "failed";
  message: string;
  retryAfterSec?: number;
};

const JSON_POST = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

async function call(fetchImpl: RelayFetch, url: string, init?: RequestInit): Promise<
  { ok: true; body: Record<string, unknown> } | RelayFailure
> {
  let response: Response;
  try {
    response = await fetchImpl(url, init);
  } catch {
    return { ok: false, error: "failed", message: "" };
  }
  let body: Record<string, unknown>;
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, error: "failed", message: "" };
  }
  if (response.ok) return { ok: true, body };
  const error = typeof body.error === "string" ? body.error : "failed";
  return {
    ok: false,
    error: (["relay-unavailable", "budget", "no-room", "already-joined", "bad-code"] as const).includes(
      error as never,
    )
      ? (error as RelayFailure["error"])
      : "failed",
    message: typeof body.message === "string" ? body.message : "",
    ...(typeof body.retryAfterSec === "number" ? { retryAfterSec: body.retryAfterSec } : {}),
  };
}

export async function createRoom(
  offer: string,
  fetchImpl: RelayFetch,
): Promise<{ ok: true; code: string; ttlSec: number } | RelayFailure> {
  const result = await call(fetchImpl, "/api/relay", JSON_POST({ offer }));
  if (!result.ok) return result;
  return { ok: true, code: String(result.body.code), ttlSec: Number(result.body.ttlSec) };
}

export async function fetchOffer(
  code: string,
  fetchImpl: RelayFetch,
): Promise<{ ok: true; offer: string } | RelayFailure> {
  const result = await call(fetchImpl, `/api/relay?code=${code}`);
  if (!result.ok) return result;
  return { ok: true, offer: String(result.body.offer) };
}

export async function sendAnswer(
  code: string,
  answer: string,
  fetchImpl: RelayFetch,
): Promise<{ ok: true } | RelayFailure> {
  const result = await call(fetchImpl, "/api/relay/answer", JSON_POST({ code, answer }));
  return result.ok ? { ok: true } : result;
}

export type PollOptions = {
  wait?: (ms: number) => Promise<void>;
  now?: () => number;
  onTick?: (secondsLeft: number) => void;
};

export async function pollForAnswer(
  code: string,
  fetchImpl: RelayFetch,
  options: PollOptions = {},
): Promise<{ ok: true; answer: string } | RelayFailure> {
  const wait = options.wait ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = options.now ?? (() => Date.now());
  const started = now();

  for (;;) {
    const result = await call(fetchImpl, `/api/relay/answer?code=${code}`);
    if (!result.ok) return result;
    if (typeof result.body.answer === "string") return { ok: true, answer: result.body.answer };
    if (now() - started >= POLL_WINDOW_MS) return { ok: false, error: "gave-up", message: "" };
    options.onTick?.(Math.max(0, Math.round((POLL_WINDOW_MS - (now() - started)) / 1000)));
    await wait(POLL_INTERVAL_MS);
  }
}
```

- [ ] **Step 3: Write the transport and its coupling test**

```ts
// lib/tools/overlap/webrtc.test.ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ICE_SERVERS, packSdp, unpackSdp } from "./webrtc";

/**
 * A source-coupling check, not a render and not a connection.
 *
 * vitest runs in a `node` environment here and there is no
 * `RTCPeerConnection` in it, so nothing in this file opens anything. What it
 * does is hold the two properties that make the rest of the tool auditable:
 * this is the only module that names `RTCPeerConnection`, and it waits for ICE
 * gathering before serialising an SDP. The handshake itself is proved by the
 * two-browser check in the plan's Task 14 and by the live run in Task 15, and
 * by nothing in this suite.
 */
const source = readFileSync(join(process.cwd(), "lib", "tools", "overlap", "webrtc.ts"), "utf8");

describe("webrtc.ts", () => {
  it("names one public address server and says whose it is", () => {
    expect(ICE_SERVERS).toEqual([{ urls: ["stun:stun.cloudflare.com:3478"] }]);
    expect(source).toContain("Cloudflare");
  });

  it("waits for gathering to finish before handing over an SDP", () => {
    expect(source).toMatch(/icegatheringstatechange/);
    expect(source).toMatch(/ICE_TIMEOUT_MS/);
  });

  it("creates an ordered reliable data channel, which is what the protocol assumes", () => {
    expect(source).toMatch(/createDataChannel\("overlap", \{ ordered: true \}\)/);
  });

  it("touches no storage", () => {
    expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/);
  });
});

describe("packSdp and unpackSdp", () => {
  it("round trips a session description through the copy and paste blob", async () => {
    const sdp = `v=0\r\n${"a=candidate:1 1 udp 2 10.0.0.1 1 typ host\r\n".repeat(20)}`;
    expect(await unpackSdp(await packSdp(sdp))).toBe(sdp);
  });

  it("makes a blob a person can paste into a message", async () => {
    const sdp = `v=0\r\n${"a=candidate:1 1 udp 2 10.0.0.1 1 typ host\r\n".repeat(20)}`;
    const packed = await packSdp(sdp);
    expect(packed).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(packed.length).toBeLessThan(sdp.length);
  });

  it("refuses a blob that is not one rather than handing back rubbish", async () => {
    await expect(unpackSdp("not a blob at all")).rejects.toThrow();
  });
});
```

```ts
// lib/tools/overlap/webrtc.ts
import type { Channel } from "./protocol";

/**
 * The only module in this tool that touches `RTCPeerConnection`.
 *
 * Everything above it works against the three-method `Channel`, which is why
 * the protocol is testable in node and this file is not. There is no
 * `RTCPeerConnection` in vitest's node environment and this plan does not shim
 * one: `webrtc.test.ts` is a source-coupling check, and the handshake is
 * proved on two real browsers instead.
 *
 * **Non-trickle, on purpose.** The relay holds two blobs, so the whole
 * candidate list has to be inside the offer before it is handed over. That
 * means waiting for `icegatheringstate` to reach `complete`, with a timeout,
 * because some networks never report it and a page that waits for ever is
 * worse than one that connects with the candidates it has.
 *
 * **One public address server, named on the page.** Two browsers on different
 * networks cannot find each other from host candidates alone, so the browser
 * asks Cloudflare's public STUN server what its address looks like from
 * outside. One small packet, no part of anybody's file. The page names
 * Cloudflare and offers a same-network-only switch that empties this list, for
 * two people on the same wifi who would rather nothing left the building. There
 * is no TURN server, so a symmetric NAT will fail to connect, and the honest
 * answer to that is the copy and paste route, which always works.
 */

export const ICE_SERVERS: RTCIceServer[] = [{ urls: ["stun:stun.cloudflare.com:3478"] }];

/** Some networks never report gathering as complete. Go with what we have. */
const ICE_TIMEOUT_MS = 4_000;

function gathered(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      pc.removeEventListener("icegatheringstatechange", check);
      clearTimeout(timer);
      resolve();
    };
    const check = () => {
      if (pc.iceGatheringState === "complete") done();
    };
    const timer = setTimeout(done, ICE_TIMEOUT_MS);
    pc.addEventListener("icegatheringstatechange", check);
  });
}

export function channelFrom(dataChannel: RTCDataChannel): Channel {
  return {
    send: (text) => dataChannel.send(text),
    onMessage: (handler) => {
      dataChannel.addEventListener("message", (event) => handler(String(event.data)));
    },
    close: () => dataChannel.close(),
  };
}

export type Opened = { channel: Channel; localSdp: string; remoteSdp: string; connection: RTCPeerConnection };

export async function openAsCreator(options: { sameNetworkOnly?: boolean } = {}): Promise<{
  offer: string;
  finish: (answerSdp: string) => Promise<Opened>;
}> {
  const pc = new RTCPeerConnection({ iceServers: options.sameNetworkOnly ? [] : ICE_SERVERS });
  const dataChannel = pc.createDataChannel("overlap", { ordered: true });
  const open = new Promise<void>((resolve) => dataChannel.addEventListener("open", () => resolve()));

  await pc.setLocalDescription(await pc.createOffer());
  await gathered(pc);
  const offer = pc.localDescription?.sdp ?? "";

  return {
    offer,
    finish: async (answerSdp: string) => {
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
      await open;
      return { channel: channelFrom(dataChannel), localSdp: offer, remoteSdp: answerSdp, connection: pc };
    },
  };
}

export async function openAsJoiner(
  offerSdp: string,
  options: { sameNetworkOnly?: boolean } = {},
): Promise<{ answer: string; opened: Promise<Opened> }> {
  const pc = new RTCPeerConnection({ iceServers: options.sameNetworkOnly ? [] : ICE_SERVERS });
  const channel = new Promise<RTCDataChannel>((resolve) => {
    pc.addEventListener("datachannel", (event) => {
      const dc = event.channel;
      if (dc.readyState === "open") resolve(dc);
      else dc.addEventListener("open", () => resolve(dc));
    });
  });

  await pc.setRemoteDescription({ type: "offer", sdp: offerSdp });
  await pc.setLocalDescription(await pc.createAnswer());
  await gathered(pc);
  const answer = pc.localDescription?.sdp ?? "";

  return {
    answer,
    opened: channel.then((dc) => ({
      channel: channelFrom(dc),
      localSdp: answer,
      remoteSdp: offerSdp,
      connection: pc,
    })),
  };
}

/**
 * An SDP squeezed into something a person can paste into a message.
 *
 * `CompressionStream` is platform. Where it is missing the blob is base64 and
 * longer, which is a worse paste and not a broken one, so the fallback is
 * silent rather than a refusal.
 */
export async function packSdp(sdp: string): Promise<string> {
  const bytes = new TextEncoder().encode(sdp);
  if (typeof CompressionStream === "undefined") return base64url(bytes);
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"));
  return `z${base64url(new Uint8Array(await new Response(stream).arrayBuffer()))}`;
}

export async function unpackSdp(text: string): Promise<string> {
  const compressed = text.startsWith("z");
  const bytes = fromBase64url(compressed ? text.slice(1) : text);
  if (!compressed) return new TextDecoder().decode(bytes);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new TextDecoder().decode(await new Response(stream).arrayBuffer());
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(text: string): Uint8Array {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
```

- [ ] **Step 4: Run them**

```bash
cd "$WT"
npx tsc --noEmit && npx vitest run lib/tools/overlap/relay-client.test.ts lib/tools/overlap/webrtc.test.ts 2>&1 | tail -8
```

Expected: PASS. If `packSdp` fails on `CompressionStream`, Task 0 Step 4 already recorded whether it exists in this Node; the fallback path is the answer and the test should be split so the compressed case skips when it is absent.

What this proves: every relay call has the shape and the URL the routes expect, every refusal becomes an outcome rather than a throw, the poll stops on an answer, on a refusal and at the window, no request body carries anything but `offer`, `answer` or `code`, and an SDP survives the copy and paste encoding. What it cannot see: any of the WebRTC. Nothing here opens a connection, and the words for the handshake stay "untested" until Task 14.

- [ ] **Step 5: Commit**

```bash
cd "$WT"
git add lib/tools/overlap/relay-client.ts lib/tools/overlap/relay-client.test.ts lib/tools/overlap/webrtc.ts lib/tools/overlap/webrtc.test.ts
git commit -m "feat(overlap): the relay client and the transport, each alone in its own file"
```

---

### Task 11: The page, the island, and the greps that hold the promise

**Files:**
- Create: `app/tools/overlap/page.tsx`
- Test: `app/tools/overlap/page.test.ts`
- Create: `app/tools/overlap/OverlapTool.tsx`
- Test: `app/tools/overlap/OverlapTool.test.ts`
- Create: `app/tools/overlap/tool.css`
- Create: `lib/tools/overlap/safety.test.ts`
- Modify: `content/tools/overlap.ts` (`status` back to `"live"`)

**Interfaces:**
- Consumes: everything above; `ToolPage`, `toolPath`, `toolPageSchema` (F3), `trackToolRun` (F3 `lib/tools/events.ts`)
- Produces: `/tools/overlap`

- [ ] **Step 1: Write the safety greps first, because they are the promise**

```ts
// lib/tools/overlap/safety.test.ts
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * The three properties that make this tool auditable by reading, and a grep
 * for each. Coupling checks, not renders: vitest is in a node environment
 * here.
 *
 * They exist because the tool's promise is about what it does **not** do, and
 * absence is exactly the thing a behavioural test cannot show. A unit test can
 * prove the exchange sends hashes; only a grep can prove nothing else in the
 * tool quietly opened a second door.
 */

const dirs = [join(process.cwd(), "lib", "tools", "overlap"), join(process.cwd(), "app", "tools", "overlap")];

const files = dirs.flatMap((dir) =>
  readdirSync(dir)
    .filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"))
    .map((f) => ({ path: join(dir, f), name: f, text: readFileSync(join(dir, f), "utf8") })),
);

describe("the tool writes nothing to the visitor's machine", () => {
  it.each(files.map((f) => [f.name, f.text] as const))("%s touches no storage API", (_name, text) => {
    for (const api of ["localStorage", "sessionStorage", "indexedDB", "document.cookie", "caches."]) {
      expect(text).not.toContain(api);
    }
  });
});

describe("one door out", () => {
  it("calls fetch in relay-client.ts and nowhere else", () => {
    const callers = files.filter((f) => /\bfetch\s*\(/.test(f.text)).map((f) => f.name);
    expect(callers).toEqual(["relay-client.ts"]);
  });

  it("names RTCPeerConnection in webrtc.ts and nowhere else", () => {
    const users = files.filter((f) => f.text.includes("RTCPeerConnection")).map((f) => f.name);
    expect(users).toEqual(["webrtc.ts"]);
  });

  it("holds no URL to anywhere but this site's own relay and LinkedIn's download page", () => {
    const urls = files.flatMap((f) => [...f.text.matchAll(/https?:\/\/[^\s"'`)]+/g)].map((m) => m[0]));
    for (const url of urls) {
      expect(url.startsWith("https://www.linkedin.com/"), `unexpected URL ${url}`).toBe(true);
    }
  });
});

describe("the page says the thing the code does", () => {
  it("tells the visitor forget has nothing to wipe", async () => {
    const { overlapCopy } = await import("@/content/tools/overlap");
    expect(overlapCopy.honesty.storage).toContain("forget");
  });
});
```

The URL grep will fail while `webrtc.ts` holds `stun:stun.cloudflare.com:3478`, which is not an `https:` URL and so is not matched by the pattern, and while `content/tools/overlap.ts` is outside both directories. Both are correct: the STUN host is named in a constant that its own test pins, and the copy lives in `content/`. If the grep does catch something, it is a real finding.

- [ ] **Step 2: Write the page**

```tsx
// app/tools/overlap/page.tsx
import type { Metadata } from "next";
import ToolPage from "@/components/tools/ToolPage";
import { overlap } from "@/content/tools/overlap";
import { canonical, toolPageSchema, toolPath, OG_IMAGE } from "@/lib/seo";
import { profile } from "@/content/profile";
import OverlapTool from "./OverlapTool";
import "./tool.css";

const PATH = toolPath(overlap.slug);

export const metadata: Metadata = {
  title: overlap.name,
  description: overlap.blurb,
  alternates: canonical(PATH),
  openGraph: {
    title: `${overlap.name} · ${profile.shortName}`,
    description: overlap.blurb,
    type: "website",
    url: PATH,
    images: [OG_IMAGE],
  },
  twitter: { card: "summary_large_image", images: [OG_IMAGE] },
};

/**
 * `/tools/overlap`.
 *
 * Server component. Everything a crawler needs is in the HTML before any
 * script runs: the name, the blurb, the privacy line, the honesty paragraphs
 * and the "can't see" list, which `ToolPage` renders. The island below is the
 * interactive half and it is the only part that needs JavaScript.
 */
export default function OverlapPage() {
  return (
    <ToolPage
      tool={overlap}
      extraSchema={toolPageSchema(overlap)}
      talk="If this found somebody unexpected, I would like to hear who."
    >
      <OverlapTool />
    </ToolPage>
  );
}
```

- [ ] **Step 3: Write the island**

```tsx
// app/tools/overlap/OverlapTool.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { overlapCopy } from "@/content/tools/overlap";
import { trackToolRun } from "@/lib/tools/events";
import { entriesFrom, readConnections, MIN_USABLE_ROWS, type ConnectionsFile, type ReadCounts } from "@/lib/tools/overlap/csv";
import { displayCode, normaliseTypedCode } from "@/lib/tools/overlap/code";
import { demoCsv, demoLists, runDemo } from "@/lib/tools/overlap/demo";
import { fingerprintOf, runExchange, type ExchangeResult } from "@/lib/tools/overlap/protocol";
import { createRoom, fetchOffer, pollForAnswer, sendAnswer } from "@/lib/tools/overlap/relay-client";
import { openAsCreator, openAsJoiner, packSdp, unpackSdp } from "@/lib/tools/overlap/webrtc";
import type { Entry } from "@/lib/tools/overlap/types";

/**
 * The one client component, and it is wiring.
 *
 * Every decision in this tool is a pure function in `lib/tools/overlap/` with
 * a test beside it. This file picks a file, picks a route to the other tab,
 * and paints what comes back. There is no maths here and there must not be.
 *
 * **Nothing is written anywhere.** No storage API appears in this file and
 * `lib/tools/overlap/safety.test.ts` greps for that. The file the visitor
 * chooses is read into memory, reduced to slugs, and dropped when the tab
 * closes.
 *
 * The page opens on the demo, which runs the real exchange in this tab through
 * `pairedChannels`, so nobody ever meets an empty form and a broken protocol
 * shows before a second browser is involved.
 */

type Panel = "demo" | "file";
type Route = "code" | "paste";
type Note = { kind: "info" | "warn"; text: string };

const fill = (template: string, values: Record<string, string | number>): string =>
  Object.entries(values).reduce((out, [k, v]) => out.replace(`{${k}}`, String(v)), template);

const round100 = (ms: number) => Math.round(ms / 100) * 100;

export default function OverlapTool() {
  const [panel, setPanel] = useState<Panel>("demo");
  const [route, setRoute] = useState<Route>("code");
  const [sameNetworkOnly, setSameNetworkOnly] = useState(false);

  const [demo, setDemo] = useState<ExchangeResult | null>(null);
  const [file, setFile] = useState<ConnectionsFile | null>(null);
  const [column, setColumn] = useState(-1);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [counts, setCounts] = useState<ReadCounts | null>(null);

  const [code, setCode] = useState("");
  const [typed, setTyped] = useState("");
  const [outbound, setOutbound] = useState("");
  const [inbound, setInbound] = useState("");
  const [note, setNote] = useState<Note | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ExchangeResult | null>(null);
  const started = useRef(0);

  // The demo runs the real exchange, in this tab, on mount.
  useEffect(() => {
    let live = true;
    runDemo().then(({ a }) => { if (live) setDemo(a); }).catch(() => {});
    return () => { live = false; };
  }, []);

  const readFile = useCallback((chosen: File) => {
    const reader = new FileReader();
    setNote({ kind: "info", text: overlapCopy.file.reading });
    reader.onerror = () => setNote({ kind: "warn", text: overlapCopy.errors.file });
    reader.onload = () => {
      const parsed = readConnections(String(reader.result ?? ""));
      setFile(parsed);
      setColumn(parsed.urlColumn);
      applyColumn(parsed, parsed.urlColumn);
    };
    reader.readAsText(chosen);
  }, []);

  const applyColumn = useCallback((parsed: ConnectionsFile, index: number) => {
    if (index < 0) { setNote({ kind: "warn", text: overlapCopy.file.noColumn }); setEntries([]); return; }
    const { entries: found, counts: c } = entriesFrom(parsed, index, parsed.nameColumns);
    setEntries(found);
    setCounts(c);
    setNote(
      found.length < MIN_USABLE_ROWS
        ? { kind: "warn", text: fill(overlapCopy.file.tooFew, { min: MIN_USABLE_ROWS }) }
        : { kind: "info", text: fill(overlapCopy.file.read, { rows: c.rows, used: c.used }) },
    );
  }, []);

  const finish = useCallback(
    async (
      opened: { channel: Parameters<typeof runExchange>[0]["channel"]; localSdp: string; remoteSdp: string },
      side: "creator" | "joiner",
    ) => {
      const fingerprints =
        side === "creator"
          ? { offer: fingerprintOf(opened.localSdp), answer: fingerprintOf(opened.remoteSdp) }
          : { offer: fingerprintOf(opened.remoteSdp), answer: fingerprintOf(opened.localSdp) };
      try {
        const out = await runExchange({ side, entries, channel: opened.channel, fingerprints });
        setResult(out);
        setNote(null);
        void trackToolRun({ tool: "overlap", outcome: "ok", ms: round100(Date.now() - started.current) });
      } catch {
        setNote({ kind: "warn", text: overlapCopy.errors.protocol });
        void trackToolRun({ tool: "overlap", outcome: "error", ms: round100(Date.now() - started.current) });
      } finally {
        setBusy(false);
      }
    },
    [entries],
  );

  const create = useCallback(async () => {
    setBusy(true);
    started.current = Date.now();
    setNote({ kind: "info", text: overlapCopy.connect.creating });
    const { offer, finish: complete } = await openAsCreator({ sameNetworkOnly });
    const room = await createRoom(offer, (u, i) => fetch(u, i));
    if (!room.ok) {
      setBusy(false);
      setNote({ kind: "warn", text: room.message || overlapCopy.relay.failed });
      if (room.error === "relay-unavailable" || room.error === "budget") setRoute("paste");
      void trackToolRun({ tool: "overlap", outcome: "refused", ms: round100(Date.now() - started.current) });
      return;
    }
    setCode(room.code);
    setNote({ kind: "info", text: fill(overlapCopy.connect.created, { code: displayCode(room.code) }) });
    const answer = await pollForAnswer(room.code, (u, i) => fetch(u, i), {
      onTick: (secondsLeft) => setNote({ kind: "info", text: fill(overlapCopy.connect.waiting, { seconds: secondsLeft }) }),
    });
    if (!answer.ok) {
      setBusy(false);
      setNote({ kind: "warn", text: answer.error === "gave-up" ? overlapCopy.connect.gaveUp : answer.message });
      void trackToolRun({ tool: "overlap", outcome: "refused", ms: round100(Date.now() - started.current) });
      return;
    }
    await finish(await complete(answer.answer), "creator");
  }, [finish, sameNetworkOnly]);

  const join = useCallback(async () => {
    const clean = normaliseTypedCode(typed);
    if (!clean) { setNote({ kind: "warn", text: overlapCopy.relay.badCode }); return; }
    setBusy(true);
    started.current = Date.now();
    setNote({ kind: "info", text: overlapCopy.connect.joining });
    const offer = await fetchOffer(clean, (u, i) => fetch(u, i));
    if (!offer.ok) {
      setBusy(false);
      setNote({ kind: "warn", text: offer.message || overlapCopy.relay.failed });
      if (offer.error === "relay-unavailable") setRoute("paste");
      return;
    }
    const { answer, opened } = await openAsJoiner(offer.offer, { sameNetworkOnly });
    const posted = await sendAnswer(clean, answer, (u, i) => fetch(u, i));
    if (!posted.ok) { setBusy(false); setNote({ kind: "warn", text: posted.message }); return; }
    await finish(await opened, "joiner");
  }, [finish, sameNetworkOnly, typed]);

  const pasteStart = useCallback(async () => {
    setBusy(true);
    started.current = Date.now();
    const { offer, finish: complete } = await openAsCreator({ sameNetworkOnly });
    setOutbound(await packSdp(offer));
    setNote({ kind: "info", text: overlapCopy.connect.pasteStart });
    (window as unknown as { __overlapComplete?: typeof complete }).__overlapComplete = complete;
  }, [sameNetworkOnly]);

  const pasteReply = useCallback(async () => {
    const complete = (window as unknown as { __overlapComplete?: (sdp: string) => Promise<Parameters<typeof finish>[0]> }).__overlapComplete;
    if (!complete) { await pasteJoin(); return; }
    await finish(await complete(await unpackSdp(inbound)), "creator");
  }, [finish, inbound]);

  const pasteJoin = useCallback(async () => {
    setBusy(true);
    started.current = Date.now();
    const { answer, opened } = await openAsJoiner(await unpackSdp(inbound), { sameNetworkOnly });
    setOutbound(await packSdp(answer));
    setNote({ kind: "info", text: overlapCopy.connect.pasteAnswer });
    await finish(await opened, "joiner");
  }, [finish, inbound, sameNetworkOnly]);

  const saveDemoFiles = useCallback(() => {
    const { a, b } = demoLists();
    for (const [list, owner] of [[a, "Aoife"], [b, "Cormac"]] as const) {
      const url = URL.createObjectURL(new Blob([demoCsv(list, owner)], { type: "text/csv;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `overlap-demo-${owner.toLowerCase()}.csv`;
      anchor.rel = "noopener";
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  }, []);

  const shown = result ?? (panel === "demo" ? demo : null);

  return (
    <div className="overlap">
      <p className="overlap__honesty">{overlapCopy.honesty.notPsi}</p>
      <p className="overlap__honesty">{overlapCopy.honesty.claim}</p>
      <p className="overlap__honesty">{overlapCopy.honesty.theyLearn}</p>
      <p className="overlap__honesty">{overlapCopy.honesty.storage}</p>

      <div className="overlap__panels" role="group" aria-label={overlapCopy.file.legend}>
        <button type="button" className="overlap__tab" aria-pressed={panel === "demo"} onClick={() => setPanel("demo")}>
          Demo
        </button>
        <button type="button" className="overlap__tab" aria-pressed={panel === "file"} onClick={() => setPanel("file")}>
          {overlapCopy.file.legend}
        </button>
      </div>

      {panel === "demo" ? (
        <section className="overlap__block">
          <p className="overlap__demo-label">{overlapCopy.demo.label}</p>
          <p className="overlap__hint">{overlapCopy.demo.hint}</p>
          <button type="button" className="overlap__button" onClick={saveDemoFiles}>
            {overlapCopy.demo.save}
          </button>
        </section>
      ) : (
        <section className="overlap__block">
          <p className="overlap__hint">
            {overlapCopy.export.how}{" "}
            <a className="prose__link" href={overlapCopy.export.link} rel="noopener noreferrer" target="_blank">
              {overlapCopy.export.linkLabel}
            </a>
          </p>
          <label className="overlap__label" htmlFor="overlap-file">{overlapCopy.file.input}</label>
          <input
            id="overlap-file"
            className="overlap__file"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => { const f = event.target.files?.[0]; if (f) readFile(f); }}
          />
          {file && column < 0 ? (
            <label className="overlap__label">
              {overlapCopy.file.pick}
              <select
                className="overlap__select"
                value={column}
                onChange={(event) => { const i = Number(event.target.value); setColumn(i); applyColumn(file, i); }}
              >
                <option value={-1}>{overlapCopy.file.pick}</option>
                {file.headers.map((header, i) => <option key={header + i} value={i}>{header || `column ${i + 1}`}</option>)}
              </select>
            </label>
          ) : null}
          {counts ? (
            <p className="overlap__counts">
              {fill(overlapCopy.file.skipped, { empty: counts.empty, legacy: counts.legacyPub, other: counts.notAProfile })}
            </p>
          ) : null}
        </section>
      )}

      <fieldset className="overlap__block" disabled={panel === "file" && entries.length < MIN_USABLE_ROWS}>
        <legend className="overlap__legend">{overlapCopy.connect.legend}</legend>
        <label className="overlap__check">
          <input type="checkbox" checked={sameNetworkOnly} onChange={(e) => setSameNetworkOnly(e.target.checked)} />
          {overlapCopy.connect.sameNetwork}
        </label>
        <p className="overlap__hint">{overlapCopy.honesty.stun}</p>

        {route === "code" ? (
          <div className="overlap__row">
            <button type="button" className="overlap__button" onClick={create} disabled={busy}>
              {overlapCopy.connect.create}
            </button>
            {code ? <output className="overlap__code">{displayCode(code)}</output> : null}
            <label className="overlap__label" htmlFor="overlap-code">{overlapCopy.connect.joinLabel}</label>
            <input
              id="overlap-code"
              className="overlap__input"
              inputMode="text"
              autoComplete="off"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
            />
            <button type="button" className="overlap__button" onClick={join} disabled={busy}>
              {overlapCopy.connect.join}
            </button>
          </div>
        ) : null}

        <details className="overlap__paste" open={route === "paste"}>
          <summary className="overlap__summary">{overlapCopy.connect.pasteLegend}</summary>
          <p className="overlap__hint">{overlapCopy.connect.pasteHint}</p>
          <button type="button" className="overlap__button" onClick={pasteStart} disabled={busy}>
            {overlapCopy.connect.pasteStart}
          </button>
          <textarea className="overlap__blob" readOnly value={outbound} rows={4} aria-label={overlapCopy.connect.pasteAnswer} />
          <label className="overlap__label" htmlFor="overlap-inbound">{overlapCopy.connect.pasteJoin}</label>
          <textarea
            id="overlap-inbound"
            className="overlap__blob"
            rows={4}
            value={inbound}
            onChange={(event) => setInbound(event.target.value)}
          />
          <button type="button" className="overlap__button" onClick={pasteReply} disabled={busy || inbound === ""}>
            {overlapCopy.connect.pasteReply}
          </button>
        </details>
      </fieldset>

      {note ? <p className={`overlap__note overlap__note--${note.kind}`} role="status">{note.text}</p> : null}

      {shown ? (
        <section className="overlap__result" aria-live="polite">
          <h2 className="overlap__heading">{overlapCopy.result.heading}</h2>
          <p className="overlap__counts">{fill(overlapCopy.result.counts, { mine: shown.mine, theirs: shown.theirs })}</p>
          <p className="overlap__counts">
            {shown.theirMode === "bloom" && shown.falsePositives !== null
              ? fill(overlapCopy.result.bloom, {
                  rate: `one in ${Math.round(1 / (shown.falsePositives / Math.max(1, shown.mine))).toLocaleString("en-IE")}`,
                  expected: shown.falsePositives.toFixed(3),
                })
              : overlapCopy.result.exact}
          </p>
          <p className="overlap__safety">
            {overlapCopy.result.safetyLabel}: <strong>{shown.safety}</strong>
          </p>
          <p className="overlap__hint">{overlapCopy.honesty.safety}</p>
          {shown.shared.length === 0 ? (
            <p className="overlap__counts">{overlapCopy.result.none}</p>
          ) : (
            <ul className="overlap__names">
              {shown.shared.map((entry) => <li key={entry.slug}>{entry.label}</li>)}
            </ul>
          )}
          <p className="overlap__hint">{overlapCopy.result.names}</p>
        </section>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Write the stylesheet**

```css
/* app/tools/overlap/tool.css */
/* The tool's own rules. app/globals.css stays the shell's stylesheet. */

.overlap { display: grid; gap: var(--sp); }

.overlap__honesty { color: var(--green); max-width: 62ch; }

.overlap__panels { display: flex; flex-wrap: wrap; gap: calc(var(--sp) * 0.5); }

.overlap__tab,
.overlap__button {
  min-height: 44px;
  padding: 0 calc(var(--sp) * 0.75);
  font: inherit;
  font-size: 16px;
  color: var(--green-bright);
  background: transparent;
  border: 1px solid var(--green);
  cursor: pointer;
}

.overlap__tab[aria-pressed="true"] { color: var(--amber); border-color: var(--amber); }

.overlap__block { display: grid; gap: calc(var(--sp) * 0.5); border: 1px solid var(--green); padding: var(--sp); }

.overlap__row { display: flex; flex-wrap: wrap; gap: calc(var(--sp) * 0.5); align-items: center; }

.overlap__label { color: var(--green); font-size: 16px; }

/* 16px on every control, or iOS zooms the page when one takes focus. */
.overlap__input,
.overlap__select,
.overlap__file,
.overlap__blob {
  min-height: 44px;
  font: inherit;
  font-size: 16px;
  color: var(--green-bright);
  background: transparent;
  border: 1px solid var(--green);
  max-width: 100%;
  width: 100%;
}

.overlap__blob { min-height: 88px; word-break: break-all; }

.overlap__code { font-size: 1.6rem; letter-spacing: 0.2em; color: var(--amber); }

.overlap__safety strong { font-size: 1.3rem; letter-spacing: 0.2em; color: var(--amber); }

.overlap__check { display: flex; align-items: center; gap: calc(var(--sp) * 0.5); min-height: 44px; color: var(--green); }

.overlap__note--warn { color: var(--amber); }

.overlap__names { display: grid; gap: 0.2rem; padding-left: 1.2em; }

.overlap__result { border-top: 1px solid var(--green); padding-top: var(--sp); }

@media (prefers-reduced-motion: no-preference) {
  .overlap__result { animation: overlap-in 240ms ease-out both; }
  @keyframes overlap-in { from { opacity: 0; } to { opacity: 1; } }
}
```

- [ ] **Step 5: Write the coupling tests**

```ts
// app/tools/overlap/OverlapTool.test.ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Source-coupling checks, not renders. vitest is in a node environment here so
 * nothing can mount React. Each assertion below is a wiring fact that no unit
 * test can reach, and every one of them is a way this tool could look right
 * and be wrong.
 */
const source = readFileSync(join(process.cwd(), "app", "tools", "overlap", "OverlapTool.tsx"), "utf8");
const css = readFileSync(join(process.cwd(), "app", "tools", "overlap", "tool.css"), "utf8");

describe("the island is wiring and nothing else", () => {
  it("builds no sentence of its own", () => {
    // Every visible string comes from content. A quoted sentence in here would
    // be copy outside the voice lint.
    const sentences = [...source.matchAll(/"[A-Z][^"]{25,}"/g)].map((m) => m[0]);
    expect(sentences).toEqual([]);
  });

  it("opens on the demo and runs the real exchange for it", () => {
    expect(source).toContain('useState<Panel>("demo")');
    expect(source).toContain("runDemo()");
  });

  it("records one tool_run per path out, rounded, and never the input", () => {
    const calls = [...source.matchAll(/trackToolRun\(\{[^}]*\}\)/g)].map((m) => m[0]);
    expect(calls.length).toBeGreaterThanOrEqual(3);
    for (const call of calls) {
      expect(call).toContain('tool: "overlap"');
      expect(call).toContain("round100(");
      expect(call).not.toMatch(/entries|slug|label|counts|code/);
    }
    expect(source).toMatch(/outcome: "ok"/);
    expect(source).toMatch(/outcome: "refused"/);
    expect(source).toMatch(/outcome: "error"/);
  });

  it("falls through to copy and paste when the relay is unavailable", () => {
    expect(source).toMatch(/error === "relay-unavailable"[\s\S]{0,80}setRoute\("paste"\)/);
  });

  it("touches no storage API", () => {
    for (const api of ["localStorage", "sessionStorage", "indexedDB", "document.cookie"]) {
      expect(source).not.toContain(api);
    }
  });

  it("reads the file with FileReader and sends it nowhere", () => {
    expect(source).toContain("new FileReader()");
    expect(source).not.toMatch(/FormData|\.upload|XMLHttpRequest/);
  });
});

describe("the stylesheet clears the phone floors before the phone check runs", () => {
  it("puts 16px on every control, so iOS does not zoom on focus", () => {
    const controls = css.slice(css.indexOf(".overlap__input"), css.indexOf(".overlap__blob {"));
    expect(controls).toContain("font-size: 16px");
    expect(css).toMatch(/\.overlap__tab,\s*\n\.overlap__button \{[\s\S]*?font-size: 16px/);
  });

  it("puts 44px under every tap target", () => {
    expect([...css.matchAll(/min-height: 44px/g)]).toHaveLength(4);
  });

  it("stops a pasted blob pushing the page sideways", () => {
    expect(css).toContain("max-width: 100%");
    expect(css).toContain("word-break: break-all");
  });

  it("gates the one animation behind reduced motion", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\)[\s\S]*overlap__result/);
  });
});
```

```ts
// app/tools/overlap/page.test.ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { overlap } from "@/content/tools/overlap";

/** A source-coupling check: the page renders through the shell and owns its CSS. */
const source = readFileSync(join(process.cwd(), "app", "tools", "overlap", "page.tsx"), "utf8");

describe("/tools/overlap", () => {
  it("renders through ToolPage rather than laying itself out", () => {
    expect(source).toContain('from "@/components/tools/ToolPage"');
    expect(source).toMatch(/<ToolPage[\s\S]*tool=\{overlap\}/);
  });

  it("imports its own stylesheet and not the shell's", () => {
    expect(source).toContain('import "./tool.css"');
  });

  it("is a server component, so the words are in the HTML before any script", () => {
    expect(source).not.toContain('"use client"');
  });

  it("is registered as live", () => {
    expect(overlap.status).toBe("live");
  });
});
```

- [ ] **Step 6: Flip the entry to live and run everything**

In `content/tools/overlap.ts`, change `status` back to `"live"`. Then:

```bash
cd "$WT"
npx tsc --noEmit && npx vitest run 2>&1 | tail -6
npm run build 2>&1 | tail -8
```

Expected: `tsc` silent, every test green including `content/tools/index.test.ts`'s "has a page behind it", and a clean build with `/tools/overlap` in the route list.

What this proves: the page compiles, the registry finds it, the island builds no sentences, records the right events and never touches storage, and the stylesheet clears the phone floors on paper. What it cannot see: any pixel, any click and any connection. Nothing here has rendered React.

- [ ] **Step 7: Commit**

```bash
cd "$WT"
git add app/tools/overlap lib/tools/overlap/safety.test.ts content/tools/overlap.ts
git commit -m "feat(overlap): the page, the island, and the greps that hold the promise"
```

---
### Task 12: Prove the tests can fail, then wire the guards into the mutation check

**Files:**
- Temporarily modify then restore: `lib/tools/overlap/hash.ts`
- Modify: `scripts/mutation-check.mjs` (fourteen entries)

**Interfaces:**
- Consumes: every module from Tasks 2 to 11
- Produces: fourteen mutation rows, and the evidence that the suite goes red when this plan's central decision is broken

A guard that survives its own mutation is decoration, and a suite nobody has watched fail is a ritual. This task does both, in that order, and neither claim belongs in the ledger before its run.

**The one chosen for the demonstration, and why it is not the obvious one.** The obvious choice is `BLOOM_THRESHOLD`, and it is the wrong choice: the protocol test passes its own threshold in, so moving the constant leaves that file green and only `bloom.test.ts`'s single equality bites. The hash truncation is the decision the whole plan argues for from the birthday table, three separate tests bite on it, and every one of them is written with the literal 16 rather than with `HASH_HEX_CHARS`, which is the exact relativity trap T2 recorded on `MIN_EVENTS`. That was deliberate when the tests were written and this step is what confirms it worked.

- [ ] **Step 1: Break the truncation on purpose and watch the suite notice**

In `lib/tools/overlap/hash.ts`, change one number:

```ts
export const HASH_HEX_CHARS = 12;
```

Then:

```bash
cd "$WT"
npx vitest run lib/tools/overlap/hash.test.ts 2>&1 | tail -30
```

Expected: **FAIL**, and specifically these three, not something vague:

- `hashSlug > is 16 lowercase hex characters, which is 8 bytes, which is 64 bits`: `HASH_HEX_CHARS` is 12, and the returned string is 12 characters against the literal 16.
- `hashSlug > matches SHA-256 of salt then slug, checked against node:crypto`: the reference slices at 16 and the module now stops at 12, so all four slugs disagree.
- `hashSlug > agrees with the published SHA-256 of the empty input`: `e3b0c44298fc` against `e3b0c44298fc1c14`.

Paste all three failure lines into the ledger. That paste is the observation. **If the suite goes green with the truncation at 12, stop**: the birthday argument at the head of this plan is unearned, and the tests are asserting against the constant rather than against the number.

- [ ] **Step 2: Put it back and confirm the failure goes with it**

```bash
cd "$WT"
git checkout -- lib/tools/overlap/hash.ts
npx vitest run lib/tools/overlap/hash.test.ts 2>&1 | tail -5
```

Expected: PASS. The pair of runs is `CLAIMS.md` rule 3, revert to confirm: the failure appeared when the guard was broken and went when it was restored, which is what earns the word "tested" for the truncation. It says nothing about the other thirteen, which is what Step 3 is for.

- [ ] **Step 3: Check every anchor before adding a row**

Every anchor is a regex tolerant of CRLF, which means single-line and never containing `\n`, because `scripts/mutation-check.mjs` has been bitten once by a bare newline against a CRLF file. Tasks 2 to 11 may have been typed with different spacing, so check first:

```bash
cd "$WT"
node -e '
const { readFileSync } = require("node:fs");
const checks = [
  ["lib/tools/overlap/slug.ts", /s = s\.split\("#", 1\)\[0\];/],
  ["lib/tools/overlap/slug.ts", /if \(\/\^pub\(\\\/\|\$\)\/i\.test\(s\)\) return \{ ok: false, reason: "legacy-pub" \};/],
  ["lib/tools/overlap/slug.ts", /s = s\.normalize\("NFC"\)\.toLowerCase\(\);/],
  ["lib/tools/overlap/slug.ts", /if \(!LINKEDIN_HOST\.test\(host\)\) return \{ ok: false, reason: "not-a-profile" \};/],
  ["lib/tools/overlap/slug.ts", /s = s\.replace\(\/\^in\\\/\/i, ""\);/],
  ["lib/tools/overlap/hash.ts", /export const HASH_HEX_CHARS = 16;/],
  ["lib/tools/overlap/hash.ts", /buffer\.set\(salt, 0\);/],
  ["lib/tools/overlap/bloom.ts", /const step = h2 % bits \|\| 1;/],
  ["lib/tools/overlap/bloom.ts", /export const BITS_PER_ENTRY = 29;/],
  ["lib/tools/overlap/code.ts", /const REJECT_AT = 253;/],
  ["lib/relay.ts", /return encoder\.encode\(value\)\.length <= MAX_SDP_BYTES;/],
  ["app/api/relay/route.ts", /if \(error instanceof StoreUnavailableError\) \{/],
  ["lib/tools/overlap/protocol.ts", /const mode: Mode = mine\.length > threshold \? "bloom" : "exact";/],
  ["content/tools/overlap.ts", /not a private set intersection protocol/],
];
let bad = 0;
for (const [file, re] of checks) {
  const hit = re.test(readFileSync(file, "utf8"));
  if (!hit) bad++;
  console.log(`${hit ? "ok    " : "MISS  "} ${file}  ${re}`);
}
process.exitCode = bad ? 1 : 0;
'
```

Expected: fourteen `ok` lines and exit 0. A `MISS` means the anchor has to be rewritten against the file as it was actually typed. **Never loosen the file to fit the anchor**, and never carry a `MISS` into the run: the script reports an unmatched anchor as `ANCHOR-MISS` and counts it as a survivor, which is the right behaviour.

- [ ] **Step 4: Add the fourteen rows**

Append to the `MUTATIONS` array in `scripts/mutation-check.mjs`, after the entries the previous sub-project added:

```js
  // ── overlap: fourteen guards, each with the test that bites on it ──
  {
    name: "overlap decodes before splitting a URL, so a %23 in a slug cuts it in half",
    file: "lib/tools/overlap/slug.ts",
    pattern: /s = s\.split\("#", 1\)\[0\];/,
    replace: 's = decodeURIComponent(s).split("#", 1)[0];',
  },
  {
    name: "overlap turns an old /pub/ link into an /in/ slug, inventing matches",
    file: "lib/tools/overlap/slug.ts",
    pattern: /if \(\/\^pub\(\\\/\|\$\)\/i\.test\(s\)\) return \{ ok: false, reason: "legacy-pub" \};/,
    replace: 's = s.replace(/^pub\\//i, "");',
  },
  {
    name: "overlap stops composing accents, so one name hashes two ways",
    file: "lib/tools/overlap/slug.ts",
    pattern: /s = s\.normalize\("NFC"\)\.toLowerCase\(\);/,
    replace: "s = s.toLowerCase();",
  },
  {
    name: "overlap accepts any host, so a lookalike domain becomes a LinkedIn profile",
    file: "lib/tools/overlap/slug.ts",
    pattern: /if \(!LINKEDIN_HOST\.test\(host\)\) return \{ ok: false, reason: "not-a-profile" \};/,
    replace: "if (false) return { ok: false, reason: \"not-a-profile\" };",
  },
  {
    name: "overlap strips the suffix, so two people called John Smith become one",
    file: "lib/tools/overlap/slug.ts",
    pattern: /s = s\.replace\(\/\^in\\\/\/i, ""\);/,
    replace: 's = s.replace(/^in\\//i, "").replace(/-[0-9a-z]+$/, "");',
  },
  {
    name: "overlap truncates to 48 bits, where a big pair of lists gets a wrong name",
    file: "lib/tools/overlap/hash.ts",
    pattern: /export const HASH_HEX_CHARS = 16;/,
    replace: "export const HASH_HEX_CHARS = 12;",
  },
  {
    name: "overlap hashes the slug before the salt, so the two sides still agree and the salt does nothing",
    file: "lib/tools/overlap/hash.ts",
    pattern: /buffer\.set\(salt, 0\);/,
    replace: "buffer.set(salt, text.length);",
  },
  {
    name: "overlap lets a bloom step of zero put twenty probes on one bit",
    file: "lib/tools/overlap/bloom.ts",
    pattern: /const step = h2 % bits \|\| 1;/,
    replace: "const step = h2 % bits;",
  },
  {
    name: "overlap sizes a filter at 8 bits an entry, ten thousand times its stated rate",
    file: "lib/tools/overlap/bloom.ts",
    pattern: /export const BITS_PER_ENTRY = 29;/,
    replace: "export const BITS_PER_ENTRY = 8;",
  },
  {
    name: "overlap takes the remainder without rejecting, biasing the room code towards 2, 3 and 4",
    file: "lib/tools/overlap/code.ts",
    pattern: /const REJECT_AT = 253;/,
    replace: "const REJECT_AT = 256;",
  },
  {
    name: "overlap measures an SDP in code units, so an astral blob is three times the cap",
    file: "lib/relay.ts",
    pattern: /return encoder\.encode\(value\)\.length <= MAX_SDP_BYTES;/,
    replace: "  return value.length <= MAX_SDP_BYTES;",
  },
  {
    name: "overlap dresses a missing Redis up as a server fault, so nobody is told to use copy and paste",
    file: "app/api/relay/route.ts",
    pattern: /if \(error instanceof StoreUnavailableError\) \{/,
    replace: "if (false) {",
  },
  {
    name: "overlap always sends a filter, so a small list gets false positives for nothing",
    file: "lib/tools/overlap/protocol.ts",
    pattern: /const mode: Mode = mine\.length > threshold \? "bloom" : "exact";/,
    replace: 'const mode: Mode = "bloom";',
  },
  {
    name: "overlap softens the paragraph that says what a salted hash does not do",
    file: "content/tools/overlap.ts",
    pattern: /not a private set intersection protocol/,
    replace: "a careful way to compare lists",
  },
```

Two guards deliberately get no row, and both for the same reason: they are a second door into a module the fourteen already cover, and each row costs a full run of the suite. `partsOf`'s chunk size is held by the chunking case in `protocol.test.ts`, and `normaliseTypedCode`'s lookalike map is held by four cases in `code.test.ts`. If a later change touches either, add the row then.

One row is worth watching more than the others. The salt-order mutation is the only one where **both sides still agree**: swap the concatenation and the two browsers compute the same wrong hashes and the tool appears to work perfectly. Nothing about the page would look different. The only thing that catches it is the `node:crypto` cross-check, which is an independent implementation and does not move with the code. If that row comes back `GREEN`, the salt is untested and the honest word in the ledger drops from "checked against a second implementation" to "self-consistent".

- [ ] **Step 5: Run the mutation check**

```bash
cd "$WT"
node scripts/mutation-check.mjs 2>&1 | tail -28
```

Expected: every overlap row prints `RED`, and the last line reads `N/N mutations caught.` with no `Survived` block. An `ANCHOR-MISS` is a failure, not a skip.

This run is long. Each mutation runs the whole suite and there are eighty-odd rows before these fourteen, so budget forty minutes and do not interleave it with anything that writes to the worktree: the script restores each file by writing the original text back, and a concurrent edit in the same file would be lost.

- [ ] **Step 6: Commit**

```bash
cd "$WT"
git add scripts/mutation-check.mjs
git commit -m "test(overlap): mutate the fourteen guards and prove each one is load-bearing"
```

---

### Task 13: The phone check, at 390 and 320, on a real engine

**Files:**
- Modify: whatever the run names, and only in `app/tools/overlap/tool.css`
- Modify: `.github/workflows/ci.yml`, but only if the phone job names its routes

**Interfaces:**
- Consumes: `scripts/phone-check.mjs` (F3), the production build
- Produces: the phone evidence for T3, pasted verbatim into the ledger

The design's rule, and the one this site refuses to fudge: **a resized desktop window does not count.** WebKit at 390 and at 320 because that is what an iPhone renders with, and a throttled Chromium Pixel beside it.

**Predictions, written before the run so the run can prove them wrong (`CLAIMS.md` rule 2). All five are guesses from reading the CSS and none has been observed:**

1. **`overflow`: pass, and this is the likeliest place to be wrong.** The two textareas carry `max-width: 100%` and `word-break: break-all`, which is what stops a 1,100-character base64 blob with no spaces in it from setting a minimum content width of a thousand-odd pixels. That is the specific failure a copy-and-paste UI produces at 320 and the reason both rules are there. If the prediction is wrong, the run names `.overlap__blob`.
2. **`tap-target`: pass, but the checkbox is the one to watch.** Every button and control carries `min-height: 44px`, and the label around the same-network checkbox carries it too, which it needs: a bare checkbox renders at about 13px on WebKit and the label is what gives the thumb something to hit. Whether the script measures the input or the label is unknown behaviour worth reading in `auditInPage` rather than guessing at.
3. **`input-font`: pass.** All four of `.overlap__input`, `.overlap__select`, `.overlap__file` and `.overlap__blob` are a literal `16px`, and so are the buttons and tabs. Anything under that and iOS zooms the page on focus, which on this route would happen while somebody is typing a room code.
4. **`contrast`: pass, and least certain of the four.** The honesty paragraphs and the hints are `--green` rather than `--green-dim`, following T1's measured finding that `--green-dim` fails on two of the three themes. The code and the safety string are `--amber`, which has never been sampled through the scanline overlay and the phosphor shader on this route.
5. **The check cannot see the tool at all.** It measures the page as it opens: the honesty paragraphs, the panels, the demo block and the connect fieldset. The demo result appears after a promise resolves, so whether it is in the screenshot depends on timing the script does not control, and nothing behind the file panel or the paste details is on screen. That is a real gap and Step 3 closes it by hand.

- [ ] **Step 1: Decide whether CI needs editing at all**

```bash
cd "$WT"
grep -n "phone-check" .github/workflows/ci.yml
```

If the job runs `--from-sitemap`, **change nothing**: a live tool is in the sitemap because `liveTools` puts it there, so `/tools/overlap` joins the phone job the moment Task 11 flips the status, and the file-structure table naming `ci.yml` is wrong. Record that as a correction to this plan rather than editing a workflow to make a table true. If the job names routes with `--routes`, add `/tools/overlap` alphabetically and nothing else.

- [ ] **Step 2: Build and serve**

```bash
cd "$WT"
pkill -f "next start" || true
npm run build 2>&1 | tail -5
(npm start > .t3-server.log 2>&1 &)
for i in $(seq 1 30); do curl -sf http://localhost:3000/tools/overlap > /dev/null && break; done
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/tools/overlap
```

Expected: `200`.

- [ ] **Step 3: Run the check and keep the output**

```bash
cd "$WT"
mkdir -p .phone-check
node scripts/phone-check.mjs --base http://localhost:3000 --routes /tools/overlap --out .phone-check | tee .phone-check/t3-first-run.txt
echo "exit: $?"
```

Expected: a header naming `1 route(s) x 3 profiles`, then whatever it finds. **Paste the whole output into the ledger under "T3 first phone-check run" before changing a single line.** That paste is the observation; everything after it is a fix.

Then close the gap named in prediction 5, by hand rather than by assertion. With the built site still serving, open the route in a real WebKit at 320 (`npx playwright open --device="iPhone 13" http://localhost:3000/tools/overlap` opens at 390; set 320 in the inspector) and:

- Open the file panel. Look at the file input, the column select and their labels.
- Open the copy-and-paste details. Press the start button so a real SDP blob lands in the textarea, and look at whether it pushes the page sideways. This is the single most likely layout failure on this route.
- Look at whether the room code at `1.6rem` with `0.2em` letter spacing still fits on one line at 320.

Write down what you see. If a control is under a thumb's width there, it is a `tool.css` fix exactly as if the script had named it.

- [ ] **Step 4: Fix each named failure in the file that owns it**

Every fix goes in `app/tools/overlap/tool.css`. The thresholds in the script are not touched, and `app/globals.css` is not touched: a shell failure on this route is a shell failure on every route, and that is F3's ground. If the run names one, record it in the ledger and leave it.

A `contrast` failure is fixed by using a lighter token on that element, never by editing the token: the tokens are proven on all three themes in `app/globals.test.ts` and other surfaces depend on them.

An `overflow` failure naming `.overlap__blob` is the prediction being wrong, and the fix is on that element (`overflow-wrap: anywhere` beside the break, or a smaller `font-size` on the textarea alone), not on the container.

- [ ] **Step 5: Rebuild, re-run, confirm green**

```bash
cd "$WT"
pkill -f "next start" || true
npm run build 2>&1 | tail -3
(npm start > .t3-server.log 2>&1 &)
for i in $(seq 1 30); do curl -sf http://localhost:3000/tools/overlap > /dev/null && break; done
node scripts/phone-check.mjs --base http://localhost:3000 --routes /tools/overlap --out .phone-check
echo "exit: $?"
pkill -f "next start" || true
```

Expected: `exit: 0` and no `FAIL` lines.

What this proves: on WebKit at 390 and 320 and on a throttled Chromium Pixel, the route has no horizontal overflow, no input under 16px, no tap target under 44px and no sampled text contrast under 4.5:1, in the state the page opens in. What it cannot see: the file panel, the paste panel, a real SDP blob in a textarea unless Step 3's manual pass put one there, whether any of it is pleasant to use, and a real iPhone GPU.

- [ ] **Step 6: Commit**

```bash
cd "$WT"
git add app/tools/overlap/tool.css .github/workflows/ci.yml
git commit -m "fix(overlap): meet the phone floors the check named"
```

If the run was clean and nothing changed, skip the commit and say so in the ledger. A clean first run is a finding worth recording, not a step to fake.

---

### Task 14: The handshake, on two real browsers, by hand

**Files:**
- Create: nothing. This task produces evidence, not code.

**Interfaces:**
- Consumes: the built site from Task 13, and the two demo CSVs from Task 9
- Produces: the first observation in this whole plan that the WebRTC handshake works at all

**Nothing in the suite has opened a connection.** There is no `RTCPeerConnection` in vitest's node environment, the protocol is tested against two in-memory channels, and `webrtc.ts` has a source-coupling check and nothing more. So every sentence written so far about "two browsers connecting" is a design intention. This task is where it becomes an observation, and until it passes the honest word in every document is **untested**.

Redis is very likely not provisioned (the ledger has F4 held on Fergus), so run the copy-and-paste route first and treat the room-code route as conditional on the store being there. **That order is deliberate**: the route with no server in it is the one that must work.

- [ ] **Step 1: Get the two files**

```bash
cd "$WT"
npm run build 2>&1 | tail -3
(npm start > .t3-server.log 2>&1 &)
for i in $(seq 1 30); do curl -sf http://localhost:3000/tools/overlap > /dev/null && break; done
```

Open `http://localhost:3000/tools/overlap`, press **Save the two demo files**, and confirm two CSVs land: `overlap-demo-aoife.csv` and `overlap-demo-cormac.csv`. Open one in a text editor and confirm it starts `Notes:` and has a `First Name,Last Name,URL` header on line four. If it does not, `demoCsv` and the reader disagree and Task 9's round-trip test was checking itself.

- [ ] **Step 2: The copy-and-paste route, two browsers, no server**

Open the page in two different browsers, or one normal window and one private window, and load one CSV into each: Aoife's on the left, Cormac's on the right. Then, on the left, open the copy-and-paste details, press the start button, and copy the blob. Paste it into the right browser's inbound box and press the reply button. Copy the blob the right browser produces back into the left browser's inbound box and press reply again.

**What to look for, in this order.** Each is a claim this plan has been making on paper:

| Look at | What a pass is | What a failure means |
|---|---|---|
| Both results appear | Both sides print a shared list | The connection did not open. Read the console on both sides before touching anything: an ICE failure and a data-channel failure look identical on the page and different in the console. |
| The count | **37** on both sides | Any other number and the intersection is wrong, and the demo test that says 37 was checking a different code path than the browser runs. |
| The Síne row | Left shows `Síne Ní Dhomhnaill`, right shows `Sine Ni Dhomhnaill` | The same spelling on both sides means a label crossed the wire, which is the thing this tool exists not to do. Stop and fix. |
| The safety string | The same four characters on both sides | Different strings with no relay in the picture means the fingerprints are being read off the wrong SDPs. |
| Network panel, both sides | **Zero requests** to anything but the page's own assets and the analytics ingest path | Any request at all on this route is a straight contradiction of "no server at all" and is a stop-and-fix. |
| The `tool_run` event | One per side, with `tool`, `outcome` and `ms` | A fourth property, or a count in `ms` that is not a multiple of 100, means the rounding or the whitelist is not doing its job. |

Then do the negative check by hand, because it is the one nothing automated can reach. In the right browser's console, take a slug that is only in Cormac's file (any name in the result list is shared, so pick one that is not), and confirm it does not appear in the left browser's result. That is the tool doing its job. Then, in either console, search the whole page for a slug from the other side's file: `document.body.innerText.includes("<a slug only in the other file>")` must be `false`.

- [ ] **Step 3: The room-code route, if there is a Redis to run it against**

```bash
cd "$WT"
curl -s -X POST http://localhost:3000/api/relay -H 'content-type: application/json' \
  -d '{"offer":"v=0\r\no=- 1 2 IN IP4 0.0.0.0\r\n"}' | head -c 300; echo
```

Two outcomes and both are results:

- **`{"error":"relay-unavailable",...}`.** That is the expected state, and the thing to check then is that the **page** handles it: create a room in the browser and confirm the copy-and-paste details open on their own with the sentence above them, no spinner, no retry loop. Record "room codes untested against a live store" in the ledger and move on. That is not a gap in this work, it is F4's provisioning waiting on Fergus.
- **A code.** Then run the real flow: left browser presses create, reads the code aloud (or into the other window), right browser types it with the hyphen in and joins. Everything in Step 2's table applies again, plus: the code is six characters from `234679FKMRW`, joining with a wrong code says there is no room rather than hanging, and a second joiner on the same code is told somebody has already joined.

Also read one real SDP with your own eyes, in the network panel of the browser that created the room. Confirm what the plan has been asserting: it carries `a=candidate:` lines, those lines carry addresses, and the page's sentence about the relay seeing your address is true rather than defensive. If it does not carry candidates, gathering is not completing and the connection is working on host candidates alone, which will fail between networks.

- [ ] **Step 4: The two things that only a phone can answer**

On a real iPhone on the same wifi, with the dev server reachable, load the page, tick **same network only**, and run the copy-and-paste route against a laptop. Two questions, neither of which any test in this repo can reach:

- Does the connection open with an empty ICE server list on the same network? If not, the same-network switch is a button that does nothing and it should either be removed or its sentence changed.
- How long does the hashing take on a real phone with a real file? The plan's batching is sized for 30,000 entries and the time is a guess. Drop the 520-row demo file, then, if you have a real export, drop that, and write down the wall clock from pressing the button to seeing the list.

- [ ] **Step 5: Write it all down**

Into the ledger, verbatim, under "T3 two-browser check". Every row of Step 2's table with what was actually seen, the SDP observation, whether the relay answered 503 or a code, and the phone timing. Label the rung: this is **observed**, on two named browsers on one machine on one network, and it is not "works".

---

### Task 15: Documentation, the pull request and the live check

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/PROGRESS.md`
- Modify: `docs/superpowers/programme/toolshed-ledger.md`

**Interfaces:**
- Consumes: everything above, and the `check` and `mutation` CI jobs required on `main`
- Produces: `/tools/overlap` live on `https://fergusoreilly.dev`, with the deployment id and the evidence in the ledger

- [ ] **Step 1: The paragraph in AGENTS.md**

In "Stack and conventions", at the end of the bullet F3 added about `content/tools/` and `ToolPage`, append:

```markdown
  `/tools/overlap` compares two people's LinkedIn connections without either list leaving its
  browser. Two things about it are load-bearing and easy to undo by accident. **The claim on the
  page is deliberately small**: a salted hash of a profile slug is not a commitment against the
  peer, who holds the salt and can grind a dictionary of plausible slugs, so the only sentence
  the page is allowed to make is "your list never leaves your browser, and the person you are
  comparing with sees only hashes". `lib/tools/overlap/copy.test.ts` bans the words that would
  oversell it and there is a mutation row on the paragraph. **And the untestable part is kept
  small on purpose**: the transport is a three-method `Channel`, so the whole protocol runs in
  vitest against two in-memory channels, `RTCPeerConnection` appears only in
  `lib/tools/overlap/webrtc.ts`, `fetch` appears only in `lib/tools/overlap/relay-client.ts`, and
  `lib/tools/overlap/safety.test.ts` greps for both. Nothing in the suite has ever opened a
  connection, so the handshake rests on a two-browser check, not on a green run.

  `app/api/relay` is the only server part and it is reused by the arcade's two-player game. Two
  keys a room, an offer and an answer, ten minutes, budgeted per address, per code and globally.
  **When `getRedis()` throws `StoreUnavailableError` the answer is a 503 with a sentence and the
  page falls through to copy and paste**, which needs no server at all and is the route to pick if
  you are being careful. That path is not a degraded mode and the copy must not describe it as one.
```

- [ ] **Step 2: Update PROGRESS.md and the ledger**

`docs/PROGRESS.md`: tick T3 and add a decision-log line naming the 8-byte truncation and the birthday table it comes from, the eleven-character alphabet and why, the 29-bit filter and its stated rate, the relay's two keys and its Redis arithmetic, and the correction to the design's section 5 table.

The ledger: set the T3 row to `**pr**` and put the observations in the Log, each labelled with its rung:

```markdown
- 2026-09-03: T3 built. Observed: tsc clean; N tests passing (was M at baseline); the mutation
  check caught all fourteen overlap guards, the salt-order row included, so the hash is pinned by
  an independent implementation rather than by itself; the phone check passed on /tools/overlap at
  390, 320 and the throttled Pixel. The two-browser check found 37 shared names on both sides with
  each side keeping its own spelling of Síne, matching safety strings, and no network request on
  the copy-and-paste route. The relay answered <503 / a code> against the local build. Not verified
  at this point: anything on the live site, and <room codes against a real Upstash database, if the
  503 branch was the one observed>.
```

- [ ] **Step 3: Push and open the pull request**

```bash
cd "$WT"
npx tsc --noEmit && npm test -- --reporter=dot 2>&1 | tail -3
git add AGENTS.md docs/PROGRESS.md docs/superpowers/programme/toolshed-ledger.md
git commit -m "docs(overlap): record the claim, the untested part and the T3 evidence"
git push -u origin toolshed/t3-overlap
gh pr create --title "T3: Overlap, who you both already know, without either list leaving a browser" --body "$(cat <<'BODY'
Adds `/tools/overlap`.

Two people about to meet drop their LinkedIn `Connections.csv` into two browsers. The browsers
connect straight to each other, agree a 32-byte salt, hash every profile slug with it, and swap
only the hashes. Each side prints the intersection with names read out of its own file.

**The claim is deliberately small, and the page says so in its own words.** A salted hash of a
profile slug is not a commitment against the peer: they hold the salt and a slug is a name with a
suffix, so they can hash a dictionary and learn whether somebody is in your list. This is a tool
for two people who have chosen to compare notes, not a protocol against an adversary. The page
also says the peer learns roughly how many connections you have, and your IP address, because two
browsers connecting directly is what that is. `lib/tools/overlap/copy.test.ts` bans
"cryptographically private" and friends and pins the one sentence that is allowed, and there is a
mutation row on the paragraph.

8-byte truncation, argued from the birthday bound: at LinkedIn's 30,000 cap that is 4.9e-11
expected wrong names against 0.21 at 4 bytes, and a wrong name here means printing a stranger as a
mutual friend. Above 10,000 entries a side sends a Bloom filter at 29 bits an entry and 20 probes,
which is 8.89e-7 per name checked, and the page prints the number computed from the real sizes
whenever one is in use.

Identifier normalisation is where this fails in practice, so it has thirty-odd cases: query and
fragment stripped before decoding because `%23` is a literal hash, NFC before folding because a
composed accent and a decomposed one are the same person, country subdomains, bare slugs, old
`/pub/` links refused rather than converted, and **the trailing suffix kept**, because
`john-smith-1a2b3c4` and `john-smith-9f8e7d6` are two people.

`app/api/relay` is the only server part: two keys a room, ten minutes, budgeted three ways,
reused by G1. Redis is not provisioned in production, so a missing store is an ordinary answer
here: 503, a sentence, and the page falls through to copy and paste, which needs no server at all.

No new dependencies. WebRTC, `crypto.subtle`, `FileReader` and `CompressionStream` are platform.

**What is not tested and never will be by this suite.** vitest runs in node, so nothing here has
opened a connection. The protocol is driven end to end by two in-memory channels, and
`RTCPeerConnection` lives alone in one file behind a coupling check. The handshake rests on a
two-browser check, written up in the ledger, not on a green run.

Fourteen new guards, fourteen mutation rows, all caught. The phone check passes at 390 and 320 on
WebKit and on a throttled Chromium Pixel.

Not verified in this PR: anything on the live site, and room codes against a real Upstash database
if the relay answered 503 locally. The post-deploy checks follow the merge.
BODY
)"
```

Expected: the PR opens and the `check` and `mutation` jobs start. Wait for both green. A red `mutation` job with a `Survived` line is a guard that does nothing, and it is fixed by making the test bite, never by deleting the row.

- [ ] **Step 4: Merge, then find the deployment the way AGENTS.md says**

```bash
gh pr merge --squash --delete-branch=false
sleep 20
curl -s "https://api.vercel.com/v6/deployments?projectId=$VERCEL_PROJECT_ID&teamId=$VERCEL_TEAM_ID&target=production&limit=3" \
  -H "Authorization: Bearer $VERCEL_TOKEN_PERSONAL" | head -c 2000
```

Then read `readyState`, `aliasAssigned` and `meta.githubCommitSha` from `v13/deployments/<id>`. Expected: `READY`, `aliasAssigned` true, and the SHA equal to the squash-merge commit. **Do not** run `vercel ls`, which renders `BLOCKED` as `UNKNOWN` and reads like "still building", and do not trust the CLI's exit code. The `teamId` is not optional: without it the listing is scoped to the wrong account and comes back empty, which reads like a failed deploy.

- [ ] **Step 5: Drive the whole flow on the live site, in two contexts, watching every byte**

A 200 on the route is not a pass. This runs both sides in one script, wires them through the copy-and-paste route so no server is needed, and captures every request either context makes.

**Prove the instrument before accusing the object.** Playwright's WebKit build is the right engine for layout and its data-channel support has not been checked here. So the script runs in Chromium, and WebKit's job is the phone check below it. If the data channel never opens in Chromium either, that is a finding about the tool; if it opens in Chromium and not WebKit, that is a finding about the automation engine and it goes in the ledger as one, not as a bug.

```bash
cd "$WT"
node --input-type=module -e "$(cat <<'JS'
import { chromium, devices } from "playwright";
import { writeFileSync } from "node:fs";
import { demoCsv, demoLists } from "./lib/tools/overlap/demo.ts";

const { a, b } = demoLists();
writeFileSync("/tmp/aoife.csv", demoCsv(a, "Aoife"));
writeFileSync("/tmp/cormac.csv", demoCsv(b, "Cormac"));

const browser = await chromium.launch();
const traffic = { left: [], right: [] };
const open = async (side, file) => {
  const context = await browser.newContext(devices["Pixel 7"]);
  const page = await context.newPage();
  page.on("request", (r) => traffic[side].push(`${r.method()} ${r.url()}`));
  await page.goto("https://fergusoreilly.dev/tools/overlap", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Your file" }).click();
  await page.getByLabel("Connections.csv").setInputFiles(file);
  await page.locator(".overlap__note").first().waitFor();
  return page;
};

const left = await open("left", "/tmp/aoife.csv");
const right = await open("right", "/tmp/cormac.csv");

console.log("left read:", await left.locator(".overlap__note").first().innerText());

await left.getByText("Or copy and paste, with no server at all").click();
await left.getByRole("button", { name: "Start here and send this to the other person" }).click();
await left.locator(".overlap__blob").first().waitFor();
const offer = await left.locator(".overlap__blob").first().inputValue();
console.log("offer blob chars:", offer.length, "compressed:", offer.startsWith("z"));

await right.getByText("Or copy and paste, with no server at all").click();
await right.getByLabel("Paste what they sent you").fill(offer);
await right.getByRole("button", { name: "Paste what they send back" }).click();
await right.locator(".overlap__blob").first().waitFor();
const answer = await right.locator(".overlap__blob").first().inputValue();

await left.getByLabel("Paste what they sent you").fill(answer);
await left.getByRole("button", { name: "Paste what they send back" }).click();

await left.locator(".overlap__names li").first().waitFor({ timeout: 60_000 });
await right.locator(".overlap__names li").first().waitFor({ timeout: 60_000 });

const read = async (page) => ({
  count: await page.locator(".overlap__names li").count(),
  safety: await page.locator(".overlap__safety strong").innerText(),
  counts: await page.locator(".overlap__counts").first().innerText(),
  sine: await page.locator(".overlap__names li", { hasText: /S.ne N. Dhomhnaill/ }).innerText(),
  text: await page.locator(".overlap").innerText(),
});
const L = await read(left);
const R = await read(right);

console.log("left  :", L.count, L.safety, JSON.stringify(L.sine));
console.log("right :", R.count, R.safety, JSON.stringify(R.sine));
console.log("safety strings match:", L.safety === R.safety);

const onlyInB = b.find((e) => !a.some((x) => x.slug === e.slug));
console.log("a slug only in Cormac's file:", onlyInB.slug);
console.log("does it appear on the left page:", L.text.includes(onlyInB.label));

const offSite = (list) => list.filter((u) => !u.includes("fergusoreilly.dev"));
console.log("left off-site requests :", JSON.stringify(offSite(traffic.left)));
console.log("right off-site requests:", JSON.stringify(offSite(traffic.right)));
console.log("relay requests         :", JSON.stringify([...traffic.left, ...traffic.right].filter((u) => u.includes("/api/relay"))));

await browser.close();
JS
)"
```

Expected, and each line is the observation for one claim:

- `left read:` a real count out of the demo file's rows. **The reader works on a file the browser produced.**
- `offer blob chars:` a number in the low thousands, `compressed: true`. If `false`, `CompressionStream` is missing in that engine and the fallback took over, which is a finding rather than a fault.
- `left` and `right`: **37** on both, the same safety string, and the Síne row spelled `Síne Ní Dhomhnaill` on the left and `Sine Ni Dhomhnaill` on the right. **That pair of spellings is the whole tool.** The same spelling on both sides means a label crossed the wire.
- `does it appear on the left page:` **`false`**. A `true` here means one side is showing a name it never had.
- `left off-site requests` and `right off-site requests`: `[]`, or nothing but the analytics ingest path. **This is the "nothing leaves this tab" promise, checked on the wire.**
- `relay requests`: `[]`. The copy-and-paste route did not touch the server, which is the thing it claims.

Then the room code route against production:

```bash
curl -s -X POST https://fergusoreilly.dev/api/relay -H 'content-type: application/json' \
  -d '{"offer":"v=0\r\no=- 1 2 IN IP4 0.0.0.0\r\n"}' -w '\n%{http_code}\n'
curl -s "https://fergusoreilly.dev/api/relay?code=NOTACODE" -w '\n%{http_code}\n'
```

Expected, in the state this ships in: `503` with `{"error":"relay-unavailable"}` and a sentence naming copy and paste, and `400` with `bad-code` for the second. **A 500 on either is a stop-and-fix**: it means a real fault is being dressed up, or the store error is not the one being caught. If Redis has been provisioned by then, expect a code and a `404`/`no-room` respectively, and go back and run Task 14 Step 3 against production.

Then the phone check:

```bash
cd "$WT"
node scripts/phone-check.mjs --base https://fergusoreilly.dev --routes /tools/overlap
```

Expected: exit 0.

- [ ] **Step 6: Try it on one real export, which nothing has done**

Every test above ran on files this repository generated. The shapes in `slug.ts` and the preamble in `csv.ts` are written from the format rather than copied from a live file, and that is the largest single guess in this plan.

Request an export from `https://www.linkedin.com/mypreferences/d/download-my-data`, tick Connections, and when it arrives load it into the page on the live site. Then write down, from the counts line:

- How many rows, how many used, how many with no profile link. A very large `empty` count is either normal or a wrong column, and the column picker is what tells the two apart.
- Whether any row landed under `legacy-pub` or `not-a-profile`. Either is interesting: the first says old links are still in exports, the second says the URL column holds something this normaliser refuses.
- Whether the header was found without the picker appearing. If the picker appeared, the preamble or the header spelling has moved and `URL_HEADER` needs the real one, with a new case in `csv.test.ts` before it is called fixed.

If any of those disagrees with what Task 3 assumed, that is the finding this step exists for. Fix `csv.ts` or `slug.ts`, add the case, and say so in the ledger. **Do not** paste any part of the export into a commit, an issue or the ledger: it is other people's names.

- [ ] **Step 7: Check the event landed and carries nothing**

In PostHog, look for `tool_run` with `tool: "overlap"` from the runs above, within a few minutes. There should be one per side per completed exchange, one for each refusal, and none for saving the demo files. Confirm the payload carries `tool`, `outcome` and `ms` and nothing else, and that `ms` is a multiple of 100. A slug, a count or a room code in it is a stop-and-fix. If pageviews are arriving and this is not, read the `cookieless_server_hash_mode` note in AGENTS.md before blaming the tool.

- [ ] **Step 8: Close the ledger**

Set the T3 row to `**live**` with the deployment uid, and write the final log line stating both halves:

```markdown
- 2026-09-03: T3 live. Verified on https://fergusoreilly.dev/tools/overlap with two Chromium
  contexts driving the copy-and-paste route end to end: both sides printed 37 shared names, both
  computed the same safety string, each kept its own spelling of Síne Ní Dhomhnaill, a slug present
  only in Cormac's file appeared nowhere on Aoife's page, and neither context made a single
  off-site request or touched /api/relay. The relay answered <503 relay-unavailable / a code> in
  production and 400 bad-code for rubbish. The phone check passed at 390, 320 and the throttled
  Pixel. The tool_run event arrived with slug, outcome and milliseconds only, rounded to 100 ms.
  One real LinkedIn export was read: R rows, U used, E with no profile link, and the header was
  found <without the picker / only after picking column N, which is a correction to csv.ts>.
  Not verified: room codes against a real Upstash database <if 503 was what came back>, which waits
  on F4's provisioning; WebKit's data channel, because the live run used Chromium after the
  automation engine's WebRTC support was treated as unproven; any network with a symmetric NAT,
  where there is no TURN server and the answer is copy and paste; how long hashing 30,000 entries
  takes on a real phone, since the largest file anybody has put through it is <N> rows; and the
  security claim itself, which is an argument in the plan with a page that states its own limits,
  not something any test in this repository can settle.
```

- [ ] **Step 9: Commit the ledger straight to main**

```bash
cd /c/Dev/fergus-portfolio
git checkout main && git pull
git add docs/superpowers/programme/toolshed-ledger.md docs/PROGRESS.md
git commit -m "docs(ledger): T3 overlap is live, with what was and was not verified"
git push
```

Docs-only commits may land on `main` directly (AGENTS.md, Commands).

---

## Self-review

Run against the spec with fresh eyes, per the writing-plans skill, after the tasks were written. Gaps found were fixed inline before this plan was saved; each is listed with what changed.

**1. Spec coverage.** Walking design section 6, T3, clause by clause, plus the clauses sections 2, 5, 8 and 9 apply to every tool:

| Spec clause | Task |
|---|---|
| `/tools/overlap` | 11 |
| "Two people drop their LinkedIn `Connections.csv` into two tabs" | 3 (the reader), 11 (the input) |
| "a six-character room code from `api/relay`" | 6 (the alphabet and the generator), 8 (the routes) |
| "introduces the tabs over WebRTC" | 10 (`webrtc.ts`), 14 (the only observation that it does) |
| "one side generates a salt" | 4 (`newSalt`), 7 (the creator sends it, and only the creator) |
| "both hash every profile slug with it" | 2 (what a slug is), 4 (the hashing) |
| "only hashes cross the channel" | 7 (a test captures every frame and searches it), 10 (the fetch tripwire), 15 Step 5 (the wire, live) |
| "each side sees the intersection with names only from its own file" | 7 (the Síne test), 9 (the demo plants it), 14 and 15 (a person and a script both look at it) |
| "Relay stores the offer and answer in Redis for ten minutes and nothing else" | 8 (`ROOM_TTL_SEC`, two keys, and a test that they are two) |
| "the page offers the copy-paste route with no relay at all" | 10 (`packSdp`), 11 (the details block), 15 Step 5 (proved by an empty relay-request list) |
| "Bloom filters above 10,000 rows" | 5 (the threshold and the sizing), 7 (the mode decision per side) |
| "This relay is reused by Pong" | the frozen interface block at the head of this plan, and `lib/relay.ts` holding the pure half rather than the route |
| "Can't see: second-degree paths, warmth, changed slugs" | 1 (`cantSee`, five lines, the three named plus two the code forced) |
| Demo state, never an empty form (section 6 preamble) | 9, 11 |
| `tool_run` with slug and outcome, never the input (section 6, F3) | 11, and the coupling test that greps the call sites |
| Budgets per IP, per target and globally, refusal a sentence (section 5) | 8 |
| Every hosted tool proves its budget refuses (section 9) | 8's route tests, and F4's own integration test for `takeBudget` itself |
| Phone check at 390 and 320 on a real engine (section 9) | 13 |
| Mutation check on every new guard (section 9) | 12 |
| "can't see" list on the page, checked against the code (section 9) | 1 writes it, F3's `ToolPage` renders it, the reviewer checks it against `lib/tools/overlap/*` |
| "the verifier runs the exact flow, a 200 is not a pass" (section 9) | 15 Steps 5 to 7 |
| Every completion note states what was not verified (section 9) | 15 Step 8 |
| Tool owns `app/tools/<slug>/tool.css` (section 2, rule 2) | 11 |
| Only what the visitor explicitly saved (section 2, rule 1) | the storage grep in 11, and the sentence in 1 |
| No new dependencies (section 2, rule 3) | Global Constraints, and nothing in any task installs anything |

**Five gaps found and closed while reviewing.**

The first is the worst. The brief and the spec both say only hashes cross, and until the review there was **no test that looked at the frames**. Every test proved the intersection was right, which a tool that sent the whole list would also pass. Task 7 now captures every frame both sides send and searches the joined text for four slugs and three labels, and Task 10 does the same on the relay traffic. Without those two, the tool's central promise rested on reading the code.

Second, `ToolEntry.privacyNote` is specified by both T2 and T3, which run in parallel from F3. A plan that simply added it would produce a conflict for whichever branch merged second, on a file every tool touches. Task 1 Step 2 now checks and skips, and the Global Constraints name it as the one place the two sub-projects meet.

Third, the demo was going to be a canned result. That would have made it a picture of the protocol rather than an exercise of it, and a broken exchange would have shown a perfect demo. `runDemo` now drives the real `runExchange` through `pairedChannels`, which also means `pairedChannels` is production code rather than a test fixture, and the demo files are saveable so Task 14 has something to run the genuine two-tab flow with.

Fourth, the relay's Redis arithmetic contradicted the design. Section 5's table allows 20,000 commands a month for "relay, boards, crons" together, and a completed handshake costs about sixty commands, which at any usable cap is more than that on its own. Rather than quietly exceed it, the plan works the arithmetic out, sets the poll at four seconds over a sixty-second window to hold it to 37,000, states the correction in its own section, and shows the programme total still landing at 45% of the free tier. Two constants moved because of that: the poll interval and the global cap.

Fifth, nothing in Tasks 0 to 13 ever opened a connection, and the plan was on course to reach a pull request describing a WebRTC tool whose WebRTC had never run. Task 14 exists for that, before the PR rather than after it, with a table of what to look for and what each failure means. The word "untested" is now written into the Global Constraints, into `webrtc.test.ts`'s docblock, into the PR body and into the ledger line.

**2. Placeholder scan.** No "TBD", no "add error handling", no "similar to Task N", no "write tests for the above". Every code step carries the code. Eight places name something that has not happened yet and every one is labelled as a prediction with the action to take if it is wrong: the five phone-check guesses (Task 13), the three failure lines expected from the broken truncation (Task 12 Step 1), the fourteen anchors that must be checked before the mutation run (Task 12 Step 3), whether Redis answers at all (Tasks 8, 14 and 15), whether Playwright's WebKit holds a data channel (Task 15 Step 5), what a real export looks like (Task 15 Step 6), how long hashing takes on a phone (Tasks 4 and 14), and whether `CompressionStream` is present (Task 0 Step 4). That is the `CLAIMS.md` pattern, not a placeholder.

Three sets of numbers are arithmetic rather than measurement and are marked as such: the birthday table, which is `n^2 / 2^b`; the Bloom sizing, which is `-ln p / (ln 2)^2` and `(1 - e^(-k n / m))^k`; and the Redis command counts, which are additions of documented per-call costs. All three are checkable on the spot and none is a claim about a run. The one number that is neither is `11^6 = 1,771,561`, and the plan says plainly that it is a small space and what defends it.

**3. Type consistency.** Checked name by name across tasks:

- `Entry` is produced in Task 2's `types.ts` and consumed in 3, 7, 9 and 11. Task 11 imports it from `@/lib/tools/overlap/types` and nowhere else, so there is one definition.
- `Channel` is produced in Task 7's `protocol.ts` and consumed by `webrtc.ts` (Task 10) and by `demo.ts` (Task 9) through `pairedChannels`. `channelFrom` returns the same three methods, so a real data channel and a paired one are interchangeable at the type level, which is the whole point of the seam.
- `ExchangeResult` gained `theirMode` during the review. Both `mode` (what this side sent) and `theirMode` (what it received) are needed, because the false-positive sentence depends on what was received and the plan originally carried only one field. Task 7's tests assert both, and Task 11 reads `theirMode` for the copy.
- `SubtleLike` is defined once in `hash.ts` and threaded through `protocol.ts` as `input.subtle`. `safetyString` takes it too, so a test can drive every digest in one exchange through one injected implementation.
- `RelayFailure["error"]` in the client and `RelayError` in `lib/relay.ts` overlap but are not the same union: the client adds `gave-up`, which the server never sends, and drops `bad-request`, which the client cannot cause. That is deliberate and is stated where each is defined, because making them one type would put a server-only case into a client switch.
- `takeBudget`'s `BudgetRequest` is used with `tool: "overlap-relay"` in both routes, so the counters are one namespace and the poll cap and the create cap cannot collide with another tool's.
- `normaliseTypedCode` returns `string | null` and `isCode` is a type guard; the routes use `isCode` on untrusted input and the client uses `normaliseTypedCode` on typed input, which is the right way round: the server never repairs a code, and the page never sends one it has not repaired.
