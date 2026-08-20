import type { Article } from "../articles";

export const splitTextSeo: Article = {
  slug: "split-text-is-costing-you-search",
  title: "Your split-text animation is eating your headline",
  description:
    "Per-character text animations are everywhere. They also quietly turn your best headline into gibberish for the crawlers that read your site. Here is the fix.",
  date: "2026-08-20",
  tags: ["SEO", "Motion", "Frontend", "Accessibility"],
  summary:
    "Per-character split-text animations (GSAP SplitText, Framer Motion stagger, hand-rolled span splitting) can make a headline extract as separated letters for naive HTML-to-text crawlers, including the ones feeding AI answer engines. Fix: render a contiguous copy of the text alongside the animated one.",
  body: `I found this on my own site, which is the only reason I'm confident it's worth writing down.

The homepage headline is my name. It animates in one character at a time, because that looks good and because [the whole site is pretending to be a CRT terminal](/writing/a-crt-that-behaves-like-a-crt). To do that, the name is split into one element per letter. Standard stuff. GSAP's SplitText does it, Framer Motion's stagger examples do it, and every "animated hero text" tutorial you have ever read does it.

Then I ran the live page through a plain HTML-to-text extraction, the sort of thing that feeds a scraper, and got this back:

\`\`\`
P a t r i c k  F e r g u s  O ' R e i l l y
\`\`\`

The single most important string on the entire domain, rendered as loose letters.

## Why it happens

Split text produces markup like this:

\`\`\`html
<h1>
  <span class="ch">P</span><span class="ch">a</span><span class="ch">t</span>
  <span class="ch">r</span><span class="ch">i</span><span class="ch">c</span>
  <span class="ch">k</span>
</h1>
\`\`\`

A browser concatenates that to \`Patrick\` without a second thought, because \`span\` is inline and inline elements don't create word boundaries. So the page looks perfect and you never notice.

The trouble starts with two things that are both extremely common.

**The first is \`display: inline-block\`.** You almost always need it, because \`transform\` does nothing on a plain inline element. The moment you set it, you have told the layout engine these are boxes, not text runs. Some text-extraction code follows that.

**The second is whitespace in your markup.** If your framework or your formatter puts a newline between those spans, a naive extractor that strips tags and normalises whitespace hands you \`P a t r i c k\`. Mine did exactly that.

## Who actually reads it this way

This is where I want to be careful, because there's a lot of confident nonsense written about SEO and I don't want to add to it.

Googlebot renders pages with a real browser engine. In my experience and by every reasonable reading of how it works, it handles inline-block spans correctly. I would not tell you split text is torching your Google rankings, because I don't believe that and I can't show it.

The problem is everything else, and "everything else" got a lot more important in the last two years.

Most of the machinery that reads the web now is not a full browser. Link preview generators, RSS and content aggregators, archive tools, academic scrapers, and, crucially, the crawlers and fetchers behind AI answer engines. A large number of these do some variation of "fetch the HTML, strip the tags, normalise the whitespace". That pipeline turns your hero headline into confetti.

So the risk isn't that you drop three places on a search results page. The risk is that when someone asks a model who you are, the strongest signal on your own website is a string the model can't match against your name.

That's a worse outcome and it's a harder one to detect, because nobody sends you a report about it.

## The fix, which is about four lines

Render the text twice. Once fragmented for the animation, once whole for everything that reads text.

\`\`\`html
<h1>
  <span class="visually-hidden">Patrick Fergus O'Reilly</span>
  <span aria-hidden="true">
    <span class="ch">P</span><span class="ch">a</span>...
  </span>
</h1>
\`\`\`

The hidden copy is real text in the document. Crawlers get one contiguous string. The animated copy is marked \`aria-hidden\`, so assistive technology reads the clean version once rather than announcing forty individual letters.

Two things people get wrong here.

**Don't use \`display: none\` or \`visibility: hidden\`** for the plain copy. Both remove it from the accessibility tree and both are, reasonably, treated by search engines as content you are choosing not to show. Use the standard clip-rect pattern that keeps the element rendered but out of view.

**Don't put \`aria-label\` on the wrapper and call it done.** That was my original setup and it is genuinely correct for accessibility. A screen reader announces the name properly. But \`aria-label\` is an accessibility property, not content, and a text extractor has no reason to read it. Accessible and crawlable are overlapping problems, not the same problem, and this is exactly where they come apart.

## How to check your own site

Don't inspect the DOM in dev tools, because the browser will render it correctly and tell you everything is fine. Fetch the HTML the way a dumb crawler would.

\`\`\`bash
curl -s https://yoursite.com | python -c "
import sys, re, html
h = sys.stdin.read()
h = re.sub(r'<script.*?</script>', '', h, flags=re.S)
t = html.unescape(re.sub(r'<[^>]+>', ' ', h))
print(re.sub(r'\\s+', ' ', t)[:600])
"
\`\`\`

Replacing every tag with a space is deliberate. It's the pessimistic case, and it's what tells you whether your markup is relying on inline behaviour to hold a word together. If your headline survives that, it will survive anything.

## The general shape

The lesson generalises past text animation, and it's the reason I bothered writing this up rather than just fixing my own page.

**Any visual effect that fragments content also fragments it for machines that read the content.** Scramble effects, per-word reveals, typewriters that build a string from an array, canvas-rendered headlines, marquees assembled from duplicated nodes. Every one of them is a decision to render your meaning as pieces, and every one needs a whole copy left somewhere in the document for the readers who are not looking at pixels.

You get to have the animation. You just don't get to have it instead of the words.`,
};
