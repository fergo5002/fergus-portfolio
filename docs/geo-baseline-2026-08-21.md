# GEO / SEO baseline: fergusoreilly.dev

**Measured:** 2026-08-21, roughly 09:20 to 09:40 UTC
**Target:** `https://fergusoreilly.dev` (live production, Vercel, `dub1`)
**Method:** read-only. `curl` against the live host with no JavaScript execution, plus
`WebSearch` for indexation. No repo state was read for any number in this document,
and no build or dev server was run.
**Rubrics:** `claude-seo` v2.2.4, skills `seo-geo`, `seo-technical`, `seo-schema`,
`seo-content`. There is no `seo-entity` skill in that package (the installed set is 25
skills and entity work lives inside `seo-geo` and `seo-schema`), so section 6 is scored
against the entity signals in the `seo-geo` "Authority & Brand Signals" criterion rather
than against a rubric of my own.

Every number below is one I ran a command to get. Where I could not measure something,
it says so and says why, and it is not scored.

---

## 1. Summary table

| Score | Value | Rubric | What drags it |
|---|---|---|---|
| **GEO Readiness** | **53 / 100** | `seo-geo`, 5 weighted criteria | citability 8/25, multi-modal 4/15 |
| **Technical SEO** | **75 / 100** | `seo-technical`, 7 of 9 categories measured | IndexNow 0, security headers 60 |
| **Content Quality (E-E-A-T)** | **60 / 100** | `seo-content` weighting (T30/E25/A25/Ex20) | authoritativeness 5/25 |
| **Schema** | **88 / 100** | `seo-schema` | one dangling `@id` per article, `publisher` is a Person |
| **Site citability (mean of 8 articles)** | **7.9 / 25 (32%)** | `seo-geo` criterion 1 | 0 question headings, 0 sourced statistics |

### GEO Readiness breakdown

| Criterion | Weight | Score | Basis |
|---|---|---|---|
| Citability | 25 | **8** | computed per-article, formula in §4 |
| Structural readability | 20 | **13** | hierarchy and paragraph length good, 0 question headings, 0 tables, `#` fused into every H2 |
| Multi-modal content | 15 | **4** | 0 in-body images/video/charts across 8 articles; OG images exist and are schema-referenced |
| Authority and brand | 20 | **10** | byline/date/recency full marks; 0 external citations, 0 reciprocal `sameAs`, no Wikipedia/Wikidata |
| Technical accessibility | 20 | **18** | full SSR, 19 AI crawlers allowed, llms.txt present; no RSL 1.0, sitemap `lastmod` partial |

### Technical SEO breakdown

| Category | Score | Note |
|---|---|---|
| Crawlability | 95 | robots + sitemap valid and 200; largest page 67 kB against a 2 MB Googlebot cap |
| Indexability | 85 | 13/13 correct self-referencing canonicals, no duplicates; `/contact` is 56 words of main content |
| Security | 60 | HTTPS + HSTS only; no CSP, XFO, XCTO or Referrer-Policy |
| URL structure | 100 | clean, max depth 2, single 308 hop, all under 100 chars |
| Mobile | **not measured** | viewport present on 13/13; touch targets and font size need a render |
| Core Web Vitals | **not measured** | Lighthouse excluded by instruction; no CrUX pulled |
| Structured data | 88 | see §3 |
| JS rendering | 100 | `X-Nextjs-Prerender: 1`, all content and JSON-LD server-rendered |
| IndexNow | 0 | no key file, no submission endpoint |

Overall is the mean of the seven measured categories: (95+85+60+100+88+100+0)/7 = 75.4.

> These are the `claude-seo` skill's own heuristics, not Google-internal signals. The skill
> says so itself and it is worth repeating here: nothing in this document is a ranking
> prediction.

---

## 2. Crawl surface

All 13 sitemap URLs plus the four support files were fetched individually.

```
for p in / /experience /projects /writing /contact /robots.txt /sitemap.xml /llms.txt /feed.xml; do
  curl -s -o /dev/null -w "%{http_code} %{content_type} %{size_download}" https://fergusoreilly.dev$p
done
```

| URL | Status | Content-Type | Bytes |
|---|---|---|---|
| `/` | 200 | `text/html; charset=utf-8` | 50,395 |
| `/experience` | 200 | `text/html; charset=utf-8` | 44,180 |
| `/projects` | 200 | `text/html; charset=utf-8` | 66,844 |
| `/writing` | 200 | `text/html; charset=utf-8` | 47,829 |
| `/contact` | 200 | `text/html; charset=utf-8` | 29,092 |
| `/robots.txt` | 200 | `text/plain` | 730 |
| `/sitemap.xml` | 200 | `application/xml` | 2,224 |
| `/llms.txt` | 200 | `text/plain; charset=utf-8` | 10,570 |
| `/feed.xml` | 200 | `application/rss+xml; charset=utf-8` | 12,532 |

All eight article URLs from the sitemap:

| URL | Status | Bytes |
|---|---|---|
| `/writing/split-text-is-costing-you-search` | 200 | 54,519 |
| `/writing/shipping-with-ai-agents` | 200 | 55,127 |
| `/writing/one-webhook-secret-two-tenants` | 200 | 53,707 |
| `/writing/why-presterly-wound-down` | 200 | 52,294 |
| `/writing/a-crt-that-behaves-like-a-crt` | 200 | 54,142 |
| `/writing/agents-will-tell-you-it-works` | 200 | 55,990 |
| `/writing/multi-tenant-shopify-apps` | 200 | 58,170 |
| `/writing/what-an-accelerator-is-for` | 200 | 50,261 |

**13 of 13 sitemap URLs return 200.** No 404s, no redirects, no soft-404s in the set.

### Redirects and host canonicalisation

| Test | Observed |
|---|---|
| `http://fergusoreilly.dev/` | `308 -> https://fergusoreilly.dev/` |
| `https://www.fergusoreilly.dev/` | `308 -> https://fergusoreilly.dev/` |
| `https://fergusoreilly.dev/projects/` | `308 -> https://fergusoreilly.dev/projects` |
| `https://fergusoreilly.dev/definitely-not-a-page-xyz` | `404` |

