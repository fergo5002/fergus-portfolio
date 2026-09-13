import type { Article } from "../articles";

export const multiTenantShopify: Article = {
  slug: "multi-tenant-shopify-apps",
  title: "Multi-tenant Shopify apps: what I'd get right first",
  description:
    "Two multi-tenant Shopify apps later, here are the decisions that were expensive to change and the ones that turned out not to matter at all.",
  date: "2026-08-26",

  updated: "2026-09-13",
  tags: ["Shopify", "Multi-tenant", "Architecture", "TypeScript"],
  summary:
    "Architecture guidance for multi-tenant Shopify apps: scoping every query by shop, handling duplicate and out-of-order webhooks with idempotency keys, storing money in the shop's own currency, surviving token revocation, and treating uninstall as a soft state rather than a delete.",
  body: `I have built two multi-tenant Shopify apps. One reached 34 stores holding 423,000 customers, the other runs bookings and payments for sauna venues. Most of what I worried about up front did not matter. A handful of things I never thought about turned out to be structural. This is that list.

## Scope by shop at the lowest level you can

Every row belongs to a shop and every query filters by shop. The only real question is where that gets enforced.

Enforce it in your handlers and every future handler is a chance to forget. A forgotten filter is not a bug, it is a cross-tenant data leak, and it fails quietly. Push it down: row-level security, or a repository layer that cannot build a query without a shop id.

\`\`\`ts
// A shop-scoped handle is the only way to reach data. There is no
// unscoped accessor to reach for at 2am.
const shop = await tenants.forDomain(domain);
const orders = await shop.orders.recent(50);
\`\`\`

Passing \`shopId\` as the first argument to every function looks equivalent and isn't: a wrong-but-valid id type-checks perfectly.

## What happens when webhooks arrive twice, or out of order, or not at all?

All three happen, so plan for all three now. Retrofitting means reasoning about state you have already written wrongly.

Out of order: \`orders/updated\` can land before \`orders/create\`. Don't assume the row exists and don't assume what you are holding is newer. Compare Shopify's \`updated_at\` and drop anything older.

Twice: retries are normal and a duplicate is not an error. Every webhook carries an id, so store it with a unique constraint and let the insert conflict.

\`\`\`sql
insert into webhook_events (id, shop_id, topic)
values ($1, $2, $3)
on conflict (id) do nothing
returning id;
\`\`\`

No row returned means you have already done this one. That constraint removes a whole category of double-charge and double-booking bug.

Not at all: webhooks get missed, so anything that matters needs a reconciliation job that pulls from the API and repairs the gap. Webhooks are an optimisation over polling, not a source of truth.

## Which currency is the money actually in?

The shop's own, never yours. The trap is the dashboard query that sums a total across shops, runs perfectly, returns a number and is meaningless.

\`\`\`sql
-- wrong, and it will never tell you it is wrong
select sum(total_price) from orders;

-- right
select currency, sum(total_price) from orders group by currency;
\`\`\`

I published a mixed euro and sterling figure once. It was too high, nothing errored, and it was only caught because somebody re-derived it by hand. Store the currency beside every amount.

## What happens when a token dies mid job?

Tokens get revoked, apps get uninstalled and scopes change, all of it mid-flight, so a job that was fine when it was queued gets a 401 when it runs.

Treat 401 and 403 as a tenant state change rather than a transient error. Retrying with backoff is exactly wrong: you will hammer an endpoint that can never succeed. Mark the install as needing re-auth and stop its jobs.

And make uninstall soft. Merchants uninstall and reinstall constantly, sometimes by accident, so set \`uninstalled_at\` and exclude it from active queries rather than deleting in the handler. That column is also the only honest basis for counting customers.

## What did I over-think?

Almost everything that felt like architecture, and almost nothing that felt like plumbing. Two apps in, here is the honest scorecard of what I spent the worry on.

| what I worried about | how much it mattered |
|---|---|
| sharding and scaling architecture | none yet |
| GraphQL against REST | barely, use GraphQL |
| beautiful embedded app UX | none, nobody mentioned our modals |
| one webhook secret for every tenant | enormously |
| logging the raw webhook body | enormously |

One well-indexed Postgres with a shop id on everything carries you past the point where you know whether the product works. The bottom two are the ones to act on today. A single [platform-wide webhook secret](https://shopify.dev/docs/apps/build/webhooks) is correct with one tenant, and with two it only proves the request was signed by one of your merchants, while the tenant comes from a header the caller controls. Use per-install secrets.

And log the raw webhook body before you parse it. In production the question is always what Shopify actually sent, and without it you are reconstructing that from the mangled state it produced. It is the first thing I reach for, every time.

The same principle runs through [deciding whether a customer has gone](/writing/when-is-a-customer-actually-gone): what you chose to store decides what you are able to ask later.`,
};
