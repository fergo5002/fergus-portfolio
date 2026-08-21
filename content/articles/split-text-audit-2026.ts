import type { Article } from "../articles";

export const splitTextAudit: Article = {
  slug: "split-text-audit-2026",
  title: "A third of award-winning sites ship no h1 at all",
  description:
    "I fetched the server HTML of 154 Awwwards winners. Fifty-four of the 151 that answered serve no h1 at all. Exactly one fragments its headline.",
  date: "2026-08-21",
  tags: ["SEO", "Research", "Frontend", "Motion"],
  summary:
    "Original measurement of 154 Awwwards Sites of the Day, fetched as server HTML on 21 August 2026: 54 of the 151 reachable sites serve no h1 element at all and 31 serve no heading of any level, 96 are clean, and exactly 1 fragments its h1 into per-character elements. Raw dataset, seed file and script published.",
  body: `I fetched the server HTML of 154 award-winning websites. Fifty-four of the 151 that answered serve no h1 at all, and 31 of those serve no heading of any level. I went looking for split-text animation eating headlines and found one site doing it. The bug is real. It is also rare, and something worse has replaced it.

I wrote [the explainer for this](/writing/split-text-is-costing-you-search) after finding it on my own site. It argues that a per-character animation can turn your best headline into confetti for anything reading HTML rather than pixels. What it could not tell you is how often that happens in the wild, because nobody had counted. So I counted, and I have published the script, the sample and every row so you can check me.

## How many award-winning sites serve no h1 at all?

Fifty-four of the 151, a shade under 36%. Fifty-two have no \`h1\` element anywhere in the document, and two have an empty \`h1\` sitting there waiting for JavaScript to fill it. Thirty-one of the 54 carry no heading of any level, no h2, no h3, nothing. The strongest on-page signal there is, the thing every ranking and citation heuristic reaches for first, simply is not in the document a crawler receives.

| Result | Sites | Share of the 151 |
| --- | --- | --- |
| Clean h1 | 96 | 63.6% |
| No h1 in the served HTML | 54 | 35.8% |
| Fragmented h1 | 1 | 0.7% |
| Refused the fetch | 3 | not reachable |

They are not entirely mute. 149 of the 151 ship a \`title\` element, so there is one string to go on. Exactly one page in the sample ships neither a heading nor a title, and it is \`lafamigliamysteryunfolds.gucci.com\`.

## How many fragment their headline instead?

One. Out of the 151 sites that answered, exactly one serves an h1 whose characters are wrapped one element each with nothing whole left behind for a text extractor to find.

That one is \`brand.ivress.co.jp\`, a Site of the Day from June. Its h1 carries eighteen characters in eighteen elements, and a tag-stripping extractor reads the lot as \`A B R A N D S I T E B Y I V R E S S\`. It is a lovely site and this is a small tax on it, but it is exactly the failure I described, in public, on an award winner.

So the thing I wrote about is real and rare, at least here, and that is worth saying plainly rather than burying. I found it on my own site, I fixed it, and when I went looking for company I found one. A headline split into letters is at least present, and a determined extractor can reassemble it. A headline that never arrives cannot be recovered by anybody.

## Is per-character splitting actually gone?

No, and this is the check I ran to try to prove my own result wrong. A near-zero has two explanations: the technique is absent from served HTML, or it is there and my heading rule is walking straight past it. So I applied the same single-character-element test to the whole document instead of just the heading.

Nineteen of the 151, about 12.6%, carry a run of four or more consecutive single-character elements somewhere on the page. Thirteen carry a run of eight or more. Of those nineteen, twelve have a perfectly clean h1, six have no h1 at all, and one is the fragmented site.

So the technique is alive and it does reach the server. It just mostly lands on subheads, nav labels and body lines rather than on the h1. Why it spares the h1 specifically, I did not measure, so treat any explanation of that as a guess.

## What exactly was measured?

The sample is the 154 most recent Awwwards Sites of the Day, collected on 21 August 2026, covering awards dated 19 March to 21 August 2026. Five listing pages, 31 entries each, 155 outbound links, one dropped for being a second win by a host already in the list. That is the only exclusion. The seed file is checked in with every URL and its Awwwards slug, so the sample stays fixed even though the listing keeps moving.

Each site got one GET with a Chrome user-agent, a ten second timeout and a 3 MB cap, one retry on a transport failure and none on an HTTP status. Three refused, and they are counted as unreachable rather than quietly dropped: two 403s and a 429.

The rule: a heading is fragmented when its markup holds a run of four or more consecutive single-character elements **and** fewer than half its non-whitespace characters survive a pessimistic tag-strip inside tokens of two characters or more.

## What can this measurement not see?

It reads server HTML and nothing else. No JavaScript runs, no styles are computed, no hydrated DOM is inspected. That is the measurement rather than a shortcut, because the naive crawler's view is the thing under test and a real browser would answer a different question. A site that ships a whole headline and splits it on the client counts as clean here, correctly, because whole is what the crawler got.

Both halves of the rule have to hold, so a headline with one split word among otherwise intact prose scores clean. The count is a floor and not a ceiling. The fix I recommended, a whole copy sitting beside the split copy, also scores clean, and that is deliberate.

Awwwards winners are not the web. They are heavier, more JavaScript-driven and more design-led than average, so this sample probably over-states client rendering and under-states plain server-rendered pages. One fetch each, one machine, one afternoon.

## Why does it happen at all?

Wrapping every character in its own element is how you animate them separately, and \`transform\` does nothing to a plain inline element, so those wrappers get \`display: inline-block\`. That is a box, not a text run. A browser still paints the word correctly. Code that strips tags and normalises whitespace does not, and if your formatter has put a newline between the spans you get loose letters without needing the inline-block at all.

The full mechanism, and the four-line fix, are in [the original piece](/writing/split-text-is-costing-you-search).

What these numbers suggest is that the fix has largely won at the h1, and my hunch is that split-text libraries now do their splitting at runtime rather than in the markup. I did not verify that, so it stays a hunch. What I did verify is what arrives on the wire: the h1 is usually whole, or it is not there.

## How do I check my own site?

Three ways, and none of them needs a browser. The quickest is [the headline checker](/tools/headline-check): paste a URL and it runs the same classification this audit did, on one page. Your dev tools will render the page correctly and tell you everything is fine, so the point of all three is to see the document as it leaves the server.

The one-liner from the earlier piece still works. Fetch the page, replace every tag with a space, collapse the whitespace, read the first few hundred characters. If your headline comes back as separated letters, you have this problem. If nothing comes back at all, you have the bigger one.

Or run the script that produced this dataset. It lives at \`scripts/split-text-audit.mjs\` in this site's repository and reads a checked-in seed file of URLs. Do \`--self-test\` first: it checks the classifier against twelve hand-built headings, including two that look broken and are fine.

\`\`\`bash
node scripts/split-text-audit.mjs --self-test   # the classifier's own fixtures
node scripts/split-text-audit.mjs --collect     # rebuild the sample from Awwwards
node scripts/split-text-audit.mjs               # run the audit
\`\`\`

Every row is in the raw dataset at [/data/split-text-audit-2026-08.json](https://fergusoreilly.dev/data/split-text-audit-2026-08.json), with the heading, the element counts and the status for each site. If you think the rule is wrong, the two thresholds are constants at the top of the script. Move them, run it again, and tell me what you get.`,
};