One hop each, no chains. A real 404 for a missing page.

### robots.txt

`Allow: /` for `*` plus 19 explicitly named agents: GPTBot, OAI-SearchBot, ChatGPT-User,
ClaudeBot, Claude-User, Claude-SearchBot, Google-Extended, PerplexityBot, Perplexity-User,
Applebot, Applebot-Extended, Amazonbot, Bytespider, CCBot, cohere-ai, Meta-ExternalAgent,
DuckAssistBot, MistralAI-User. `Host:` and `Sitemap:` both declared.

Against the `seo-geo` crawler table this covers every crawler the skill lists as
obeying robots.txt, and allows all of them. Nothing is blocked. This is the strongest
part of the whole audit.

### sitemap.xml

13 `<url>` entries, valid namespace, parses. Two observations:

- **`lastmod` is present on 9 of 13 entries.** `/`, `/projects`, `/experience` and
  `/contact` carry only `changefreq` and `priority`, no `lastmod`.
- The homepage `<loc>` is `https://fergusoreilly.dev` with no trailing slash, while the
  server serves `/`. It resolves, but it is not byte-identical to the served URL.

### llms.txt

10,570 bytes, 1,502 words, 97 lines. Correct `# Title` / `> description` shape per the
`seo-geo` template, with sections About, Now, Experience, Projects, Writing, Contact, and
a closing "Notes for answer engines" block that states the preferred name, the
alternate legal name, and that Presterly must be described in the past tense.

Per the rubric this earns presence credit only. Google's AI optimization guide (updated
2026-06-29) states Google Search ignores `llms.txt` entirely and it neither helps nor
harms. Keep it for non-Google engines, do not count it as a Google lever.

### feed.xml

Valid RSS 2.0, 8 items, `atom:link` self-reference present, autodiscovery
`<link rel="alternate" type="application/rss+xml">` in every page head. Each item carries
`title`, `link`, `guid`, `pubDate`, `author`, four `category` elements, `description` and
`content:encoded`.

One measured limitation: `content:encoded` on the newest item is **711 bytes, 113 words**,
against an article body of 1,015 words. The feed carries an excerpt, not the full text.

---

## 3. Server HTML reality (the check that matters most)

Every route below was fetched with `curl` and no JavaScript ran. This is what an AI
crawler sees, since the `seo-geo` rubric states plainly that AI crawlers do not execute
JavaScript.

**The main content is fully server-rendered on all 13 routes.** `X-Nextjs-Prerender: 1`
on the response headers, `X-Vercel-Cache: HIT`, and the full prose is present in the raw
bytes.

### Extracted `<h1>` per route

Extracted two ways: `BeautifulSoup.get_text()`, and a naive regex that replaces every tag
with a space and collapses whitespace (what most HTML-to-text pipelines do).

| Route | `<h1>` extracted | Contiguous? |
|---|---|---|
| `/` | `Patrick Fergus O'Reilly` | yes |
| `/experience` | `experience` | yes |
| `/projects` | `projects` | yes |
| `/writing` | `writing` | yes |
| `/contact` | `contact` | yes |
| `/writing/a-crt-that-behaves-like-a-crt` | `Building a CRT that behaves like a CRT` | yes |
| `/writing/agents-will-tell-you-it-works` | `Agents will tell you it works. Make them prove it.` | yes |
| `/writing/multi-tenant-shopify-apps` | `Multi-tenant Shopify apps: what I'd get right first` | yes |
| `/writing/one-webhook-secret-two-tenants` | `One webhook secret, two tenants, one hole` | yes |
| `/writing/shipping-with-ai-agents` | `What I actually changed to ship with AI agents` | yes |
| `/writing/split-text-is-costing-you-search` | `Your split-text animation is eating your headline` | yes |
| `/writing/what-an-accelerator-is-for` | `What an accelerator is actually for` | yes |
| `/writing/why-presterly-wound-down` | `Why we wound Presterly down` | yes |

Exactly one `<h1>` per route, 13 of 13. Both extraction methods agree on all 13.

The homepage `<h1>` in the raw bytes is:

```html
<span class="heroname"><span class="heroname__plain">Patrick Fergus O'Reilly</span></span>
```

No per-character spans in the server HTML at all. The character splitting happens
client-side after hydration, so a crawler never sees it. **The problem the 2026-08-20
spec set out to fix is fixed in the served document.** This is at the *observed* rung: I
ran the fetch and read the bytes. I have not confirmed by reverting the fix, so I am not
calling it *fixed* in the CLAIMS.md sense.

### Word counts from raw HTML, no JS

| Route | Body words | Words inside `<main>`/`<article>` |
|---|---|---|
| `/` | 548 | 515 |
| `/experience` | 540 | 507 |
| `/projects` | 520 | 487 |
| `/writing` | 442 | 409 |
| `/contact` | 89 | 56 |
| `/writing/a-crt-that-behaves-like-a-crt` | 1,186 | 1,153 |
| `/writing/agents-will-tell-you-it-works` | 1,189 | 1,156 |
| `/writing/multi-tenant-shopify-apps` | 1,182 | 1,149 |
| `/writing/one-webhook-secret-two-tenants` | 983 | 950 |
| `/writing/shipping-with-ai-agents` | 1,197 | 1,164 |
| `/writing/split-text-is-costing-you-search` | 1,048 | 1,015 |
| `/writing/what-an-accelerator-is-for` | 1,001 | 968 |
| `/writing/why-presterly-wound-down` | 1,056 | 1,023 |

**Site total: 10,981 body words**, of which 8,578 are article prose. The spec recorded
~1,340 words across three routes on 2026-08-20.

### Terminal chrome inside the extractable text

I classified leaf text nodes by CSS class to separate prose from the CRT decoration. On
the homepage:

