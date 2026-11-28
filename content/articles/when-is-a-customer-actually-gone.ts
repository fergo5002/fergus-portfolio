import type { Article } from "../articles";

export const customerGone: Article = {
  slug: "when-is-a-customer-actually-gone",
  title: "When is a customer actually gone?",
  description:
    "A thirty day lapsed window is wrong for nearly every customer, and wrong in both directions at once. What I'd use instead, and what it can't tell you.",
  date: "2026-09-11",
  updated: "2026-11-25",

  tags: ["Retention", "Data", "Product"],
  summary:
    "Why a fixed lapsed-customer window gets almost everyone wrong, and what I'd use instead: each customer's own median gap between visits, a multiple of that gap as the alarm, and an honest range when there aren't enough visits to know their rhythm.",
  body: `Every booking system I've looked at decides a customer has gone quiet after a fixed number of days. Usually it's thirty. I think that's wrong for nearly everyone, and it's wrong in both directions.

## What's wrong with thirty days?

Two people who are both thirty-three days on from their last visit can be in completely different places.

One comes every Saturday. Thirty-three days is five missed Saturdays, so she's gone. The other comes every couple of months, so thirty-three days is just the middle of her normal gap and there's nothing to do.

Thirty days says they're both fine, and they're not.

The Saturday regular is the one that costs you. Five missed Saturdays means the habit's already broken. She was the best customer in the place and the dashboard doesn't care. Tighten the window to catch her and now you're messaging the twice-a-season customer halfway through her normal gap, and you're spending money on people who were coming back anyway.

## So what do you measure instead?

Use their own history. Take the gaps between their visits, take the median, and set the alarm at a multiple of it.

Use the median, because one four-month holiday drags the mean way out and the alarm basically never fires again. And use a multiple, because a fortnight late means nothing for someone who comes twice a season and a lot for the Saturday regular.

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

Twice is just where I'd start. Pick it by how much you're willing to spend on being early. Messaging someone too early is a mistake you can live with. Missing the regular isn't.

## How sure can you be after three visits?

Not very, and it's way more useful to say that than to round it into a confident date.

Three visits is two gaps, and two numbers aren't a rhythm. Any median you take will move the second a third visit comes in. The [rule of three](https://en.wikipedia.org/wiki/Rule_of_three_%28statistics%29) is the general version of the problem: with a small sample you just can't claim much.

So the answer should carry its own doubt. "Probably gone, on two gaps" is a useful thing to hand someone. Put a date on it with the doubt taken out and it looks a lot surer than it is. The [second visit tool](/tools/second-visit) on this site does the honest version and puts the range right beside the number.

## What I would build first

Keep the gaps, not just the last visit.

Most schemas store \`last_seen_at\` and work everything out from that, which throws away the one thing you need to make the call. Same lesson as the [multi-tenant work](/writing/multi-tenant-shopify-apps): you can only ask about what you kept. Keep the visits, work out the median when you read it, and cache it when that starts to hurt.

Then sort the list by who you're actually at risk of losing, not by who's been away longest. A weekly regular two weeks late matters more than a seasonal customer three months late, and a list sorted by days since last visit puts those two in exactly the wrong order.

Do the boring bit first though. Make sure a returning customer counts as the same person. Names get typed differently every time, and someone who books as Sinead and then as Sinéad is two customers with one visit each, both of whom look like they never came back. I built a version of this before for Shopify brands, where we called it run-out prediction, and it ended for reasons that had nothing to do with the maths.`,
};
