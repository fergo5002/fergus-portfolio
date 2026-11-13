# Text, crawlers, search and analytics

Read this before adding any text effect or decorative string, before touching `lib/seo.ts`, `robots.ts`, the sitemap, `llms.txt`, the feed, `middleware.ts`, `next.config.ts`, `lib/analytics.ts` or `lib/crawlers.ts`, and before verifying analytics on a deploy.

## The site is a search and answer-engine surface

**The site is also a search and answer-engine surface**, which is a second set of constraints on
top of the CRT premise and does not bend to it. Every route carries a canonical URL and JSON-LD;
`/robots.txt`, `/sitemap.xml`, `/llms.txt` and `/feed.xml` are generated from `content/`, never
hand-maintained. `lib/seo.ts` is the only place a URL or a schema.org object is built. Read
`docs/superpowers/specs/2026-08-20-seo-geo-growth-design.md` before touching any of it.

## Text effects must leave the words in the server HTML

**The rule that keeps biting:** a visual effect that fragments text also fragments it for
crawlers. The hero name is animated one character per element, and for a while that meant the
most important string on the domain extracted as `P a t r i c k F e r g u s O ' R e i l l y`.
`HeroName` now renders **only** the plain contiguous name on the server, and swaps in the
per-character layer after mount. Rendering both at once was the first attempt and it left the
h1 saying the name twice with nothing between them (`O'ReillyPatrick`), so the swap is the
fix, not an optimisation. `aria-label` does not solve this: it is an accessibility property
rather than content, and a text extractor has no reason to read it.

Any new per-character, scrambled, typewriter or canvas-rendered text effect must leave a whole
copy of its words in the server HTML, or it is quietly costing the site the words it decorates.

## Decorative text belongs in CSS

**And the converse, which cost more than the first one did: decorative text belongs in CSS.**
The same rule read the other way. If a string is on the page to set a mood rather than to be
read, it must not be in the document competing with the prose. Measured against the live site
on 2026-08-21, a plain HTML-to-text extraction of any article opened like this:

```
fergus @ portfolio : /writing/why-presterly-wound-down $ cd ~ cd experience cd projects
cd writing fergus @ portfolio : ~/writing $ cat ./writing/why-presterly-wound-down.md
Why we wound Presterly down
```

Roughly 150 characters of terminal costume in front of the first real word, in the part of the
page a retrieval step reads first. On the landing page about 190 of 548 extractable words were
chrome. Separately, all 46 article headings extracted as `#The actual reason`, because the
anchor-link glyph was a real `#` text node.

`aria-hidden` does **not** fix this, for exactly the reason `aria-label` did not fix the hero
name: it is an accessibility property and a text extractor has no reason to read it. The only
thing that removes text from extraction is not putting the text in the document. `PromptLine`
now passes its parts as CSS custom properties and `app/globals.css` draws them with `content`;
the spans stay so the per-part colours stay with them. The heading anchor is drawn the same way.
`components/chrome.test.ts` is the guard.

**It has come back twice since, both times as a `$`,** which is why the guard now covers three
files rather than one. `Terminal.tsx` wrote the separator and the dollar as text while the
stylesheet was already drawing them, so the live home page read `fergus@portfolio::~ $$` until
2026-09-03. Then the status bar's prompt button shipped a `<span aria-hidden="true">$</span>`,
which put a `$` in front of every page's words on every route. A one-character string still feels
too small to be content, and that instinct is the bug. The test for it: if the string is there to
set a mood, it goes in `content`, whatever its length, and whether or not it is server-rendered
decides only how much it costs. Client-only costume is fine as text, which is why `.shell__title`
("fsh") stays: the drawer renders nothing until somebody opens it.

## The nav is the deliberate exception

The nav is the deliberate exception. Its links read `cd experience` rather than `Experience`,
which is weak anchor text, but they are real navigation and a crawler needs to follow them.
That is a design call, not a bug, and it is Fergus's to change if he ever wants to.