| Class | Words | Kind |
|---|---|---|
| `about__p` | 211 | prose |
| `skills__items` | 104 | prose |
| `term__srhint` | 22 | chrome |
| `term__out` | 21 | chrome |
| `talk__line` | 17 | prose |
| `promptline__user` | 15 | chrome |
| `hero__edu` | 15 | prose |
| `window__btns` | 12 | chrome |
| `hero__tagline` | 8 | prose |
| remainder | ~117 | mixed nav / status bar / prompt fragments |

Roughly **355 of the homepage's 548 words are prose and roughly 190 are terminal
chrome**: `skip to content`, `fergus @ portfolio : ~ $`, `cd ~ cd experience cd projects
cd writing`, `~/whoami [_] [□] [x]`, `FergusOS 5.0 'Mass' · interactive shell ready`,
`Press Tab to complete a command...`, `0x00400000 60 fps 500,500 green ◎ sound ◇ gravity
▢ eject`.

Against the `seo-content` homepage floor of 500 words, the raw count passes at 548 and the
prose-only count of ~355 does not.

### The prompt line sits above the H1 on every article

The first element inside `<article>` on all 8 posts, ahead of the `<h1>`, is:

```html
<p class="promptline"><span class="promptline__user">fergus<!-- -->@<!-- -->portfolio</span>
<span class="promptline__sep">:</span><span class="promptline__path">~/writing</span>
<span class="promptline__dollar">$</span>
<span class="promptline__cmd">cat ./writing/why-presterly-wound-down.md</span></p>
```

It is not `aria-hidden`. Extracted lede text for every article therefore starts:

`fergus @ portfolio : ~/writing $ cat ./writing/<slug>.md 14 August 2026 · 5 min read · Fergus O'Reilly On this page <first real sentence>`

The `seo-geo` rubric records that ~44% of AI citations come from the first 30% of a page.
The first 10 to 12 extracted words of every article are a shell prompt.

### Every H2 extracts with a `#` fused to it

The anchor-link glyph carries an `aria-label` rather than `aria-hidden`, so it is a real
text node inside the heading:

```html
<h2 id="the-actual-reason" class="prose__h">
  <a href="#the-actual-reason" class="prose__anchor"
     aria-label="Link to the section: The actual reason">#</a>The actual reason</h2>
```

`get_text()` returns `'#The actual reason'`. Reproduced across two files and all H2s
within them:

```
art-why-presterly-wound-down.html   '#The actual reason'  '#The lesson I own'  "#What I'd want asked"
art-shipping-with-ai-agents.html    "#The agent will tell you it works. It doesn't know."  '#Local success means less than you think'
```

**46 of 46 content H2s across the 8 articles extract with a leading `#` fused to the first
word.** This is the same class of defect as the split-text problem, one level down, and it
is on every heading of the article that explains the split-text problem.

### Render-blocking and performance-adjacent, raw HTML only

| Signal | Observed |
|---|---|
| Speculation Rules | **0** `<script type="speculationrules">` on 13 of 13 routes |
| `unload` handler in HTML | none found |
| `beforeunload` in HTML | none found |
| `Cache-Control` on `/` | `public, max-age=0, must-revalidate` (not `no-store`, so not a bfcache blocker) |
| Render-blocking stylesheets | 1 (`/_next/static/css/520df2962dffda96.css`) |
| Synchronous scripts | 1 (`/_next/static/chunks/polyfills-*.js`) |
| Inline `<style>` blocks | 0 on all 13 routes |
| Preloads | 2 woff2 fonts + 1 webpack chunk, on all 13 routes |

No bfcache blocker is visible in the raw HTML. That is a statement about the raw HTML
only, not about runtime behaviour, which I did not measure.

### Response headers on `/`

```
HTTP/1.1 200 OK
Cache-Control: public, max-age=0, must-revalidate
Server: Vercel
Strict-Transport-Security: max-age=63072000
X-Nextjs-Prerender: 1
X-Nextjs-Stale-Time: 300
X-Vercel-Cache: HIT
Age: 36314
```

HSTS present at two years but without `includeSubDomains` or `preload`. **Absent:**
`Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`,
`Referrer-Policy`. No `X-Robots-Tag`.

### Robots directives

Identical on all 13 routes:

```html
<meta name="robots" content="index, follow"/>
<meta name="googlebot" content="index, follow, max-video-preview:-1, max-image-preview:large, max-snippet:-1"/>
```

No `nosnippet` or `data-nosnippet` anywhere on the site. Per `seo-geo`, these preview
directives are the actual controls governing appearance in AI Overviews and AI Mode, and
they are set to maximum permission. That is correct for a site that wants to be cited.

---

## 4. Structured data

Every route carries **two** `<script type="application/ld+json">` blocks. **26 of 26
blocks parse as valid JSON.** No Microdata, no RDFa.

### Types found

| Route | Block 1 | Block 2 |
|---|---|---|
| `/` | `Person` + `WebSite` | `ProfilePage` |
| `/experience` | `Person` + `WebSite` | `CollectionPage` + `ItemList`(4) + `BreadcrumbList` |
| `/projects` | `Person` + `WebSite` | `CollectionPage` + `ItemList`(6) + `BreadcrumbList` |
| `/writing` | `Person` + `WebSite` | `Blog` + 8 `BlogPosting` + `BreadcrumbList` |
| `/contact` | `Person` + `WebSite` | `ContactPage` + `BreadcrumbList` |
| `/writing/*` (×8) | `Person` + `WebSite` | `BlogPosting` + `BreadcrumbList` |

Against the `seo-schema` type-status list (June 2026): every type used is in the ACTIVE
column. **No deprecated types**, no `HowTo`, no `FAQPage`, no `SpecialAnnouncement`.

### `@id` resolution within each page's graph

| Route | `@id`s defined | Dangling references |
|---|---|---|
| `/` | 3 | none |
| `/experience` | 3 | none |
| `/projects` | 3 | none |
| `/writing` | 11 | none |
| `/contact` | 3 | none |
| `/writing/*` (all 8) | 4 | `https://fergusoreilly.dev/writing#blog` |

