# Local agent workflow

These files contain no account credentials. Select this repository's local environment in
the Codex composer when making a new worktree. Setup installs the lockfile dependencies;
it does not copy .env files or deploy. Claude can run the same setup commands in a shell.

For substantial changes, record the intended behaviour and a verifiable completion condition.
Use `/goal <objective and checks>` in Codex for sustained work. Each concurrent writer gets
its own Git worktree. Agree file ownership before parallel work. Review is read-only and
must examine the actual diff and failure modes, not merely repeat the implementation's tests.
Before integration, resolve findings and record commands, exit codes, commit, environment,
browser evidence and any untested requirements. Do not describe a queued check as passed.

Parallel agents remain opt-in. Fergus authorised an independent review for this setup;
that does not authorise delegation or deployment of every later task.

Generated outputs belong inside the current worktree under `.codex/results/`. Never share
node_modules, .next, test databases, or a mutable build folder between worktrees. Port clashes
must fail rather than silently switch to another server. A browser check needs a server
launched from the same worktree, with its startup confirmed before the check.

## FergusOS acceptance

- Setup: Node 24 and `npm ci`.
- Harness regression: `node --test scripts/worktree-runtime.test.mjs scripts/worktree-server-proof.test.mjs scripts/worktree-local.test.mjs`.
- `node scripts/worktree-local.mjs info` prints this worktree's deterministic loopback URL.
- `node scripts/worktree-local.mjs dev` starts its preview; an occupied port fails.
- For release rendering, run `node scripts/worktree-local.mjs build`, then
  `node scripts/worktree-local.mjs start`. Both use the same clean environment; start
  requires the successful build receipt to match `.next/BUILD_ID`.
- Against that confirmed local server: `node scripts/worktree-local.mjs phone`.
  Exit receipts and screenshots go under `.codex/results/<worktree-id>/`.
  A per-launch marker verifies the server belongs to this exact worktree before tests.
  The marker is a generated, ignored local file and is removed when the launcher exits.
- Run the relevant arcade/interaction checks with this exact URL, as documented by each
  script. Include 320px and 390px WebKit, keyboard focus and reduced motion for UI changes.
- Unit checks: `npm test`; types: `npx tsc --noEmit`; guards: `node scripts/mutation-check.mjs`.
  Run the checks appropriate to changed behaviour and record any skips.

The launcher strips inherited credentials and refuses .env files because Next loads them
itself. It is for fixture-based UI work. An authenticated integration needs separately
reviewed test credentials. This does not prevent hard-coded external calls in application
code, so inspect the changed flow before exercising it.
