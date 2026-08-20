import type { Article } from "../articles";

export const presterlyPostMortem: Article = {
  slug: "why-presterly-wound-down",
  title: "Why we wound Presterly down",
  description:
    "We reached 34 Shopify stores and €19M of order history in ten weeks, then stopped. The reason was not the product and not the market. A founder's post-mortem.",
  date: "2026-08-14",
  tags: ["Startups", "Post-mortem", "Founders"],
  summary:
    "Post-mortem of Presterly, a Shopify retention startup wound down in August 2026 after ten weeks. Primary cause was founder-product fit and three founders pulling in different directions, not the technology or the market. Secondary lesson: nobody checked unit economics until week eight.",
  body: `Presterly predicted when a Shopify brand's customers would run out of what they'd bought, then reached them over SMS and WhatsApp at that moment with a checkout already filled in.

It reached 34 stores holding 423,000 customers, analysed nearly €19 million of order history, and got through Meta's approval as a WhatsApp Business Platform Tech Provider. Ten weeks from the first commit.

We wound it down in August 2026.

People assume the technology fell over or the market said no. Neither happened, and pretending otherwise would make this a less useful thing to read.

## The actual reason

Three founders, moving in different directions, for ten weeks.

That's it. That's the headline cause and I've stopped dressing it up.

Not a falling-out. Nobody behaved badly. We just each had a different idea of what we were building and who it was for, and we never forced the disagreement into the open because there was always something more urgent to ship. Building is a wonderful way to avoid a conversation. You feel productive the entire time you're avoiding it.

What that looks like day to day is subtle. Priorities that don't quite line up. Two people solving adjacent problems that don't compose. A feature that one person thinks is the core product and another thinks is a demo. Everyone works hard, everything gets built, and the thing doesn't cohere.

The word for it is founder-product fit, and I had not taken it seriously as a real category of failure before this. I thought it was a soft thing people said. It's the main thing.

## The lesson I own

The one that's mine specifically: **nobody looked at the unit economics until about week eight.**

Not because we were reckless. Because the idea seemed so obviously good at the start that checking felt like a formality we'd get to. Predicting a reorder and messaging at the right moment is plainly valuable. The margin question felt like it would answer itself.

It did answer itself, in week eight, and the answer had a long revenue lead time attached to it.

I want to be precise about how much weight this carries, because it's tempting to make it the headline. It isn't. The maths is a minor detail in why Presterly ended. The founder split is the real story, and if the three of us had been aligned we'd have found the economics in week two and adjusted.

But it's the part I could have personally fixed in an afternoon, so it's the part I keep.

## What I'd want asked

If I were interviewing me, I'd push on this.

I say the venture was wrong rather than saying what I got wrong. That's a real dodge and I've been called on it. The honest version is that I chose to own the technical half, and the thing that killed this company was commercial. I did that at Loira too. I've now done it twice.

The pattern I'm still walking around with is that I keep taking the half I'm comfortable in and hoping someone else has the other half covered. Nobody has ever made me answer when I stop doing that. I don't have a clean answer yet. I'm just no longer pretending it's a coincidence.

## What was genuinely good

Worth saying, because a post-mortem that's all self-criticism is its own kind of performance.

**Building fast against real merchants worked.** First commit to live merchant brands in six weeks, inside an accelerator, with a real Shopify install and real order data. The prediction engine was backtested against actual purchase history rather than a synthetic set, which is why we found out early that consumable reorder intervals are much noisier than the pitch deck version.

**The WhatsApp work was hard and it landed.** Getting through Meta's Tech Provider approval so each merchant onboards their own number through Embedded Signup and keeps ownership of it is not a weekend job. It's a real asset and I'd do it again.

**We stopped in ten weeks.** I've written separately about [what the accelerator was actually for](/writing/what-an-accelerator-is-for). This is the bit I'm most comfortable with. The failure mode I've watched other people fall into is a company that stays technically alive for two years because nobody wants to be the one to say it. Ten weeks of clear evidence is enough evidence.

## What I changed

I'm building again, a booking and operations product for saunas, with one co-founder rather than two.

Three concrete changes.

**One person owns the commercial side and it isn't a shared responsibility.** My co-founder owns design and business, I own the platform. Not because that's tidier, but because "we'll both do sales" means neither of us does.

**The economics got checked in week one.** Before the schema. It took an afternoon and it changed what we built.

**We're building it with real venues rather than for an imagined one.** Two sauna businesses, in the product, finding the awkward parts early. It's slower and much less comfortable than building in a vacuum, and it's the only version that produces a product anyone wants.

## The thing I'd tell someone about to start

Have the argument early.

Whatever the disagreement is that you can feel and are not naming, the one that keeps not being urgent enough to interrupt shipping, that's the one that ends the company. It will not resolve itself while you build. Building makes it easier to ignore, which is precisely why it's dangerous.

Ten weeks is a cheap way to learn that. Two years is not.`,
};