**Every article page has exactly one unresolved `@id`.** `BlogPosting.isPartOf` points at
`/writing#blog`, which is only defined on `/writing`. Cross-page `@id` references are
legitimate linked data and Google normally resolves them by crawling, but within the
page's own graph the node does not exist. The `#person` and `#website` references do
resolve, because block 1 defines them on every route, which means the graph is merged
across the two script blocks.

### `BlogPosting` completeness

All 8 articles carry an identical property set:

```
@id, @type, author, dateModified, datePublished, description, headline,
image, inLanguage, isPartOf, keywords, mainEntityOfPage, publisher, url, wordCount
```

That covers every property Google lists as recommended for `Article`. All URLs absolute.
All dates valid ISO `YYYY-MM-DD`. No placeholder text. `image` resolves:
`/writing/why-presterly-wound-down/opengraph-image` returns 200, `image/png`, and the
PNG header decodes to **1200 × 630**.

### What would be flagged

| Finding | Severity | Evidence |
|---|---|---|
| `publisher` on all 8 `BlogPosting` is `{"@id": ".../#person"}`, a `Person` | warning | Google's `Article` guidance frames `publisher` as an `Organization`. I have **not** run Google's Rich Results Test, so I am not asserting it errors, only that it is the property most likely to warn |
| `isPartOf` dangles on 8/8 article pages | low | table above |
| `dateModified` == `datePublished` on 8/8 | low | no refresh signal; `seo-geo` rates recency heavily |
| `/projects` `ItemList` items are bare `ListItem`, not `CreativeWork` | low | the 2026-08-20 spec said `ItemList` of `CreativeWork`; shipped code uses `ListItem` |
| `/experience` uses `CollectionPage`, not `ProfilePage` + `OrganizationRole` | low | spec deviation; `OrganizationRole` would carry start/end dates the current markup drops |
| `WebSite` has no `potentialAction` | info | no sitelinks search box |
| `Person` has no `email`, no `Organization` for `worksFor` beyond name + url | info | |
| `/experience` item 4 (`Trinity Student Managed Fund`) has no `description` | info | the other 3 have one |

Nothing here would fail a Rich Results test outright on the evidence I have. The
`publisher`-as-`Person` line is the one to check against the real tool.

---

## 5. Citability per article (`seo-geo` criterion 1)

Sections are defined as an `<h2>` and everything up to the next `<h2>`. The boilerplate
`Fancy a chat?` CTA section is excluded from all counts, leaving **46 content sections
across 8 articles**.

### Raw observations

| Article | Sections | In 134-167 window | Open 40-60 words | Open ≥25 words | Definition-shaped opening | Question headings | Words |
|---|---|---|---|---|---|---|---|
| multi-tenant-shopify-apps | 7 | 3 | 1 | 2 | 0 | **0** | 1,149 |
| why-presterly-wound-down | 6 | 2 | 0 | 0 | 0 | **0** | 1,023 |
| what-an-accelerator-is-for | 5 | 1 | 0 | 0 | 0 | **0** | 968 |
| agents-will-tell-you-it-works | 6 | 2 | 1 | 2 | 2 | **0** | 1,156 |
| one-webhook-secret-two-tenants | 6 | 3 | 0 | 1 | 1 | **0** | 950 |
| a-crt-that-behaves-like-a-crt | 5 | 1 | 0 | 2 | 1 | **0** | 1,153 |
| split-text-is-costing-you-search | 5 | 1 | 0 | 2 | 1 | **0** | 1,015 |
| shipping-with-ai-agents | 6 | 0 | 1 | 3 | 3 | **0** | 1,164 |
| **Total** | **46** | **13 (28.3%)** | **3 (6.5%)** | **12 (26.1%)** | **8 (17.4%)** | **0 (0%)** | **8,578** |

Section word counts, all 46, sorted:

```
82 84 90 97 99 101 102 109 113 115 116 118 118 121 123 125 125 130 131 136
139 142 143 151 154 155 157 161 161 162 164 165 169 176 178 180 181 182 187
191 194 201 203 214 217 297
```

13 fall inside the rubric's 134-167 window. 19 are below 134. 14 are above 167.

Section-opening block lengths, in words, are dominated by very short leads. The median
opening block is 18 words. The rubric asks for a direct answer in the first 40 to 60.

### Sourced statistics, dates, attribution

| Signal | Observed |
|---|---|
| External links across all 8 articles | **0** |
| Tables across all 8 articles | **0** |
| In-body images across all 8 articles | **0** |
| Lists | 18 |
| Code blocks | 15 |
| Blockquotes | 2 (all in `shipping-with-ai-agents`) |
| Visible byline | 8 / 8 (`Fergus O'Reilly` in `.post__meta`) |
| `<time datetime="...">` | 8 / 8 |
| `meta name="author"` | 13 / 13 routes (`Patrick Fergus O'Reilly`) |
| `link rel="author"` | 13 / 13 routes |
| Table of contents `<nav>` | 8 / 8 |
| Paragraph length, average words | 24.0 to 31.0 across the 8 |
| Paragraph length, average sentences | 1.8 to 2.4 across the 8 |
| Paragraphs over 4 sentences | 15 out of 274 total paragraphs |

**Zero of the 8 articles cite an external source.** The only statistics that appear
anywhere are first-party and unsourced by construction: 34 Shopify stores, 423,000
customers, €19M of order history, one of nine from about 1,700 applicants. Those are
genuinely unique data points, which the rubric rewards, but no claim in any article
points at a study, a doc or a dataset.

Paragraph discipline is the strongest content signal on the site. 1.8 to 2.4 sentences
per paragraph sits exactly in the rubric's 2-to-4 target, and only 15 of 274 paragraphs
exceed it.

### Per-article citability score

Formula, 25 points, five 5-point signals, each one taken directly from the `seo-geo`
criterion-1 signal list:

- **A. Passage length** = 5 × (sections in the 134-167 window ÷ sections)
- **B. Answer-first opening** = 5 × (mean of: 1.0 if the opening block is 40-60 words, 0.5 if 25-39, else 0)
- **C. Sourced statistics** = 0 for external sourcing (zero everywhere) + 2 where the article carries at least one unique first-party data point
- **D. Question-framed headings** = 5 × (question headings ÷ content headings)
- **E. Date and author attribution** = 5 where visible byline, `<time datetime>`, and schema `author` + `datePublished` + `dateModified` are all present

