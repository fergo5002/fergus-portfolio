# F0 Ship Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `fergo5002/fergus-portfolio` public with a clean history, put CI on every pull request, and prove that a push to `main` now produces a `READY` production deployment on Vercel instead of a `BLOCKED` one.

**Architecture:** Nothing in the app changes. This is a history sweep, a GitHub Actions workflow, a repository setting, a branch rule, and one deployment observed through the Vercel API. It is first in the programme because every later sub-project ships through it.

**Tech Stack:** gitleaks (in Docker), GitHub CLI (`gh`, authenticated as `fergo5002`), GitHub Actions, Vercel REST API with `VERCEL_TOKEN_PERSONAL` (team `larry-pm`, `team_SW7xEyTEz5ftQj3cIxulWxKG`, project `prj_NkKhUuc2coWnU08tOz2B1NPsf6Fx`).

## Global Constraints

- Programme design: `docs/superpowers/specs/2026-09-03-toolshed-programme-design.md`, section 6, F0.
- The repository goes public only after the sweep in Task 1 is clean or every finding is rotated. A found secret is rotated **before** the flip, never after.
- Public repository from Task 3 onward: code changes go through pull requests; docs-only commits may go straight to `main`. Never force-push, never rewrite history.
- CI must run `vitest`, `tsc --noEmit`, `next build` and `node scripts/mutation-check.mjs`. The suite is 33 files, 1,008 tests, about 5 seconds; the mutation check reruns the suite once per mutation (64 when counted on 2026-09-03, not the 40 an earlier summary said), so it gets its own job with a 30-minute timeout.
- `next build` needs no secrets: `NEXT_PUBLIC_POSTHOG_KEY` missing compiles analytics to a no-op, and `RESEND_API_KEY` is read at request time only.
- Do not add a repo-wide `.npmrc`. If `npm ci` fails on the `@vercel/analytics` optional peer, use `npm ci --legacy-peer-deps` in the workflow and say why in a comment.
- Vercel CLI 54.x and 58.x render `BLOCKED` as `UNKNOWN`. Read deployment state from `https://api.vercel.com/v6/deployments?projectId=...&teamId=...` only.
- House style for commit messages: lowercase `type(scope): declarative sentence`. British English, no em dashes, per `C:\Users\oreil\.claude\LANGUAGE.md`.
- The two ownership-proof files in `public/` are not secrets and must not be removed.

---

### Task 1: Secrets sweep of the full history

**Files:**
- Create: `docs/superpowers/programme/f0-sweep-2026-09-03.md` (the record)
- Modify: nothing in the tree unless a finding requires it

**Interfaces:**
- Consumes: nothing
- Produces: a written verdict, `clean` or `rotated`, that Task 3 requires before it may run

- [ ] **Step 1: Run gitleaks over every commit**

From Git Bash, with path conversion off so the Windows path mounts correctly:

```bash
cd /c/Dev/fergus-portfolio
MSYS_NO_PATHCONV=1 docker run --rm -v "C:\Dev\fergus-portfolio:/repo" zricethezav/gitleaks:latest \
  detect -s /repo --no-banner --redact --log-opts="--all" \
  --report-format json --report-path /repo/.gitleaks-report.json
echo "exit: $?"
```

Expected: exit 0 and `no leaks found`, or exit 1 with a report. If the image reports `unknown command "detect"`, the newer syntax is `git /repo --no-banner --redact --report-format json --report-path /repo/.gitleaks-report.json`.

- [ ] **Step 2: Grep for the shapes gitleaks misses**

```bash
cd /c/Dev/fergus-portfolio
git log --all -p | grep -n -E "re_[A-Za-z0-9]{20,}|phc_[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{30,}|sk_(live|test)_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (RSA|OPENSSH|EC) PRIVATE KEY" | head -20
git log --all --name-only --format="" | sort -u | grep -E "^\.env|\.pem$|\.key$|credentials|secret" | head
```

Expected: no matches on either command. `re_` is Resend, `phc_` is the PostHog write-only key (public by design, inlined into the client bundle, so a match there is not a leak but note it).

- [ ] **Step 3: Read the content and public directories by hand**

```bash
cd /c/Dev/fergus-portfolio
grep -rn -i -E "password|token|secret|api[_ -]?key" content/ public/ app/ lib/ components/ --include=*.ts --include=*.tsx --include=*.md --include=*.txt --include=*.json | grep -v -E "test\.ts|// |\* " | head -30
ls public/
```

Expected: hits are prose or variable names (`RESEND_API_KEY` as an env var name is fine); no literal values. Confirm `public/` holds only images, the two ownership-proof files and static assets.

- [ ] **Step 4: Write the record**

```markdown
# F0 sweep, 2026-09-03

- gitleaks `<version>` over `--all`: `<no leaks found | N findings>`
- Shape grep: `<none | list>`
- Hand pass over content/, public/, app/, lib/, components/: `<none | list>`
- Verdict: **clean** | **rotated** (`<what, where, when>`)
- Not checked: `<anything skipped, e.g. deleted branches on the remote>`
```

