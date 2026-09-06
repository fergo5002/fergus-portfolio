import type { Article } from "../articles";

export const presterlyPostMortem: Article = {
  slug: "why-presterly-wound-down",
  title: "Why we wound Presterly down",
  description: "Presterly lasted ten weeks. We built the product, reached real merchants and avoided a disagreement about what company we wanted to build.",
  date: "2026-08-14",
  updated: "2026-09-06",
  tags: ["Startups","Post-mortem","Founders"],
  summary: "A first-person account of closing Presterly in August 2026: three founders wanted different products, the economics were checked late, and Fergus kept retreating into the technical work.",
  body: `Presterly predicted when a Shopify customer would run out of something they'd bought, then sent an SMS or WhatsApp message with a checkout already filled in. We built it in ten weeks and wound it down in August 2026.

By then it had reached 34 stores holding 423,000 customer records and analysed nearly €19 million of order history. Those were installation and data figures. They didn't answer whether the three of us wanted to build the same company.

## We kept building around the disagreement

We each had a different idea of the product and who it was for. There wasn't a falling-out. We worked hard, but our priorities didn't line up. A feature one person treated as the core product could be a demo to someone else.

We never properly resolved that. There was always something to ship first, and I was comfortable being the person who could build it. A finished feature gave me something concrete to point at. The disagreement was still there the following week.

I also left the commercial questions to the others. I'd done that at Loira. I keep choosing the technical half because I know how to make progress there, then hoping the other half is covered. I don't have a clean answer to that yet.

## The spreadsheet came late

Nobody looked properly at the unit economics until about week eight. The idea sounded valuable: predict the next purchase, send the message at the right time, make checkout easy. I treated checking the margins as something we'd get to.

When we did, the revenue would take longer to arrive than we'd allowed for. That wasn't the main reason we stopped, but it was a question I could have investigated before building so much of the product.

Some of the technical work held up. We backtested the predictions against purchase history and found that reorder intervals were noisier than the pitch suggested. We got through Meta's WhatsApp Tech Provider approval, allowing merchants to onboard their own numbers and keep ownership of them.

Those were useful results. They didn't settle the disagreement between the founders.

## What Hatch105 gave us

We got into [Hatch105](https://hatch105.com) as one of nine teams from around 1,700 applicants. Its deadlines helped: we went from the first commit to live merchant brands in six weeks.

The programme also gave us people to compare notes with and introductions we'd have struggled to get ourselves. It couldn't make me spend Tuesday talking to customers when I wanted to spend it in the codebase. That choice was mine.

## What changed afterwards

I'm now building Tigh Sauna with one co-founder. We checked the economics before designing the schema, and we're working with sauna operators while we build.

My co-founder owns design and business; I own the platform. That is clearer than leaving sales as a shared responsibility. It also leaves me with the same habit to watch: staying in the part I enjoy and assuming someone else has answered the difficult questions.`,
};