| Article | A | B | C | D | E | **Total** |
|---|---|---|---|---|---|---|
| multi-tenant-shopify-apps | 2.1 | 1.1 | 2.0 | 0.0 | 5.0 | **10.2 / 25** |
| why-presterly-wound-down | 1.7 | 0.0 | 2.0 | 0.0 | 5.0 | **8.7 / 25** |
| what-an-accelerator-is-for | 1.0 | 0.0 | 2.0 | 0.0 | 5.0 | **8.0 / 25** |
| agents-will-tell-you-it-works | 1.7 | 1.2 | 0.0 | 0.0 | 5.0 | **7.9 / 25** |
| one-webhook-secret-two-tenants | 2.5 | 0.4 | 0.0 | 0.0 | 5.0 | **7.9 / 25** |
| a-crt-that-behaves-like-a-crt | 1.0 | 1.0 | 0.0 | 0.0 | 5.0 | **7.0 / 25** |
| split-text-is-costing-you-search | 1.0 | 1.0 | 0.0 | 0.0 | 5.0 | **7.0 / 25** |
| shipping-with-ai-agents | 0.0 | 1.7 | 0.0 | 0.0 | 5.0 | **6.7 / 25** |

**Site citability: 7.9 / 25 (32%)**, the mean of the eight.

Component E carries the score. Strip attribution out and the mean is 2.9 / 20 on the
other four signals.

### Word count against the `seo-content` floor

The blog-post coverage floor in `seo-content` is 1,500 words. All 8 articles sit between
950 and 1,164. **8 of 8 are below the floor.** The rubric itself flags this as a topical
coverage guideline and states plainly that word count is not a Google ranking factor, so
this is a coverage observation rather than a defect.

---

## 6. Metadata

| Route | Title chars | Desc chars | Canonical correct | OG image |
|---|---|---|---|---|
| `/` | 35 | **168** | yes | `/opengraph-image?30b001ca262e23fe` |
| `/experience` | 28 | 132 | yes | `/opengraph-image` |
| `/projects` | 26 | 158 | yes | `/opengraph-image` |
| `/writing` | 25 | 130 | yes | `/opengraph-image` |
| `/contact` | 25 | 125 | yes | `/opengraph-image` |
| `.../a-crt-that-behaves-like-a-crt` | 56 | 145 | yes | own |
| `.../agents-will-tell-you-it-works` | **68** | 156 | yes | own |
| `.../multi-tenant-shopify-apps` | **69** | 130 | yes | own |
| `.../one-webhook-secret-two-tenants` | 59 | 156 | yes | own |
| `.../shipping-with-ai-agents` | **64** | 144 | yes | own |
| `.../split-text-is-costing-you-search` | **67** | 157 | yes | own |
| `.../what-an-accelerator-is-for` | 53 | 152 | yes | own |
| `.../why-presterly-wound-down` | 45 | 158 | yes | own |

- **Duplicate titles: 0.** Duplicate descriptions: **0.** Checked with a `Counter` over
  all 13.
- **Canonicals: 13 of 13 present and matching the served URL exactly.** No mismatches.
- **Titles over 60 characters: 5**, all articles. The ` · Fergus O'Reilly` suffix costs 19
  characters, so a 50-character headline lands at 69.
- **Descriptions outside 70-160: 1.** The homepage is 168.
- **OG image reuse: 4 routes share the generic `/opengraph-image`** (`/experience`,
  `/projects`, `/writing`, `/contact`). The homepage and all 8 articles have their own.
- OG images render: `/opengraph-image` 200, `image/png`, 39,162 bytes, **1200 × 630**.
  Declared `og:image:width` 1200 and `og:image:height` 630 match the actual PNG header.
- `og:type` is `website` on `/`, `/projects`, `/writing`, `/contact`; `profile` on
  `/experience`; `article` on all 8 posts.
- `twitter:card` is `summary_large_image` on 13 of 13.
- `lang="en"` and the viewport meta on 13 of 13.
- Title separator is `·` (U+00B7), not an em dash. Checked by codepoint. `LANGUAGE.md`
  compliant.
- `/favicon.ico` returns **404** with a 24 kB HTML body. `/icon.svg` is declared in the
  head and does serve, so this is cosmetic.

---

## 7. Entity signals

### What `sameAs` publishes

The `Person` node, identical on all 13 routes, publishes three:

```json
"sameAs": [
  "https://github.com/oreillyfergus",
  "https://github.com/fergo5002",
  "https://www.linkedin.com/in/patrickfergusoreilly/"
]
```

### Do they resolve, and do they point back

| Target | Status | Points back to fergusoreilly.dev? |
|---|---|---|
| `github.com/oreillyfergus` | 200 | **no** |
| `github.com/fergo5002` | 200 | **no** |
| `linkedin.com/in/patrickfergusoreilly/` | **999** | **could not measure** |
| `tighsauna.com` (in `worksFor`) | 200, redirects to `www.tighsauna.com` | not checked |
| `www.tcd.ie` (in `alumniOf`) | 200 | n/a |

GitHub API, `https://api.github.com/users/<login>`:

| Field | `oreillyfergus` | `fergo5002` |
|---|---|---|
| `name` | `null` | `null` |
| `blog` (the website field) | `""` | `""` |
| `bio` | `null` | `null` |
| `company` | `null` | `null` |
| `public_repos` | **0** | 7 |
| `followers` | 0 | 2 |
| `created_at` | 2026-06-11 | 2025-03-11 |

**Neither GitHub account links back, names the person, or carries a bio.** Both have an
empty `blog` field, which is the exact field a reciprocal link would live in. There is no
`rel="me"` anywhere on the site either: 0 across all 13 routes.

So `sameAs` is one-directional on every link I could verify. The rubric's entity-linking
signal wants a closed loop and there is no loop.

