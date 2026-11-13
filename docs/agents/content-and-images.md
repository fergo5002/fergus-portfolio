# Content, numbers, images and `public/`

Read this before editing anything in `content/`, any traction figure, the experience entries, anything in `public/` or `scripts/build-images.mjs`.

## Keeping the numbers honest

> [!important] These are now **historical** figures, and they must stay in the past tense
> Presterly was wound down in **August 2026**. Its numbers are a snapshot of a company that no
> longer trades, so every sentence carrying one reads "reached", not "installed on", and no
> figure gets a present-tense verb. **Do not re-verify them against the Presterly database**: it
> is frozen, it is a different business's infrastructure, and a fresh query would only produce a
> more precise number for something that stopped. The 2026-08-04 snapshot below is the last word.
>
> Tigh Sauna carries **no** traction numbers on this site on purpose. It has two merchants and it
> has not been through a season, so there is nothing measured to publish. If that changes, the
> same discipline applies: scope every figure to one query, say what the query proves, and round
> down.

`content/` carries traction claims (customers under management, order value analysed, store
count) on a page whose footer invites people to check. **They are claims, not decoration, and they
go stale silently.** Last verified against the Presterly production database on **2026-08-04** via
the read-only Supabase MCP, and never to be re-verified: see the note above.

**The scoped query is the only one to publish from.** The trap, hit twice on 2026-08-04, is pairing
a filtered store count with unfiltered platform totals. Scope every figure to the same set:

```sql
with live as (
  select s.id from shops s
  where s.installed_at is not null and s.uninstalled_at is null
    and (select count(*) from customers c where c.shop_id = s.id) >= 1000
)
select (select count(*) from live),
       (select count(*) from customers where shop_id in (select id from live)),
       (select currency, sum(total_price) from orders where shop_id in (select id from live) group by currency),
       (select count(*) from predictions where shop_id in (select id from live));
```

Verified 2026-08-04: **34 stores, 423,624 customers, EUR 18,956,608 + GBP 941,244, 292,745
predictions.** Published rounded **down**, as 34 / 423,000 / nearly €19M / roughly 292,000.

Three rules that came out of getting it wrong:

1. **Never sum `orders.total_price` across shops without grouping by `currency`.** It is stored in
   each shop's own currency. The published euro figure is the EUR subtotal alone, which is true
   without the GBP and errs low. Do not pick an FX rate to make a bigger number.
2. **Say what the query proves.** It proves *installation*, so the copy says "installed on", not
   "live on". Of the 34, only **14 have any orders at all**, which is why the order value is a
   separate sentence and never sits behind a colon under the store count. Likewise a
   `count(*)` on `predictions` proves rows exist, not that any are fresh, so no freshness verb
   unless someone actually checks `updated_at`.
3. **Do not publish the raw install count.** `shops` had 105 rows marked installed, including dev
   and test installs. The 34 is the defensible floor. Checked the same day: 34 stores resolve to 34
   distinct brand roots, and none of the domains look like dev or staging stores.

Re-check before any application or outreach push, and never round upward.

## Content still needing the owner (Fergus)

- Settled, nothing outstanding: Hatch105 has its own short accelerator entry under Tigh, at
  Fergus's request on 23 September 2026, rewritten to his brief on 24 September. Keep it short: Jack Pierse (co-founder of
  Wayflyer and HappyStack) founded it, 1,700 applied and Fergus was one of nine **people**, not
  nine teams, then the $10k monthly revenue goal and what chasing it did. Role "Technical
  founder", Jun to Aug 2026. The build-challenge ranker was his selection task, but he asked for
  it to stay off the page.

## Two files in `public/` are ownership proofs. Do not delete them.

Nothing in the code imports either, which is exactly the shape a later cleanup deletes.

- **`google9622a76d3e2fd7ba.html`** verifies the `https://fergusoreilly.dev/` URL-prefix property
  in Google Search Console, owned by **`fergus@tighsauna.com`**. Google re-checks it periodically,
  so removing it un-verifies the property and the search performance data stops arriving. Its
  contents are the single line `google-site-verification: google9622a76d3e2fd7ba.html`.
- **`1e1c07d6835b43b5ae97096bb927a1ee.txt`** is the IndexNow key, used by `scripts/indexnow.mjs`.
  The file's contents ARE the key, and that is the whole ownership proof, so it is deliberately
  not a secret and is committed on purpose. Rotating it means adding a new file and changing the
  constant in that script.

**Anything in `public/` is served from the site root and is indexable**, so do not put notes,
READMEs or working files there. This section exists because the obvious place for the note above
was `public/README.md`, which would have been live at `fergusoreilly.dev/README.md`.

Run `node scripts/indexnow.mjs --dry-run` to see what would be submitted, and without the flag to
submit every sitemap URL to Bing. Worth running after publishing an article. Google has no
equivalent: its sitemap ping endpoint was retired in 2023, so new pages go through Search Console
or wait for a natural recrawl.

## Images

Everything in `public/img/` is a **derived artefact built by `scripts/build-images.mjs`**. Do not
hand-edit the images; change the script and re-run `node scripts/build-images.mjs`. Brand marks are
vendored in `assets/sources/`; the two large sources stay where they live (the photo library and the
Trinity coursework). The script skips politely with a message when a source is missing, so a fresh
clone still builds everything else.

- `portrait.jpg`: from `IMG_1018.HEIC`. **sharp cannot decode HEIC** (its libvips has no HEVC
  decoder; it reads the metadata then fails on the pixels), so the script shells out to `ffmpeg`
  to decode to PNG first and crops from that. ffmpeg on PATH is needed for this step only.
- `presterly.png`, `loira.png`: brand marks composited onto 16:9 cards.
- `remand.png`: Remand's R, traced from the nybblers.vercel.app app icon and vendored as
  `assets/sources/remand-r.svg` (provenance in `remand-brand.md`). Rebuild with `--remand-only`.
- `tigh-sauna.png`: the approved Tigh wordmark beside the brass ribbon sculpture
  from the current tighsauna.com website, on evergreen `#0B3028`. The outlined
  wordmark and transparent brass still are vendored in `assets/sources/`; provenance
  is recorded in `assets/sources/tigh-brand.md`. No installed font is needed.
  Rebuild just this card with `node scripts/build-images.mjs --tigh-only`.
  The old teal house SVG is historical and is no longer used by the builder.
  Firespark, Hearth and Sauna OS are retired public names; the outbound link guard
  in `content/links.test.ts` still protects the current Tigh Sauna domain.
- `contrabot.png`: authored SVG, rasterised. Deliberately not stock screenshots.
  In `contrabot`, **all geometry is in screen coordinates where a smaller y is a higher price**,
  getting that backwards once produced a rising chart captioned as a profitable short.
- `under-the-campanile.jpg`: real gameplay, cropped to drop the browser scrollbars. JPEG, not
  PNG: it is the one photographic card, and lossless cost ~8x the bytes for no visible gain.

Alt text lives in `content/projects.ts` as `imageAlt`, per project. Do **not** reintroduce a
blanket `"${title} screenshot"`: most of these are brand marks or authored illustrations, and
mislabelling them is a false claim about the work.

Any project whose `image` is `""` falls back to `SignalPlate`, a procedural CRT alignment card
seeded from its slug. That is deliberately a test card, never a fake screenshot.

Imagery is phosphor-duotoned at rest and resolves to full colour on hover (a light cast on touch,
where there is no hover to earn it). The duotone hue is per-theme via `--duotone-hue`.