Save it, then delete the raw report so it is never committed:

```bash
rm -f /c/Dev/fergus-portfolio/.gitleaks-report.json
```

- [ ] **Step 5: Commit the record**

```bash
cd /c/Dev/fergus-portfolio
git add docs/superpowers/programme/f0-sweep-2026-09-03.md
git commit -m "docs(programme): record the history sweep before the repo goes public"
```

---

### Task 2: CI on every pull request

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `package.json` scripts `test` (`vitest run`), `build` (`next build`); `scripts/mutation-check.mjs`
- Produces: two GitHub checks named `check` and `mutation`, which Task 3's branch rule requires

- [ ] **Step 1: Write the workflow**

```yaml
# .github/workflows/ci.yml
#
# Two jobs. `check` is the gate every PR waits on: types, tests, build.
# `mutation` runs scripts/mutation-check.mjs, which breaks each guard on
# purpose and runs the suite about forty times, so it gets its own job and
# its own timeout rather than slowing the gate.
name: ci

on:
  pull_request:
  push:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npm test
      - run: npm run build
        env:
          # Absent on purpose: the build compiles analytics to a no-op without it.
          NEXT_PUBLIC_POSTHOG_KEY: ""

  mutation:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: node scripts/mutation-check.mjs
```

- [ ] **Step 2: Run the same commands locally to prove the workflow's commands are right**

```bash
cd /c/Dev/fergus-portfolio
npx tsc --noEmit && npm test -- --reporter=dot && npm run build 2>&1 | tail -5
```

Expected: `tsc` silent, `1008 passed`, build ends with the route table and no error. If `npm ci` is needed for parity, run it in a temp copy, not in the working tree.

- [ ] **Step 3: Commit on a branch and open the PR that proves the check runs**

```bash
cd /c/Dev/fergus-portfolio
git checkout -b toolshed/f0-ship-path
git add .github/workflows/ci.yml
git commit -m "ci: types, tests, build and the mutation check on every pull request"
git push -u origin toolshed/f0-ship-path
gh pr create --title "ci: types, tests, build and the mutation check on every pull request" \
  --body "F0 of the toolshed programme. Adds the CI workflow. The repo is still private at this point; Actions minutes on private repos are limited, which is one of the reasons Task 3 follows immediately."
```

- [ ] **Step 4: Watch both checks go green**

```bash
cd /c/Dev/fergus-portfolio
gh pr checks --watch
```

Expected: `check` and `mutation` both pass. If `mutation` reports a surviving mutant, that is a real finding: stop and fix the guard, do not weaken the check.

- [ ] **Step 5: Prove the check can fail**

Push one commit that breaks a test on purpose, watch it go red, then revert it:

```bash
cd /c/Dev/fergus-portfolio
printf '\nimport { it, expect } from "vitest";\nit("f0 canary: must fail", () => { expect(1).toBe(2); });\n' >> lib/text.test.ts
git commit -am "test: f0 canary, expected to fail"
git push
gh pr checks --watch
```

Expected: `check` fails. Then:

```bash
git revert --no-edit HEAD
git push
gh pr checks --watch
```

Expected: green again. Record both run URLs in the ledger.

---

### Task 3: Public, with a rule on main

**Files:**
- Modify: repository settings (no files)

**Interfaces:**
- Consumes: Task 1's verdict of `clean` or `rotated`; Task 2's check names `check` and `mutation`
- Produces: a public repository and a branch rule that later PRs must satisfy

- [ ] **Step 1: Confirm the sweep record says clean or rotated**

```bash
grep -n "Verdict" /c/Dev/fergus-portfolio/docs/superpowers/programme/f0-sweep-2026-09-03.md
```

Expected: `Verdict: **clean**` or `**rotated**`. Anything else: stop.

- [ ] **Step 2: Flip visibility**

```bash
gh repo edit fergo5002/fergus-portfolio --visibility public --accept-visibility-change-consequences
gh repo view fergo5002/fergus-portfolio --json visibility,isPrivate
```

Expected: `"visibility": "PUBLIC"`, `"isPrivate": false`.

- [ ] **Step 3: Protect main**

Require the two checks, require a PR for code, and keep admin pushes allowed so docs-only commits can land directly:

```bash
gh api -X PUT repos/fergo5002/fergus-portfolio/branches/main/protection \
  --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["check", "mutation"] },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
gh api repos/fergo5002/fergus-portfolio/branches/main/protection --jq '.required_status_checks.contexts, .allow_force_pushes.enabled'
```

Expected: `["check","mutation"]` and `false`.

- [ ] **Step 4: Merge the CI pull request**

```bash
cd /c/Dev/fergus-portfolio
gh pr merge --squash --delete-branch=false
git checkout main && git pull
```

Expected: merged; `main` now carries the workflow. (Branch deletion is left to repo hygiene.)

---

### Task 4: Prove a push deploys

