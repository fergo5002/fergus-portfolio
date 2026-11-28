import type { Article } from "../articles";

export const multiTenantShopify: Article = {
  slug: "multi-tenant-shopify-apps",
  title: "Multi-tenant Shopify apps: what I'd get right first",
  description:
    "What I learned building multi-tenant Shopify apps: the decisions that were a pain to change later, and the ones that didn't matter at all.",
  date: "2026-07-23",

  updated: "2026-11-25",
  tags: ["Shopify", "Multi-tenant", "Architecture", "TypeScript"],
  summary:
    "What I'd get right first in a multi-tenant Shopify app: scope every query by shop, handle duplicate and out-of-order webhooks with idempotency keys, store money in the shop's own currency, survive token revocation, and treat uninstall as a soft state rather than a delete.",
  body: `Building multi-tenant Shopify apps taught me to worry about the boring stuff. Most of what I worried about up front didn't matter. A few things I never thought about turned out to be holding the whole thing up. Most of it I learnt building Presterly during [Hatch105](/writing/what-an-accelerator-is-for). This is that list.

## Scope by shop at the lowest level you can

Every row belongs to a shop and every query filters by shop. The only real question is where you enforce that.

Do it in your handlers and every new handler is a chance to forget. A forgotten filter leaks one merchant's data to another, and nothing tells you it happened. Push it down: row-level security, or a repository layer that can't build a query without a shop id.

\`\`\`ts
// A shop-scoped handle is the only way to reach data. There is no
// unscoped accessor to reach for at 2am.
const shop = await tenants.forDomain(domain);
const orders = await shop.orders.recent(50);
\`\`\`

Passing \`shopId\` as the first argument to every function looks like the same thing and isn't, because a wrong but valid id type-checks fine.

## What happens when webhooks arrive twice, or out of order, or not at all?

All three happen, so plan for all three from day one. Retrofitting means working out which state you've already written wrong.

Out of order: \`orders/updated\` can land before \`orders/create\`. Don't assume the row exists and don't assume what you're holding is newer. Compare Shopify's \`updated_at\` and drop anything older.

Twice: retries are normal, so a duplicate isn't an error. Every webhook has an id, so store it with a unique constraint and let the insert conflict.

\`\`\`sql
insert into webhook_events (id, shop_id, topic)
values ($1, $2, $3)
on conflict (id) do nothing
returning id;
\`\`\`

No row back means you've already handled this one. That one constraint gets rid of a whole class of double-charge and double-booking bugs.

Not at all: webhooks go missing, so anything that matters needs a reconciliation job that pulls from the API and fills the gap. Think of webhooks as a quicker way of polling. They're never the source of truth.

## Which currency is the money actually in?

The shop's own, never yours. The trap is the dashboard query that sums a total across shops, runs perfectly, gives you a number and means nothing.

\`\`\`sql
-- wrong, and it will never tell you it is wrong
select sum(total_price) from orders;

-- right
select currency, sum(total_price) from orders group by currency;
\`\`\`

I published a mixed euro and sterling figure once. It was too high, nothing errored, and it only got caught because someone worked it out again by hand. Store the currency next to every amount.

## What happens when a token dies mid job?

Tokens get revoked, apps get uninstalled and scopes change, all of it mid-flight. So a job that was fine when it was queued gets a 401 when it actually runs.

Treat 401 and 403 as the tenant's state changing, not a blip. Retrying with backoff is exactly wrong here, because you'll hammer an endpoint that can never succeed. Mark the install as needing re-auth and stop its jobs.

And make uninstall soft. Merchants uninstall and reinstall all the time, sometimes by accident, so set \`uninstalled_at\` and leave it out of active queries instead of deleting anything in the handler. That column's also the only honest way to count customers.

## What did I over-think?

Almost everything that felt like architecture, and almost nothing that felt like plumbing. Two apps in, here's where my worrying actually went.

Sharding and scaling: none of it has mattered yet. GraphQL or REST: barely, just use GraphQL. A beautiful embedded app UI: nobody has ever mentioned our modals. What mattered loads was the webhook secret and the raw webhook log, and I thought about neither.

One well-indexed Postgres with a shop id on everything gets you past the point where you know if the product works. The last two are the ones to act on today. A single [platform-wide webhook secret](https://shopify.dev/docs/apps/build/webhooks) is fine with one tenant. With two, it only proves the request was signed by one of your merchants, and which merchant comes from a header the caller controls. Use per-install secrets.

And log the raw webhook body before you parse it. In production the question is always what Shopify actually sent, and without the raw body you're piecing it together from whatever mess it left behind. It's the first thing I reach for, every time.

Same idea as [deciding whether a customer has gone](/writing/when-is-a-customer-actually-gone): what you store decides what you can ask later.`,
};
