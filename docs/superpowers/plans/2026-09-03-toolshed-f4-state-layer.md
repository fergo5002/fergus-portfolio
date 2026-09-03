# F4 State Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the site three free stores it can reach from a Vercel function (Upstash Redis, Neon Postgres, Vercel Blob), a budget layer on Redis that every replica agrees on, and one shared SSRF fence, with `headline-check` moved onto both and proven live.

**Architecture:** Three thin, env-guarded clients under `lib/store/` that throw a named error when their variable is missing and construct nothing at import. `lib/fence.ts` is the address and URL guard lifted out of `lib/headline-fetch.ts`; the fetch keeps its redirect loop and calls the fence on every hop. `lib/budget.ts` counts fixed windows in Redis with two commands a call, falls back to memory only outside production, and hashes the visitor's address with a daily salt so the raw IP is never stored. The stores are provisioned through the Vercel CLI as Marketplace integrations on the Hobby team, and the whole thing is proven in the Docker parity image and then against the live route.

**Tech Stack:** Next.js 15 (App Router, Node runtime), TypeScript, vitest (node environment, tests beside source), `@upstash/redis` (REST), `@neondatabase/serverless` (HTTP driver), `@vercel/blob`, Vercel CLI 58.4.4 on PATH (59.x via `npx --yes vercel@latest` also verified), Docker (`Dockerfile.parity`), GitHub CLI as `fergo5002`.

## Global Constraints

- Programme design: `docs/superpowers/specs/2026-09-03-toolshed-programme-design.md`, section 6 (F4), plus sections 4, 5, 8, 9 and 10. Acceptance from F4: "a budget of three is exhausted on the fourth call from two different function instances, proven with a test against a real Upstash database, and `headline-check` runs on the shared fence with its own tests green."
- Hosting is **Vercel only, on free tiers**. Free plans verified 2026-09-03: Upstash Redis 256 MB and 500,000 commands a month; Neon 0.5 GB and 100 compute-hours a month, pgvector available with `CREATE EXTENSION IF NOT EXISTS vector`; Vercel Blob Hobby allotment **unverified**, Task 1 reads and records it. Nothing moves to a paid plan without Fergus saying so.
- Vercel team `larry-pm` (`team_SW7xEyTEz5ftQj3cIxulWxKG`), project `fergus-portfolio` (`prj_NkKhUuc2coWnU08tOz2B1NPsf6Fx`), token `VERCEL_TOKEN_PERSONAL` in the shell environment. **Every `vercel` call passes `--token "$VERCEL_TOKEN_PERSONAL" --scope larry-pm`.** Without `--token` the CLI silently picks up `VERCEL_TOKEN`, which is the retired Presterly account, and fails with `Error: The specified scope does not exist`. That error means wrong token, not missing team.
- If any CLI step hands off to a browser, asks for terms to be accepted interactively, or prints a device-attestation URL, the task **stops** and reports "needs Fergus in the dashboard" with the exact command for him to run. Nobody automates a login.
- Dependencies this plan earns and nothing else: `@upstash/redis`, `@neondatabase/serverless`, `@vercel/blob`, each on its own commit with the reason in the message. `npm install --legacy-peer-deps` may be needed because of the `@vercel/analytics` optional `@sveltejs/kit` peer. A repo-wide `.npmrc` is forbidden; the committed lockfile must still install under strict `npm ci`, and the parity image is what proves it.
- **Never print a secret.** Every step that touches `.env.local`, `.env.vercel` or a store variable prints names only (`grep -oE '^[A-Z0-9_]+'`) or a redacted line. No `cat .env.local`, no `set -x`, no `echo $TOKEN`. The record file in `docs/` holds names, plan names, regions and quotas, never values.
- vitest only, node environment, tests beside source (`lib/x.ts` has `lib/x.test.ts`). `lib/budget.integration.test.ts` is the one file that touches the network and it skips itself unless a Redis variable is present.
- The interfaces in the block below are **frozen**: other sub-projects are being planned against these names in parallel. Additive extensions are allowed (an optional parameter, an extra field on a result, an extra export) and each one is called out where it is made. Nothing frozen is renamed or narrowed.
- Commit messages: lowercase `type(scope): declarative sentence`. British English, no em dashes, per `C:\Users\oreil\.claude\LANGUAGE.md`. Claims per `C:\Users\oreil\.claude\CLAIMS.md`: every "done" says what it did not verify.
- The repository is public and `main` is protected (F0). Code goes through a pull request on branch `toolshed/f4-state-layer` in its own worktree; docs-only commits may land on `main` directly. Never force-push. F4 starts only once the ledger shows F0 `merged` or `live`.
- `scripts/mutation-check.mjs` grows entries for every new guard (the fence rules, the budget comparison, the production fallback, the IP hash). A guard that survives its own mutation is decoration.

---

## File structure

| Path | Responsibility |
|---|---|
| `lib/store/errors.ts` (+ `.test.ts`) | `StoreUnavailableError`, the one error every missing-store path throws |
| `lib/store/redis.ts` (+ `.test.ts`) | `getRedis()`: Upstash REST client on first use, `UPSTASH_*` names first, `KV_*` names second |
| `lib/store/neon.ts` (+ `.test.ts`) | `getSql()`: Neon HTTP driver on first use, `DATABASE_URL` |
| `lib/store/blob.ts` (+ `.test.ts`) | `requireBlobToken()` and `getBlob()`: `@vercel/blob` calls with the token bound |
| `lib/fence.ts` (+ `.test.ts`) | The SSRF fence: address maths, `checkUrl`, `checkParsedUrl`, `resolveAndCheck` |
| `lib/headline-fetch.ts` (modified) | Keeps the redirect loop and the body handling; imports the fence for every hop |
| `lib/headline-fetch.test.ts` (appended) | Existing describes untouched; two tests added for the two new refusal reasons |
| `lib/budget.ts` (+ `.test.ts`, `.integration.test.ts`) | `takeBudget`, the Redis and memory implementations, `budgetKeyForIp`, the refusal sentence |
| `app/tools/headline-check/actions.ts` (modified) | Three budgets then the fence then the fetch |
| `app/tools/headline-check/state.ts` (modified) | `HEADLINE_BUDGETS`, the `storeDown` copy; `limited` copy removed |
| `app/tools/headline-check/rate-limit.ts`, `rate-limit.test.ts` (deleted) | Replaced by `lib/budget.ts` |
| `scripts/store-check.mjs` | Proves the three stores answer, prints nothing secret |
| `scripts/mutation-check.mjs` (appended) | Eleven new mutations for the fence and the budget |
| `.env.example`, `.gitignore` (one line) | The documented variable list, and the negation that lets it be committed |
| `AGENTS.md`, `docs/PROGRESS.md`, `docs/superpowers/programme/toolshed-ledger.md`, `docs/superpowers/programme/f4-stores-2026-09-03.md` | The words that match the code, and the provisioning record |

## Interfaces frozen across the programme

Written into every parallel plan. Reproduced here so a task implementer never has to guess a neighbour's name.

```ts
// lib/store/errors.ts
export class StoreUnavailableError extends Error {
  constructor(public readonly store: "redis" | "neon" | "blob", envVar: string);
}

// lib/store/redis.ts   (@upstash/redis, REST client)
export function getRedis(): Redis;                     // throws StoreUnavailableError when UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN is missing
// lib/store/neon.ts    (@neondatabase/serverless, HTTP driver)
export function getSql(): NeonQueryFunction<false, false>;  // throws StoreUnavailableError when DATABASE_URL is missing
// lib/store/blob.ts    (@vercel/blob)
export function requireBlobToken(): string;            // throws StoreUnavailableError when BLOB_READ_WRITE_TOKEN is missing

// lib/budget.ts
export type BudgetScope = "ip" | "target" | "global";
export type BudgetRequest = { tool: string; scope: BudgetScope; key: string; limit: number; windowSec: number };
export type BudgetResult = { ok: true; remaining: number } | { ok: false; remaining: 0; retryAfterSec: number; reason: string };
export async function takeBudget(req: BudgetRequest, now?: number): Promise<BudgetResult>;
export function budgetKeyForIp(headers: Headers): string;

// lib/fence.ts
export type FenceVerdict = { ok: true; url: URL } | { ok: false; reason: string };
export function checkUrl(input: string): FenceVerdict;
export async function resolveAndCheck(url: URL): Promise<FenceVerdict>;
export function isPrivateAddress(ip: string): boolean;
```

Additive extensions this plan makes, each compatible with code written against the block above:

