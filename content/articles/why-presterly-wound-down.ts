import type { Article } from "../articles";

export const presterlyPostMortem: Article = {
  slug: "why-presterly-wound-down",
  title: "Why we wound Presterly down",
  description:
    "34 Shopify stores and €19M of order history in ten weeks, then we stopped. It was not the product and it was not the market. A founder's post-mortem.",
  date: "2026-08-16",

  updated: "2026-09-13",
  tags: ["Startups", "Post-mortem", "Founders"],
  summary:
    "Post-mortem of Presterly, a Shopify retention startup wound down in August 2026 after ten weeks. The cause was founder-product fit and three founders pulling in different directions, not the technology or the market. Second lesson: nobody checked the unit economics until week eight.",
  body: `Presterly worked out when a Shopify brand's customers would run out of what they had bought, then messaged them at that moment with a checkout already filled in. It reached 34 stores holding 423,000 customers, analysed nearly €19 million of order history, and got through Meta's approval as a WhatsApp Tech Provider. Ten weeks from the first commit. We wound it down in August 2026.

## Why did Presterly actually wind down?

Three founders moving in different directions for ten weeks. That is the headline cause and I have stopped dressing it up as a market problem.

Nobody behaved badly. We each had a different idea of what we were building and who it was for, and we never forced that into the open, because there was always something more urgent to ship. Building is a wonderful way to avoid a conversation.

Day to day it is subtle. Priorities that don't quite line up. A feature one person thinks is the core product and another thinks is a demo. Everyone works hard, everything gets built, and the thing doesn't cohere.

The word for it is founder-product fit. I thought that was a soft thing people said. It is the main thing.

## What did I get wrong myself?

Nobody looked at the unit economics until about week eight, and that one is mine rather than ours.

Not because we were reckless. The idea seemed so obviously good that checking felt like a formality, and the margin question felt like it would answer itself. It did, in week eight, with a long revenue lead time attached.

It is a minor detail next to the founder split. Had the three of us been aligned we would have found it in week two and adjusted. But it is the part I could have fixed in an afternoon, so it is the part I keep.

There is a second one underneath it. I chose to own the technical half and hoped somebody else had the commercial half covered. I did that at Loira too. Twice is a pattern, not a coincidence, and I don't have a clean answer for it yet.

## What was genuinely good about it?

Quite a lot, and saying so matters, because a post-mortem made entirely of self-criticism is its own kind of performance.

Building fast against real merchants worked. First commit to live brands in six weeks, on real installs and real order data, with the prediction engine backtested against actual purchase history rather than a synthetic set. The WhatsApp work was hard and it landed.

And we stopped in ten weeks. I have written separately about [what the accelerator was actually for](/writing/what-an-accelerator-is-for). The failure mode I have watched other people fall into is a company that stays technically alive for two years because nobody wants to be the one to say it.

## What changed for the next one

Three things are different at Tigh Sauna, and not one of them is a process or a document. Each is a decision somebody had to make out loud and then own, which is the part that was missing last time rather than the discipline.

| | Presterly | Tigh Sauna |
|---|---|---|
| who owns the commercial side | all three of us, so nobody | one person, named |
| when we checked the economics | week eight | week one, before the schema |
| who we built it with | a merchant we imagined | live venues, from the start |
## What would I tell someone about to start?

Have the argument early. Write down what you each think you are building and who it is for, separately, then compare the answers before anyone writes a line of code.

Whatever the disagreement is that you can feel and are not naming, the one that keeps not being urgent enough to interrupt shipping, that is the one that ends the company. It will not resolve itself while you build. Building makes it easier to ignore, which is exactly what makes it dangerous.

Ten weeks is a cheap way to learn that. Two years is not.`,
};
