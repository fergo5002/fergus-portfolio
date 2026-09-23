import type { Article } from "../articles";

export const customerGone: Article = {
  slug: "when-is-a-customer-actually-gone",
  title: "When is a customer actually gone?",
  description:
    "A thirty day lapsed window is wrong for nearly every customer, and wrong in both directions at once. What to use instead, and what it cannot tell you.",
  date: "2026-09-11",

  tags: ["Retention", "Data", "Product"],
  summary:
    "Why a fixed lapsed-customer window misclassifies almost everyone, and what to use instead: each customer's own median gap between visits, a multiple of that gap as the alarm, and a stated range when there are too few visits to know the rhythm.",
  body: `Every booking system I have looked at decides a customer has gone quiet after a fixed number of days. Thirty is the usual one. It is the wrong question asked of nearly everybody, and it manages to be wrong in both directions at the same time.

## Why is a fixed window wrong?

Because two people sitting at exactly the same thirty-three days since their last visit can be in completely different states.

One comes every Saturday. Thirty-three days is five missed Saturdays and she is gone. The other comes every couple of months, so thirty-three days is an ordinary Tuesday in the middle of her normal gap, and there is nothing to do about it.

One threshold has to pick which of them to be wrong about, and thirty days calls both of them fine.

The Saturday regular is the expensive half of that. Five missed Saturdays is a habit that has already broken, she was the best customer in the building, and the dashboard is calm about it. Set the window tighter to catch her and you start messaging the twice-a-season customer in the middle of her ordinary gap, which is how a retention budget gets spent on people who were always coming back.

## What do you measure instead?

Each customer against their own history. Take the gaps between their visits, take the median, and put the alarm at a multiple of that median.

The median rather than the mean, because one holiday-shaped gap of four months drags a mean somewhere useless and quietly disables the alarm for good. A multiple rather than a fixed number of days, because a fortnight late means nothing to somebody who comes twice a season and means everything to the Saturday regular.

\`\`\`chart
{
  "kind": "bar",
  "title": "Days late before the alarm fires",
  "unit": " days",
  "categories": ["weekly", "fortnightly", "monthly", "twice a season"],
  "series": [{ "label": "alarm at twice their own gap", "values": [14, 28, 66, 120] }],
  "caption": "Arithmetic rather than data: the alarm sits at twice each customer's own median gap, so it moves with them instead of with the calendar."
}
\`\`\`

Twice is a starting point, not a law. Pick the multiple from what you are willing to spend on being early, because being early is the only mistake of the two you can recover from.

## How sure can you be after three visits?

Not very at all, and saying so plainly is a great deal more useful than rounding it into a confident date.

Three visits is two gaps, and two numbers are not a rhythm. Any median you take from them will move the moment a third one lands. The [rule of three](https://en.wikipedia.org/wiki/Rule_of_three_%28statistics%29) is the general shape of the problem: a small sample puts a wide bound on what you are allowed to claim, and no amount of formatting narrows it.

So the answer should carry its own doubt. "Probably gone, on two gaps" is a useful thing to hand somebody. The same judgement with the doubt stripped off and a date attached is worse, because now it looks like it knows. The [second visit tool](/tools/second-visit) on this site does the honest version and puts the range beside the number rather than behind it.

## What I would build first

Keep the gaps, not just the last visit.

Most schemas store \`last_seen_at\` and compute everything from it, which throws away the one thing that makes the judgement possible. It is the same lesson as the [multi-tenant work](/writing/multi-tenant-shopify-apps): the shape you store decides the questions you can ask later. Keep the visits, work the median out on read, cache it when that starts to hurt.

Then sort by what is at risk rather than by who is latest. A weekly regular two weeks late is worth more than a seasonal customer three months late, and a list ordered by days since last visit puts those two in exactly the wrong order.

Do the dull one first, though: make sure a returning customer is recognised as the same person. Names get typed differently every time, and somebody who books as Sinead and then as Sinéad is two customers with one visit each, both of whom look like they never came back. I built a version of this before for Shopify brands, where the same idea went by run-out prediction, and [it ended for reasons that had nothing to do with the maths](/writing/why-presterly-wound-down).`,
};