**Files:**
- Modify: `docs/superpowers/programme/toolshed-ledger.md` (F0 row and log)

**Interfaces:**
- Consumes: Vercel REST API, `VERCEL_TOKEN_PERSONAL` from the shell environment
- Produces: the ledger entry that says git-linked deploys work, with the deployment id as evidence

- [ ] **Step 1: Write the prediction down before looking**

In the ledger log: "Prediction: the merge commit `<sha>` produces a production deployment with `readyState: READY` and `meta.githubCommitSha` equal to the SHA. If it comes back `BLOCKED`, the Hobby collaboration rule is not the whole story and F0 is not done."

- [ ] **Step 2: Poll the API until the deployment for the merge commit settles**

```bash
SHA=$(cd /c/Dev/fergus-portfolio && git rev-parse HEAD)
for i in $(seq 1 40); do
  curl -s -H "Authorization: Bearer $VERCEL_TOKEN_PERSONAL" \
    "https://api.vercel.com/v6/deployments?projectId=prj_NkKhUuc2coWnU08tOz2B1NPsf6Fx&teamId=team_SW7xEyTEz5ftQj3cIxulWxKG&limit=5&target=production" \
    | python -c "import sys,json; d=json.load(sys.stdin); [print(x['uid'], x.get('readyState'), (x.get('meta') or {}).get('githubCommitSha','')[:7], x.get('url')) for x in d['deployments']]" \
    | grep "${SHA:0:7}" && break
  sleep 15
done
```

Expected: a line with the SHA and `READY`. `BLOCKED` or no line after ten minutes is a failure to report, not to retry.

- [ ] **Step 3: Confirm the alias and the live site**

```bash
DEP=<uid from step 2>
curl -s -H "Authorization: Bearer $VERCEL_TOKEN_PERSONAL" \
  "https://api.vercel.com/v13/deployments/$DEP?teamId=team_SW7xEyTEz5ftQj3cIxulWxKG" \
  | python -c "import sys,json; d=json.load(sys.stdin); print(d['readyState'], d.get('aliasAssigned'), d.get('target'), [a for a in d.get('alias',[]) if 'fergusoreilly.dev' in a])"
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://fergusoreilly.dev/tools
```

Expected: `READY True production ['fergusoreilly.dev']` and `200`.

- [ ] **Step 4: Record it**

Ledger F0 row to `**live**` with the deployment uid; log line with the two check-run URLs from Task 2 and the deployment. Commit the ledger straight to `main` (docs-only):

```bash
cd /c/Dev/fergus-portfolio
git add docs/superpowers/programme/toolshed-ledger.md
git commit -m "docs(programme): f0 live, git-linked deploys work again"
git push
```

---

### Task 5: Docs match reality

**Files:**
- Modify: `AGENTS.md` (the deploy section), `docs/PROGRESS.md` (new entry at the top)

**Interfaces:**
- Consumes: Task 4's evidence
- Produces: the written rule later agents read

- [ ] **Step 1: Rewrite the deploy paragraph in AGENTS.md**

Find the paragraph that describes deploys (search for `readyState` and `BLOCKED`). Replace the operational advice with:

```markdown
The repository is public (since 2026-09-03) and git-linked to Vercel. A push to `main` deploys to production; a pull request deploys a preview. `main` requires the `check` and `mutation` CI jobs. Code goes through pull requests; docs-only commits may land on `main` directly. Read deployment state from the Vercel API (`v6/deployments` with `teamId`), never from `vercel ls`, which renders `BLOCKED` as `UNKNOWN`. The temp-directory CLI deploy that was needed while the repo was private is retired; if a git deploy ever comes back `BLOCKED` again, that is a finding to report, not a reason to reach for it.
```

Keep the existing sentence about reading `readyState` and `aliasAssigned`.

- [ ] **Step 2: Add the PROGRESS.md entry**

At the top, in the file's existing voice:

```markdown
## 2026-09-03: the ship path, and the repo is public

F0 of the toolshed programme (`docs/superpowers/specs/2026-09-03-toolshed-programme-design.md`). The history was swept (record in `docs/superpowers/programme/`), the repository went public, `main` requires CI, and a push produced deployment `<uid>` as `READY` with the commit SHA attached, which had been `BLOCKED` on every git push since August. Not verified: nothing in the app changed, so no live feature was exercised beyond a 200 on `/tools`.
```

- [ ] **Step 3: Commit to main**

```bash
cd /c/Dev/fergus-portfolio
git add AGENTS.md docs/PROGRESS.md
git commit -m "docs: the deploy path is git again, and the repo is public"
git push
```

- [ ] **Step 4: Update the vault**

In `C:\Users\oreil\.claude\projects\C--Users-oreil\memory\machine-map.md`, the `fergus-portfolio` deploy paragraph (search `Blocked on commit authorship`): add a dated line that the block was the Hobby private-repo rule, the repo is public since 2026-09-03, git deploys are READY again, and the temp-dir workaround is retired. Do not delete the history of the trap.
