import type { Article } from "../articles";

export const webhookSecret: Article = {
  slug: "one-webhook-secret-two-tenants",
  title: "One webhook secret, two tenants, one hole",
  description:
    "A shared Shopify webhook secret is correct with one store and a cross-tenant vulnerability with two. The bug is invisible until the second customer arrives.",
  date: "2026-08-16",
  tags: ["Shopify", "Security", "Multi-tenant", "Webhooks"],
  summary:
    "In a multi-tenant Shopify app, verifying webhook HMAC against one platform-wide secret only proves the request came from one of your merchants, not the merchant it claims to be. Per-install secrets are the fix. The general rule: any secret scoped per-platform rather than per-tenant is a latent cross-tenant hole.",
  body: `We onboarded a second sauna onto our booking platform and found a security bug that had been sitting there, perfectly invisible, the entire time the first one was live.

It's a good bug. Not clever, not exotic, just a thing that is genuinely correct with one customer and genuinely broken with two. I think a lot of small multi-tenant apps have it right now.

## The setup

Shopify signs every webhook with an HMAC-SHA256 of the raw body, using a shared secret, in the \`X-Shopify-Hmac-Sha256\` header. You verify it like this, and every tutorial you'll find shows roughly this:

\`\`\`ts
const digest = crypto
  .createHmac("sha256", process.env.SHOPIFY_WEBHOOK_SECRET!)
  .update(rawBody, "utf8")
  .digest("base64");

if (!crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(headerHmac))) {
  return new Response("bad signature", { status: 401 });
}
\`\`\`

Then you work out which of your tenants the order belongs to, and write it into their data:

\`\`\`ts
const tenant = req.headers.get("x-shopify-shop-domain");
await recordOrder(tenant, body);
\`\`\`

Read those two blocks together and the problem is right there.

## What the signature actually proves

The HMAC check proves the request was signed by **the holder of that one secret**. That's it.

In a single-tenant app, the holder of that secret is your one merchant, so the check proves the request is from them. Correct.

In a multi-tenant app with a single platform-wide secret, the holder is **any of your merchants**. So the check proves the request came from someone in the set of your customers. It says nothing whatsoever about *which* one.

And the tenant is taken from a header the caller supplies.

So merchant A, who has your app installed and therefore legitimately possesses the shared secret, can sign a perfectly valid payload, set the shop domain header to merchant B, and write into merchant B's data. Bookings, orders, customer records. Everything downstream of that webhook.

No signature check fails. Nothing looks wrong in any log. It's an authenticated request from a real customer, doing exactly what the code was told to allow.

## Why nobody notices

Because with one tenant the code is right.

There is no test you would plausibly have written that catches this. Your webhook tests assert a valid signature is accepted and an invalid one is rejected, and both of those pass, correctly, forever. The failing case requires two tenants to exist and one of them to lie about being the other, and until your second customer signs up there is no second tenant to write that test with.

This is what makes the class of bug worth naming rather than just fixing. It isn't a mistake in the usual sense. It's a correct implementation of an assumption that expires silently.

## The fix

Give every install its own secret and verify against that one alone.

\`\`\`sql
alter table shopify_installs
  add column webhook_secret text not null;
\`\`\`

\`\`\`ts
const domain = req.headers.get("x-shopify-shop-domain");
const install = await installs.findByDomain(domain);
if (!install) return new Response("unknown shop", { status: 404 });

const digest = crypto
  .createHmac("sha256", install.webhookSecret)
  .update(rawBody, "utf8")
  .digest("base64");

if (!timingSafeEqual(digest, headerHmac)) {
  return new Response("bad signature", { status: 401 });
}

await recordOrder(install.id, body);
\`\`\`

The shape change is the point. The tenant header is now a **lookup key**, and the signature is checked against that specific tenant's secret. A request claiming to be merchant B is verified against merchant B's secret, which merchant A does not have. The claim and the proof are finally about the same thing.

Note that \`recordOrder\` takes \`install.id\`, from the row we looked up, rather than the header. Never carry the caller's string past the point where you resolved it to a record.

## Proving it, rather than believing it

The check I trust on a security fix is not that the new tests pass. It's reverting the fix and watching them fail.

So: put the old shared-secret verification back, run the suite, confirm the cross-tenant test goes red, then restore the fix and watch it go green. If the test stays green with the vulnerability reinstated, the test was testing something else and you've learnt nothing.

The test itself is short. Sign a payload with tenant A's secret, send it with tenant B's shop domain, and assert a 401 and that nothing was written to B.

## The general rule, which is the bit worth keeping

**Any secret that is scoped per-platform rather than per-tenant is a latent cross-tenant hole, and it stays invisible until the second tenant arrives.**

Once you have the shape you start finding it in other places. A single signing key for customer-facing tokens. One API key your app uses for all tenants against a provider that scopes by key. A shared encryption key over per-tenant credentials. A webhook endpoint that trusts an identifier in the body.

The test question is always the same, and it takes ten seconds to ask: *if one of my customers had this secret and wanted to act as another of my customers, what would stop them?* If the answer is a value they control, there's your bug.

Worth asking before the second customer signs up rather than after.

The rest of what I would get right first is in [multi-tenant Shopify apps](/writing/multi-tenant-shopify-apps).`,
};
