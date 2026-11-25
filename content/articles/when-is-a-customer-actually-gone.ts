import type { Article } from "../articles";

export const customerGone: Article = {
  slug: "when-is-a-customer-actually-gone",
  title: "When is a customer actually gone?",
  description:
    "A thirty day lapsed window is wrong for nearly every customer, and wrong in both directions at once. What I'd use instead, and what it can't tell you.",
  date: "2026-09-11",

  tags: ["Retention", "Data", "Product"],
  summary:
    "Why a fixed lapsed-customer window gets almost everyone wrong, and what I'd use instead: each customer's own median gap between visits, a multiple of that gap as the alarm, and an honest range when there aren't enough visits to know their rhythm.",
  body: `Every booking system I've looked at decides a customer has gone quiet after a fixed number of days. Usually it's thirty. That's the wrong question for nearly everybody, and somehow it manages to be wrong in both directions at once.

## Why is a fixed window wrong?

Because two people who are both thirty-three days on from their last visit can be in completely different places.

One comes every Saturday. Thirty-three days is five missed Saturdays, so she's gone. The other comes every couple of months, so thirty-three days is just the middle of her normal gap and there's nothing to do.

One threshold has to pick which of them to be wrong about, and thirty days says they're both fine.

The Saturday regular is the one that costs you. Five missed Saturdays means the habit's already broken, she was the best customer in the place, and the dashboard isn't bothered. Tighten the window to catch her and now you're messaging the twice-a-season customer halfway through her normal gap, which is how a retention budget gets spent on people who were always coming back.

## What do you measure instead?

Each customer against their own history. Take the gaps between their visits, take the median, and set the alarm at a multiple of it.

Median and not mean, because one four-month holiday gap drags the mean somewhere useless and quietly kills the alarm for good. A multiple and not a fixed number of days, because a fortnight late means nothing for someone who comes twice a season and means everything for the Saturday regular.

\`\`\`chart
{
  "kind": "bar",
  "title": "Days late before the alarm fires",
  "unit": " days",
  "categories": ["weekly", "fortnightly", "monthly", "twice a season"],
  "series": [{ "label": "alarm at twice their own gap", "values": [14, 28, 66, 120] }],
  "caption": "Just arithmetic, no real data: the alarm sits at twice each customer's own median gap, so it moves with them instead of with the calendar."
}
\`\`\`

Twice is just where I'd start. Pick the multiple based on what you're willing to spend on being early, because early is the only one of the two mistakes you can recover from.

## How sure can you be after three visits?

Not very, and saying that straight is way more useful than rounding it into a confident date.

Three visits is two gaps, and two numbers aren't a rhythm. Any median you take will move the second a third visit comes in. The [rule of three](https://en.wikipedia.org/wiki/Rule_of_three_%28statistics%29) is the general version of the problem: a small sample puts a wide bound on what you're allowed to claim, and no amount of nice formatting narrows it.

So the answer should carry its own doubt. "Probably gone, on two gaps" is a useful thing to hand someone. The same call with the doubt stripped out and a date stuck on is worse, because now it looks like it knows. The [second visit tool](/tools/second-visit) on this site does the honest version and puts the range right beside the number.

## What I would build first

Keep the gaps, not just the last visit.

Most schemas store \`last_seen_at\` and work everything out from that, which throws away the one thing you need to make the call. It's the same lesson as the [multi-tenant work](/writing/multi-tenant-shopify-apps): what you store decides what you can ask later. Keep the visits, work out the median when you read it, and cache it when that starts to hurt.

Then sort by what's at risk, not by who's latest. A weekly regular two weeks late matters more than a seasonal customer three months late, and a list sorted by days since last visit puts those two in exactly the wrong order.

Do the boring one first though: make sure a returning customer is recognised as the same person. Names get typed differently every time, and someone who books as Sinead and then as Sinéad is two customers with one visit each, both of whom look like they never came back. I built a version of this before for Shopify brands, where we called it run-out prediction, and it ended for reasons that had nothing to do with the maths.`,
};