The LinkedIn 999 is LinkedIn's standard anti-automation response, not a broken profile.
Both `curl` and `WebFetch` got it. That is evidence about the measurement path, not about
the profile, so I am recording it as unmeasured rather than as a failure.

### Two GitHub accounts: corroborate or split?

**They split it.** Three reasons, each from a measurement above:

1. `oreillyfergus` has **0 public repos and 0 followers**. An engine that follows the
   `sameAs` to corroborate "software engineer" finds a blank page. It contributes nothing
   and it dilutes the two-link set into a one-real-link set.
2. Neither account carries the person's `name`, so there is no string for an engine to
   match against `Fergus O'Reilly` or `Patrick Fergus O'Reilly`. The link is asserted from
   the site and confirmed by nothing at the other end.
3. `llms.txt` labels them inversely to their content:

   ```
   - github (work): github.com/oreillyfergus
   - github (personal): github.com/fergo5002
   ```

   The account labelled "work" is the empty one. The account with 7 public repos is
   labelled "personal". An answer engine that trusts the labels will look in the wrong
   place.

Two `sameAs` entries pointing at the same platform with different handles, neither
naming the person, is the shape of an ambiguous entity rather than a corroborated one.

### The name is already taken

Two of the four `WebSearch` queries surfaced a different, much better established
**Fergus O'Reilly** in the same industry: a product advisor and angel investor, ex-Stripe,
ex-SAP, CTO of Highdeal before its acquisition, with a **Crunchbase person profile** and a
30-year software career.

That is a direct entity collision on the exact string the site is trying to own, in the
same vertical, held by someone with more corroborating sources. It makes
`alternateName: "Patrick Fergus O'Reilly"` more valuable than it looks, and it makes the
absence of Wikidata, a reciprocal GitHub link and a resolvable LinkedIn more costly than
it would be for a name nobody else uses.

### Other entity observations

- No Wikipedia or Wikidata presence observed for either name.
- No YouTube presence observed.
- No Reddit mentions observed. The `seo-geo` rubric puts Reddit at 46.7% of Perplexity
  citations and 11.3% of ChatGPT's, so this is a named gap against the rubric.
- The published contact email is `oreillferg@gmail.com`, a personal Gmail, on both
  `/contact` and in `llms.txt`. A `@fergusoreilly.dev` address would tie the person to the
  domain; a Gmail does not.
- `worksFor` names Tigh Sauna with a URL. `tighsauna.com` 200s. Whether that site links
  back to fergusoreilly.dev was not checked.

---

## 8. Indexation reality

**I could not measure index status. Every indexation instrument I tried failed its
control.** Recording that plainly rather than reporting a number I do not trust.

### Failed instruments, with the control that killed them

| Instrument | Control (`site:vercel.com`, certainly indexed) | Test (`site:fergusoreilly.dev`) | Verdict |
|---|---|---|---|
| `curl` → Bing HTML | 122,302 bytes, 0 result anchors parsed, "no results" phrase present | 121,451 bytes, 0 result anchors parsed, "no results" phrase present | **identical readings. Instrument dead** |
| `curl` → DuckDuckGo HTML | 14,150 bytes, captcha markers present | 14,164 bytes, captcha markers present | **blocked on both. Instrument dead** |
| `WebFetch` → Bing | returned Wordle and nytimes.com URLs for a `site:vercel.com` query | returned ChatGPT-DAN and zhihu.com URLs | **nonsense on the control. Instrument dead** |

The Bing HTML page did report "About 1,860 results" for the test query while
simultaneously containing the no-results phrase, and my parser extracted zero titles from
the control too. That contradiction is a property of the fetch path, not of the domain.
Per CLAIMS.md rule 1, that is evidence about the measurement path until the path is shown
healthy, and it was not.

### What I did observe

Four `WebSearch` queries, run 2026-08-21. `WebSearch` is documented as US-only, which
matters for an Irish personal site.

| Query | Did `fergusoreilly.dev` appear? | What came back instead |
|---|---|---|
| `Fergus O'Reilly technical founder Dublin Tigh Sauna` | **no** | Tigh'N Alluis (an unrelated Dublin sauna), Wikipedia pages for other Ferguses |
| `"fergusoreilly.dev"` (exact string) | **no** | Instagram, Wikipedia disambiguations, **Fergus O'Reilly's Crunchbase profile (the ex-Stripe/SAP one)** |
| `"Patrick Fergus O'Reilly" Trinity College Dublin founder Presterly` | **no** | Trinity history pages, other O'Reillys. The tool reported no match for the name or for "Presterly" |
| `"Your split-text animation is eating your headline"` (exact article title) | **no** | GSAP docs, Motion.dev, web.dev, Elementor issues |

**Zero appearances in four queries, including an exact-match query on the domain string
and an exact-match query on an article title.** An exact title-phrase query is the easiest
possible query to win, and it did not surface.

This is one non-deterministic sample from one tool. It is evidence of current invisibility,
not proof of non-indexation.

### Context that matters for reading that

The design spec is dated 2026-08-20 and records `/robots.txt`, `/sitemap.xml` and
`/llms.txt` all returning **404** on that date. Today is 2026-08-21. The `Age` header on
`/` was 36,314 s (~10.1 h) and on `/sitemap.xml` 24,806 s (~6.9 h), so the current build
has been at the CDN for at least ~7 hours.

**The crawl surface is at most about a day old.** A domain not appearing in search a day
after its first sitemap is the expected result, not a fault. This section records a
starting value. It is not a finding against the work.

### AI answer engines

I did not query ChatGPT, Perplexity, Claude web search, Google AI Mode or AI Overviews
directly. No credentialed path to any of them was available in this session, and the
`seo-geo` skill's suggested route (`ai_optimization_chat_gpt_scraper` via DataForSEO) is
not installed. The four `WebSearch` results above are the closest proxy I have and they
are not the same thing.

---

## 9. Gaps, ranked

Ranked by how much each one costs against the rubrics, with the measurement behind it.

### 1. Zero external citations across 8 articles and 8,578 words