- `StoreUnavailableError` also exposes `public readonly envVar: string`.
- `lib/store/redis.ts` also reads `KV_REST_API_URL` / `KV_REST_API_TOKEN` when the `UPSTASH_*` pair is absent, because that is what the Vercel Marketplace integration writes (Upstash's own docs, `redis/tutorials/nextjs_with_redis.mdx`). The error still names `UPSTASH_REDIS_REST_URL`.
- `lib/store/blob.ts` also exports `getBlob(): BlobStore`, the token-bound `put`/`head`/`list`/`del`.
- `FenceVerdict`'s refusal carries `code: FenceCode` beside `reason`, and its success may carry `addresses?: string[]` (the resolved addresses, kept for a caller that can pin a connection).
- `resolveAndCheck(url, resolver?)` takes an optional resolver so a test can inject one. `checkParsedUrl(url: URL)` is exported beside `checkUrl` so a caller holding a `URL` does not re-parse.
- `budgetKeyForIp` accepts `Pick<Headers, "get">`, which every `Headers` satisfies, so Next's `ReadonlyHeaders` passes without a cast.
- `lib/budget.ts` also exports `takeBudgetOnRedis`, `takeBudgetInMemory`, `refusalReason`, `budgetKey`, `MAX_TRACKED` and the `BudgetRedis` type, for tests and for a later caller that already holds a client.

**The redirect loop stays in `lib/headline-fetch.ts`.** `followWithFence` is not created. The only consumer of a `fetch`-driven redirect walk is the headline fetch itself: On the glass (T5) navigates a browser engine and applies the fence per navigation through a request hook, Tide (T7) calls fixed third-party APIs, and the census crawler (T6) runs on the home machine. Lifting a loop whose entire test contract (call counts, `redirect: "manual"`, abort semantics, seven distinct reasons) belongs to one caller would be a large change to a security-critical file for no second caller. The loop calls `checkParsedUrl` and `resolveAndCheck` on every hop, which is what the design asked for.

---

### Task 1: Provision the three stores on the Vercel project

**Files:**
- Create: `docs/superpowers/programme/f4-stores-2026-09-03.md`
- Modify: `docs/superpowers/programme/toolshed-ledger.md` (F4 row to `building`, log lines)
- Modify: `.env.local` in the main checkout and in the worktree (untracked, never committed)

**Interfaces:**
- Consumes: nothing in the tree. `VERCEL_TOKEN_PERSONAL` in the shell.
- Produces: the three resources connected to the project on all three environments, the variable names they write (recorded), and a `.env.local` in the worktree that later tasks source for the integration test and the store check.

- [ ] **Step 1: Confirm F0 is merged and the token reaches the right team**

```bash
grep -n "^| F0 " /c/Dev/fergus-portfolio/docs/superpowers/programme/toolshed-ledger.md
vercel --version
vercel --token "$VERCEL_TOKEN_PERSONAL" --scope larry-pm whoami
vercel --token "$VERCEL_TOKEN_PERSONAL" --scope larry-pm --cwd /c/Dev/fergus-portfolio integration installations
vercel --token "$VERCEL_TOKEN_PERSONAL" --scope larry-pm --cwd /c/Dev/fergus-portfolio blob list-stores
```

Expected: the F0 row reads `**merged**` or `**live**` (anything else: stop, F4 waits). `58.4.4` or newer. `whoami` prints the username that owns `larry-pm`. `No marketplace installations found` and `No blob stores connected to fergus-portfolio` (observed 2026-09-03; if either lists something, read it before creating a duplicate). `Error: The specified scope does not exist` means the token argument was dropped and the CLI fell back to `VERCEL_TOKEN`.

- [ ] **Step 2: Create the worktree and branch**

```powershell
powershell -NoProfile -File C:\Users\oreil\.claude\scripts\workspaces\workspaces.ps1 create -Repository C:\Dev\fergus-portfolio -Branch toolshed/f4-state-layer
powershell -NoProfile -File C:\Users\oreil\.claude\scripts\workspaces\workspaces.ps1 path -Repository C:\Dev\fergus-portfolio -Branch toolshed/f4-state-layer
```

Expected: a sibling worktree on a new branch cut from `main`. The `path` line is `WT` for the rest of this plan; substitute it literally in every later `cd "$WT"`. Then `cd "$WT" && git status --short` shows nothing, and `npm ci` is **not** run here (the checkout's `node_modules` are not shared; run `npm install --legacy-peer-deps` once in the worktree in Task 2, where the lockfile changes anyway).

- [ ] **Step 3: List Upstash's plans and metadata keys, and pick the free plan by name**

```bash
vercel --token "$VERCEL_TOKEN_PERSONAL" --scope larry-pm --cwd /c/Dev/fergus-portfolio integration add upstash/upstash-kv --help
```

Expected: the option list, and beneath it (on 59.x) the product's metadata keys and billing plans. Write down the plan id whose name is `Free` (or the one plan with no charge) as `UPSTASH_FREE_PLAN`, and note whether `region` and `eviction` are metadata keys. If the output shows no plan list at all, the 58.4.4 binary is printing generic help: rerun the same command through `npx --yes vercel@latest` (the coordinator observed the plan list on 59.11.2). **If no plan named Free appears in either output, stop and report:** the product may have changed its free tier and nobody guesses at a paid one.

- [ ] **Step 4: Create the Redis resource, without the automatic env pull**

`--no-env-pull` because the automatic pull would overwrite `.env.local`, which carries the hand-written PostHog comments. Metadata flags only if Step 3 listed the key: `-m region=us-east-1` (Vercel's `iad1` function region is in AWS `us-east-1`) and `-m eviction=false` (an evicted budget counter is a free run, so budgets must never be evicted).

```bash
vercel --token "$VERCEL_TOKEN_PERSONAL" --scope larry-pm --cwd /c/Dev/fergus-portfolio \
  integration add upstash/upstash-kv --non-interactive --plan "$UPSTASH_FREE_PLAN" \
  --name fergus-portfolio-redis --no-env-pull --json
```

Expected: exit 0 and a JSON object describing one resource named `fergus-portfolio-redis` connected to `fergus-portfolio`, with the plan named in it as the free one. Success is **both** of these, not exit 0 alone. Any of the following means stop and report "needs Fergus in the dashboard", with the command he runs (`vercel integration accept-terms upstash/upstash-kv --scope larry-pm` in an interactive terminal, or `https://vercel.com/marketplace/upstash` signed in as the `larry-pm` owner): output mentioning terms, legal, consent, "open in browser", a URL to visit, or device attestation. If the JSON shows a plan that is not free, remove the resource at once (`vercel integration resource remove fergus-portfolio-redis`) and report, because a paid resource on Hobby is a bill.

- [ ] **Step 5: Create the Neon resource the same way**

```bash
vercel --token "$VERCEL_TOKEN_PERSONAL" --scope larry-pm --cwd /c/Dev/fergus-portfolio integration add neon --help
```

Record `NEON_FREE_PLAN` from the plan list by the same rule (a plan named `Free`, nothing else), and whether `region` and a Postgres version are metadata keys. Then, with `-m region=aws-us-east-1` and the newest listed Postgres version only if those keys exist:

```bash
vercel --token "$VERCEL_TOKEN_PERSONAL" --scope larry-pm --cwd /c/Dev/fergus-portfolio \
  integration add neon --non-interactive --plan "$NEON_FREE_PLAN" \
  --name fergus-portfolio-neon --no-env-pull --json
```

Expected: exit 0, JSON naming one resource `fergus-portfolio-neon` on the free plan, connected to the project. Same stop rules as Step 4.

- [ ] **Step 6: Create the Blob store**

Blob is a Vercel product, not a Marketplace integration. `public` access: report screenshots are meant to be linked to, the SDK appends a random suffix to every pathname so nothing is enumerable, and nothing private will ever be written there (the constitution in AGENTS.md limits server state to anonymous aggregates and visitor-requested reports).

```bash
vercel --token "$VERCEL_TOKEN_PERSONAL" --scope larry-pm --cwd /c/Dev/fergus-portfolio \
  blob create-store fergus-portfolio-blob --access public --region iad1 --yes
vercel --token "$VERCEL_TOKEN_PERSONAL" --scope larry-pm --cwd /c/Dev/fergus-portfolio blob list-stores
```

Expected: a success line carrying a `store_...` id, then `list-stores` showing `fergus-portfolio-blob` connected to `fergus-portfolio`. If `create-store` reports a browser step, stop and report as above.

- [ ] **Step 7: Record which variable names were written, names only**

```bash
vercel --token "$VERCEL_TOKEN_PERSONAL" --scope larry-pm --cwd /c/Dev/fergus-portfolio env ls | grep -oE '^ [A-Z0-9_]+' | sort
```

Expected: the two that were there (`NEXT_PUBLIC_POSTHOG_KEY`, `RESEND_API_KEY`) plus, from Upstash, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `KV_REST_API_READ_ONLY_TOKEN`, `KV_URL`, `REDIS_URL` (the integration may instead or also write `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`; either pair is read by Task 2's client, record which appeared); from Neon, `DATABASE_URL` at least, usually with `DATABASE_URL_UNPOOLED`, `PGHOST`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `POSTGRES_URL` and friends; from Blob, `BLOB_READ_WRITE_TOKEN`. **If `DATABASE_URL` or `BLOB_READ_WRITE_TOKEN` is absent, or neither Redis pair is present, stop:** the resource was created but not connected, and `vercel integration resource connect <name>` is the repair, not a code change.

- [ ] **Step 8: Pull the development variables to a scratch file and merge them into both `.env.local` files**

`env pull` overwrites its target and `.env.local` already holds `NEXT_PUBLIC_POSTHOG_KEY` with its comments, so pull to `.env.vercel` and append only the store lines. Both files are gitignored (`.env*`). The worktree has no `.env.local` of its own yet, so it gets a copy of the main one first.

```bash
cd /c/Dev/fergus-portfolio
vercel --token "$VERCEL_TOKEN_PERSONAL" --scope larry-pm --cwd /c/Dev/fergus-portfolio env pull .env.vercel --environment development --yes
grep -oE '^[A-Z0-9_]+' .env.vercel | sort
cp .env.local "$WT/.env.local"
for f in .env.local "$WT/.env.local"; do
  printf '\n# Stores, pulled from Vercel on %s. Secrets: never print this file.\n' "$(date -I)" >> "$f"
  grep -E '^(UPSTASH_REDIS_REST_URL|UPSTASH_REDIS_REST_TOKEN|KV_REST_API_URL|KV_REST_API_TOKEN|KV_REST_API_READ_ONLY_TOKEN|KV_URL|REDIS_URL|DATABASE_URL|DATABASE_URL_UNPOOLED|PG[A-Z_]*|POSTGRES_[A-Z_]*|NEON_[A-Z_]*|BLOB_READ_WRITE_TOKEN)=' .env.vercel >> "$f"
done
rm .env.vercel
grep -oE '^[A-Z0-9_]+' .env.local | sort
git -C /c/Dev/fergus-portfolio status --short
git -C "$WT" status --short
```

Expected: the name lists include the store names from Step 7; `NEXT_PUBLIC_POSTHOG_KEY` is still the first uncommented name in `.env.local`; both `git status` lines are empty (nothing env-shaped is tracked, and `.env.vercel` is gone). A later `vercel env pull` must go through this same merge, and `.env.example` (Task 6) says so in its header.

- [ ] **Step 9: Prove the Redis instrument with one command, printing only the answer**

```bash
cd "$WT"
set -a; . ./.env.local; set +a
URL="${UPSTASH_REDIS_REST_URL:-$KV_REST_API_URL}"; TOKEN="${UPSTASH_REDIS_REST_TOKEN:-$KV_REST_API_TOKEN}"
curl -s -H "Authorization: Bearer $TOKEN" "$URL/ping"; echo
curl -s -H "Authorization: Bearer $TOKEN" "$URL/dbsize"; echo
```

Expected: `{"result":"PONG"}` and `{"result":0}` (a fresh database has no keys). Anything else is about the credentials or the URL, not about code that does not exist yet. Two commands spent on the 500,000-a-month meter; note them in the record. Neon and Blob are proven in Task 2 once their SDKs are installed.

- [ ] **Step 10: Read the Blob quota and write it down**

Fetch `https://vercel.com/docs/vercel-blob/usage-and-pricing` (WebFetch, or open it) and copy the **Hobby** row: included storage, data transfer, simple operations, advanced operations, and the sentence on what happens when Hobby exceeds it. Then open the Vercel dashboard, `larry-pm` team, Storage, `fergus-portfolio-blob`, Usage, and note what it shows for the current period. If the two disagree, the dashboard is the meter and the docs are the claim; record both.

- [ ] **Step 11: Write the record and the ledger, and commit them on the branch**

`docs/superpowers/programme/f4-stores-2026-09-03.md`, with the real values observed above in place of the angle brackets (names, plan names, regions, quota figures, counts; never a token or URL):

```markdown
# F4 stores, provisioned 2026-09-03

Team `larry-pm`, project `fergus-portfolio`, all three environments. CLI `<version>`, run with `--token "$VERCEL_TOKEN_PERSONAL" --scope larry-pm`.

| Store | Resource | Plan (as printed) | Region | Variables written | Quota (verified) | Proof |
|---|---|---|---|---|---|---|
| Upstash Redis | `fergus-portfolio-redis` | `<plan name>` | `<region>` | `<names>` | 256 MB, 500,000 commands a month | `PING` answered `PONG`, `DBSIZE` 0 |
| Neon Postgres | `fergus-portfolio-neon` | `<plan name>` | `<region>` | `<names>` | 0.5 GB, 100 compute-hours a month | Task 2 store check |
| Vercel Blob | `fergus-portfolio-blob` (`store_<id>`) | Hobby | `iad1` | `BLOB_READ_WRITE_TOKEN` | `<Hobby row from the docs, and the dashboard reading>` | Task 2 store check |

Metadata keys the CLI offered: Upstash `<keys>`, Neon `<keys>`. Eviction: `<off | key not offered>`.

Redis commands spent by provisioning checks: 2.

Not verified here: the Neon and Blob connections (Task 2), that production functions see the variables (Task 7's live check), and the Blob quota as a measured number rather than a documented one.
```

Ledger: F4 row to `**building**` with the branch name; log line `2026-09-03: F4 Task 1 done. Three stores provisioned from the CLI, no dashboard step needed` (or the exact step that needed Fergus, if one did). Then:

```bash
cd "$WT"
git add docs/superpowers/programme/f4-stores-2026-09-03.md docs/superpowers/programme/toolshed-ledger.md
git commit -m "docs(programme): record the three stores provisioned for the state layer"
```

---

### Task 2: The three dependencies and the store clients

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create: `lib/store/errors.ts`, `lib/store/errors.test.ts`
- Create: `lib/store/redis.ts`, `lib/store/redis.test.ts`
- Create: `lib/store/neon.ts`, `lib/store/neon.test.ts`
- Create: `lib/store/blob.ts`, `lib/store/blob.test.ts`
- Create: `scripts/store-check.mjs`

**Interfaces:**
- Consumes: the environment variable names recorded in Task 1.
- Produces: `StoreUnavailableError(store, envVar)` with `.store`, `.envVar`; `getRedis(): Redis`; `getSql(): NeonQueryFunction<false, false>`; `requireBlobToken(): string`; `getBlob(): BlobStore`. Task 4 imports `getRedis` and `StoreUnavailableError`. Task 7 runs `scripts/store-check.mjs`.

- [ ] **Step 1: Install the worktree's modules, then add the three dependencies as three commits**

Try strict peers first. The known failure is `ERESOLVE` naming `@sveltejs/kit` or `vite@8`, from `@vercel/analytics`'s optional peer; only then add `--legacy-peer-deps`, and only on the command line, never in a `.npmrc`.

```bash
cd "$WT"
npm install --legacy-peer-deps
npm install @upstash/redis || npm install @upstash/redis --legacy-peer-deps
npm ls @upstash/redis
git add package.json package-lock.json
git commit -m "chore(deps): add @upstash/redis so budgets are counted where every replica can see them"

npm install @neondatabase/serverless || npm install @neondatabase/serverless --legacy-peer-deps
npm ls @neondatabase/serverless
git add package.json package-lock.json
git commit -m "chore(deps): add @neondatabase/serverless for the census tables and the tide cache over http"

npm install @vercel/blob || npm install @vercel/blob --legacy-peer-deps
npm ls @vercel/blob
git add package.json package-lock.json
git commit -m "chore(deps): add @vercel/blob because a screenshot will not fit in a 4.5 mb function response"
```

Expected: each `npm ls` prints one line with a version and no `UNMET` or `invalid`. `git diff --stat HEAD~3` touches only `package.json` and `package-lock.json`. Whether strict peers or `--legacy-peer-deps` was needed goes in the ledger log; `npm ci` in Task 7's parity image is what proves the lockfile is clean either way.

- [ ] **Step 2: Write the failing test for the error**

`lib/store/errors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { StoreUnavailableError } from "./errors";

/**
 * One error for every missing store. Every catch block in the repo that wants
 * to turn "the store is not configured" into a sentence keys on this class,
 * so what is pinned here is the contract those blocks lean on: the name, the
 * two fields, and that `instanceof` survives a throw.
 */
describe("StoreUnavailableError", () => {
  it("names the store and the variable, and points at .env.example", () => {
    const error = new StoreUnavailableError("neon", "DATABASE_URL");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("StoreUnavailableError");
    expect(error.store).toBe("neon");
    expect(error.envVar).toBe("DATABASE_URL");
    expect(error.message).toContain("DATABASE_URL");
    expect(error.message).toContain(".env.example");
  });

  it("survives instanceof across a throw", () => {
    try {
      throw new StoreUnavailableError("redis", "UPSTASH_REDIS_REST_URL");
    } catch (caught) {
      expect(caught instanceof StoreUnavailableError).toBe(true);
      expect((caught as StoreUnavailableError).store).toBe("redis");
    }
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `cd "$WT" && npx vitest run lib/store/errors.test.ts`
Expected: FAIL, `Failed to resolve import "./errors"`.

- [ ] **Step 4: Write the error**

`lib/store/errors.ts`:

```ts
/**
 * The one error every missing store throws.
 *
 * The design's rule for the state layer is that a missing store fails loudly:
 * in CI, in a preview, in production, the first request that needs a store
 * whose variable is not set throws this, naming the variable, and nothing
 * degrades into a quieter, wronger version of itself. The single exception
 * is `lib/budget.ts` outside production, and that module says so.
 *
 * The message names the variable and never its value, because this error
 * ends up in function logs and in the odd test failure.
 */

export type StoreName = "redis" | "neon" | "blob";

export class StoreUnavailableError extends Error {
  readonly envVar: string;

  constructor(
    public readonly store: StoreName,
    envVar: string,
  ) {
    super(`The ${store} store is not configured: ${envVar} is not set. See .env.example.`);
    this.name = "StoreUnavailableError";
    this.envVar = envVar;
  }
}
```

- [ ] **Step 5: Run it to see it pass, and commit**

Run: `cd "$WT" && npx vitest run lib/store/errors.test.ts`
Expected: 2 passed.

```bash
cd "$WT"
git add lib/store/errors.ts lib/store/errors.test.ts
git commit -m "feat(store): one named error for every store that is not configured"
```

- [ ] **Step 6: Write the failing test for the Redis client**

`lib/store/redis.test.ts`. The SDK is mocked with a class wrapping a hoisted spy, so the test can say how many clients were built and with what, and the "nothing at import" case re-imports a fresh module instance to prove it on its own rather than by test order.

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StoreUnavailableError } from "./errors";

const { ctor } = vi.hoisted(() => ({ ctor: vi.fn() }));

vi.mock("@upstash/redis", () => ({
  Redis: class {
    constructor(options: unknown) {
      ctor(options);
    }
  },
}));

/**
 * Four variable names, two of which the Vercel Marketplace integration writes
 * (`KV_*`) and two of which Upstash's console and docs use (`UPSTASH_*`). The
 * client reads the Upstash pair first. Every test starts with all four unset,
 * so a laptop that happens to have a real database in its shell cannot make a
 * failing case pass.
 */
const NAMES = [
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
] as const;
const saved = new Map<string, string | undefined>();

beforeEach(() => {
  for (const name of NAMES) {
    saved.set(name, process.env[name]);
    delete process.env[name];
  }
  ctor.mockClear();
});

afterEach(() => {
  for (const name of NAMES) {
    const value = saved.get(name);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

async function fresh() {
  vi.resetModules();
  return import("./redis");
}

describe("getRedis", () => {
  it("constructs nothing at import time", async () => {
    await fresh();
    expect(ctor).not.toHaveBeenCalled();
  });

  it("throws the named error for the URL before anything is built", async () => {
    const { getRedis } = await fresh();
    process.env.UPSTASH_REDIS_REST_TOKEN = "token-that-must-not-leak";
    let caught: unknown;
    try {
      getRedis();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(StoreUnavailableError);
    const error = caught as StoreUnavailableError;
    expect(error.store).toBe("redis");
    expect(error.envVar).toBe("UPSTASH_REDIS_REST_URL");
    expect(error.message).not.toContain("token-that-must-not-leak");
    expect(ctor).not.toHaveBeenCalled();
  });

  it("throws the named error for the token when only the URL is set", async () => {
    const { getRedis } = await fresh();
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    expect(() => getRedis()).toThrow(StoreUnavailableError);
    expect(() => getRedis()).toThrow(/UPSTASH_REDIS_REST_TOKEN/);
    expect(ctor).not.toHaveBeenCalled();
  });

  it("builds one client from the Upstash pair and reuses it", async () => {
    const { getRedis } = await fresh();
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "t1";
    const first = getRedis();
    const second = getRedis();
    expect(second).toBe(first);
    expect(ctor).toHaveBeenCalledTimes(1);
    expect(ctor).toHaveBeenCalledWith({ url: "https://example.upstash.io", token: "t1" });
  });

  it("falls back to the KV pair the Vercel integration writes", async () => {
    const { getRedis } = await fresh();
    process.env.KV_REST_API_URL = "https://kv.upstash.io";
    process.env.KV_REST_API_TOKEN = "t2";
    getRedis();
    expect(ctor).toHaveBeenCalledWith({ url: "https://kv.upstash.io", token: "t2" });
  });

  it("prefers the Upstash pair when both are present", async () => {
    const { getRedis } = await fresh();
    process.env.KV_REST_API_URL = "https://kv.upstash.io";
    process.env.KV_REST_API_TOKEN = "kv";
    process.env.UPSTASH_REDIS_REST_URL = "https://up.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "up";
    getRedis();
    expect(ctor).toHaveBeenCalledWith({ url: "https://up.upstash.io", token: "up" });
  });

  it("builds a new client when the variables change", async () => {
    const { getRedis } = await fresh();
    process.env.UPSTASH_REDIS_REST_URL = "https://a.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "t";
    const a = getRedis();
    process.env.UPSTASH_REDIS_REST_URL = "https://b.upstash.io";
    const b = getRedis();
    expect(b).not.toBe(a);
    expect(ctor).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 7: Run it to see it fail**

Run: `cd "$WT" && npx vitest run lib/store/redis.test.ts`
Expected: FAIL, `Failed to resolve import "./redis"`.

- [ ] **Step 8: Write the Redis client**

`lib/store/redis.ts`:

```ts
import { Redis } from "@upstash/redis";
import { StoreUnavailableError } from "./errors";

/**
 * Upstash Redis over REST, built on first use and never at import.
 *
 * ## Why REST
 *
 * A Vercel function is a process that freezes between requests. A TCP client
 * that keeps a socket open across that freeze fails on the first request
 * after it, and the failure looks like a random timeout. `@upstash/redis` is
 * one HTTPS request per command, or per pipeline, which is the right shape
 * for a function that lives for a hundred milliseconds. It is also metered
 * the same way in the Upstash console as it is sent from here, so the command
 * count on the usage page is the command count this code produced.
 *
 * ## Two names for the same two variables
 *
 * The Vercel Marketplace integration writes `KV_REST_API_URL` and
 * `KV_REST_API_TOKEN`, a naming inherited from Vercel KV. Upstash's console
 * and every one of its examples use `UPSTASH_REDIS_REST_URL` and
 * `UPSTASH_REDIS_REST_TOKEN`, which is what `.env.example` documents and what
 * the programme's frozen interface names. This reads the Upstash pair first
 * and the KV pair second, so a hand-provisioned database and an
 * integration-provisioned one both work, and the error names the Upstash
 * variable because that is the one a reader will find documented.
 *
 * ## Nothing at import time
 *
 * `getRedis()` is a function rather than a module-level constant because a
 * module that builds its client on load throws during `next build` on any
 * machine without the store, and that turns "the parity image carries no
 * secrets" from a safety property into a build failure. The test pins it.
 */

export const REDIS_URL_VARS = ["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL"] as const;
export const REDIS_TOKEN_VARS = ["UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_TOKEN"] as const;

function firstSet(names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  return undefined;
}

let cached: { url: string; token: string; client: Redis } | null = null;

export function getRedis(): Redis {
  const url = firstSet(REDIS_URL_VARS);
  if (!url) throw new StoreUnavailableError("redis", REDIS_URL_VARS[0]);
  const token = firstSet(REDIS_TOKEN_VARS);
  if (!token) throw new StoreUnavailableError("redis", REDIS_TOKEN_VARS[0]);

  if (cached && cached.url === url && cached.token === token) return cached.client;
  const client = new Redis({ url, token });
  cached = { url, token, client };
  return client;
}
```

- [ ] **Step 9: Run it to see it pass, and commit**

Run: `cd "$WT" && npx vitest run lib/store/redis.test.ts`
Expected: 7 passed.

```bash
cd "$WT"
git add lib/store/redis.ts lib/store/redis.test.ts
git commit -m "feat(store): the redis client, built on first use and reading both variable spellings"
```

- [ ] **Step 10: Write the failing test for the Neon client**

`lib/store/neon.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StoreUnavailableError } from "./errors";

const { neonSpy, fakeSql } = vi.hoisted(() => ({
  neonSpy: vi.fn(),
  fakeSql: Object.assign(async () => [], { name: "fakeSql" }),
}));

vi.mock("@neondatabase/serverless", () => ({
  neon: (url: string) => {
    neonSpy(url);
    return fakeSql;
  },
}));

const saved = new Map<string, string | undefined>();

beforeEach(() => {
  saved.set("DATABASE_URL", process.env.DATABASE_URL);
  delete process.env.DATABASE_URL;
  neonSpy.mockClear();
});

afterEach(() => {
  const value = saved.get("DATABASE_URL");
  if (value === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = value;
});

async function fresh() {
  vi.resetModules();
  return import("./neon");
}

describe("getSql", () => {
  it("constructs nothing at import time", async () => {
    await fresh();
    expect(neonSpy).not.toHaveBeenCalled();
  });

  it("throws the named error when DATABASE_URL is missing", async () => {
    const { getSql } = await fresh();
    expect(() => getSql()).toThrow(StoreUnavailableError);
    expect(() => getSql()).toThrow(/DATABASE_URL/);
    expect(neonSpy).not.toHaveBeenCalled();
  });

  it("builds the driver from DATABASE_URL once and reuses it", async () => {
    const { getSql } = await fresh();
    process.env.DATABASE_URL = "postgres://user:pass@ep.example.neon.tech/db?sslmode=require";
    const first = getSql();
    const second = getSql();
    expect(first).toBe(fakeSql);
    expect(second).toBe(first);
    expect(neonSpy).toHaveBeenCalledTimes(1);
    expect(neonSpy).toHaveBeenCalledWith("postgres://user:pass@ep.example.neon.tech/db?sslmode=require");
  });

  it("builds the message from the name and nothing else", async () => {
    const { getSql } = await fresh();
    let message = "";
    try {
      getSql();
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toBe("The neon store is not configured: DATABASE_URL is not set. See .env.example.");
  });
});
```

- [ ] **Step 11: Run it to see it fail**

Run: `cd "$WT" && npx vitest run lib/store/neon.test.ts`
Expected: FAIL, `Failed to resolve import "./neon"`.

- [ ] **Step 12: Write the Neon client**

`lib/store/neon.ts`:

```ts
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { StoreUnavailableError } from "./errors";

/**
 * Neon Postgres over HTTP, built on first use and never at import.
 *
 * `neon(url)` is the HTTP driver: one request per query, no connection to
 * keep alive, no pool to drain when the function freezes. That is the shape a
 * serverless function wants and the reason `DATABASE_URL` alone is enough.
 * There is deliberately no `Pool` and no WebSocket transport here. A
 * transaction that spans requests is not something this site does, and the
 * tools that read Neon (the census, Tide's cache) read through ISR so the
 * compute stays asleep between rebuilds.
 *
 * The return type is the tagged template: rows come back as plain objects.
 * Use it as a tag, never by building a string, because the tag is what turns
 * interpolations into parameters.
 *
 * Built lazily for the same reason as `getRedis`: a client built at import
 * time fails `next build` on any machine without the variable, and the parity
 * image has none on purpose.
 */

export const DATABASE_URL_VAR = "DATABASE_URL";

let cached: { url: string; sql: NeonQueryFunction<false, false> } | null = null;

export function getSql(): NeonQueryFunction<false, false> {
  const url = process.env[DATABASE_URL_VAR];
  if (!url) throw new StoreUnavailableError("neon", DATABASE_URL_VAR);

  if (cached && cached.url === url) return cached.sql;
  const sql = neon(url);
  cached = { url, sql };
  return sql;
}
```

- [ ] **Step 13: Run it to see it pass, and commit**

Run: `cd "$WT" && npx vitest run lib/store/neon.test.ts`
Expected: 4 passed.

```bash
cd "$WT"
git add lib/store/neon.ts lib/store/neon.test.ts
git commit -m "feat(store): the neon http driver, built on first use"
```

- [ ] **Step 14: Write the failing test for the Blob helper**

`lib/store/blob.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StoreUnavailableError } from "./errors";

const spies = vi.hoisted(() => ({
  put: vi.fn(async () => ({ url: "https://blob.example/a.png" })),
  head: vi.fn(async () => ({ size: 1 })),
  list: vi.fn(async () => ({ blobs: [], hasMore: false })),
  del: vi.fn(async () => undefined),
}));

vi.mock("@vercel/blob", () => spies);

const saved = new Map<string, string | undefined>();

beforeEach(() => {
  saved.set("BLOB_READ_WRITE_TOKEN", process.env.BLOB_READ_WRITE_TOKEN);
  delete process.env.BLOB_READ_WRITE_TOKEN;
  for (const spy of Object.values(spies)) spy.mockClear();
});

afterEach(() => {
  const value = saved.get("BLOB_READ_WRITE_TOKEN");
  if (value === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
  else process.env.BLOB_READ_WRITE_TOKEN = value;
});

async function fresh() {
  vi.resetModules();
  return import("./blob");
}

describe("requireBlobToken", () => {
  it("throws the named error when the token is missing", async () => {
    const { requireBlobToken } = await fresh();
    expect(() => requireBlobToken()).toThrow(StoreUnavailableError);
    expect(() => requireBlobToken()).toThrow(/BLOB_READ_WRITE_TOKEN/);
  });

  it("returns the token when it is set", async () => {
    const { requireBlobToken } = await fresh();
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
    expect(requireBlobToken()).toBe("vercel_blob_rw_test");
  });
});

describe("getBlob", () => {
  it("calls nothing at import time", async () => {
    await fresh();
    for (const spy of Object.values(spies)) expect(spy).not.toHaveBeenCalled();
  });

  it("refuses to build without the token", async () => {
    const { getBlob } = await fresh();
    expect(() => getBlob()).toThrow(StoreUnavailableError);
  });

  it("binds the token onto every call so no caller reads the environment", async () => {
    const { getBlob } = await fresh();
    process.env.BLOB_READ_WRITE_TOKEN = "tok";
    const blob = getBlob();

    await blob.put("reports/a.png", "bytes", { access: "public", contentType: "image/png" });
    expect(spies.put).toHaveBeenCalledWith("reports/a.png", "bytes", {
      access: "public",
      contentType: "image/png",
      token: "tok",
    });

    await blob.head("https://blob.example/a.png");
    expect(spies.head).toHaveBeenCalledWith("https://blob.example/a.png", { token: "tok" });

    await blob.list({ prefix: "reports/" });
    expect(spies.list).toHaveBeenCalledWith({ prefix: "reports/", token: "tok" });

    await blob.list();
    expect(spies.list).toHaveBeenLastCalledWith({ token: "tok" });

    await blob.del(["https://blob.example/a.png"]);
    expect(spies.del).toHaveBeenCalledWith(["https://blob.example/a.png"], { token: "tok" });
  });
});
```

- [ ] **Step 15: Run it to see it fail**

Run: `cd "$WT" && npx vitest run lib/store/blob.test.ts`
Expected: FAIL, `Failed to resolve import "./blob"`.

- [ ] **Step 16: Write the Blob helper**

`lib/store/blob.ts`:

```ts
import { del, head, list, put } from "@vercel/blob";
import { StoreUnavailableError } from "./errors";

/**
 * Vercel Blob, with the token bound so no caller ever reads the environment.
 *
 * `@vercel/blob` reads `BLOB_READ_WRITE_TOKEN` from `process.env` on its own
 * when no token is passed, which is convenient and is exactly the behaviour
 * this file exists to remove: a caller that forgot the variable would get a
 * runtime error from inside the SDK, on the first write, in production,
 * rather than `StoreUnavailableError` naming the variable. `requireBlobToken`
 * is the guard, `getBlob` is the guard applied to every call.
 *
 * Store `fergus-portfolio-blob` is public (Task 1 of the F4 plan says why):
 * every pathname gets the SDK's random suffix, nothing enumerable is written,
 * and the things that go there (On the glass screenshots, filmstrips) are
 * meant to be linked to from a report. Nothing private is ever put here.
 */

export const BLOB_TOKEN_VAR = "BLOB_READ_WRITE_TOKEN";

export function requireBlobToken(): string {
  const token = process.env[BLOB_TOKEN_VAR];
  if (!token) throw new StoreUnavailableError("blob", BLOB_TOKEN_VAR);
  return token;
}

type PutBody = Parameters<typeof put>[1];
type PutOptions = NonNullable<Parameters<typeof put>[2]>;
type ListOptions = NonNullable<Parameters<typeof list>[0]>;

export type BlobStore = {
  put(pathname: string, body: PutBody, options: Omit<PutOptions, "token">): ReturnType<typeof put>;
  head(url: string): ReturnType<typeof head>;
  list(options?: Omit<ListOptions, "token">): ReturnType<typeof list>;
  del(urls: string | string[]): ReturnType<typeof del>;
};

export function getBlob(): BlobStore {
  const token = requireBlobToken();
  return {
    // `PutOptions` is a union in the SDK's types and `Omit` over a union keeps
    // only the shared keys, so the spread is widened back rather than typed
    // through. The test asserts the exact object that reaches the SDK.
    put: (pathname, body, options) => put(pathname, body, { ...options, token } as PutOptions),
    head: (url) => head(url, { token }),
    list: (options) => list({ ...options, token }),
    del: (urls) => del(urls, { token }),
  };
}
```

- [ ] **Step 17: Run it to see it pass, typecheck, and commit**

Run: `cd "$WT" && npx vitest run lib/store/blob.test.ts && npx tsc --noEmit`
Expected: 5 passed, `tsc` silent. If `tsc` rejects the `as PutOptions` cast because the SDK's type is not a union in the installed version, delete the cast and the comment above it; the test is unchanged either way.

```bash
cd "$WT"
git add lib/store/blob.ts lib/store/blob.test.ts
git commit -m "feat(store): blob calls with the token bound, so nothing reads the environment twice"
```

- [ ] **Step 18: Write the store check script**

`scripts/store-check.mjs`. Committed rather than kept in a scratchpad because the repo's rule (see `scripts/mutation-check.mjs`'s docblock) is that a check nobody can re-run is a claim, and every hosted tool's verifier will want this one.

```js
/**
 * Proves the three stores answer, printing nothing that could be a secret.
 *
 * Run from the repo root with the variables in the environment:
 *
 *     set -a; . ./.env.local; set +a; node scripts/store-check.mjs
 *
 * Exit code 0 means every configured store answered. A store with no variable
 * set prints "not configured" and does not fail the run, because a laptop
 * without a Blob token is a normal state and this is a check, not a gate. A
 * store that is configured and does not answer fails the run: that is the
 * state that would take a live tool down.
 *
 * Every error message passes through `redact` before it is printed, so a
 * driver that echoes the connection string on a bad password cannot echo it
 * here. Two Redis commands (PING, DBSIZE) are spent per run.
 */
import { Redis } from "@upstash/redis";
import { neon } from "@neondatabase/serverless";
import { list } from "@vercel/blob";

const SECRET_VARS = [
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "KV_REST_API_READ_ONLY_TOKEN",
  "KV_URL",
  "REDIS_URL",
  "DATABASE_URL",
  "DATABASE_URL_UNPOOLED",
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
  "POSTGRES_PASSWORD",
  "PGPASSWORD",
  "BLOB_READ_WRITE_TOKEN",
  "RESEND_API_KEY",
];

function redact(text) {
  let out = String(text);
  for (const name of SECRET_VARS) {
    const value = process.env[name];
    if (value && value.length >= 8) out = out.split(value).join(`<${name}>`);
  }
  return out;
}

async function check(name, configured, run) {
  if (!configured) {
    console.log(`${name}: not configured`);
    return true;
  }
  try {
    console.log(`${name}: ${await run()}`);
    return true;
  } catch (error) {
    const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.log(`${name}: FAILED ${redact(text)}`);
    return false;
  }
}

const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

const results = await Promise.all([
  check("redis", Boolean(redisUrl && redisToken), async () => {
    const redis = new Redis({ url: redisUrl, token: redisToken });
    const pong = await redis.ping();
    const size = await redis.dbsize();
    return `${pong}, ${size} keys`;
  }),
  check("neon", Boolean(process.env.DATABASE_URL), async () => {
    const sql = neon(process.env.DATABASE_URL);
    const [{ version }] = await sql`select version()`;
    await sql`create extension if not exists vector`;
    const [{ extversion }] = await sql`select extversion from pg_extension where extname = 'vector'`;
    return `${version.split(" on ")[0]}, vector ${extversion}`;
  }),
  check("blob", Boolean(process.env.BLOB_READ_WRITE_TOKEN), async () => {
    const { blobs } = await list({ limit: 1 });
    return blobs.length === 0 ? "reachable, empty" : "reachable, has blobs";
  }),
]);

if (!results.every(Boolean)) process.exitCode = 1;
```

- [ ] **Step 19: Run it against the real stores, then without any variables**

```bash
cd "$WT"
set -a; . ./.env.local; set +a
node scripts/store-check.mjs; echo "exit $?"
env -u UPSTASH_REDIS_REST_URL -u KV_REST_API_URL -u DATABASE_URL -u BLOB_READ_WRITE_TOKEN node scripts/store-check.mjs; echo "exit $?"
```

Expected, first run: `redis: PONG, 0 keys`, `neon: PostgreSQL 1x.y, vector 0.z.w`, `blob: reachable, empty`, `exit 0`. Second run: three `not configured` lines and `exit 0`. A `FAILED` line is a real finding about that store's variable or network, and the fix is in Task 1's provisioning, not here. Copy the three answer lines into `f4-stores-2026-09-03.md` under "Proof" and add 2 to its Redis command count.

- [ ] **Step 20: Commit the script and the record**

```bash
cd "$WT"
git add scripts/store-check.mjs docs/superpowers/programme/f4-stores-2026-09-03.md
git commit -m "chore(scripts): a store check that proves the three stores answer and prints no secret"
```

---

### Task 3: The fence, lifted out of the headline fetch

**Files:**
- Create: `lib/fence.ts`, `lib/fence.test.ts`
- Modify: `lib/headline-fetch.ts` (the address maths and `normaliseUrl` leave; the guard calls the fence; two reasons added)
- Modify: `lib/headline-fetch.test.ts` (append one describe at the end; every existing describe untouched)
- Modify: `scripts/mutation-check.mjs` (six fence entries)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `isPrivateAddress(ip)`, `isLocalName(hostname)`, `normaliseUrl(raw)`, `checkUrl(input)`, `checkParsedUrl(url)`, `resolveAndCheck(url, resolver?)`, types `FenceCode`, `FenceVerdict`, `Resolved`, `Resolver`. `lib/headline-fetch.ts` keeps exporting `isBlockedAddress` (an alias of `isPrivateAddress`) and `normaliseUrl` so its existing test compiles unchanged. Task 5 calls `checkUrl` from the action.

- [ ] **Step 1: Write the failing fence test**

`lib/fence.test.ts`. The address tables are the ones from `headline-fetch.test.ts`, moved to their new home, plus the cases the programme asked for by name: v4-mapped v6 in both spellings and inside a URL, `169.254.169.254`, `0.0.0.0`, decimal, octal and hex address forms, and a DNS name resolving to a private address with the resolver injected.

```ts
import { describe, expect, it, vi } from "vitest";
import {
  checkParsedUrl,
  checkUrl,
  isLocalName,
  isPrivateAddress,
  normaliseUrl,
  resolveAndCheck,
} from "./fence";

/**
 * Every test here is written so that the failure it guards against is the
 * test going green. An address check that allows something it should block is
 * a server-side request forgery on a box with a metadata endpoint, so the
 * allow cases are asserted as explicitly as the block cases, and the resolver
 * tests assert that it was **not called** for a literal, rather than only
 * that the verdict was right.
 */

const PUBLIC = "93.184.216.34";

describe("isPrivateAddress: the ranges that must never be reached", () => {
  it.each([
    ["0.0.0.0", "this host"],
    ["0.1.2.3", "this network"],
    ["127.0.0.1", "loopback"],
    ["127.255.255.254", "loopback, top of the range"],
    ["10.0.0.1", "private class A"],
    ["10.255.255.255", "private class A, top of the range"],
    ["172.16.0.1", "private class B, bottom of the range"],
    ["172.31.255.255", "private class B, top of the range"],
    ["192.168.0.1", "private class C"],
    ["192.168.255.255", "private class C, top of the range"],
    ["169.254.169.254", "link local, and the cloud metadata address"],
    ["169.254.0.1", "link local, bottom"],
    ["100.64.0.1", "carrier grade NAT"],
    ["192.0.0.1", "IETF protocol assignments"],
    ["198.18.0.1", "benchmarking"],
    ["224.0.0.1", "multicast"],
    ["255.255.255.255", "broadcast"],
    ["::1", "IPv6 loopback"],
    ["::", "IPv6 unspecified"],
    ["fc00::1", "IPv6 unique local, bottom of fc00::/7"],
    ["fdff:ffff::1", "IPv6 unique local, top of fc00::/7"],
    ["fe80::1", "IPv6 link local"],
    ["ff02::1", "IPv6 multicast"],
    ["::ffff:127.0.0.1", "IPv4 loopback mapped into IPv6"],
    ["::ffff:7f00:1", "the same thing written in hex"],
    ["::ffff:169.254.169.254", "the metadata address mapped into IPv6"],
    ["::ffff:a9fe:a9fe", "the metadata address mapped into IPv6, hex form"],
    ["[::ffff:a9fe:a9fe]", "the same, with the brackets a URL host carries"],
    ["::ffff:0.0.0.0", "this host mapped into IPv6"],
    ["::ffff:10.0.0.1", "private class A mapped into IPv6"],
    ["64:ff9b::7f00:1", "loopback behind NAT64"],
  ])("blocks %s (%s)", (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it.each([
    ["93.184.216.34", "an ordinary public address"],
    ["8.8.8.8", "a public resolver"],
    ["11.0.0.1", "just outside 10/8"],
    ["172.15.255.255", "just below 172.16/12"],
    ["172.32.0.1", "just above 172.16/12"],
    ["192.169.0.1", "just above 192.168/16"],
    ["169.253.255.255", "just below 169.254/16"],
    ["100.63.255.255", "just below the CGNAT range"],
    ["100.128.0.1", "just above the CGNAT range"],
    ["223.255.255.255", "just below multicast"],
    ["2606:4700:4700::1111", "a public IPv6 resolver"],
    ["2a00:1450:4001:80f::200e", "another one"],
    ["::ffff:93.184.216.34", "a public address mapped into IPv6"],
  ])("allows %s (%s)", (address) => {
    expect(isPrivateAddress(address)).toBe(false);
  });

  it("blocks anything it cannot parse", () => {
    for (const junk of ["", "not-an-address", "999.1.1.1", "1.2.3", "::gggg", "127.0.0.1.5"]) {
      expect(isPrivateAddress(junk), junk).toBe(true);
    }
  });

  it("blocks the decimal, octal and hex spellings of loopback by failing closed", () => {
    // None of these are understood as addresses here, and that is deliberate:
    // the parser takes four decimal octets or an IPv6 literal and nothing
    // else, so an unusual spelling is refused as unparseable rather than
    // decoded. The URL layer is where those spellings are normalised (next
    // describe), and both layers refusing is the point.
    for (const spelling of ["2130706433", "0177.0.0.1", "0x7f000001", "0x7f.0.0.1", "017700000001"]) {
      expect(isPrivateAddress(spelling), spelling).toBe(true);
    }
  });
});

describe("isLocalName", () => {
  it.each(["localhost", "LOCALHOST", "localhost.", "api.localhost", "printer.local", "db.internal", "x.y.internal"])(
    "treats %s as local",
    (name) => expect(isLocalName(name)).toBe(true),
  );
  it.each(["example.com", "localhost.example.com", "internal.example.com", "local.ie", "localtest.me"])(
    "treats %s as a real name",
    (name) => expect(isLocalName(name)).toBe(false),
  );
});

describe("normaliseUrl", () => {
  it("assumes https for a bare hostname, because everybody types one", () => {
    expect(normaliseUrl("example.com")?.toString()).toBe("https://example.com/");
    expect(normaliseUrl("  example.com/path  ")?.toString()).toBe("https://example.com/path");
  });

  it("leaves a scheme that is already there alone", () => {
    expect(normaliseUrl("http://example.com")?.protocol).toBe("http:");
  });

  it("does not turn a dangerous scheme into an https URL", () => {
    expect(normaliseUrl("javascript:alert(1)")?.protocol).toBe("javascript:");
    expect(normaliseUrl("file:///etc/passwd")?.protocol).toBe("file:");
  });

  it("returns null for something that is not a URL at all", () => {
    for (const junk of ["", "   ", "https://", "http://", "?"]) {
      expect(normaliseUrl(junk), junk).toBeNull();
    }
  });
});

describe("checkUrl: the synchronous half", () => {
  const refused = (input: string) => {
    const verdict = checkUrl(input);
    expect(verdict.ok, input).toBe(false);
    if (verdict.ok) throw new Error("unreachable");
    // Every refusal is a sentence a page can print.
    expect(verdict.reason.length, input).toBeGreaterThan(10);
    expect(verdict.reason.endsWith("."), input).toBe(true);
    return verdict;
  };

  it("accepts an ordinary page and a bare hostname", () => {
    const a = checkUrl("https://example.com/page");
    expect(a.ok).toBe(true);
    if (a.ok) expect(a.url.hostname).toBe("example.com");
    const b = checkUrl("example.com");
    expect(b.ok).toBe(true);
    if (b.ok) expect(b.url.protocol).toBe("https:");
  });

  it("accepts a public address literal without consulting anything", () => {
    expect(checkUrl(`http://${PUBLIC}/`).ok).toBe(true);
  });

  it("refuses something that is not a URL", () => {
    expect(refused("   ").code).toBe("invalid-url");
    expect(refused("?").code).toBe("invalid-url");
  });

  it.each(["file:///etc/passwd", "ftp://example.com/x", "javascript:alert(1)", "data:text/html,x", "gopher://x/"])(
    "refuses the scheme in %s",
    (input) => expect(refused(input).code).toBe("scheme"),
  );

  it("refuses a URL that carries credentials", () => {
    expect(refused("https://user:secret@example.com/").code).toBe("credentials");
    expect(refused("https://user@example.com/").code).toBe("credentials");
  });

  it.each(["http://localhost/", "http://localhost:80/", "http://api.localhost/", "http://printer.local/", "http://db.internal/", "http://localhost./"])(
    "refuses the local name in %s",
    (input) => expect(refused(input).code).toBe("blocked-host"),
  );

  it.each([
    "http://127.0.0.1/",
    "http://0.0.0.0/",
    "http://10.0.0.1/",
    "http://192.168.1.1/admin",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/",
    "http://[fe80::1]/",
    "http://[::ffff:169.254.169.254]/",
    "http://[::ffff:a9fe:a9fe]/",
  ])("refuses the private literal in %s", (input) => {
    expect(refused(input).code).toBe("private-address");
  });

  it("refuses the private literal before it looks at the port", () => {
    // Order matters for the message a visitor reads: `127.0.0.1:3000` is
    // refused for being loopback, not for being on port 3000, and the
    // headline fetch's existing contract depends on that.
    expect(refused("http://127.0.0.1:3000/").code).toBe("private-address");
    expect(refused("http://[::1]:8080/").code).toBe("private-address");
  });

  it("relies on the URL parser to canonicalise odd address spellings, and checks that it does", () => {
    // The WHATWG parser turns a decimal, octal or hex host into dotted form
    // before this code sees it. That is an instrument this guard depends on,
    // so it is asserted rather than assumed: if a runtime ever stops doing it,
    // the first line fails and says so.
    expect(new URL("http://2130706433/").hostname).toBe("127.0.0.1");
    expect(new URL("http://0177.0.0.1/").hostname).toBe("127.0.0.1");
    expect(new URL("http://0x7f000001/").hostname).toBe("127.0.0.1");
    expect(new URL("http://127.1/").hostname).toBe("127.0.0.1");
    expect(new URL("http://[::ffff:169.254.169.254]/").hostname).toBe("[::ffff:a9fe:a9fe]");
    for (const input of ["http://2130706433/", "http://0177.0.0.1/", "http://0x7f000001/", "http://127.1/", "http://2852039166/"]) {
      // 2852039166 is 169.254.169.254 in decimal.
      expect(refused(input).code, input).toBe("private-address");
    }
  });

  it("refuses any port other than 80 and 443", () => {
    expect(refused("http://example.com:8080/").code).toBe("port");
    expect(refused("https://example.com:8443/").code).toBe("port");
    expect(refused("http://example.com:3000/").reason).toContain("3000");
    // The parser drops a scheme's default port, and the other well-known one
    // is allowed explicitly, so both of these stay open.
    expect(checkUrl("https://example.com:443/").ok).toBe(true);
    expect(checkUrl("http://example.com:443/").ok).toBe(true);
    expect(checkUrl("https://example.com:80/").ok).toBe(true);
  });

  it("gives the same verdict for a URL object as for its string", () => {
    const url = new URL("http://169.254.169.254/latest/");
    const parsed = checkParsedUrl(url);
    const typed = checkUrl(url.toString());
    expect(parsed).toEqual(typed);
  });
});

describe("resolveAndCheck: the half that asks the resolver", () => {
  const resolverWith = (answers: Array<{ address: string; family: number }>) => vi.fn(async () => answers);

  it("does not consult the resolver for a literal, and refuses a private one", async () => {
    const resolver = resolverWith([{ address: PUBLIC, family: 4 }]);
    const pub = await resolveAndCheck(new URL(`http://${PUBLIC}/`), resolver);
    expect(pub.ok).toBe(true);
    if (pub.ok) expect(pub.addresses).toEqual([PUBLIC]);
    const priv = await resolveAndCheck(new URL("http://169.254.169.254/"), resolver);
    expect(priv.ok).toBe(false);
    if (!priv.ok) expect(priv.code).toBe("private-address");
    const v6 = await resolveAndCheck(new URL("http://[::1]/"), resolver);
    expect(v6.ok).toBe(false);
    expect(resolver).not.toHaveBeenCalled();
  });

  it("refuses a hostname that resolves to a private address", async () => {
    const resolver = resolverWith([{ address: "127.0.0.1", family: 4 }]);
    const verdict = await resolveAndCheck(new URL("https://localtest.me/"), resolver);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.code).toBe("private-address");
      expect(verdict.reason).toContain("localtest.me");
      expect(verdict.reason).toContain("127.0.0.1");
    }
    expect(resolver).toHaveBeenCalledWith("localtest.me");
  });

  it("refuses a hostname that resolves to the metadata address", async () => {
    const verdict = await resolveAndCheck(
      new URL("https://meta.example/"),
      resolverWith([{ address: "169.254.169.254", family: 4 }]),
    );
    expect(verdict.ok).toBe(false);
  });

  it("refuses a hostname whose IPv6 answer maps a private IPv4 address", async () => {
    const verdict = await resolveAndCheck(
      new URL("https://mapped.example/"),
      resolverWith([{ address: "::ffff:10.0.0.1", family: 6 }]),
    );
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.code).toBe("private-address");
  });

  it("refuses when any one of several answers is private", async () => {
    const verdict = await resolveAndCheck(
      new URL("https://mixed.example/"),
      resolverWith([
        { address: PUBLIC, family: 4 },
        { address: "10.1.2.3", family: 4 },
      ]),
    );
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.code).toBe("private-address");
  });

  it("refuses a hostname that resolves to nothing, and one whose resolver throws", async () => {
    const empty = await resolveAndCheck(new URL("https://nowhere.example/"), resolverWith([]));
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.code).toBe("dns");
    const thrown = await resolveAndCheck(
      new URL("https://nowhere.example/"),
      vi.fn(async () => {
        throw new Error("ENOTFOUND");
      }),
    );
    expect(thrown.ok).toBe(false);
    if (!thrown.ok) expect(thrown.code).toBe("dns");
  });

  it("returns every public answer for a caller that can pin a connection", async () => {
    const verdict = await resolveAndCheck(
      new URL("https://example.com/"),
      resolverWith([
        { address: PUBLIC, family: 4 },
        { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
      ]),
    );
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.addresses).toEqual([PUBLIC, "2606:2800:220:1:248:1893:25c8:1946"]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd "$WT" && npx vitest run lib/fence.test.ts`
Expected: FAIL, `Failed to resolve import "./fence"`.

- [ ] **Step 3: Write the fence**

`lib/fence.ts`. The address functions are moved from `lib/headline-fetch.ts` word for word (they are the tested ones); `isBlockedAddress` becomes `isPrivateAddress`, the recursion inside it renamed with it. `checkParsedUrl`, `checkUrl`, `isLocalName` and `resolveAndCheck` are new.

```ts
/**
 * The fence: is this URL one this server may reach on a stranger's behalf?
 *
 * Lifted from `lib/headline-fetch.ts` on 2026-09-03 so every tool that takes
 * a URL from a visitor (headline-check today, On the glass and its browser
 * navigations next) refuses the same things for the same reasons. The
 * interesting target of a server-side request forgery is never the visitor's
 * own site; it is `http://169.254.169.254/latest/meta-data/`, a database
 * console bound to loopback, or something on the same private network as the
 * box doing the fetching. So the guard is the feature.
 *
 * Two entry points, split by cost:
 *
 *  - `checkUrl(input)` and `checkParsedUrl(url)` are synchronous and touch no
 *    network. Syntax, scheme, credentials, local names, address literals,
 *    ports. Run one of them before a budget is spent, so a URL that was never
 *    going to be fetched costs the visitor nothing.
 *  - `resolveAndCheck(url)` asks the resolver and refuses if **any** answer is
 *    private. Any, not the first: a host with one public and one private
 *    record is still a way in. The answers ride back on the verdict for a
 *    caller that can pin a connection to one of them.
 *
 * **The limit, stated plainly.** Resolving here and then handing the hostname
 * to `fetch`, which resolves again, is beatable by a name server that answers
 * public once and private the second time (DNS rebinding). Closing that means
 * pinning the resolved address on the connection itself, through an agent
 * with a `lookup` hook. It is not done here, and each caller's docblock says
 * what bounds it for that caller (the headline fetch: the content type is
 * checked before a byte of body is read).
 *
 * **Fails closed.** Anything unparseable is blocked, because an address that
 * cannot be read is one that cannot be vouched for, and the two wrong answers
 * do not cost remotely the same. The odd spellings of an address (decimal,
 * octal, hex) are refused here as unparseable and are also canonicalised by
 * the URL parser before they arrive, and the test asserts both.
 *
 * Nothing here throws. A verdict is a value.
 */

import { lookup } from "node:dns/promises";

export type FenceCode =
  | "invalid-url"
  | "scheme"
  | "credentials"
  | "blocked-host"
  | "port"
  | "private-address"
  | "dns";

export type FenceVerdict =
  | { ok: true; url: URL; addresses?: string[] }
  | { ok: false; code: FenceCode; reason: string };

export type Resolved = { address: string; family: number };
export type Resolver = (hostname: string) => Promise<Resolved[]>;

/** The sentence every private-address refusal ends with. */
export const PRIVATE_ADDRESS_REASON =
  "is on a private, loopback or reserved network, so this server will not fetch it.";

function refuse(code: FenceCode, reason: string): FenceVerdict {
  return { ok: false, code, reason };
}

/* ── addresses ───────────────────────────────────────────────────────────── */

function parseIPv4(address: string): number[] | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    octets.push(n);
  }
  return octets;
}

/** Eight 16-bit groups, or null. Handles `::` and a trailing dotted quad. */
function parseIPv6(address: string): number[] | null {
  if (!address.includes(":")) return null;
  let head = address;
  let tail4: number[] | null = null;

  const lastColon = head.lastIndexOf(":");
  const maybeV4 = head.slice(lastColon + 1);
  if (maybeV4.includes(".")) {
    tail4 = parseIPv4(maybeV4);
    if (!tail4) return null;
    head = head.slice(0, lastColon + 1) + "0";
  }

  const halves = head.split("::");
  if (halves.length > 2) return null;

  const toGroups = (part: string): number[] | null => {
    if (part === "") return [];
    const out: number[] = [];
    for (const piece of part.split(":")) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(piece)) return null;
      out.push(Number.parseInt(piece, 16));
    }
    return out;
  };

  const left = toGroups(halves[0]);
  const right = halves.length === 2 ? toGroups(halves[1]) : [];
  if (!left || !right) return null;

  let groups: number[];
  if (halves.length === 2) {
    const gap = 8 - left.length - right.length - (tail4 ? 1 : 0);
    if (gap < 0) return null;
    groups = [...left, ...new Array<number>(gap).fill(0), ...right];
  } else {
    groups = [...left, ...right];
  }

  if (tail4) {
    // The placeholder group added above stands in for the two the quad fills.
    groups = groups.slice(0, groups.length - 1);
    groups.push((tail4[0] << 8) | tail4[1], (tail4[2] << 8) | tail4[3]);
  }

  return groups.length === 8 ? groups : null;
}

function blockedIPv4(octets: number[]): boolean {
  const [a, b] = octets;
  if (a === 0) return true; // 0.0.0.0/8, "this network", and 0.0.0.0 itself
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10, carrier NAT
  if (a === 127) return true; // 127.0.0.0/8, loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16, link local + metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 192 && octets[1] === 0 && (octets[2] === 0 || octets[2] === 2)) return true;
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15, benchmarking
  if (a === 198 && b === 51 && octets[2] === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && octets[2] === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast, reserved, and 255.255.255.255
  return false;
}

/**
 * Whether an address is one this server must not be talked into reaching.
 *
 * **Fails closed.** Anything unparseable is blocked, because an address that
 * cannot be read is one that cannot be vouched for, and the two wrong answers
 * do not cost remotely the same.
 */
export function isPrivateAddress(address: string): boolean {
  const trimmed = address.trim().replace(/^\[|\]$/g, "");
  if (trimmed === "") return true;

  const v4 = parseIPv4(trimmed);
  if (v4) return blockedIPv4(v4);

  // A zone index (`fe80::1%eth0`) is not part of the address.
  const groups = parseIPv6(trimmed.split("%")[0]);
  if (!groups) return true;

  if ((groups[0] & 0xfe00) === 0xfc00) return true; // fc00::/7, unique local
  if ((groups[0] & 0xffc0) === 0xfe80) return true; // fe80::/10, link local
  if ((groups[0] & 0xff00) === 0xff00) return true; // ff00::/8, multicast

  const embedded = (): string =>
    [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff].join(".");

  /*
    One rule for the whole of ::/96 and ::ffff:0:0/96, rather than a separate
    line each for `::` and `::1`.

    Those two are inside ::/96 and the v4 address they carry is 0.0.0.0 and
    0.0.0.1, both of which 0.0.0.0/8 already refuses. Writing them out again
    above would read as two more guards and behave as none: deleting either one
    changed nothing, which is how a line ends up being decoration.
  */
  if (groups.slice(0, 5).every((g) => g === 0) && (groups[5] === 0xffff || groups[5] === 0)) {
    return isPrivateAddress(embedded());
  }
  // 64:ff9b::/96, the well-known NAT64 prefix.
  if (groups[0] === 0x0064 && groups[1] === 0xff9b && groups.slice(2, 6).every((g) => g === 0)) {
    return isPrivateAddress(embedded());
  }

  return false;
}

/** True when the host is written as an address rather than as a name. */
function isAddressLiteral(hostname: string): boolean {
  const bare = hostname.replace(/^\[|\]$/g, "");
  return parseIPv4(bare) !== null || bare.includes(":");
}

/* ── names ───────────────────────────────────────────────────────────────── */

const LOCAL_SUFFIXES = [".localhost", ".local", ".internal"];

/**
 * Names that are never on the internet. `localhost` and anything under it,
 * mDNS `.local`, and `.internal`, which cloud providers use for their own
 * metadata and service names. These would mostly be caught at resolution
 * time anyway; refusing them by name is a second layer that costs nothing.
 */
export function isLocalName(hostname: string): boolean {
  const name = hostname.toLowerCase().replace(/\.$/, "");
  return name === "localhost" || LOCAL_SUFFIXES.some((suffix) => name.endsWith(suffix));
}

/* ── the URL ─────────────────────────────────────────────────────────────── */

/**
 * Reads what somebody typed into the box.
 *
 * `https://` is assumed only when there is no scheme at all, because everybody
 * types `example.com`. Prefixing something that already has one would turn
 * `javascript:alert(1)` into a fetchable host, which is the opposite of the job.
 */
export function normaliseUrl(raw: string): URL | null {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (text === "") return null;
  const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(text) ? text : `https://${text}`;
  try {
    return new URL(candidate);
  } catch {
    return null;
  }
}

/**
 * The synchronous half, on a URL that has already been parsed.
 *
 * Order is deliberate and the test pins it: the address literal is checked
 * before the port, so `127.0.0.1:3000` is refused for being loopback and the
 * visitor reads the reason that matters.
 */
export function checkParsedUrl(url: URL): FenceVerdict {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return refuse("scheme", `${url.protocol} is not a scheme I will fetch.`);
  }
  if (url.username !== "" || url.password !== "") {
    return refuse("credentials", "That URL carries a username or password, and I will not send anybody's credentials.");
  }

  const hostname = url.hostname;
  if (hostname === "") return refuse("invalid-url", "That URL has no host in it.");

  if (isAddressLiteral(hostname)) {
    if (isPrivateAddress(hostname)) {
      return refuse("private-address", `${hostname} ${PRIVATE_ADDRESS_REASON}`);
    }
  } else if (isLocalName(hostname)) {
    return refuse("blocked-host", `${hostname} is a local name, not something on the internet.`);
  }

  if (url.port !== "" && url.port !== "80" && url.port !== "443") {
    return refuse("port", `Port ${url.port} is not one I will fetch from. Only 80 and 443.`);
  }

  return { ok: true, url };
}

/** The synchronous half, on whatever a visitor typed. */
export function checkUrl(input: string): FenceVerdict {
  const url = normaliseUrl(input);
  if (!url) return refuse("invalid-url", "That is not a URL I can read. Try something like example.com/page.");
  return checkParsedUrl(url);
}

/* ── the resolver ────────────────────────────────────────────────────────── */

async function defaultResolver(hostname: string): Promise<Resolved[]> {
  return lookup(hostname, { all: true, verbatim: true });
}

/**
 * The half that asks the resolver.
 *
 * A literal is answered without a lookup, and a private literal is refused
 * here too so a caller that skipped `checkParsedUrl` is still fenced. A
 * resolver that throws and one that answers with nothing are the same fact:
 * nothing to reach.
 */
export async function resolveAndCheck(url: URL, resolver: Resolver = defaultResolver): Promise<FenceVerdict> {
  const hostname = url.hostname;
  if (hostname === "") return refuse("invalid-url", "That URL has no host in it.");

  if (isAddressLiteral(hostname)) {
    const bare = hostname.replace(/^\[|\]$/g, "");
    return isPrivateAddress(bare)
      ? refuse("private-address", `${hostname} ${PRIVATE_ADDRESS_REASON}`)
      : { ok: true, url, addresses: [bare] };
  }

  let answers: Resolved[] = [];
  try {
    answers = (await resolver(hostname)) ?? [];
  } catch {
    answers = [];
  }
  if (answers.length === 0) return refuse("dns", `${hostname} does not resolve.`);

  // Every answer, not the first. One private record among public ones is still
  // a route in, and checking only answers[0] is exactly how that gets missed.
  for (const answer of answers) {
    if (isPrivateAddress(answer.address)) {
      return refuse(
        "private-address",
        `${hostname} resolves to ${answer.address}, which is on a private, loopback or reserved network.`,
      );
    }
  }
  return { ok: true, url, addresses: answers.map((answer) => answer.address) };
}
```

- [ ] **Step 4: Run the fence test to see it pass**

Run: `cd "$WT" && npx vitest run lib/fence.test.ts`
Expected: all passed (the two `it.each` tables expand to about 60 cases).

- [ ] **Step 5: Point the headline fetch at the fence**

In `lib/headline-fetch.ts`:

Replace the import line `import { lookup } from "node:dns/promises";` with:

```ts
import {
  checkParsedUrl,
  normaliseUrl,
  resolveAndCheck,
  type FenceCode,
  type Resolved,
  type Resolver,
} from "./fence";

/**
 * Kept for the existing test contract and for any reader who learnt these
 * names here. The fence is their home now; `lib/fence.test.ts` is where the
 * address tables live and grow.
 */
export { isPrivateAddress as isBlockedAddress, normaliseUrl } from "./fence";
export type { Resolved } from "./fence";
```

Delete from the file: `parseIPv4`, `parseIPv6`, `blockedIPv4`, `isBlockedAddress`, `isAddressLiteral`, the `normaliseUrl` function, `defaultLookup`, and the whole `/* ── addresses ── */` and `/* ── the URL ── */` section headers that introduced them. Delete `export type Resolved = ...` (it is re-exported above).

Change `FetchDeps.lookupImpl` to use the fence's type:

```ts
export type FetchDeps = {
  fetchImpl?: typeof fetch;
  lookupImpl?: Resolver;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
};
```

Add two members to `FetchReason`, after `"private-address"`:

```ts
  | "blocked-port"
  | "blocked-credentials"
```

Add two entries to `MESSAGES`, after `"private-address"`:

```ts
  "blocked-port": "I only fetch from ports 80 and 443.",
  "blocked-credentials": "I will not fetch a URL that carries a username or password.",
```

Replace the whole `guard` function with:

```ts
/** How the fence's codes read as this module's reasons. */
const FENCE_TO_REASON: Record<FenceCode, FetchReason> = {
  "invalid-url": "invalid-url",
  scheme: "blocked-scheme",
  credentials: "blocked-credentials",
  "blocked-host": "private-address",
  port: "blocked-port",
  "private-address": "private-address",
  dns: "dns",
};

/** The fence, run on the URL and again on every redirect. */
async function guard(raw: string, target: URL, lookupImpl?: Resolver): Promise<FetchedPage | null> {
  const syntax = checkParsedUrl(target);
  if (!syntax.ok) return fail(raw, FENCE_TO_REASON[syntax.code], syntax.reason);
  const resolved = await resolveAndCheck(target, lookupImpl);
  if (!resolved.ok) return fail(raw, FENCE_TO_REASON[resolved.code], resolved.reason);
  return null;
}
```

In `fetchPage`, delete the line `const resolve = deps.lookupImpl ?? defaultLookup;` and change the guard call to `const refusal = await guard(raw, target, deps.lookupImpl);`.

Replace the numbered list in the file's docblock (the four points under "What is actually checked") with:

```
 * **What is checked, and every one of them on every hop**, lives in
 * `lib/fence.ts` since 2026-09-03: scheme, credentials, local names, private
 * or reserved address literals, ports other than 80 and 443, and every DNS
 * answer rather than the first. This module adds what is specific to fetching
 * a page: redirects are read, not followed (`redirect: "manual"`), capped at
 * three hops, and the fence runs again on each `Location` before it is
 * fetched.
```

Keep every other paragraph of the docblock, including the DNS rebinding limit and the content-type bound, as they are.

- [ ] **Step 6: Prove the old contract is intact, then append the two new tests**

```bash
cd "$WT"
git diff --stat -- lib/headline-fetch.test.ts
npx vitest run lib/headline-fetch.test.ts
```

Expected: the diff stat is empty (the test file is byte-identical), and every test passes against the rewritten module. If any fails, the lift changed behaviour and that is the bug to fix, never the test.

Then append to the end of `lib/headline-fetch.test.ts`:

```ts
describe("fetchPage: the two rules the shared fence added", () => {
  it("refuses a port other than 80 and 443 before fetching", async () => {
    const d = deps();
    const result = await fetchPage("http://example.com:8080/", d);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("blocked-port");
      expect(result.detail).toContain("8080");
    }
    expect(d.fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses a URL carrying credentials before fetching", async () => {
    const d = deps();
    const result = await fetchPage("https://user:secret@example.com/", d);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("blocked-credentials");
      // The refusal must not echo the secret back onto the page.
      expect(result.detail).not.toContain("secret");
    }
    expect(d.fetchImpl).not.toHaveBeenCalled();
  });
});
```

Run: `cd "$WT" && npx vitest run lib/headline-fetch.test.ts lib/fence.test.ts && npx tsc --noEmit`
Expected: all passed, `tsc` silent.

- [ ] **Step 7: Add the fence mutations and prove every one goes red**

Append to the `MUTATIONS` array in `scripts/mutation-check.mjs`, before the closing `];`:

```js
  // ── the shared fence (2026-09-03) ──
  {
    name: "the metadata address is allowed back in",
    file: "lib/fence.ts",
    pattern: /if \(a === 169 && b === 254\) return true;/,
    replace: "if (false) return true;",
  },
  {
    name: "only the first DNS answer is checked",
    file: "lib/fence.ts",
    pattern: /for \(const answer of answers\) \{/,
    replace: "for (const answer of answers.slice(0, 1)) {",
  },
  {
    name: "v4-mapped v6 stops being unwrapped",
    file: "lib/fence.ts",
    pattern: /\(groups\[5\] === 0xffff \|\| groups\[5\] === 0\)/,
    replace: "(false)",
  },
  {
    name: "the port fence opens",
    file: "lib/fence.ts",
    pattern: /url\.port !== "" && url\.port !== "80" && url\.port !== "443"/,
    replace: "false",
  },
  {
    name: "credentials are forwarded",
    file: "lib/fence.ts",
    pattern: /url\.username !== "" \|\| url\.password !== ""/,
    replace: "false",
  },
  {
    name: "an unparseable address fails open",
    file: "lib/fence.ts",
    pattern: /if \(!groups\) return true;/,
    replace: "if (!groups) return false;",
  },
```

Run: `cd "$WT" && node scripts/mutation-check.mjs 2>&1 | tail -12`
Expected: six new `RED` lines among the rest, `46/46 mutations caught.`, no `Survived` block, no `ANCHOR-MISS`. A `GREEN` on any of the six is a guard with no test biting it: add the test, do not delete the mutation.

- [ ] **Step 8: Commit**

```bash
cd "$WT"
git add lib/fence.ts lib/fence.test.ts lib/headline-fetch.ts lib/headline-fetch.test.ts scripts/mutation-check.mjs
git commit -m "feat(fence): lift the ssrf guard out of the headline fetch so every tool shares it"
```

---

### Task 4: Budgets on Redis, with the memory fallback and the integration proof

**Files:**
- Create: `lib/budget.ts`, `lib/budget.test.ts`, `lib/budget.integration.test.ts`
- Modify: `scripts/mutation-check.mjs` (five budget entries)

**Interfaces:**
- Consumes: `getRedis()` from `lib/store/redis.ts`, `StoreUnavailableError` from `lib/store/errors.ts`.
- Produces: `takeBudget(req, now?)`, `budgetKeyForIp(headers)`, `takeBudgetOnRedis(redis, req)`, `takeBudgetInMemory(req, now)`, `refusalReason(scope, limit, windowSec, retryAfterSec)`, `budgetKey(req)`, `MAX_TRACKED`, types `BudgetScope`, `BudgetRequest`, `BudgetResult`, `BudgetRedis`. Task 5 calls `takeBudget` and `budgetKeyForIp`.

- [ ] **Step 1: Write the failing unit test**

`lib/budget.test.ts`. The store module is mocked so the router's three branches are driven by what `getRedis` does, not by the shell's environment. The Redis path runs against a fake that counts commands, because the command count is the meter.

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { StoreUnavailableError } from "./store/errors";

const { getRedisMock } = vi.hoisted(() => ({ getRedisMock: vi.fn() }));
vi.mock("./store/redis", () => ({ getRedis: getRedisMock }));

import {
  MAX_TRACKED,
  budgetKey,
  budgetKeyForIp,
  refusalReason,
  takeBudget,
  takeBudgetInMemory,
  takeBudgetOnRedis,
  type BudgetRedis,
  type BudgetRequest,
} from "./budget";

/**
 * A Redis that behaves like the two commands the budget uses, and counts
 * them. `SET ... EX NX` creates a live key or does nothing; `INCR` counts;
 * `PTTL` and `EXPIRE` do what they say. The clock is a number the test moves,
 * so a window can pass without waiting for one.
 */
function fakeRedis() {
  const store = new Map<string, { value: number; expiresAt: number }>();
  const commands: string[] = [];
  let clock = 1_000_000;
  const live = (key: string) => {
    const row = store.get(key);
    return row && row.expiresAt > clock ? row : undefined;
  };
  const redis: BudgetRedis & { commands: string[]; tick: (ms: number) => void; store: typeof store } = {
    commands,
    store,
    tick: (ms) => {
      clock += ms;
    },
    multi() {
      const queued: Array<() => unknown> = [];
      const tx = {
        set(key: string, value: number, options: { ex: number; nx: true }) {
          queued.push(() => {
            commands.push("SET");
            if (live(key)) return null;
            store.set(key, { value, expiresAt: clock + options.ex * 1000 });
            return "OK";
          });
          return tx;
        },
        incr(key: string) {
          queued.push(() => {
            commands.push("INCR");
            const row = live(key) ?? { value: 0, expiresAt: Number.POSITIVE_INFINITY };
            row.value += 1;
            store.set(key, row);
            return row.value;
          });
          return tx;
        },
        async exec() {
          return queued.map((run) => run());
        },
      };
      return tx;
    },
    async pttl(key: string) {
      commands.push("PTTL");
      const row = store.get(key);
      if (!row) return -2;
      if (!Number.isFinite(row.expiresAt)) return -1;
      return Math.max(0, row.expiresAt - clock);
    },
    async expire(key: string, seconds: number) {
      commands.push("EXPIRE");
      const row = store.get(key);
      if (!row) return 0;
      row.expiresAt = clock + seconds * 1000;
      return 1;
    },
  };
  return redis;
}

let counter = 0;
const request = (over: Partial<BudgetRequest> = {}): BudgetRequest => ({
  tool: "t",
  scope: "ip",
  key: `k${(counter += 1)}`,
  limit: 3,
  windowSec: 3600,
  ...over,
});

afterEach(() => {
  vi.unstubAllEnvs();
  getRedisMock.mockReset();
});

describe("refusalReason", () => {
  it("prints the sentence from the design for a daily budget", () => {
    expect(refusalReason("ip", 3, 86_400, 4 * 3600)).toBe(
      "This address has used its 3 runs for today; the counter resets in 4 hours.",
    );
  });

  it("reads correctly for each scope, window and wait", () => {
    expect(refusalReason("target", 60, 3600, 60)).toBe(
      "That site has had its 60 runs for this hour; the counter resets in a minute.",
    );
    expect(refusalReason("global", 500, 86_400, 3600)).toBe(
      "Everyone together has used the 500 runs for today; the counter resets in an hour.",
    );
    expect(refusalReason("ip", 1, 60, 30)).toBe(
      "This address has used its 1 run for this minute; the counter resets in 30 seconds.",
    );
    expect(refusalReason("ip", 3, 86_400, 5400)).toContain("resets in 2 hours.");
    expect(refusalReason("ip", 3, 86_400, 90)).toContain("resets in 2 minutes.");
    expect(refusalReason("ip", 3, 86_400, 1)).toContain("resets in a second.");
  });
});

describe("budgetKey", () => {
  it("is the frozen shape", () => {
    expect(budgetKey({ tool: "headline-check", scope: "global", key: "all", limit: 1, windowSec: 1 })).toBe(
      "budget:headline-check:global:all",
    );
  });
});

describe("takeBudgetOnRedis", () => {
  it("allows a limit of three and refuses the fourth, with a sentence and a wait", async () => {
    const redis = fakeRedis();
    const req = request({ limit: 3, windowSec: 120 });
    expect(await takeBudgetOnRedis(redis, req)).toEqual({ ok: true, remaining: 2 });
    expect(await takeBudgetOnRedis(redis, req)).toEqual({ ok: true, remaining: 1 });
    expect(await takeBudgetOnRedis(redis, req)).toEqual({ ok: true, remaining: 0 });
    const fourth = await takeBudgetOnRedis(redis, req);
    expect(fourth.ok).toBe(false);
    if (!fourth.ok) {
      expect(fourth.remaining).toBe(0);
      expect(fourth.retryAfterSec).toBe(120);
      expect(fourth.reason).toBe(
        "This address has used its 3 runs for these 120 seconds; the counter resets in 2 minutes.",
      );
    }
  });

  it("spends exactly two commands on an allowed call and three on a refused one", async () => {
    // 500,000 commands a month is the meter. This is the guard on it.
    const redis = fakeRedis();
    const req = request({ limit: 1 });
    await takeBudgetOnRedis(redis, req);
    expect(redis.commands).toEqual(["SET", "INCR"]);
    await takeBudgetOnRedis(redis, req);
    expect(redis.commands).toEqual(["SET", "INCR", "SET", "INCR", "PTTL"]);
  });

  it("gives the window its TTL on the first hit only", async () => {
    const redis = fakeRedis();
    const req = request({ limit: 5, windowSec: 60 });
    await takeBudgetOnRedis(redis, req);
    redis.tick(50_000);
    await takeBudgetOnRedis(redis, req);
    // Ten seconds left from the first hit, not sixty from the second.
    expect(await redis.pttl(budgetKey(req))).toBe(10_000);
  });

  it("starts a fresh window once the old one has expired", async () => {
    const redis = fakeRedis();
    const req = request({ limit: 1, windowSec: 60 });
    expect((await takeBudgetOnRedis(redis, req)).ok).toBe(true);
    expect((await takeBudgetOnRedis(redis, req)).ok).toBe(false);
    redis.tick(60_001);
    expect((await takeBudgetOnRedis(redis, req)).ok).toBe(true);
  });

  it("repairs a counter that somehow has no expiry rather than locking the key out for ever", async () => {
    const redis = fakeRedis();
    const req = request({ limit: 1, windowSec: 60 });
    redis.store.set(budgetKey(req), { value: 5, expiresAt: Number.POSITIVE_INFINITY });
    const result = await takeBudgetOnRedis(redis, req);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.retryAfterSec).toBe(60);
    expect(redis.commands).toContain("EXPIRE");
    expect(await redis.pttl(budgetKey(req))).toBe(60_000);
  });

  it("keeps one key's spending away from another's", async () => {
    const redis = fakeRedis();
    const a = request({ limit: 1 });
    const b = request({ limit: 1 });
    await takeBudgetOnRedis(redis, a);
    expect((await takeBudgetOnRedis(redis, a)).ok).toBe(false);
    expect((await takeBudgetOnRedis(redis, b)).ok).toBe(true);
  });
});

describe("takeBudgetInMemory", () => {
  it("allows a limit of three and refuses the fourth", () => {
    const req = request({ limit: 3, windowSec: 120 });
    const now = 5_000_000;
    expect(takeBudgetInMemory(req, now)).toEqual({ ok: true, remaining: 2 });
    expect(takeBudgetInMemory(req, now)).toEqual({ ok: true, remaining: 1 });
    expect(takeBudgetInMemory(req, now)).toEqual({ ok: true, remaining: 0 });
    const fourth = takeBudgetInMemory(req, now + 30_000);
    expect(fourth.ok).toBe(false);
    if (!fourth.ok) {
      expect(fourth.retryAfterSec).toBe(90);
      expect(fourth.reason).toContain("resets in 2 minutes.");
    }
  });

  it("stays refused inside the window and resets after it", () => {
    const req = request({ limit: 1, windowSec: 60 });
    const now = 6_000_000;
    expect(takeBudgetInMemory(req, now).ok).toBe(true);
    expect(takeBudgetInMemory(req, now + 59_999).ok).toBe(false);
    expect(takeBudgetInMemory(req, now + 60_000).ok).toBe(true);
  });

  it("keeps one key's spending away from another's", () => {
    const a = request({ limit: 1 });
    const b = request({ limit: 1 });
    const now = 7_000_000;
    takeBudgetInMemory(a, now);
    expect(takeBudgetInMemory(a, now).ok).toBe(false);
    expect(takeBudgetInMemory(b, now).ok).toBe(true);
  });

  it("survives the eviction sweep without handing out a free window", () => {
    // Ported from rate-limit.test.ts. Past MAX_TRACKED the map drops expired
    // windows and clears outright if that was not enough. Either way the
    // flooder does not get more than one window's worth out of it.
    const req = request({ limit: 3 });
    const now = 8_000_000;
    for (let i = 0; i < 3; i += 1) takeBudgetInMemory(req, now);
    expect(takeBudgetInMemory(req, now).ok).toBe(false);

    for (let i = 0; i < MAX_TRACKED + 100; i += 1) {
      takeBudgetInMemory({ ...req, key: `flood-${i}` }, now);
    }
    const flooder = { ...req, key: "flood-0" };
    for (let i = 0; i < 3; i += 1) takeBudgetInMemory(flooder, now);
    expect(takeBudgetInMemory(flooder, now).ok).toBe(false);
  });
});

describe("takeBudget: which implementation answers", () => {
  it("uses Redis when the client is available", async () => {
    const redis = fakeRedis();
    getRedisMock.mockReturnValue(redis);
    const req = request({ limit: 1 });
    expect((await takeBudget(req)).ok).toBe(true);
    expect((await takeBudget(req)).ok).toBe(false);
    expect(redis.commands.length).toBe(5);
  });

  it("falls back to memory outside production when Redis is not configured, and the fallback counts", async () => {
    getRedisMock.mockImplementation(() => {
      throw new StoreUnavailableError("redis", "UPSTASH_REDIS_REST_URL");
    });
    vi.stubEnv("NODE_ENV", "test");
    const req = request({ limit: 1 });
    expect((await takeBudget(req, 9_000_000)).ok).toBe(true);
    expect((await takeBudget(req, 9_000_000)).ok).toBe(false);
  });

  it("throws in production when Redis is not configured, and never runs unlimited", async () => {
    getRedisMock.mockImplementation(() => {
      throw new StoreUnavailableError("redis", "UPSTASH_REDIS_REST_URL");
    });
    vi.stubEnv("NODE_ENV", "production");
    await expect(takeBudget(request())).rejects.toBeInstanceOf(StoreUnavailableError);
  });

  it("lets any other Redis failure surface rather than swallowing it", async () => {
    getRedisMock.mockImplementation(() => {
      throw new TypeError("fetch failed");
    });
    vi.stubEnv("NODE_ENV", "test");
    await expect(takeBudget(request())).rejects.toBeInstanceOf(TypeError);
  });
});

describe("budgetKeyForIp", () => {
  const headersOf = (init: Record<string, string>) => new Headers(init);

  it("is sixteen hex characters that never contain the address", () => {
    const key = budgetKeyForIp(headersOf({ "x-real-ip": "203.0.113.9" }));
    expect(key).toMatch(/^[0-9a-f]{16}$/);
    expect(key).not.toContain("203.0.113.9");
    expect(key).not.toContain("203");
  });

  it("prefers x-real-ip, then the last x-forwarded-for entry, then unknown", () => {
    const real = budgetKeyForIp(headersOf({ "x-real-ip": "203.0.113.9", "x-forwarded-for": "198.51.100.1, 203.0.113.9" }));
    const last = budgetKeyForIp(headersOf({ "x-forwarded-for": "198.51.100.1, 203.0.113.9" }));
    const first = budgetKeyForIp(headersOf({ "x-forwarded-for": "198.51.100.1" }));
    expect(real).toBe(last);
    expect(first).not.toBe(last);
    expect(budgetKeyForIp(headersOf({}))).toBe(budgetKeyForIp(headersOf({ "x-forwarded-for": "" })));
  });

  it("changes with the UTC date, so yesterday's key cannot be joined to today's", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-09-03T23:59:59Z"));
      const before = budgetKeyForIp(headersOf({ "x-real-ip": "203.0.113.9" }));
      expect(budgetKeyForIp(headersOf({ "x-real-ip": "203.0.113.9" }))).toBe(before);
      vi.setSystemTime(new Date("2026-09-04T00:00:00Z"));
      expect(budgetKeyForIp(headersOf({ "x-real-ip": "203.0.113.9" }))).not.toBe(before);
    } finally {
      vi.useRealTimers();
    }
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd "$WT" && npx vitest run lib/budget.test.ts`
Expected: FAIL, `Failed to resolve import "./budget"`.

- [ ] **Step 3: Write the budget module**

`lib/budget.ts`:

```ts
import { createHash } from "node:crypto";
import { StoreUnavailableError } from "./store/errors";
import { getRedis } from "./store/redis";

/**
 * Budgets: how many times a thing may happen in a window, agreed on by every
 * replica.
 *
 * Replaces the token bucket that lived in
 * `app/tools/headline-check/rate-limit.ts` until 2026-09-03. That one sat in a
 * module `Map`, so every serverless instance kept its own copy and anybody
 * who arrived often enough to land on fresh instances beat it without trying.
 * This one counts in Upstash Redis, so the fourth call of a budget of three
 * is refused whichever instance answers it. `lib/budget.integration.test.ts`
 * proves that against the real database, from two module instances.
 *
 * ## Shape
 *
 * A budget is a fixed window that starts on the first hit. `SET key 0 EX
 * window NX` creates the key with its TTL only if it does not exist, then
 * `INCR` counts; both in one transaction, so an allowed call costs two Redis
 * commands and not three, because 500,000 commands a month is the meter this
 * site lives under. A refused call spends one more (`PTTL`) to say when the
 * counter resets, and refusals are the rare path.
 *
 * ## Three scopes
 *
 * `ip` for one visitor, `target` for one thing being fetched or rendered,
 * `global` for everyone together. A hosted tool takes all three, in that
 * order, so a refused visitor never spends the target or global count.
 *
 * ## The fallback, and where it is refused
 *
 * Outside production, no Redis means an in-memory `Map` with the same window
 * semantics, so `npm run dev` and `npm test` work on a laptop with no store.
 * In production, no Redis throws `StoreUnavailableError`. It never falls back
 * to unlimited and never falls back quietly: the design's rule is that a
 * missing store fails loudly rather than degrading.
 *
 * ## The address is never stored
 *
 * `budgetKeyForIp` hashes the visitor's address with the UTC date, so the key
 * is a different sixteen hex characters every day and there is no way back
 * from a key to a person. That is the whole of the site's server-side memory
 * of a visitor, and it expires with the window.
 *
 * Preview and production deployments share one database and one key space
 * (the key does not carry the environment), so a preview test spends the
 * same counters production does. Recorded in the programme ledger.
 */

export type BudgetScope = "ip" | "target" | "global";

export type BudgetRequest = {
  tool: string;
  scope: BudgetScope;
  key: string;
  limit: number;
  windowSec: number;
};

export type BudgetResult =
  | { ok: true; remaining: number }
  | { ok: false; remaining: 0; retryAfterSec: number; reason: string };

/** Above this many tracked windows, the in-memory fallback drops expired ones. */
export const MAX_TRACKED = 5000;

export function budgetKey(req: BudgetRequest): string {
  return `budget:${req.tool}:${req.scope}:${req.key}`;
}

/* ── the sentence ────────────────────────────────────────────────────────── */

function describeWindow(windowSec: number): string {
  if (windowSec >= 86_400) return "today";
  if (windowSec >= 3_600) return "this hour";
  if (windowSec >= 60) return "this minute";
  return `these ${windowSec} seconds`;
}

function describeWait(seconds: number): string {
  if (seconds >= 7_200) return `${Math.ceil(seconds / 3_600)} hours`;
  if (seconds >= 3_600) return "an hour";
  if (seconds >= 120) return `${Math.ceil(seconds / 60)} minutes`;
  if (seconds >= 60) return "a minute";
  if (seconds === 1) return "a second";
  return `${seconds} seconds`;
}

/**
 * The sentence a page prints when a budget refuses. A refusal is never a
 * spinner and never a bare "try later": it says who used what, and when it
 * comes back.
 */
export function refusalReason(scope: BudgetScope, limit: number, windowSec: number, retryAfterSec: number): string {
  const runs = limit === 1 ? "run" : "runs";
  const subject =
    scope === "ip"
      ? "This address has used its"
      : scope === "target"
        ? "That site has had its"
        : "Everyone together has used the";
  return `${subject} ${limit} ${runs} for ${describeWindow(windowSec)}; the counter resets in ${describeWait(retryAfterSec)}.`;
}

function decide(req: BudgetRequest, count: number, retryAfterSec: number): BudgetResult {
  if (count <= req.limit) return { ok: true, remaining: req.limit - count };
  return {
    ok: false,
    remaining: 0,
    retryAfterSec,
    reason: refusalReason(req.scope, req.limit, req.windowSec, retryAfterSec),
  };
}

/* ── Redis ───────────────────────────────────────────────────────────────── */

type BudgetTransaction = {
  set(key: string, value: number, options: { ex: number; nx: true }): BudgetTransaction;
  incr(key: string): BudgetTransaction;
  exec(): Promise<unknown[]>;
};

/** The four things this module needs from a Redis client. `Redis` from `@upstash/redis` satisfies it. */
export type BudgetRedis = {
  multi(): BudgetTransaction;
  pttl(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
};

async function secondsUntilReset(redis: BudgetRedis, key: string, windowSec: number): Promise<number> {
  let ttlMs = await redis.pttl(key);
  if (ttlMs < 0) {
    // -1 is a key with no expiry, -2 a key that is gone. Neither should
    // happen, and a counter that never resets is a permanent lockout, so it
    // is given the window rather than trusted.
    await redis.expire(key, windowSec);
    ttlMs = windowSec * 1000;
  }
  return Math.max(1, Math.ceil(ttlMs / 1000));
}

export async function takeBudgetOnRedis(redis: BudgetRedis, req: BudgetRequest): Promise<BudgetResult> {
  const key = budgetKey(req);
  const results = await redis.multi().set(key, 0, { ex: req.windowSec, nx: true }).incr(key).exec();
  const count = Number(results[1]);
  const retryAfterSec = count > req.limit ? await secondsUntilReset(redis, key, req.windowSec) : 0;
  return decide(req, count, retryAfterSec);
}

/* ── memory ──────────────────────────────────────────────────────────────── */

type MemoryWindow = { count: number; expiresAt: number };

const memory = new Map<string, MemoryWindow>();

/**
 * The same window, in this process only. `now` is a parameter so a test can
 * move the clock, exactly as the old token bucket did.
 */
export function takeBudgetInMemory(req: BudgetRequest, now: number): BudgetResult {
  if (memory.size > MAX_TRACKED) {
    for (const [key, window] of memory) {
      if (window.expiresAt <= now) memory.delete(key);
    }
    if (memory.size > MAX_TRACKED) memory.clear();
  }

  const key = budgetKey(req);
  const existing = memory.get(key);
  const window: MemoryWindow =
    existing && existing.expiresAt > now ? existing : { count: 0, expiresAt: now + req.windowSec * 1000 };
  window.count += 1;
  memory.set(key, window);

  return decide(req, window.count, Math.max(1, Math.ceil((window.expiresAt - now) / 1000)));
}

/* ── the router ──────────────────────────────────────────────────────────── */

/**
 * Take one unit of budget. Redis when it is configured; memory outside
 * production when it is not; a throw in production when it is not.
 *
 * `now` drives the memory path only. Redis keeps its own clock.
 */
export async function takeBudget(req: BudgetRequest, now: number = Date.now()): Promise<BudgetResult> {
  let redis: BudgetRedis;
  try {
    redis = getRedis();
  } catch (error) {
    if (error instanceof StoreUnavailableError && process.env.NODE_ENV !== "production") {
      return takeBudgetInMemory(req, now);
    }
    throw error;
  }
  return takeBudgetOnRedis(redis, req);
}

/* ── the visitor ─────────────────────────────────────────────────────────── */

/**
 * A key for the visitor's address that is not the visitor's address.
 *
 * `x-real-ip` first, and the **last** entry of `x-forwarded-for` after it.
 * That header accumulates left to right, so the leftmost value is whatever
 * the client sent and the rightmost is what the nearest proxy appended;
 * keying on the leftmost hands every caller a fresh budget for the price of
 * one header. Vercel overwrites the header rather than appending, so on this
 * host both ends are the same value; that is a fact about the platform, not a
 * property of the code.
 *
 * Then `sha256(ip + ":" + yyyy-mm-dd)`, first sixteen hex characters. The
 * date is the salt, so the raw address is never stored and two days' keys
 * cannot be joined. `Pick<Headers, "get">` rather than `Headers` so Next's
 * `ReadonlyHeaders` passes without a cast; every `Headers` satisfies it.
 */
export function budgetKeyForIp(headers: Pick<Headers, "get">): string {
  const forwarded = headers.get("x-forwarded-for") ?? "";
  const chain = forwarded
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const ip = headers.get("x-real-ip")?.trim() || chain[chain.length - 1] || "unknown";
  const day = new Date().toISOString().slice(0, 10);
  return createHash("sha256").update(`${ip}:${day}`).digest("hex").slice(0, 16);
}
```

- [ ] **Step 4: Run the unit test and the typecheck**

Run: `cd "$WT" && npx vitest run lib/budget.test.ts && npx tsc --noEmit`
Expected: all passed, `tsc` silent. If `tsc` reports that `Redis` is not assignable to `BudgetRedis` at `redis = getRedis()` (the SDK's `multi()` return type is a generic tuple-typed pipeline and `exec` is generic), change that one line to `redis = getRedis() as unknown as BudgetRedis;` with the comment `// The SDK's pipeline is typed as a growing tuple; the integration test proves the shape at runtime.` Nothing else changes.

- [ ] **Step 5: Write the integration test**

`lib/budget.integration.test.ts`. Skipped unless a Redis pair is in the environment; otherwise runs against the real database with a throwaway tool name and deletes its keys after.

```ts
import { afterAll, describe, expect, it, vi } from "vitest";
import { Redis } from "@upstash/redis";

/**
 * The proof the design asks for: a budget of three exhausted on the fourth
 * call, from two different function instances, against the real Upstash
 * database. Two module instances (`vi.resetModules()` between imports) stand
 * in for two functions: they share nothing in memory, so if either one were
 * quietly counting in its own `Map` the second instance would see a fresh
 * count and the fourth call would be allowed, and this test would fail.
 *
 * Skipped when no Redis pair is present, which is every CI run (the
 * repository is public and fork pull requests never see secrets) and the
 * parity image's build-time `npm test`. Run it on purpose:
 *
 *     set -a; . ./.env.local; set +a; npx vitest run lib/budget.integration.test.ts
 *
 * Spends about twenty commands on the meter per run. Keys are named after a
 * throwaway tool and deleted in `afterAll`.
 */

const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const configured = Boolean(url && token);
const tool = `itest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

describe.skipIf(!configured)("takeBudget against the real Upstash database", () => {
  afterAll(async () => {
    if (!configured) return;
    const redis = new Redis({ url: url as string, token: token as string });
    await redis.del(`budget:${tool}:ip:one`, `budget:${tool}:ip:two`);
  });

  it("refuses the fourth call of a limit of three", async () => {
    const { takeBudget } = await import("./budget");
    const req = { tool, scope: "ip" as const, key: "one", limit: 3, windowSec: 120 };
    expect(await takeBudget(req)).toEqual({ ok: true, remaining: 2 });
    expect(await takeBudget(req)).toEqual({ ok: true, remaining: 1 });
    expect(await takeBudget(req)).toEqual({ ok: true, remaining: 0 });
    const fourth = await takeBudget(req);
    expect(fourth.ok).toBe(false);
    if (!fourth.ok) {
      expect(fourth.retryAfterSec).toBeGreaterThan(0);
      expect(fourth.retryAfterSec).toBeLessThanOrEqual(120);
      expect(fourth.reason).toMatch(/^This address has used its 3 runs for these 120 seconds; the counter resets in /);
    }
  });

  it("shares the count between two module instances, as two function instances would", async () => {
    const req = { tool, scope: "ip" as const, key: "two", limit: 3, windowSec: 120 };
    const a = await import("./budget");
    vi.resetModules();
    const b = await import("./budget");
    expect(b).not.toBe(a);

    expect((await a.takeBudget(req)).ok).toBe(true);
    expect((await b.takeBudget(req)).ok).toBe(true);
    expect((await a.takeBudget(req)).ok).toBe(true);
    const fourth = await b.takeBudget(req);
    expect(fourth.ok).toBe(false);
  });
});
```

- [ ] **Step 6: Prove the skip, then run it for real and measure the commands**

First without variables, which is what CI and the parity build see:

```bash
cd "$WT"
env -u UPSTASH_REDIS_REST_URL -u KV_REST_API_URL npx vitest run lib/budget.integration.test.ts
```

Expected: `2 skipped`, exit 0. (A run that reports `2 failed` here means the skip guard is wrong and CI would go red.)

Then read the meter, run it, read the meter again. Upstash's REST endpoint may or may not answer `INFO commandstats`; try it, and if it returns an error use the console (Upstash console, the database, Usage, "Commands", today's figure).

```bash
cd "$WT"
set -a; . ./.env.local; set +a
URL="${UPSTASH_REDIS_REST_URL:-$KV_REST_API_URL}"; TOKEN="${UPSTASH_REDIS_REST_TOKEN:-$KV_REST_API_TOKEN}"
curl -s -H "Authorization: Bearer $TOKEN" "$URL/info/commandstats" | head -c 600; echo
npx vitest run lib/budget.integration.test.ts
curl -s -H "Authorization: Bearer $TOKEN" "$URL/info/commandstats" | head -c 600; echo
curl -s -H "Authorization: Bearer $TOKEN" "$URL/dbsize"; echo
```

Expected: `2 passed`. `DBSIZE` back to what it was before the run (the `afterAll` deleted both keys; a leftover is a real finding about the cleanup). The command delta is about 19: two tests of four calls (2 each) plus one `PTTL` per refusal and one `DEL`. If `INFO` is refused, take the before and after "Commands" figure from the console and record the difference. Write the figure into `f4-stores-2026-09-03.md` and into the ledger's Meters row for 2026-09 as the running total so far (provisioning 2, store check 2 per run, this test about 19 per run). A delta in the hundreds means something loops, and that is a bug to find before anything ships.

- [ ] **Step 7: Add the budget mutations and prove every one goes red**

Append to `MUTATIONS` in `scripts/mutation-check.mjs`, after the fence entries:

```js
  // ── budgets (2026-09-03) ──
  {
    name: "the budget allows one extra run",
    file: "lib/budget.ts",
    pattern: /if \(count <= req\.limit\) return/,
    replace: "if (count <= req.limit + 1) return",
  },
  {
    name: "production silently falls back to memory",
    file: "lib/budget.ts",
    pattern: /error instanceof StoreUnavailableError && process\.env\.NODE_ENV !== "production"/,
    replace: "error instanceof StoreUnavailableError",
  },
  {
    name: "the raw address goes into the budget key",
    file: "lib/budget.ts",
    pattern: /createHash\("sha256"\)\.update\(`\$\{ip\}:\$\{day\}`\)\.digest\("hex"\)\.slice\(0, 16\)/,
    replace: "ip",
  },
  {
    name: "the in-memory window never expires",
    file: "lib/budget.ts",
    pattern: /existing && existing\.expiresAt > now \? existing/,
    replace: "existing ? existing",
  },
  {
    name: "the counter is created without a TTL",
    file: "lib/budget.ts",
    pattern: /\{ ex: req\.windowSec, nx: true \}/,
    replace: "{ nx: true } as { ex: number; nx: true }",
  },
```

Run: `cd "$WT" && node scripts/mutation-check.mjs 2>&1 | tail -10`
Expected: `51/51 mutations caught.` and no `Survived` block. The TTL mutation is caught because the fake in `budget.test.ts` computes `expiresAt` from `options.ex`, and without it the window is dead on arrival and every call is allowed.

- [ ] **Step 8: Commit**

```bash
cd "$WT"
git add lib/budget.ts lib/budget.test.ts lib/budget.integration.test.ts scripts/mutation-check.mjs docs/superpowers/programme/f4-stores-2026-09-03.md docs/superpowers/programme/toolshed-ledger.md
git commit -m "feat(budget): per-ip, per-target and global budgets on redis, proven from two instances"
```

---

### Task 5: headline-check on the shared budget and the shared fence

**Files:**
- Modify: `app/tools/headline-check/state.ts` (add `HEADLINE_BUDGETS` and `headlineCopy.storeDown`; remove `headlineCopy.limited`)
- Create: `app/tools/headline-check/state.test.ts`
- Modify: `app/tools/headline-check/actions.ts` (whole file replaced)
- Delete: `app/tools/headline-check/rate-limit.ts`, `app/tools/headline-check/rate-limit.test.ts`

**Interfaces:**
- Consumes: `takeBudget`, `budgetKeyForIp`, `BudgetScope` from `lib/budget.ts`; `checkUrl` from `lib/fence.ts`; `fetchPage` from `lib/headline-fetch.ts`; `checkHtml` from `lib/headline.ts`.
- Produces: `HEADLINE_BUDGETS: Record<BudgetScope, { limit: number; windowSec: number }>` and `headlineCopy.storeDown`. `HeadlineForm.tsx` already prints `state.message` for the `limited` and `failed` statuses, so it does not change. Task 8's live check reads the sentences this task wires in.

- [ ] **Step 1: Confirm who reads the things about to change**

```bash
cd "$WT"
grep -rn "headlineCopy.limited\|takeToken\|rate-limit" --include=*.ts --include=*.tsx app lib components scripts
```

Expected: `actions.ts` (the import and the call), `rate-limit.test.ts`, and nothing else. `HeadlineForm.tsx` reads `state.message`, never the `limited` key. If anything else appears, it moves with this task.

- [ ] **Step 2: Write the failing test for the budget constants and the copy**

`app/tools/headline-check/state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { HEADLINE_BUDGETS, headlineCopy } from "./state";

/**
 * The numbers the action spends, pinned so a change to them is a change
 * somebody meant. The third test ties them to the Redis meter: 500,000
 * commands a month is the allotment, the design's table already plans 206k of
 * it across the other tools, and this tool at its own ceiling must leave that
 * total under the 60% rule.
 */
describe("HEADLINE_BUDGETS", () => {
  it("is per address, per site and for everyone, in windows the sentence can name", () => {
    expect(HEADLINE_BUDGETS.ip).toEqual({ limit: 20, windowSec: 3600 });
    expect(HEADLINE_BUDGETS.target).toEqual({ limit: 60, windowSec: 3600 });
    expect(HEADLINE_BUDGETS.global).toEqual({ limit: 300, windowSec: 86_400 });
  });

  it("trips the per-address budget before the per-site one, so a live check from one address is deterministic", () => {
    expect(HEADLINE_BUDGETS.ip.limit).toBeLessThan(HEADLINE_BUDGETS.target.limit);
  });

  it("stays under 12% of the monthly Redis meter at the global ceiling", () => {
    // Three budgets a check, two commands each when allowed, every day of the
    // longest month. 206k planned elsewhere plus this must stay under 300k.
    const commandsPerCheck = 3 * 2;
    const worstMonth = HEADLINE_BUDGETS.global.limit * commandsPerCheck * 31;
    expect(worstMonth).toBeLessThan(500_000 * 0.12);
  });
});

describe("headlineCopy", () => {
  it("has a sentence for the store being down, and none for a limit, which the budget now writes", () => {
    expect(headlineCopy.storeDown.endsWith(".")).toBe(true);
    expect(headlineCopy.storeDown.length).toBeGreaterThan(20);
    expect("limited" in headlineCopy).toBe(false);
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `cd "$WT" && npx vitest run app/tools/headline-check/state.test.ts`
Expected: FAIL, `HEADLINE_BUDGETS` is not exported (a `SyntaxError` on the named import, or `undefined` reads), and the `limited` assertion fails because the key still exists.

- [ ] **Step 4: Edit `state.ts`**

Add after the `MAX_URL_LENGTH` export:

```ts
import type { BudgetScope } from "@/lib/budget";

/**
 * What one check may spend, per address, per site and for everyone. The
 * numbers are pinned in `state.test.ts`, with the arithmetic that keeps them
 * inside the Redis meter. Type-only import: this module is read by the client
 * form and must not pull `lib/budget.ts` (and `node:crypto`) into its bundle.
 */
export const HEADLINE_BUDGETS: Record<BudgetScope, { limit: number; windowSec: number }> = {
  ip: { limit: 20, windowSec: 3600 },
  target: { limit: 60, windowSec: 3600 },
  global: { limit: 300, windowSec: 86_400 },
};
```

(Move the `import type` line up with the other import at the top of the file; the block above shows it beside the constant only so its reason is next to it.)

In `headlineCopy`, delete the `limited:` entry and its string, and add in its place:

```ts
  storeDown:
    "The counter that keeps this tool fair is not answering, so the check did not run. Try again in a minute.",
```

- [ ] **Step 5: Run the state test to see it pass**

Run: `cd "$WT" && npx vitest run app/tools/headline-check/state.test.ts`
Expected: 4 passed.

- [ ] **Step 6: Replace `actions.ts`**

The whole file:

```ts
"use server";

import { headers } from "next/headers";
import { budgetKeyForIp, takeBudget, type BudgetScope } from "@/lib/budget";
import { checkUrl } from "@/lib/fence";
import { checkHtml } from "@/lib/headline";
import { fetchPage } from "@/lib/headline-fetch";
import { HEADLINE_BUDGETS, MAX_URL_LENGTH, URL_FIELD, headlineCopy, type ToolState } from "./state";

/**
 * The server action the form posts to.
 *
 * Thin on purpose. The things worth getting right live in `lib/` with tests
 * against them: refusing a URL this server should not reach (`lib/fence.ts`,
 * run here before a budget is spent and again inside `lib/headline-fetch.ts`
 * on every redirect hop), counting runs where every replica can see the count
 * (`lib/budget.ts`), and reading the heading (`lib/headline.ts`). A
 * `"use server"` module is a network boundary, and logic behind one only
 * ever gets exercised by a stranger who has already pasted a URL.
 *
 * **Every path out of here carries a message.** There is no branch that
 * returns a bare failure, because "nothing happened" is the exact bug the
 * rest of this site has a rule about. That includes the store being down:
 * `lib/budget.ts` throws rather than running unlimited, and this turns the
 * throw into a sentence rather than into the error boundary.
 */
export async function headlineCheckAction(prev: ToolState, formData: FormData): Promise<ToolState> {
  // Counts answers, so the form can re-key its input and keep the URL in it.
  const seq = (prev?.seq ?? 0) + 1;

  const raw = String(formData.get(URL_FIELD) ?? "").trim();
  if (raw === "") return { status: "invalid", seq, url: "", message: headlineCopy.emptyUrl };
  if (raw.length > MAX_URL_LENGTH) {
    return { status: "invalid", seq, url: raw.slice(0, 200), message: headlineCopy.tooLong };
  }

  // The fence's synchronous half, before any budget is spent: a URL that was
  // never going to be fetched costs the visitor nothing.
  const fence = checkUrl(raw);
  if (!fence.ok) return { status: "failed", seq, url: raw, message: fence.reason };

  // Three budgets, cheapest refusal first, so a refused visitor never spends
  // the target or global count. The keys are a salted hash of the address, a
  // hostname, and the word "all": nothing here is the URL and nothing here is
  // a person.
  const header = await headers();
  const takes: Array<{ scope: BudgetScope; key: string }> = [
    { scope: "ip", key: budgetKeyForIp(header) },
    { scope: "target", key: fence.url.hostname.toLowerCase() },
    { scope: "global", key: "all" },
  ];
  try {
    for (const { scope, key } of takes) {
      const budget = await takeBudget({ tool: "headline-check", scope, key, ...HEADLINE_BUDGETS[scope] });
      if (!budget.ok) return { status: "limited", seq, url: raw, message: budget.reason };
    }
  } catch (error) {
    // A missing or unreachable store is loud by design, and loud here means a
    // sentence on the page plus a line in the function log. A store error
    // carries no visitor data and no credential, so the message is safe to log.
    const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error(`[headline-check] budget store failed: ${text}`);
    return { status: "failed", seq, url: raw, message: headlineCopy.storeDown };
  }

  const page = await fetchPage(raw);
  if (!page.ok) {
    // `detail` is written for a person and always names the actual fault: the
    // scheme, the address, the status code, the content type.
    return { status: "failed", seq, url: raw, message: page.detail };
  }

  return {
    status: "done",
    seq,
    url: raw,
    finalUrl: page.finalUrl,
    redirects: page.redirects,
    report: checkHtml(page.html),
  };
}
```

- [ ] **Step 7: Delete the old limiter and prove the tree is whole**

```bash
cd "$WT"
git rm app/tools/headline-check/rate-limit.ts app/tools/headline-check/rate-limit.test.ts
npx tsc --noEmit
npm test
```

Expected: `tsc` silent; the suite green with the old `rate-limit` file gone and `state.test.ts`, `fence.test.ts`, `budget.test.ts` and the three store tests in the count. `budget.integration.test.ts` reports skipped (no variables in the vitest process; `npm test` does not load `.env.local`).

- [ ] **Step 8: Build, then prove the wiring against the real Redis from a dev server**

```bash
cd "$WT"
npm run build 2>&1 | tail -15
```

Expected: the route table with `/tools/headline-check` and no error. A build error naming `node:crypto` or `node:dns` in a client chunk means a client component imported `lib/budget.ts` or `lib/fence.ts` by value; the only allowed import from `state.ts` is the `import type`.

Then run the dev server with the store variables (Task 1 put them in the worktree's `.env.local`, which `next dev` loads on its own), drive the form through the Playwright MCP browser, and read Redis afterwards:

```bash
cd "$WT"
npm run dev
```

In the browser (Playwright MCP: `browser_navigate`, `browser_type` into the field labelled "Page URL", press Enter, `browser_snapshot` to read the result panel), at `http://localhost:3000/tools/headline-check`, in this order:

1. `http://169.254.169.254/latest/meta-data/` → the failed panel reads `169.254.169.254 is on a private, loopback or reserved network, so this server will not fetch it.` No budget is spent (the fence runs first).
2. `http://example.com:8080/` → `Port 8080 is not one I will fetch from. Only 80 and 443.`
3. `https://user:secret@example.com/` → the credentials sentence, and the word `secret` appears nowhere on the page.
4. `example.com` → the done panel with "What a person sees".

Then, with the dev server still up:

```bash
cd "$WT"
set -a; . ./.env.local; set +a
URL="${UPSTASH_REDIS_REST_URL:-$KV_REST_API_URL}"; TOKEN="${UPSTASH_REDIS_REST_TOKEN:-$KV_REST_API_TOKEN}"
curl -s -H "Authorization: Bearer $TOKEN" "$URL/keys/budget:headline-check:*"; echo
```

Expected: three keys, `budget:headline-check:ip:<16 hex characters>`, `budget:headline-check:target:example.com`, `budget:headline-check:global:all`, and no key containing a dotted address. That is the proof the action counted in Redis rather than in memory (the dev process has the variables, so `takeBudget` took the Redis branch) and that the address was hashed. Stop the dev server. The keys expire on their own within the hour; `KEYS` cost one command, note it in the record.

- [ ] **Step 9: Commit**

```bash
cd "$WT"
git add app/tools/headline-check/state.ts app/tools/headline-check/state.test.ts app/tools/headline-check/actions.ts
git commit -m "feat(headline-check): count runs on redis and refuse through the shared fence"
```

---

### Task 6: `.env.example`, the gitignore exception, and AGENTS.md

**Files:**
- Create: `.env.example`
- Modify: `.gitignore` (one line)
- Modify: `AGENTS.md` (the headline-check paragraph, the Resend sentence, a new "Environment variables" section, the `lib/` line in the layout tree)

**Interfaces:**
- Consumes: the variable names from Task 1's record and the module names from Tasks 2 to 4.
- Produces: the documented list every later sub-project adds its variables to.

- [ ] **Step 1: Write `.env.example`**

Blank values, one comment per variable saying what reads it and whether it is a secret. The divider lines use the box-drawing character the repo already uses in `lib/` section headers, not a dash.

```
# Every variable this site reads, with blank values. Committed on purpose:
# `.env*` is gitignored and this file is the one exception, by name.
#
# Copy it to .env.local and fill in what you have, or pull from Vercel:
#
#   vercel --token "$VERCEL_TOKEN_PERSONAL" --scope larry-pm env pull .env.vercel --environment development --yes
#
# then append the lines you want from .env.vercel to .env.local and delete
# .env.vercel. `env pull` overwrites its target, and .env.local carries notes
# a pull would flatten. Never commit .env.local or .env.vercel.
#
# Rules the code keeps: nothing reads process.env at import time; a missing
# store variable throws StoreUnavailableError naming it (lib/store/errors.ts);
# the budget layer alone falls back to memory, and only outside production.

# ── Analytics ────────────────────────────────────────────────────────────────
# PostHog's write-only project token for project 569350 (US Cloud). Ships in
# the client bundle by design, so it is not a secret. Read by lib/analytics.ts
# and lib/posthog-server.ts; absent means "do nothing", never an error.
NEXT_PUBLIC_POSTHOG_KEY=

# ── Contact form (lib/contact-server.ts) ─────────────────────────────────────
# Resend API key. Secret. The only variable the contact form needs.
RESEND_API_KEY=
# Optional overrides. Read the DEFAULT_FROM docblock in lib/contact.ts before
# setting either: the shared sender may only deliver to the account's own
# address.
# CONTACT_TO_EMAIL=
# CONTACT_FROM_EMAIL=

# ── Search engine ownership (app/layout.tsx), production only ────────────────
# Unset locally on purpose: only the production hostname should claim the
# site, and an unset variable emits no tag.
# GOOGLE_SITE_VERIFICATION=
# BING_SITE_VERIFICATION=

# ── Upstash Redis (lib/store/redis.ts) ───────────────────────────────────────
# Budgets today; Burn, the relay and the initials boards later. Secrets. Free
# tier: 256 MB and 500,000 commands a month, and the command count is the
# meter to watch. The Vercel Marketplace integration writes the KV_* pair;
# Upstash's console writes the UPSTASH_* pair. lib/store/redis.ts reads
# UPSTASH_* first and KV_* second, so set whichever pair you have.
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
# KV_REST_API_URL=
# KV_REST_API_TOKEN=

# ── Neon Postgres (lib/store/neon.ts) ────────────────────────────────────────
# The pooled connection string. Secret. Free tier: 0.5 GB and 100
# compute-hours a month, scaling to zero after five minutes idle. pgvector is
# enabled with `create extension if not exists vector`, which
# scripts/store-check.mjs runs.
DATABASE_URL=

# ── Vercel Blob (lib/store/blob.ts) ──────────────────────────────────────────
# Read-write token for the store fergus-portfolio-blob (public access, random
# suffixes on every pathname). Secret. The Hobby allotment as read on the day
# is in docs/superpowers/programme/f4-stores-2026-09-03.md.
BLOB_READ_WRITE_TOKEN=
```

- [ ] **Step 2: Let git see it**

`.gitignore` has `.env*`, which swallows `.env.example`. Add the negation on the line after it:

```
.env*
!.env.example
```

Then prove it:

```bash
cd "$WT"
git check-ignore -v .env.example; echo "exit $?"
git check-ignore -v .env.local; echo "exit $?"
git status --short
```

Expected: the first prints nothing and `exit 1` (not ignored); the second prints the `.env*` rule and `exit 0` (still ignored); `git status` shows `.env.example` and `.gitignore` and nothing env-shaped besides.

- [ ] **Step 3: Rewrite the headline-check paragraph in AGENTS.md**

Find the paragraph beginning `**\`/tools/headline-check\` fetches a URL a stranger typed**` and ending `Do not weaken either without reading that first.` Replace the whole paragraph with:

```markdown
**`/tools/headline-check` fetches a URL a stranger typed**, which made it the first thing on this
site with a real attack surface, and the toolshed programme is adding more. The guard is
`lib/fence.ts`, shared by everything that takes a URL from a visitor: `checkUrl` refuses bad
syntax, schemes other than http and https, credentials, local names, private or reserved address
literals (including the decimal, octal and v4-mapped-v6 spellings) and ports other than 80 and
443; `resolveAndCheck` refuses a name whose DNS answers include a private address, every answer
and not the first. `lib/headline-fetch.ts` runs both on the typed URL and again on every redirect
hop, caps time and size, and checks the content type before any body is read. Its docblock states
the gap neither closes (DNS rebinding). Do not weaken any of it without reading both files first.

The courtesy limiter that used to sit in a module `Map` is `lib/budget.ts` now, on Upstash Redis
so every replica agrees: per address (hashed with a daily salt, never the raw IP), per target
site, and for everyone together, each refusal a sentence the page prints. Outside production it
falls back to memory when Redis is not configured; in production it throws, never runs unlimited.
```

- [ ] **Step 4: Fix the Resend sentence and add the environment section**

In the contact-form section, change `\`RESEND_API_KEY\` is the only required
variable and it **is set**` to `\`RESEND_API_KEY\` is the only variable the contact form needs, and it **is set**` (the line break inside the original sentence falls wherever the editor leaves it).

Insert immediately before `## Commands`:

```markdown
## Environment variables

`.env.example` is the list: every variable, what reads it, whether it is a secret, and the free
tier behind each store. Copy it to `.env.local` or pull from Vercel the way its header says
(`vercel env pull` overwrites its target, so pull to a scratch file and merge). Three rules the
code keeps, with tests: nothing reads `process.env` at import time, every store client is built
on first use; a missing store variable throws `StoreUnavailableError` naming the variable, so a
misconfigured deploy fails on its first request rather than degrading; and `lib/budget.ts` is the
one exception, falling back to memory outside production only, so `npm run dev` works on a
laptop with no Redis. `node scripts/store-check.mjs` proves the three stores answer and prints
nothing secret. The provisioning record, with plan names, regions and the quota figures read on
the day, is `docs/superpowers/programme/f4-stores-2026-09-03.md`.

Preview and production share one Redis and one key space (the budget key does not carry the
environment), so a preview test spends the same counters production does.
```

In the layout tree under `## Layout of the repo`, extend the `lib/` line so it reads:

```
lib/            commands.ts (pure terminal parser + tab completion), system.ts (bus types,
                themes, formatters), scramble.ts, physics.ts (rigid-body solver), audio.ts
                (runtime synth), eject.ts (pull-back geometry), fence.ts (the SSRF fence),
                budget.ts (per-address, per-target and global budgets on Redis),
                store/ (redis, neon, blob: thin, env-guarded, built on first use)
                : all have .test.ts siblings
```

- [ ] **Step 5: Run the house-style guard and commit**

```bash
cd "$WT"
npx vitest run content/voice.test.ts
python -c "import sys; [print(f, open(f, encoding='utf-8').read().count(chr(0x2014))) for f in sys.argv[1:]]" AGENTS.md .env.example; echo "(both counts above must be 0; the character is produced at run time so this plan carries none)"
git add .env.example .gitignore AGENTS.md
git commit -m "docs(env): one documented list of variables, and the constitution names the fence and the budgets"
```

Expected: the voice test green (it scans `.ts`/`.tsx`; the grep covers the two files it does not), both counts `0`.

---

### Task 7: The Docker parity image, and the Redis meter reading

**Files:**
- Modify: `docs/superpowers/programme/f4-stores-2026-09-03.md` (the parity result and the command count)
- Modify: `docs/superpowers/programme/toolshed-ledger.md` (Meters row, log)

**Interfaces:**
- Consumes: `Dockerfile.parity` as it is (no change to it), the worktree's `.env.local`, `scripts/store-check.mjs`, `lib/budget.integration.test.ts`.
- Produces: the evidence Task 8's pull request cites, and the first Redis figure in the ledger's Meters table.

This is the high-risk gate from the design (section 8, point 6): F4 changes what the site does with a stranger's URL and adds three credentials to the deploy, so it does not ship on "works on my machine". The image installs from the lockfile under strict peers on the Node version Vercel runs, builds with **no store variables at all** (`.dockerignore` excludes `.env*` on purpose), and runs the suite in that state. Then the same image is run against the real stores.

- [ ] **Step 1: Prove the instrument**

```bash
docker version --format '{{.Server.Version}}'
docker run --rm hello-world 2>&1 | head -3
```

Expected: a version, and `Hello from Docker!`. `error during connect` means Docker Desktop is not running; start it and take this reading again before blaming anything in the tree. A parity build that cannot start is a fact about the laptop, not about the code.

- [ ] **Step 2: Build with a unique tag, in the foreground**

The PostHog key is public by design (it ships in the client bundle); it is read out of `.env.local` into the build argument without being printed, so the build exercises the same analytics path Vercel will.

```bash
cd "$WT"
TAG="fergus-portfolio-parity:$(git rev-parse --short HEAD)"
echo "$TAG"
docker build -f Dockerfile.parity -t "$TAG" \
  --build-arg NEXT_PUBLIC_POSTHOG_KEY="$(grep -E '^NEXT_PUBLIC_POSTHOG_KEY=' .env.local | head -1 | cut -d= -f2- | tr -d '"')" \
  . 2>&1 | tail -40
```

Run it in the foreground with a ten-minute timeout and read the whole tail. Expected, in this order in the output: `npm ci` completing without `ERESOLVE`; `next build` ending with the route table that lists `/tools/headline-check` and `/api/mcp`; `npm test` ending green with `budget.integration.test.ts` shown as skipped; the image tagged.

What would make this step fail, and what each one means:

- **`ERESOLVE` during `npm ci`.** The lockfile Task 2 committed is not clean under strict peers. The fix is to re-resolve the lockfile in the worktree (`npm install`, then `npm ci` locally as a check) and re-commit it. Never `--legacy-peer-deps` in the Dockerfile, never a `.npmrc`: both would hide the problem for `next` and `react` too.
- **`next build` failing with `Module not found: Can't resolve 'node:crypto'` or `'node:dns'`** in a client chunk. A client component reached `lib/budget.ts` or `lib/fence.ts` by value; `state.ts` may only `import type` from `lib/budget.ts`. Fix the import graph.
- **`next build` or the prerender throwing `StoreUnavailableError`.** Something built a store client at module load, which is exactly what the "nothing at import" tests exist to prevent; find the module-level call and make it lazy. This is the failure the no-variables build is designed to surface.
- **`npm test` red on `lib/budget.integration.test.ts`.** The skip guard is wrong: it ran with no variables and `getRedis` threw. It must report `skipped` here.
- **Any other red test.** A test that depends on the network or on a laptop-only path. The fence tests inject their resolver, so none should.
- **`npm test` green but slower than about a minute.** Not a failure, but note it: the mutation job in CI runs the suite fifty-one times.

- [ ] **Step 3: Serve from the image and read the route**

```bash
docker run --rm -d -p 3200:3000 --name parity-f4 "$TAG"
sleep 5
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3200/tools/headline-check
curl -s http://localhost:3200/tools/headline-check | grep -o "headline-check" | head -1
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3200/api/mcp
docker logs parity-f4 2>&1 | tail -5
docker stop parity-f4
```

Expected: `200`, `headline-check`, `200` (the MCP GET answers prose to a browser-shaped `Accept`), and logs with no `StoreUnavailableError`. The container has **no** store variables, so this proves the page renders and the site starts without them; it does not exercise the action, which needs a real submission and is Task 8's job. Posting the multipart form with its `$ACTION_ID` fields against this container is possible (AGENTS.md describes the method for the contact form) and is not done here because the live route is checked in Task 8 with the same flow.

- [ ] **Step 4: Run the integration test and the store check inside the image, against the real stores**

`-e NAME` with no value passes the variable through from the host only if it is set there, so nothing is written on the command line. `2 skipped` here is a **failure** of this step: it means the variables did not reach the container.

```bash
cd "$WT"
set -a; . ./.env.local; set +a
docker run --rm \
  -e UPSTASH_REDIS_REST_URL -e UPSTASH_REDIS_REST_TOKEN -e KV_REST_API_URL -e KV_REST_API_TOKEN \
  "$TAG" npx vitest run lib/budget.integration.test.ts 2>&1 | tail -8
docker run --rm \
  -e UPSTASH_REDIS_REST_URL -e UPSTASH_REDIS_REST_TOKEN -e KV_REST_API_URL -e KV_REST_API_TOKEN \
  -e DATABASE_URL -e BLOB_READ_WRITE_TOKEN \
  "$TAG" node scripts/store-check.mjs; echo "exit $?"
```

Expected: `2 passed` from the integration test, then `redis: PONG, N keys`, `neon: PostgreSQL ..., vector ...`, `blob: reachable, ...`, `exit 0`. This is the same lockfile, the same Node 24 on Linux, and the same SDK builds Vercel will run, reaching the same three stores. What would fail it: the variables not reaching the container (`skipped`, or `not configured`); the container's network unable to reach `*.upstash.io`, `*.neon.tech` or `blob.vercel-storage.com` (a `fetch failed` in the redacted error); a wrong token (`WRONGPASS` or a 401 in the redacted error). A pass here and a fail on Vercel later would point at the Vercel environment, not the code.

- [ ] **Step 5: Read the Redis meter for the whole test run**

Take the reading the same way Task 4 Step 6 did, before and after, so the figure is a delta and not a guess. The three things that spent commands in this task: the integration test (about 19), the store check (2) and Task 5's `KEYS` (1).

```bash
cd "$WT"
set -a; . ./.env.local; set +a
URL="${UPSTASH_REDIS_REST_URL:-$KV_REST_API_URL}"; TOKEN="${UPSTASH_REDIS_REST_TOKEN:-$KV_REST_API_TOKEN}"
curl -s -H "Authorization: Bearer $TOKEN" "$URL/dbsize"; echo
curl -s -H "Authorization: Bearer $TOKEN" "$URL/info/commandstats" | head -c 800; echo
```

If `INFO commandstats` is refused (an `{"error": ...}` body), read the Upstash console: the database, Usage, the "Commands" figure for today. Record in `f4-stores-2026-09-03.md`:

```markdown
## Parity and meter, <date>

- Image `fergus-portfolio-parity:<short sha>`: `npm ci` strict, `next build` with no store variables, `npm test` green with the integration test skipped. Served `/tools/headline-check` 200 from the container.
- Inside the image against the real stores: integration test 2 passed; store check `<three lines>`.
- Redis commands spent by this plan's checks so far: `<total>` (provisioning 2, store checks 2 each x `<n>`, integration test about 19 x `<n>`, KEYS 1). Console total for the day: `<figure>` of 500,000 for the month.
- `DBSIZE` after cleanup: `<n>` (expected: only the three headline-check keys from Task 5 Step 8 until they expire, or 0).
```

And in the ledger's Meters row for 2026-09, the Redis column: `<figure> (F4 checks)`.

- [ ] **Step 6: Remove the image and commit the record**

```bash
docker image rm "$TAG"
cd "$WT"
git add docs/superpowers/programme/f4-stores-2026-09-03.md docs/superpowers/programme/toolshed-ledger.md
git commit -m "docs(programme): the parity image passes and the first redis meter reading is in"
```

---

### Task 8: The pull request, the deploy, and the live check

**Files:**
- Modify: `docs/superpowers/programme/toolshed-ledger.md` (F4 row to `pr`, then `merged`, then `live`; the Decisions section; log)
- Modify: `docs/PROGRESS.md` (entry at the top)
- Modify (vault): `C:\Users\oreil\.claude\projects\C--Users-oreil\memory\coding-playbook.md` (one section)

**Interfaces:**
- Consumes: everything above; the `check` and `mutation` CI jobs from F0; the Vercel REST API with `VERCEL_TOKEN_PERSONAL`.
- Produces: F4 live, with the deployment id and the exact flow that was exercised written down.

- [ ] **Step 1: Rebase, run everything once more, push, open the pull request**

```bash
cd "$WT"
git fetch origin
git rebase origin/main
npx tsc --noEmit && npm test -- --reporter=dot 2>&1 | tail -4 && npm run build 2>&1 | tail -3
git push -u origin toolshed/f4-state-layer
gh pr create --title "feat(state): three free stores, budgets on redis, and one shared fence" --body-file - <<'BODY'
F4 of the toolshed programme (`docs/superpowers/specs/2026-09-03-toolshed-programme-design.md`, section 6).

- Upstash Redis, Neon Postgres and Vercel Blob provisioned on `larry-pm/fergus-portfolio` from the CLI, free plans, record in `docs/superpowers/programme/f4-stores-2026-09-03.md`.
- `lib/store/*`: thin clients that throw `StoreUnavailableError` naming the variable, and construct nothing at import (tested).
- `lib/fence.ts`: the SSRF guard lifted from the headline fetch, with new rules for credentials, local names, ports, and the odd spellings of an address. The old `headline-fetch.test.ts` describes are byte-identical and green.
- `lib/budget.ts`: per-address, per-target and global fixed windows on Redis, two commands a call, memory fallback outside production only. `lib/budget.integration.test.ts` proves the fourth call of three is refused from two module instances against the real database.
- `headline-check` runs on both. `rate-limit.ts` is gone.
- `.env.example`, AGENTS.md, and eleven new mutations (51/51 caught).

Dependencies earned, one commit each: `@upstash/redis`, `@neondatabase/serverless`, `@vercel/blob`.

Verified: the Docker parity image (strict `npm ci`, build with no store variables, suite green, then the integration test and store check inside the image against the real stores). Not verified until after merge: the live action on fergusoreilly.dev, which the post-merge check below exercises.

Preview and production share one Redis key space; a preview run spends production's counters. Recorded in the ledger.
BODY
```

Expected: `tsc` silent, the suite green, the build's route table, and a PR URL. Ledger F4 row to `**pr**` with the number (docs-only commit, may go straight to `main` from the main checkout, or ride on the branch; either is fine).

- [ ] **Step 2: Watch CI, then read the preview deployment**

```bash
cd "$WT"
gh pr checks --watch
SHA=$(git rev-parse HEAD)
curl -s -H "Authorization: Bearer $VERCEL_TOKEN_PERSONAL" \
  "https://api.vercel.com/v6/deployments?projectId=prj_NkKhUuc2coWnU08tOz2B1NPsf6Fx&teamId=team_SW7xEyTEz5ftQj3cIxulWxKG&limit=5&target=preview" \
  | python -c "import sys,json; d=json.load(sys.stdin); [print(x['uid'], x.get('readyState'), (x.get('meta') or {}).get('githubCommitSha','')[:7], x.get('url')) for x in d['deployments']]" \
  | grep "${SHA:0:7}"
```

Expected: `check` and `mutation` both pass (the mutation job now runs 51 mutants; if it times out at 20 minutes, that is a finding for the ledger and the fix is the job's timeout in `ci.yml`, not fewer mutations), and one preview line with `READY` and a `*.vercel.app` URL.

- [ ] **Step 3: The free checks on the preview**

The fence runs before any budget is spent, so the refusals below cost nothing on the shared counters; only the good check spends one. With the Playwright MCP browser at `https://<preview url>/tools/headline-check`:

1. `http://169.254.169.254/latest/meta-data/` → `169.254.169.254 is on a private, loopback or reserved network, so this server will not fetch it.`
2. `http://example.com:8080/` → `Port 8080 is not one I will fetch from. Only 80 and 443.`
3. `example.com` → the done panel.

That one good check counts against this address's hourly 20 and the global daily 300. Write down the time.

- [ ] **Step 4: Merge with a merge commit**

A merge commit rather than a squash, so the three dependency commits keep their reasons in `main`'s history. If the repository refuses merge commits, fall back to `--squash`; the PR body carries the same reasons.

```bash
cd "$WT"
gh pr merge --merge --delete-branch=false
```

Expected: merged. The branch is left for repo hygiene, never deleted by an agent.

- [ ] **Step 5: Wait for the production deployment and confirm it is the merge commit**

```bash
cd /c/Dev/fergus-portfolio && git checkout main && git pull
SHA=$(git rev-parse HEAD)
for i in $(seq 1 40); do
  curl -s -H "Authorization: Bearer $VERCEL_TOKEN_PERSONAL" \
    "https://api.vercel.com/v6/deployments?projectId=prj_NkKhUuc2coWnU08tOz2B1NPsf6Fx&teamId=team_SW7xEyTEz5ftQj3cIxulWxKG&limit=5&target=production" \
    | python -c "import sys,json; d=json.load(sys.stdin); [print(x['uid'], x.get('readyState'), (x.get('meta') or {}).get('githubCommitSha','')[:7], x.get('url')) for x in d['deployments']]" \
    | grep "${SHA:0:7}" && break
  sleep 15
done
DEP=<uid from the line above>
curl -s -H "Authorization: Bearer $VERCEL_TOKEN_PERSONAL" \
  "https://api.vercel.com/v13/deployments/$DEP?teamId=team_SW7xEyTEz5ftQj3cIxulWxKG" \
  | python -c "import sys,json; d=json.load(sys.stdin); print(d['readyState'], d.get('aliasAssigned'), d.get('target'), [a for a in d.get('alias',[]) if 'fergusoreilly.dev' in a])"
curl -s -o /dev/null -w '%{http_code}\n' https://fergusoreilly.dev/tools/headline-check
```

Expected: a line with the SHA and `READY`; then `READY True production ['fergusoreilly.dev']`; then `200`. Do not read `vercel ls` (it renders `BLOCKED` as `UNKNOWN`). `BLOCKED` or no line after ten minutes is a finding to report, not to retry.

- [ ] **Step 6: The live flow, the exact thing a visitor does**

With the Playwright MCP browser at `https://fergusoreilly.dev/tools/headline-check`, in this order, reading the result panel after each:

1. `example.com` → the done panel with "What a person sees".
2. `http://169.254.169.254/latest/meta-data/` → the private-address sentence.
3. `https://user:secret@example.com/` → `That URL carries a username or password, and I will not send anybody's credentials.` and `secret` appears nowhere on the page (`browser_snapshot`, search the text).
4. `http://example.com:8080/` → the port sentence.
5. `example.com` again, repeatedly, until the panel changes. Counting the preview's one good check and step 1 here, the refusal must land on the **21st** good check from this address within the hour: `This address has used its 20 runs for this hour; the counter resets in <wait>.` If it lands earlier or later, or never, the counter is not shared the way the integration test said it was, and that is the finding to report.

Then the two readings that say production counted in Redis rather than in memory:

```bash
cd /c/Dev/fergus-portfolio
set -a; . ./.env.local; set +a
URL="${UPSTASH_REDIS_REST_URL:-$KV_REST_API_URL}"; TOKEN="${UPSTASH_REDIS_REST_TOKEN:-$KV_REST_API_TOKEN}"
curl -s -H "Authorization: Bearer $TOKEN" "$URL/keys/budget:headline-check:*"; echo
curl -s -H "Authorization: Bearer $TOKEN" "$URL/get/budget:headline-check:global:all"; echo
vercel --token "$VERCEL_TOKEN_PERSONAL" --scope larry-pm --cwd /c/Dev/fergus-portfolio logs "https://fergusoreilly.dev" 2>&1 | grep -i "headline-check\|StoreUnavailable\|budget store failed" | head
```

Expected: the three key names (`ip:` followed by sixteen hex characters, never a dotted address; `target:example.com`; `global:all`), a global count equal to the number of good checks made today across preview and production, and **no** log line matching `StoreUnavailable` or `budget store failed`. If `vercel logs` argues about the argument on this CLI version, read the function logs in the dashboard (`larry-pm`, `fergus-portfolio`, Logs, filter `headline-check`) and say so.

No PostHog check: F4 adds no event. The `tool_run` event is F3's.

- [ ] **Step 7: Write it all down**

Ledger, F4 row to `**live**` with the deployment uid and `live check: 21st good check refused at <time>`. Under "Decisions that changed the design after 2026-09-03", add:

```markdown
- 2026-09-03 (F4): the Vercel Marketplace Upstash integration writes `KV_REST_API_URL` / `KV_REST_API_TOKEN`, not the `UPSTASH_*` names in the frozen interface. `lib/store/redis.ts` reads `UPSTASH_*` first and `KV_*` second; the error still names `UPSTASH_REDIS_REST_URL`. Both are in `.env.example`.
- 2026-09-03 (F4): the redirect loop stays in `lib/headline-fetch.ts`. No second caller wants a fetch-driven walk (On the glass fences per browser navigation; Tide calls fixed APIs; the census crawls from the home machine), and lifting a loop whose whole test contract belongs to one caller is a large change to a security file for nothing.
- 2026-09-03 (F4): the shared fence adds two rules headline-check did not have, ports other than 80 and 443 and URLs carrying credentials, as `blocked-port` and `blocked-credentials` reasons.
- 2026-09-03 (F4): preview and production share one Redis and one key space; the budget key does not carry the environment. A preview test spends production's counters. Revisit if a preview run ever eats a tool's daily cap.
- 2026-09-03 (F4): `lib/budget.integration.test.ts` does not run in CI. The repository is public, fork pull requests never see secrets, and the parity image runs it against the real database instead.
```

Meters row for 2026-09: the Redis figure from Task 7 plus today's console total after the live check. Log line: `2026-09-03: F4 live. Deployment <uid>. Verified: the fence's four refusals and the 21st-check refusal on fergusoreilly.dev, keys in Redis with a hashed address, no store errors in the logs. Not verified: Neon and Blob from a production function (nothing in production reads them yet; the store check proved them from the parity image only).`

`docs/PROGRESS.md`, at the top, in the file's voice:

```markdown
## 2026-09-03: the state layer, and the site's first shared memory

F4 of the toolshed programme. Three free stores on the Vercel project (Upstash Redis, Neon Postgres, Vercel Blob; record in `docs/superpowers/programme/f4-stores-2026-09-03.md`), thin clients that throw a named error when their variable is missing and build nothing at import, the SSRF fence lifted out of the headline fetch into `lib/fence.ts` with rules for ports, credentials, local names and the odd spellings of an address, and `lib/budget.ts` counting per address, per target and for everyone in Redis so a replica cannot be dodged. `headline-check` runs on both; its module-`Map` limiter is gone. Proven in the parity image and live: the 21st check from one address in an hour is refused with a sentence. Not verified: Neon and Blob from a production function, because nothing in production reads them yet.
```

```bash
cd /c/Dev/fergus-portfolio
git add docs/superpowers/programme/toolshed-ledger.md docs/PROGRESS.md
git commit -m "docs(programme): f4 live, the site has a state layer"
git push
```

- [ ] **Step 8: The playbook entry**

Append to `C:\Users\oreil\.claude\projects\C--Users-oreil\memory\coding-playbook.md`, as its own `##` section in the file's existing style:

```markdown
## Vercel Marketplace stores from the CLI (2026-09-03, fergus-portfolio F4)

- Every `vercel` call carries `--token "$VERCEL_TOKEN_PERSONAL" --scope larry-pm`. Without `--token` the CLI picks up `VERCEL_TOKEN` (the retired Presterly account) and fails as `The specified scope does not exist`, which reads like a missing team and is a wrong token.
- `vercel integration add <slug> --help` (with the token and scope) prints the product's plans and metadata keys on 59.x. Pick the plan named Free by name; never guess an id. Slugs observed: `upstash/upstash-kv`, `neon`. Blob is `vercel blob create-store <name> --access public --region iad1 --yes`.
- `--no-env-pull` on `integration add`, then `vercel env pull .env.vercel` and merge by hand. The automatic pull overwrites `.env.local` and its comments.
- The Upstash integration writes `KV_REST_API_URL` / `KV_REST_API_TOKEN`, not `UPSTASH_REDIS_REST_*`. Read both spellings in the client.
- `.env*` in `.gitignore` swallows `.env.example`. Add `!.env.example` and prove it with `git check-ignore -v`.
- Print variable names only: `grep -oE '^[A-Z0-9_]+' .env.local`. Source with `set -a; . ./.env.local; set +a` and pass into Docker with bare `-e NAME` so no value reaches a command line.
- Budgets on Redis: `MULTI [SET key 0 EX window NX, INCR key]` is two commands a call and gives the TTL on first hit only; `PTTL` only on refusal. Count the commands in a unit test with a fake that records them, because 500k a month is the meter.
```

If anything in this plan went wrong on the way and was fixed, the root cause and the prevention rule go in `coding-mistakes.md` in the same session; nothing is logged there for a plan that ran clean.

---

## Self-review

Run against the design's F4 paragraph and sections 4, 5, 8, 9 and 10 after the plan was written. Gaps found were fixed in the tasks above; this section says what was checked and what the plan cannot see.

### Spec coverage

| Requirement | Where |
|---|---|
| Provision Upstash, Neon and Blob on the Vercel project, CLI first, dashboard only if the CLI hands off | Task 1, Steps 3 to 6, with the stop rule in each |
| `lib/store/*` thin clients that throw a named error when their variable is missing | Task 2, Steps 2 to 17 |
| Nothing constructed at import time | Task 2: the `fresh()` import tests in all three client test files; Task 7 Step 2: the build with no variables |
| `lib/budget.ts` per-IP, per-target, global counters with TTLs on Redis | Task 4, Step 3 |
| Memory fallback only when `NODE_ENV !== "production"`; production throws, never unlimited | Task 4: the three router tests and the `production silently falls back` mutation |
| Two commands a call, not three | Task 4: `spends exactly two commands` test |
| Refusal is a sentence a page can print | Task 4: `refusalReason` tests pin the design's own example sentence |
| IP hashed with a daily salt, raw IP never stored | Task 4: `budgetKeyForIp` tests and the `raw address goes into the key` mutation; Task 5 Step 8 and Task 8 Step 6 read the keys in Redis |
| A budget of three exhausted on the fourth call from two instances, against a real Upstash database | Task 4, Step 5 (`vi.resetModules` between imports) and Step 6; Task 7 Step 4 runs it again inside the parity image |
| `lib/fence.ts` lifted from `headline-fetch.ts` with its tests | Task 3, Steps 1 to 6; the old test file byte-identical (`git diff --stat` empty) |
| New fence tests: v4-mapped v6, `169.254.169.254`, `0.0.0.0`, decimal and octal forms, a DNS name resolving to a private address with an injected resolver | Task 3, Step 1: the `isPrivateAddress` table, the `odd address spellings` test, the `resolveAndCheck` describe |
| Fence rules: syntax, http/https only, no credentials, no localhost/.local/.internal, ports 80/443 | Task 3, `checkParsedUrl` and its tests |
| Every redirect hop re-checked, max hops | Kept in `lib/headline-fetch.ts`; the existing hop tests prove it; the decision not to lift it is in the interfaces block and the ledger |
| headline-check on `takeBudget` and the shared fence, its own tests green | Task 5 |
| `.env.example`, values blank, comment per variable | Task 6, Step 1 |
| AGENTS.md env section pointing to `.env.example` | Task 6, Step 4 |
| Blob quota read from the dashboard or docs and recorded | Task 1, Step 10, and the record's table |
| Redis commands used by the test run measured and recorded | Task 4 Step 6, Task 7 Step 5, the ledger's Meters row |
| Docker parity, with what would fail it | Task 7, Step 2 |
| Mutation check runs when a guard is touched (design section 9) | Task 3 Step 7 and Task 4 Step 7: eleven entries, `51/51` expected |
| A hosted tool proves the fence refuses `127.0.0.1`, `169.254.169.254`, a private-range redirect and a DNS name resolving private, before it ships (section 9) | `fence.test.ts` and the untouched `headline-fetch.test.ts` cover all four; Task 8 Step 6 exercises two of them live |
| The verifier runs the exact flow, and a 200 is not a pass (section 9) | Task 8, Steps 3 and 6 |
| Every completion note states what was not verified (section 9) | Task 1 Step 11, Task 8 Steps 1 and 7, and the limits below |
| Public repo, PR, `check` and `mutation` required (F0) | Task 8, Steps 1, 2 and 4 |

### Placeholder scan

Searched the plan for `TBD`, `TODO`, `later`, `appropriate`, `similar to`, `handle edge cases`, `add validation`. None as instructions. The angle-bracket values that remain (`<plan name>`, `<uid>`, `<figure>`, `<preview url>`, `$UPSTASH_FREE_PLAN`, `$WT`) are values that exist only at run time and are each named at the step that produces them, the same convention the F0 plan used for its deployment id.

### Type consistency

Checked across tasks: `StoreUnavailableError(store, envVar)` with `.store` and `.envVar` (Task 2) is what Task 4's router and Task 5's action key on. `BudgetRedis` (Task 4) is what the fake in `budget.test.ts` implements and what `takeBudget` assigns `getRedis()` to. `BudgetScope` is imported as a type by `state.ts` and by value nowhere outside `lib/`. `FenceCode` and `checkParsedUrl` (Task 3) are what `headline-fetch.ts` maps through `FENCE_TO_REASON`, and the two new `FetchReason` members have `MESSAGES` entries. `HEADLINE_BUDGETS[scope]` spreads `{ limit, windowSec }` into a `BudgetRequest`. `budgetKeyForIp(Pick<Headers, "get">)` accepts what `await headers()` returns. The integration test's expected sentence (`for these 120 seconds`) matches `describeWindow(120)`. The mutation anchors were written against the code in the same tasks and each has a named test that goes red.

### Gaps found in review and fixed inline

- `.gitignore`'s `.env*` would have ignored `.env.example`: the negation and the `git check-ignore` proof were added to Task 6.
- The Upstash integration's variable names differ from the frozen interface: the `KV_*` fallback was added to Task 2 with tests, and to the record, the ledger and `.env.example`.
- A `500`-a-day global cap for headline-check put the programme's Redis total at the edge of the 60% rule; it is 300, with the arithmetic pinned in `state.test.ts`.
- The live 21st-check proof would be thrown off by the preview's good check on the same address hash: Task 8 counts it.
- `takeBudget` catching only `StoreUnavailableError` in the action would have sent an Upstash outage to the error boundary: the action catches every budget error into `storeDown` and logs the name.

### What this plan cannot see

- The plan names and metadata keys the CLI prints for Upstash and Neon were observed by the coordinator on 59.11.2 (`upstash/upstash-kv`, `neon`, no installations yet) and not the plan ids; Task 1 reads them at run time and refuses to guess.
- The Blob Hobby allotment is a documented figure read on the day, not a measured one.
- Structural assignability of `@upstash/redis`'s `multi()` pipeline to `BudgetRedis` under `tsc` is expected and not proven until Task 4 Step 4 runs; the one-line cast is written down in case.
- DNS rebinding stays open, as before the lift; the fence's docblock and AGENTS.md say so.
- Nothing in production reads Neon or Blob after this plan, so their production reachability is proven only from the parity image and the dev machine.
- CI never runs the integration test; the parity image and the implementer's machine do.
