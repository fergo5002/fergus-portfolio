# Phone polish recovery, 6 September 2026

Fergus asked Codex to find the interrupted Claude session and continue from its exact stopping
point. This record separates recovered evidence from checks performed after recovery.

## Source and preserved work

- Session: `5d32da86-0162-43ca-aafd-6934e9e73941`, in
  `C:\Users\oreil\.claude\projects\C--Dev-fergus-portfolio`.
- Original checkout: `C:\Dev\fergus-portfolio`, branch `phone-polish`, head `1e4dd0c`.
- Original request began at 11:29 Dublin time. The limit interrupted work at 13:10 on
  6 September 2026. The final background mutation check subsequently completed.
- Six commits follow `f4cc357`: `5969eae`, `bf1686c`, `7154fbd`, `aa61438`, `b3e3141`,
  and `1e4dd0c`. They cover the phone instrument, nav and arcade door, status bar,
  hydration/reveals, shorter phone boot, rain, help, MCP wrapping and article template.
- Three uncommitted files were copied byte-for-byte into the recovery checkout:
  `AGENTS.md`, `app/globals.css`, and `app/globals.test.ts`. Original copies are retained
  under `.codex/phone-polish-recovery/source-snapshot/`. The snapshot test has a `.txt`
  suffix so Vitest cannot discover it as a second test file.
- The original checkout, including its modified `CLAUDE.md`, untracked `.codex/` and
  `scripts/analytics.mjs`, is untouched. Claude instructions were not adopted by Codex.
- Recovery branch: `codex/phone-polish-recovery`, in
  `C:\Users\oreil\.codex\worktrees\95fb\fergus-portfolio`.
- Current `origin/main` included `c029de1`, the five-studio release, so recovery merged
  that commit. The phone instrument's conflict combines clipped-text sampling with the
  studio scroll-panel checks. Both sets of planted regression fixtures remain.

## Decisions recovered from Fergus's answers

- Keep the `cd` labels and scroll the phone nav sideways.
- A hard load keeps already visible words and blocks readable through hydration;
  in-site navigation and unseen content retain their effects.
- Tone down the rain on phones.
- Shorten the phone boot to about two seconds, retaining the full desktop profile.
- Fergus's additional message at 11:55 asked for `cd arcade` globally. It runs through
  the existing terminal, including when the drawer is already open.

The original edge fade was removed after the phone instrument measured the partially
clipped link at 1.23:1. The recovered implementation uses a clipped, scrolling row with
scroll snapping. It does not shorten the labels or introduce a menu.

## Exact stopping point

The final uncommitted batch lifts secondary text colour on touch for all three themes,
removes glow from small secondary lines, and gives terminal chips/input/label and contact,
experience/project and article-footer links at least 44px height. Its four tests failed
before implementation. Afterwards, 102 focused tests passed and TypeScript produced no
diagnostic in the recorded command. It had no fresh production build or browser check.

Earlier evidence belongs to the tree before that last batch:

- 2,587 passing tests and a production build.
- A full route phone scan still failing on small targets and dim text. The quoted
  transcript's successful background exit only means its wrapper command finished;
  it does not mean the phone audit passed.
- A code review found that slow hydration could re-hide blocks already scrolled past,
  and view-triggered headings could scramble after being read. `b3e3141` fixes both.
- The final filtered mutation command caught 11/11 cases: six degauss cases plus help,
  status-bar costume, arcade visibility, the arcade `cd` door and the backtick guard.
  This was not the complete mutation catalogue.
- The saved headed Chromium timeline shows one title value on a hard load. Its measured
  desktop rates were 60 to 61 frames/s; the throttled Pixel proxy reported 55 to 59
  scrolling frames/s. Those are historical measurements, not a new performance claim.
- The earlier rain screenshot comparison reported bright-pixel share changing from
  0.0024 to 0.0019, maximum channel-weighted brightness from 106.3 to 69.9, and three to
  nine bright connected regions. Mean values were 15.23 and 15.32. This was a single
  composited screenshot comparison, not a controlled time series or `gl.readPixels` proof.

## Remaining verification at recovery

- [x] Full tests on the combined tree: 2,668 passes, three opt-in skips; TypeScript passes.
- [ ] Final production build after the additional route fixes.
- [x] Phone instrument planted-fault proof, including both merged fixture sets and the
  clipped-parent honeypot, on all three browser profiles.
- [ ] Every sitemap route family, two article examples and all public tools on WebKit
  at 390/320 and throttled Chromium.
- [ ] Real browser checks of nav reachability, drawer/help, arcade entry/exit, status-bar
  geometry, validation position and hard-load/in-site motion.
- [ ] Relevant mutation proof and review of the final diff.
- [ ] Update the living progress record and shared-vault worktree/evidence notes.

## Recovery corrections

The first recovered production build reproduced a further contact issue on both WebKit
phone sizes: native validation focused the empty name field but left it above the viewport,
despite a computed 60px field scroll margin. After settling, the 320px probe measured the
field top at -10.17px. Adding document scroll padding kept the field below the nav in the
same browser. The CSS guard failed before this correction; the final browser driver also
waits for the native scroll to settle and never scrolls the invalid field itself.

Secondary-colour headroom is now checked against page and panel backgrounds on all three
themes. Ten additional mutation cases cover these colours, terminal tap height, document
scroll padding, phone boot selection, both rain constants and the two late-hydration guards.

The expanded audit also found that the earlier mobile contact font rule lost to a later
`font: inherit`: WebKit measured 15px text and 41px inputs. The touch rule now follows the
base declaration, with 16px text and 44px input/label targets. The standalone RSS link also
gets a 44px target. Experience and writing-index separator dots follow the existing article
convention: empty spans with CSS-generated decoration. Four new tests failed before these
fixes and passed afterwards; six mutation cases cover the corresponding regressions.

The contact honeypot was an instrument false positive: its input has a normal layout box
inside a clipped 1px parent. The new good fixture failed with two false alarms on all three
profiles before the audit checked the ancestors' clipping box. Afterwards it passed, while
the existing unreachable-control fault, scrollable rail, closed-details and clipped-text
fixtures continued to behave correctly. No accessibility floor or spam handling changed.

The local full-catalogue mutation proof uses four temporary checkouts under
`C:\Users\oreil\AppData\Local\Temp\codex-phone-polish-01a076f1`. Four workers per checkout
caused an unchanged protocol timeout, so those failed baselines were discarded. One worker
per checkout passed all 2,664 tests. To avoid repeating the whole suite for every fault,
the temporary runners select tests by imports and source-reading guards, verify each test
group on clean source, and fall back to the full suite if a selected group survives. The
213 mutations and assertions are unchanged. The preparation script and exact mapping are
retained under `.codex/phone-polish-recovery/`; the committed CI runner retains its standard
full-suite behaviour.

Physical phones, real mobile keyboards and representative real-network performance require
device testing. There was no phone-polish pull request at recovery. Publishing this recovered
branch is a separate final step; no deployment is claimed by this document.