**Evidence:** 0 external `<a href>` inside `<article>` on all 8 posts. 0 tables. The only
statistics on the site are first-party and unsourced by construction (34 stores, 423,000
customers, €19M, nine of ~1,700).

**Cost:** hits two rubrics at once. `seo-geo` criterion 1 lists "claims attributed with
specific sources" as a strong citability signal and "opinion without evidence" as a weak
one, and every article is currently the second. `seo-content` authoritativeness scores
5/25 almost entirely because of this. It is the single largest numeric drag in the audit.

### 2. Zero question-framed headings on 46 of 46 content sections

**Evidence:** the only `?` heading anywhere on the site is the boilerplate `Fancy a chat?`
CTA, repeated on all 8 articles. Content H2s are statements: `# The actual reason`,
`# What it genuinely gave us`, `# Scope by shop at the lowest level you can`.

**Cost:** `seo-geo` criterion 2 names "question-based headings (matches query patterns)"
as a strong signal and it is the top quick win in the skill's own list. Component D of the
citability score is 0.0 on every article, which is 5 of 25 points forfeited site-wide.

### 3. Entity graph is one-directional and the name is contested

**Evidence:** both GitHub accounts have an empty `blog` field and a `null` name;
`oreillyfergus` has 0 public repos; no `rel="me"` on any of 13 routes; `llms.txt` labels
the empty account "work" and the 7-repo account "personal"; a different Fergus O'Reilly
with a Crunchbase profile and an ex-Stripe/SAP career surfaced in the search sample.

**Cost:** `seo-geo` puts entity linking (`sameAs` across platforms) in its High Impact
tier, and lists Wikipedia and Reddit presence as top correlates of AI citation. Right now
nothing outside the domain corroborates the entity, and someone else owns the name.

### 4. Every H2 extracts as `#Heading`

**Evidence:** `get_text()` on `<h2><a aria-label="...">#</a>The actual reason</h2>` returns
`'#The actual reason'`. Reproduced on 46 of 46 content H2s across 8 files.

**Cost:** heading text is what a passage extractor keys on. A leading `#` fused to the
first word degrades every one of them. The fix is one attribute (`aria-hidden="true"` on
the anchor, with the label moved or dropped), and the site already fixed the identical
class of bug on the H1.

### 5. Terminal chrome occupies the highest-value extracted text

**Evidence:** `<p class="promptline">` is the first element inside `<article>`, ahead of
the `<h1>`, on all 8 posts, and it is not `aria-hidden`. Extracted lede opens
`fergus @ portfolio : ~/writing $ cat ./writing/<slug>.md`. On the homepage roughly 190 of
548 body words are chrome, leaving ~355 of prose against a 500-word floor.

**Cost:** `seo-geo` records that ~44% of AI citations come from the first 30% of a page.
The first 10-12 extracted words of every article are a shell prompt.

### 6. Zero multi-modal content in article bodies

**Evidence:** 0 `<img>`, 0 video, 0 charts, 0 tables inside all 8 `<article>` elements.
The 15 code blocks and 18 lists are the only non-prose elements.

**Cost:** `seo-geo` criterion 3 is worth 15 points and cites a 156% higher selection rate
for multi-modal content. Score here is 4/15, and the 4 is entirely for OG images being
present and schema-referenced.

### 7. Answer-first openings are too short

**Evidence:** 3 of 46 sections (6.5%) open with a 40-60 word block. 12 of 46 (26.1%) open
with 25 or more words. Median opening is 18 words. Passage lengths: 13 of 46 inside the
134-167 window, 19 below it, 14 above.

**Cost:** component B averages 0.8 of 5 across the eight articles. This is the cheapest
gap on the list to close, because it is a rewrite of one paragraph per section rather than
new research.

### 8. No `dateModified` movement, no refresh programme

**Evidence:** `dateModified` equals `datePublished` on 8 of 8. All articles published
between 2026-08-04 and 2026-08-20.

**Cost:** none today. Recency is currently the site's best authority signal (1 to 17 days
old, the rubric's top bucket at ~3x citation likelihood). It becomes the top gap around
2026-11, since the rubric says pages stale 6+ months lose citation eligibility. Worth
recording now because a baseline is where you note the clock starting.

### 9. Security headers absent

**Evidence:** no CSP, `X-Frame-Options`, `X-Content-Type-Options` or `Referrer-Policy` on
`/`. HSTS present at `max-age=63072000` without `includeSubDomains` or `preload`.

**Cost:** low, and `seo-technical` says so explicitly: only Core Web Vitals feeds ranking
directly, HTTPS is confirmed but lightweight, and the Page Experience report was removed
from Search Console. Costs 40 points on one of nine technical categories and roughly 6
points overall.

### 10. No Speculation Rules, no IndexNow, no RSL 1.0

**Evidence:** 0 `<script type="speculationrules">` on 13 of 13 routes. No IndexNow key
file. No RSL licensing terms.

**Cost:** small and easily fixed. IndexNow buys faster Bing/Yandex pickup, which matters
more than usual for a domain with no history. Speculation Rules is a navigation-speed win
on a five-route site, not a citation lever.

### 11. Small metadata items

**Evidence:** homepage description 168 chars (over 160); 5 article titles 64-69 chars
(over 60); 4 routes share one generic OG image; `/favicon.ico` 404s; sitemap `lastmod`
missing on 4 of 13 entries; `/contact` main content is 56 words and sits in the sitemap at
priority 0.6; `content:encoded` in the RSS carries 113 words against a 1,015-word article.

**Cost:** each one is worth a point or two. Listing them so they are in the record, not
because any of them matters much on its own.

---

## What went right, so the "after" is judged fairly

Recording these because a baseline that only lists faults will make any later comparison
look better than it is.

- **13 of 13 sitemap URLs return 200.** No broken routes, no redirect chains, no soft-404s.
- **The H1 fix works in the served document.** All 13 H1s extract as contiguous text under
  two different extraction methods. No per-character spans exist in the server HTML at all.
- **Full server rendering on every route.** 8,578 words of article prose are in the raw
  bytes with no JavaScript. This is the criterion `seo-geo` calls critical, and it is met.
