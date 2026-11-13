# Deploying, CI, the mutation check and the repo layout

Read this before deploying, verifying a deploy, changing CI or a guard, or when you need the repo layout.

## Deploy and CI (from "Commands")

Deploy: Vercel. The project is git-linked (`fergo5002/fergus-portfolio`, production branch `main`),
so **a push ships**. The repository is **public** since 2026-09-03, and that is what makes the
sentence true: on the Hobby plan a private repository's git deployments were landing in `BLOCKED`
("Git author fergo5002 must have access to the project on Vercel to create deployments"), with no
alias, production untouched, git exiting 0. Observed as late as 2026-09-02 on commits authored as
the account's own address. After the flip the same author's preview check passed and the merge of
PR #1 produced production deployment `dpl_4DPMWyNeL3FKBmYfcuTqJwibyc2F` as `readyState: READY`
with the commit SHA attached. The temp-directory CLI shipping that carried the site while it was
private is retired; if a git deployment ever comes back `BLOCKED`, that is a finding to report, not
a reason to reach for it.

`main` requires the `check`, `mutation` and `phone` GitHub Actions jobs from `.github/workflows/ci.yml`
(types, tests, build; then the mutation check). Code goes through pull requests. Docs-only commits
may land on `main` directly. **Confirm every deployment the same way regardless**: read `readyState`
and `aliasAssigned` from `https://api.vercel.com/v13/deployments/<id>?teamId=<team>`, or list them
with `v6/deployments?projectId=...&teamId=...&target=production`. Do not trust the CLI's exit code,
and do not trust `vercel ls`, which renders `BLOCKED` as `UNKNOWN` and reads like "still building".
Every Vercel CLI call passes `--token "$VERCEL_TOKEN_PERSONAL" --scope larry-pm`; without the
token flag the CLI reads the wrong account's `VERCEL_TOKEN` and reports "The specified scope does
not exist". Live host is `https://fergusoreilly.dev`.

## The mutation check

**Before shipping anything that touches this feature, or any of the brightness constants, run
`node scripts/mutation-check.mjs`.** It breaks each guard on purpose and expects the suite to
notice. Forty mutations, forty red at the time of writing. A guard that survives its own mutation is
decoration, and this repo has shipped one of those before. It caught one again on 2026-08-20: an
assertion for `audio.key()` matched the docblock that mentions `audio.key()`, so deleting the actual
call left 438 tests green.

**Mutate the constants you deliberately left alone, too.** Ten of the forty exist because a review
pointed out that seven asserted-unchanged numbers (the deflection offsets, the ripple, the power-on
strike) had never been shown to bite, so a full-red run was reading as complete coverage while those
guards were decoration.

## Layout of the repo

```
app/            layout (fonts, metadata, CRT shell) + the routes + globals.css + icon.svg
components/
  system/       SystemProvider (frame clock + settings + synth), PhosphorScreen (WebGL tube:
                persistence sim + present + room), StatusBar, MachineControls,
                Screensaver, RouteTransition, EjectRig
  physics/      GravityStage (measures the page, drops it, puts it back)
  motion/       RasterReveal (the house reveal), HeroName, TiltCard, Magnetic, TimelineSpine
  *.tsx         CrtShell, Nav, BootSequence, Terminal, Window, ImageFrame,
                SignalPlate, PromptLine, ProjectCard, ExperienceItem, Scramble
content/        profile.ts, experience.ts, projects.ts, skills.ts   <-- edit content here
lib/            commands.ts (pure terminal parser + tab completion), system.ts (bus types,
                themes, formatters), scramble.ts, physics.ts (rigid-body solver), audio.ts
                (runtime synth), eject.ts (pull-back geometry)  : all have .test.ts siblings
public/img/     user-supplied images (portrait + screenshots)
docs/
  superpowers/specs/    design spec(s)
  superpowers/plans/    implementation plan(s): execute these task-by-task
  PROGRESS.md           LIVING STATE: what's done, what's pending, decisions log
```
