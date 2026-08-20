import type { Article } from "../articles";

export const multiTenantShopify: Article = {
  slug: "multi-tenant-shopify-apps",
  title: "Multi-tenant Shopify apps: what I'd get right first",
  description:
    "Two multi-tenant Shopify apps later, here are the decisions that were expensive to change and the ones that did not matter at all.",
  date: "2026-08-06",
  tags: ["Shopify", "Multi-tenant", "Architecture", "TypeScript"],
  summary:
    "Architecture guidance for multi-tenant Shopify apps: scoping every query by shop, handling webhook ordering and duplicates with idempotency keys, storing money in the shop's own currency, surviving token revocation, and treating uninstall as a soft state.",
  body: `I've built two multi-tenant Shopify apps. One reached 34 stores holding 423,000 customers; the other runs booking and payments for sauna venues.

Most of what I worried about up front didn't matter. A handful of things I didn't think about at all turned out to be structural. This is that list.

## Scope by shop at the lowest level you can

Every row belongs to a shop. Every query filters by shop. The question is where you enforce it.

Enforcing it in your handlers means every future handler is a chance to forget, and a forgotten filter is a cross-tenant data leak rather than a bug. The failure is quiet and it's the worst kind you can ship.

Push it down. Row-level security if your database has it, or a repository layer that physically cannot construct a query without a shop id, so the type system refuses rather than a reviewer noticing.

\`\`\`ts
// A shop-scoped handle is the only way to reach data. There is no
// unscoped accessor to reach for at 2am.
const shop = await tenants.forDomain(domain);
const orders = await shop.orders.recent(50);
\`\`\`

The version where you pass \`shopId\` as the first argument to every function looks equivalent and isn't, because a wrong-but-valid value type-checks perfectly. A handle that carries the scope can't be passed the wrong id, because there's nowhere to pass one.

## Webhooks arrive out of order, twice, or not at all

Plan for all three from the start. Retrofitting is painful because it means reasoning about state you've already written wrongly.

**Out of order.** \`orders/updated\` can land before \`orders/create\`. Don't assume the row exists, and don't assume the version you're holding is newer than the one in the database. Compare Shopify's \`updated_at\` and drop anything older than what you have.

**Twice.** Retries are normal and a duplicate is not an error. Every webhook carries \`X-Shopify-Webhook-Id\`. Store it with a unique constraint and let the insert conflict:

\`\`\`sql
insert into webhook_events (id, shop_id, topic)
values ($1, $2, $3)
on conflict (id) do nothing
returning id;
\`\`\`

No row returned means you've already processed it. Stop there. This one constraint removes an entire category of double-charge and double-booking bug.

**Not at all.** Webhooks get missed. Anything that matters needs a reconciliation job that pulls from the API and repairs the gap. Treat webhooks as an optimisation over polling, not as a source of truth.

## Money is in the shop's currency, and you will get this wrong once

Every monetary field on a Shopify object is in that shop's own currency. Not yours.

The trap is not knowing that. The trap is a dashboard query that sums a total across shops, which runs perfectly, returns a number, and is meaningless.

\`\`\`sql
-- wrong, and it will never tell you it's wrong
select sum(total_price) from orders;

-- right
select currency, sum(total_price) from orders group by currency;
\`\`\`

I published a mixed euro and sterling figure once. It was too high, nothing errored, and the only reason it got caught was someone re-deriving it by hand.

Store the currency next to every amount. Never aggregate across currencies without grouping. And if the answer is "we need one number for the front page", the honest move is to publish one currency's subtotal and say so, not to pick an exchange rate that makes the number bigger.

## Tokens die while your job queue is running

Access tokens get revoked. Apps get uninstalled. Scopes change. All of this happens mid-flight, which means a background job that was fine when it was queued gets a 401 when it runs.

Two things make this survivable.

**Treat 401 and 403 as a tenant state change, not a transient error.** Retrying with backoff is exactly wrong: you'll hammer an endpoint that will never succeed and fill your logs. Mark the install as needing re-auth, stop its jobs, and surface it in the UI.

**Make uninstall soft.** Do not delete a shop's data when \`app/uninstalled\` arrives. Merchants uninstall and reinstall constantly, sometimes by accident, and hard deletion makes that unrecoverable. Set \`uninstalled_at\`, exclude it from active queries, and delete on a schedule that satisfies your data retention obligations rather than in the webhook handler.

That column also turns out to be the honest basis for counting customers. An install count including test stores, development stores and long-gone merchants is not a number you should put on a landing page.

## Secrets go per install

Covered properly in [one webhook secret, two tenants](/writing/one-webhook-secret-two-tenants), but it belongs on this list because it's the one that's genuinely dangerous.

A single platform-wide webhook secret is correct with one tenant. With two, verifying the HMAC only proves the request was signed by *one of* your merchants, and the tenant is read from a header the caller controls. Merchant A can write into merchant B.

Per-install secrets, and the tenant header becomes a lookup key rather than an assertion you trust.

## Things I over-thought

**Sharding, and any scaling architecture.** One well-indexed Postgres with a shop id on everything will carry you far past the point where you know whether the product works. Index \`(shop_id, created_at)\` on the tables you list by and move on.

**GraphQL versus REST.** Use GraphQL because the bulk operations are genuinely better and REST is being wound down, but this is not a decision worth a meeting.

**Beautiful embedded app UX.** App Bridge and Polaris are fine. What merchants actually judged us on was whether the data was right and whether it did the thing. Nobody has ever mentioned our modals.

## The one that would have saved the most time

**Log the raw webhook body before you parse it.**

When something goes wrong in production, the question is always "what did Shopify actually send". Without the raw body you're reconstructing it from the mangled state it produced, which is slow and often impossible.

Store the raw payload with its webhook id and topic, keep a fortnight, and delete on a schedule. It's cheap, it's the first thing you'll reach for every single time, and I've regretted not having it more than any other missing piece of tooling.`,
};