- **19 AI crawlers explicitly allowed**, nothing blocked, `Sitemap` and `Host` declared.
- **`max-snippet:-1` and `max-image-preview:large` on all 13 routes.** Per `seo-geo` these
  are the actual controls governing AI Overviews and AI Mode appearance, and they are set
  to maximum permission.
- **26 of 26 JSON-LD blocks parse.** No deprecated schema types. Full recommended property
  set on all 8 `BlogPosting` nodes.
- **13 correct self-referencing canonicals, 0 duplicate titles, 0 duplicate descriptions.**
- **Paragraph discipline is genuinely good:** 1.8 to 2.4 sentences per paragraph, inside
  the rubric's 2-to-4 target, with 15 of 274 paragraphs exceeding it.
- **Byline, `<time datetime>`, `datePublished` and `dateModified` on 8 of 8 articles**,
  plus a table-of-contents `<nav>` on each.
- **OG images render correctly at 1200 × 630** with matching declared dimensions.
- **Word volume is up from ~1,340 across three routes on 2026-08-20 to 10,981 across
  thirteen.**

---

## What this baseline cannot see

Stated as limits on the claim, not as hedging. Anything in this list is a place where a
later comparison should not assume this document settled the question.

1. **No rendered-DOM check.** Everything here is raw HTML from `curl`. I never executed
   the site's JavaScript, never took a screenshot, never read the accessibility tree. So I
   cannot tell you what the hydrated page looks like, whether the character-split
   animation reintroduces the H1 problem in the DOM, whether anything shifts on load, or
   whether the interactive terminal works. That was the correct scope for an AI-crawler
   audit and it is the wrong scope for anything else.

2. **No Search Console data.** No impressions, no clicks, no average position, no
   coverage report, no URL Inspection result. I do not know whether a single page has been
   crawled, discovered, or indexed. There is no first-party index evidence in this
   document at all.

3. **No crawl-log data.** I cannot tell you whether GPTBot, ClaudeBot, PerplexityBot or
   Googlebot has ever hit the domain. `robots.txt` invites them; whether any accepted is
   unknown.

4. **Index status is genuinely unmeasured, not measured-as-zero.** Three separate
   `site:` instruments each failed their control, documented in §8. Do not read §8 as
   "the site is not indexed". Read it as "four `WebSearch` queries returned nothing, and I
   could not check the index".

5. **The search sample is one non-deterministic draw from one US-only tool.** Four queries,
   one session, one day. Re-running them tomorrow could return something different for
   reasons that have nothing to do with the site. `WebSearch` is documented as US-only,
   and this is an Irish personal site.

6. **No answer-engine results.** I did not query ChatGPT, Perplexity, Claude web search,
   Google AI Overviews or AI Mode. The `seo-geo` skill notes that AI Mode and AI Overviews
   agree on the answer ~86% of the time but cite the same URLs only 13.7% of the time, so
   they need scoring separately, and neither was scored here.

7. **No Core Web Vitals, lab or field.** Lighthouse was excluded by instruction and no
   CrUX pull was made. CrUX would very likely have no data for a domain this new anyway.
   The performance section is limited to what is visible in the raw HTML: no Speculation
   Rules, one blocking stylesheet, one sync script, no `unload`/`beforeunload`, no
   `no-store`. That is not a performance measurement.

8. **The mobile category is unscored.** Viewport meta is present on 13 of 13 and SSG
   guarantees content parity, but touch-target size, base font size and horizontal
   overflow all need a render.

9. **Rich Results Test not run.** The schema findings in §4 come from parsing the JSON-LD
   and checking it against the `seo-schema` rubric. I have not put a single URL through
   Google's validator. The `publisher`-as-`Person` line in particular is my reading of
   Google's Article guidance, not a validator output, and it should be checked before
   anyone acts on it.

10. **LinkedIn reciprocity is unmeasured.** Both `curl` and `WebFetch` got HTTP 999, which
    is LinkedIn's anti-automation response. I do not know whether that profile exists,
    whether it names Fergus O'Reilly, or whether it links back to the domain. Two of the
    three `sameAs` links were verified as non-reciprocal; the third is simply unknown.

11. **Backlinks were not measured.** No Moz, no Common Crawl graph, no Bing Webmaster. The
    authoritativeness score of 5/25 rests on the absence of *on-page* external citations
    and the absence of corroborating profiles, not on a link-graph pull.

12. **Whether `tighsauna.com` links back** to `fergusoreilly.dev` was not checked, and it
    is the one reciprocal link most likely to already exist.

13. **The citability formula in §5 is mine.** The five signals come straight from the
    `seo-geo` criterion-1 list, but the skill gives no arithmetic, so the weighting is a
    construction. The raw counts in the table above it are the durable measurement. The
    scores are only comparable against a re-run of the same formula.

14. **The chrome-versus-prose split in §3 is a classification, not a fact.** I bucketed
    leaf text nodes by CSS class name. `skills__items` at 104 words could reasonably be
    called either. Treat ~355 prose words on the homepage as approximate.

15. **Section boundaries are `<h2>`-delimited.** Content sitting before the first `<h2>`
    (the lede, 71 to 142 words per article) is excluded from all 46-section statistics. It
    is reported separately and it is not scored.

16. **One measurement window.** Everything was captured between roughly 09:20 and 09:40 UTC
    on 2026-08-21 against a CDN cache that was already 7 to 10 hours old. If a deploy lands
    after that, every byte-count in this document is stale.

---

## Reproducing this

Artefacts were written to a scratch directory outside the repo and are not committed. To
regenerate from scratch: fetch all 13 routes plus the four support files with `curl` and
no JS, then parse for title, description, canonical, OG tags, `<h1>` under both
`get_text()` and tag-to-space extraction, body word count with `script`/`style`/`svg`
stripped, every `application/ld+json` block parsed with `@id` defined-versus-referenced
sets, and `<h2>`-delimited sections with per-section word counts and opening-block
lengths. Then run the four `WebSearch` queries in §8, and take a control reading on a
known-indexed domain before believing any `site:` result.
