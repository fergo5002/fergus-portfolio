# Writing edit, 6 September 2026

Fergus requested an audit of the AI-sounding articles, then approved the proposed
cuts and edits. Work is local on `codex/writing-edit`, based on `3d9b44c`.
This is not a deployment record.

Local production preview: `http://127.0.0.1:3210/writing`.

The published collection now contains five pieces:

- **The test passed because the UUIDs agreed:** retains the lock-order failure,
  SQL and measured controls; removes the general claims about random UUIDs and
  the repeated verification manifesto.
- **A Qualcomm overlay appeared in our dungeon:** retains the scene and pipeline
  controls; separates suspected texture crosstalk from the observation; removes
  the chart of unverified performance estimates.
- **A third of award-winning sites send no h1 in their HTML:** keeps the dated
  survey and dataset; narrows the claims to server HTML; absorbs the split-text
  explanation and corrects the two-copy recommendation to a swap after mount.
- **Building a CRT that behaves like a CRT:** describes the actual emitters and
  burn-in bands rather than claiming a capture of browser text; includes the
  documented saturation incident, source links and terminal commands.
- **Why we wound Presterly down:** cuts repeated lessons, keeps the founder and
  economics account, and folds in a short account of Hatch105 from the retired
  accelerator piece. No new biographical events were invented.

All five keep their original slugs and publication dates, with `updated` set to
6 September 2026. The existing newest-first ordering is unchanged.

The published prose count falls from 10,456 to 2,578, using the site's word-count
function (which excludes code): UUIDs 365, Qualcomm 354, survey 758, Presterly 499
and CRT 602 words. The five retained originals totalled 4,702 words.

The registry no longer imports these six source modules:

- `shipping-with-ai-agents`
- `agents-will-tell-you-it-works`
- `what-an-accelerator-is-for`
- `multi-tenant-shopify-apps`
- `one-webhook-secret-two-tenants`
- `split-text-is-costing-you-search`

The original modules remain in the repository as unpublished reference material.
The merged split-text URL has a permanent redirect to the survey. The other five
have no equivalent replacement and return the article route's normal 404. The
headline checker links directly to the survey. The registry supplies RSS, sitemap,
blog metadata, MCP and llms.txt, so the withdrawal applies to those surfaces too.

The standard Shopify-app credential model did not support the central claim in
the withdrawn webhook article. A historical custom-app arrangement might explain
the original incident, but that was not investigated here. Removing the article
does not establish anything about Tigh's current webhook security.

The old article tests required 600 words, question headings, minimum and maximum
section lengths, forced FAQ output and link-count quotas. Those editorial rules
have been removed. Metadata, dates, link targets, rendering and escaping remain
checked. FAQ markup is still supported when a piece actually contains the needed
questions and answers; these edited stories do not need to manufacture them.

Drift's example is rebuilt from the five published articles. Its tests now check
the real public corpus, marker validity and a finite usable report instead of
demanding eleven documents and 5,000 words. Visitor reference-building and storage
behaviour are unchanged.

The first phone audit found dim dates and undersized RSS, contents and back links
on the writing pages. Small metadata, tags and contents labels now use the
existing readable text token without glow; standalone links have 44-pixel touch
targets. A rerun isolated the remaining dim footer label and the global anchor
glow on a prose link. The footer now uses the same readable token, and prose
links explicitly remove that inherited glow. Metadata dots are drawn in CSS,
keeping decorative text out of HTML
extraction. No theme or shader brightness constant changed. The deadlock results
now use a table that shows each denominator instead of a three-bar chart.

The fixed historical question set in `scripts/share-of-model/questions.json` is
preserved. Some original sources and exact-title probes now refer to withdrawn
articles. A future measurement needs a separately versioned set; comparing its
old topic scores across this editorial cut would conflate publication changes
with retrieval performance.

Verification:

- [x] Five regression tests failed against the old catalogue, discovery output,
  redirect behaviour and headline-checker link before those changes were made.
- [x] 119 focused tests pass, including publication withdrawal, redirect query
  preservation, article validity, optional FAQ metadata and Drift's example.
- [x] Six additional writing-colour and glow guards failed before their CSS
  fixes. After the mobile fixes, 187 focused checks pass across publishing,
  prose, chrome, stylesheet, metadata and the Drift corpus.
- [x] Complete final unit suite: 2,469 passes, three opt-in integration skips across
  158 test files. The first full run found a legacy MCP flow searching for the
  retired agents topic; it now searches for the retained deadlock story. The
  next full run passed; the final run also covers six new stylesheet guards.
- [x] Production build and type checks pass, with 37 static pages generated.
- [x] Local production HTTP and desktop browser checks: all five article pages,
  dates, canonical links, JSON-LD and social images; five withdrawn 404s; the
  merged 308 including query preservation; sitemap, RSS, llms.txt and MCP; direct
  headline-checker links and the revised Drift label. No browser page errors.
- [x] Final production browser checks cover all five articles and the index at
  320 and 390 pixels across green, amber and ice: no page overflow, standalone
  navigation targets at least 44 pixels, and no glow on reading text or links.
- [x] The final survey phone audit passes WebKit at 320 and 390 and throttled
  Chromium, with no contrast, target, overflow, input, asset or layout failures.
  It exercises the remaining shared footer and prose-link fixes. Each profile
  leaves one occluded status-path readout within the checker's existing allowance.
  The preceding run cleared the index on all three profiles. The tools passed
  the initial run; a final full-site phone sweep was not performed.

HTTP/browser evidence and screenshots are in `.phone-check/writing-review/`.
The one-off check is `.phone-check/writing-check.mjs`. The initial standard phone
audit covered the index, five articles, Drift and the headline checker in all
three profiles. Both tools passed; writing failures drove the layout changes.
Screenshots are in `.phone-check/writing-mobile/`. The index, table article and
survey were checked again in `.phone-check/writing-mobile-final/`; that run
cleared the index and isolated the remaining footer and link glow failures.
The final contrast rerun is recorded in `.phone-check/writing-mobile-contrast.log`.
These are local ignored artefacts.

The audit used existing article accounts, repository code, the stored survey and
current Shopify documentation. It did not re-run historical Tigh transactions,
GPU measurements or the 154-site crawl. The source links in the edited technical
pieces pin the inspected commit rather than referring to moving main-branch code.