## Never disallow `/_next/` in `robots.txt`

**And never disallow `/_next/` in `robots.txt`.** The inline pre-paint script adds `booting` to
`<html>` on the landing page, `.booting` hides the content, and `BootSequence` is what clears it
properly. Block the chunk it ships in and a rendering crawler sees an empty homepage while every
status code stays 200. There is a 4s failsafe in the inline script, and it bounds that exposure
rather than removing it. It is not a licence to block scripts.

## Analytics (from "Stack & conventions")

- **Analytics:** `@vercel/analytics` renders `<Analytics />` at the end of `<body>` in
  `app/layout.tsx`. It returns null and appends its script to `<head>`, so the placement is
  about staying mounted, not about the DOM. Development loads Vercel's debug script and
  reports nothing, so local work never lands in the numbers.
  **Never verify a deploy by curling `/_vercel/insights/script.js`.** That is only the
  package's fallback string; a real deployment serves the loader and the view beacon from a
  per-deploy hashed path, so the pretty path 404s while analytics works fine. Check the
  beacon POST returns 200 in a browser instead, and give the landing page 15 to 20 seconds,
  because the boot sequence delays hydration.
  Adding a new dependency here may need a one-off `npm install --legacy-peer-deps`:
  `@vercel/analytics` declares an optional `@sveltejs/kit` peer whose own chain wants vite@8,
  against vitest's vite@5, so a fresh resolve dies with ERESOLVE on a framework this project
  will never use. The committed lockfile installs clean under strict peers (`npm ci` and
  `npm install` both), so do **not** paper over it with a repo-wide `.npmrc`: that would
  silently disable peer checks for `next`/`react` too.
- **PostHog (added 2026-08-21) is the GEO instrument, and it is cookieless.**
  `lib/analytics.ts` holds every constant and every decision, as values, so they can be
  asserted. Four things about it are easy to break by accident:
  - **`cookieless_mode: "always"`.** No cookies, no local storage, no banner. Fergus chose it
    on 2026-08-21. Get it wrong and the site starts setting tracking cookies on EU visitors
    with nothing in front of them, everything keeps working, and no test would notice, which
    is why there is one that does.
  - **And the SDK option is only half of it.** The PostHog *project* needs
    `cookieless_server_hash_mode` on. It is off by default, it is not in PostHog's settings UI,
    and with it off the browser's events get `200 {"status":"Ok"}` and are silently dropped
    while server-side events keep arriving normally. If pageviews go quiet but crawler events
    keep flowing, that is the first thing to check. `docs/measurement.md` has the API call.
  - **Session replay is therefore off, and that is an entailment rather than a preference.**
    Replay needs somewhere to keep a session id and cookieless removes it, so PostHog would
    disable it anyway. It is set explicitly so it reads as a consequence, not a bug to fix.
  - **Events go through `/ingest`,** rewritten to PostHog in `next.config.ts`. That is what
    `skipTrailingSlashRedirect: true` is for, and **that switch is why `middleware.ts`
    exists**: it turns off Next's trailing-slash normalisation for the whole site, so the
    middleware puts it back for everything except the proxy. Remove one and you must remove
    the other, or `/writing/` starts serving a duplicate of `/writing`.
  - **`middleware.ts` is the only thing that sees an AI crawler.** The pages an engine cites
    are static, so a crawler fetching one runs no server code at all. `lib/crawlers.ts` splits
    them into training, search-index and user-fetch, and `user-fetch` (`ChatGPT-User`,
    `Claude-User`, `Perplexity-User`) is the number worth watching: it means a person asked a
    question seconds ago and the model came here to answer it. Note that `Google-Extended` and
    `Applebot-Extended` are robots.txt tokens that never appear as user agents, so they are in
    `robots.ts` and deliberately not in the detection table.

  `next.config.mjs` became `next.config.ts` in the same change, so the proxy rules could be
  imported rather than retyped. Nothing else about the config moved.
