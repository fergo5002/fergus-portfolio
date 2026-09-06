import type { Article } from "../articles";

export const splitTextAudit: Article = {
  slug: "split-text-audit-2026",
  title: "A third of award-winning sites send no h1 in their HTML",
  description: "I fetched 154 Awwwards winners. Of 151 reachable sites, 54 sent no populated h1 and only one split it into letters. The data and corrected fix.",
  date: "2026-08-21",
  updated: "2026-09-06",
  tags: ["Research","Frontend","SEO","Motion"],
  summary: "A server-HTML survey of 154 Awwwards winners on 21 August 2026: 151 answered, 54 sent no populated h1 and one fragmented its h1 into characters. Includes the sample, dataset, limitations and a corrected server-first approach to text animation; search rankings and AI citations were not measured.",
  body: `I went looking for websites whose text animations broke their headings. I fetched 154 Awwwards winners and found one with a headline split into individual letters. Fifty-four sent no populated h1 at all.

The search started with this site. My name animated one letter at a time, and a plain HTML-to-text extraction returned:

\`\`\`
P a t r i c k  F e r g u s  O ' R e i l l y
\`\`\`

It looked fine in the browser. The extracted text was the problem. I wrote an explainer, then collected a sample to find out whether the same pattern was common elsewhere.

## What came back

Of 154 sites, 151 answered the fetch. Two returned 403 and one returned 429.

| Result | Sites | Share of the 151 reachable sites |
| --- | --- | --- |
| Clean h1 | 96 | 63.6% |
| No populated h1 in server HTML | 54 | 35.8% |
| Fragmented h1 | 1 | 0.7% |

Of the 54, 52 had no h1 element and two had an empty one. Thirty-one had no heading of any level. Most still sent a page title: 149 of the 151 had a title element.

The one fragmented heading belonged to \`brand.ivress.co.jp\`. Its eighteen characters were wrapped in eighteen elements. Replacing tags with spaces produced \`A B R A N D S I T E B Y I V R E S S\`.

I also checked beyond the h1. Nineteen sites contained a run of at least four single-character elements somewhere in the document. Twelve of those had a clean h1, six had no populated h1, and one was the fragmented case. Splitting was present in the sample, but rarely in the main heading.

## The sample and the rule

The sample was the 154 most recent [Awwwards Sites of the Day](https://www.awwwards.com/websites/sites_of_the_day/) collected on 21 August 2026, with award dates from 19 March to 21 August. Five listing pages produced 155 outbound links. I excluded one because its host had already appeared.

Each site got a GET with a Chrome user-agent, a ten-second timeout and a 3 MB cap. The script retried a transport failure once. It didn't retry an HTTP refusal.

The classifier marks an h1 as fragmented when both conditions hold:

- There is a run of at least four consecutive single-character elements.
- Fewer than half its non-whitespace characters survive a pessimistic tag-strip in tokens of two or more characters.

The [raw dataset](https://fergusoreilly.dev/data/split-text-audit-2026-08.json) records the heading, counts and response status for every site. The [script](https://github.com/fergo5002/fergus-portfolio/blob/3d9b44c42c820b35ef9ed0fc32c5a6c2189cea8e/scripts/split-text-audit.mjs) and its fixed seed file are in the repository.

This was one fetch per site from one machine. It didn't execute JavaScript or inspect the hydrated page. A site that sends a whole heading and splits it after loading counts as clean. A missing h1 in this measurement may appear once JavaScript runs.

Awwwards winners are also a particular sample, selected for design. These figures don't describe the whole web, and I didn't measure search rankings, indexing outcomes or AI citations.

## The fix on my own site needed a second attempt

My first fix rendered two copies: a whole, visually hidden name and the animated letters beside it. I marked the animated layer \`aria-hidden\`.

That gave a screen reader a clean name, but it didn't remove the second copy from ordinary text extraction. The heading could still contain the name twice, joined as \`O'ReillyPatrick\`. The original explainer recommended this approach; that recommendation was incomplete.

The current component renders one contiguous name on the server. It switches to the animated character layer after mount:

\`\`\`tsx
const [mounted, setMounted] = useState(false);
useEffect(() => setMounted(true), []);

return (
  <span aria-label={text}>
    {mounted ? (
      <>
        <span className="vh">{text}</span>
        <span aria-hidden="true">{/* animated characters */}</span>
      </>
    ) : text}
  </span>
);
\`\`\`

This is the rendering pattern, with the animation omitted. The \`vh\` class visually hides the accessible copy using clipping; it doesn't use \`display: none\`. The complete [HeroName component](https://github.com/fergo5002/fergus-portfolio/blob/3d9b44c42c820b35ef9ed0fc32c5a6c2189cea8e/components/motion/HeroName.tsx) also handles the pointer and scramble effects.

A reader of the server HTML gets the whole name once. After mount, the visually hidden copy supplies the words for assistive technology. A tool inspecting that later DOM may encounter both copies; this fix addresses the server-HTML case measured here.

## Checking another page

The [headline checker](/tools/headline-check) runs the classifier on a URL and shows the heading it receives. Its playground also lets you compare different markup without publishing a page.

The classifier deliberately uses pessimistic extraction. It tests whether the heading depends on the reader joining adjacent elements correctly. It doesn't reproduce every crawler, and it can't tell you whether a particular search engine has understood a page.

To inspect or repeat the survey locally:

\`\`\`bash
node scripts/split-text-audit.mjs --self-test
node scripts/split-text-audit.mjs
\`\`\`

The second command uses the checked-in sample. Add \`--collect\` only if you want to replace it with the latest winners; that gives you a different survey.`,
};
