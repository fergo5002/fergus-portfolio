import type { ToolEntry } from "./types";

/**
 * The first tool, migrated from the array that used to live in
 * `app/tools/page.tsx`. The blurb is the sentence that was on the index; it is
 * now also the lede on the page, because the design says a tool's index row
 * and its page must say the same thing.
 *
 * Every "can't see" line below is checked against `lib/headline.ts` and
 * `lib/headline-fetch.ts`, not against what the tool would like to be true.
 */
export const headlineCheck: ToolEntry = {
  slug: "headline-check",
  name: "Headline check",
  blurb:
    "Paste a URL and see how its h1 reads to something that never runs the JavaScript. Catches split-text animations that shred a headline into loose letters.",
  purpose: "See whether a crawler reads your h1 as whole words or as loose letters.",
  method: [
    "Both readings are models, not claims about any named crawler. The first joins the heading's text the way a browser lays it out. The second also breaks at every element a plain HTML-to-text pass would separate: an inline element given a block display in its own style attribute, and a letter in an element of its own when three or more build the heading.",
    "Pasted HTML is read as source text. Nothing in it is run and no page is rendered, so a heading that a script adds later is not there to read.",
  ],
  privacy: "server",
  privacyLine: "URL checks fetch the public page on the server. The HTML playground runs entirely in this browser; pasted source is never uploaded.",
  cantSee: [
    "Your stylesheet. It reads the served HTML and the style attributes in it, so a class that sets display:inline-block is invisible to it. One element per character is the signal that survives that.",
    "Anything JavaScript renders after load. If the heading arrives from a script, the served HTML has no h1 and that is what it reports.",
    "Pages behind a login. It fetches as a stranger with no cookies, so whatever a visitor has to sign in for is out of reach.",
  ],
  status: "live",
  order: 10,
};

/**
 * Why the check is worth running, for the disclosure at the foot of the page.
 * The link sits between `before` and `after`, so the page can make it a real
 * anchor without any words living in a component.
 */
export const headlineWhy = {
  title: "Why this is worth ten seconds",
  body:
    "Split a headline into one element per letter and a browser still paints the word. Plenty of the machinery that reads the web does not run a browser: link unfurlers, feed readers, archivers, and the fetchers behind AI answer engines. A good number of those strip the tags, normalise the whitespace, and hand the result to something else. That turns your best string into confetti, and nobody sends you a report about it.",
  before:
    "I found this on my own site, which is the only reason I trust it enough to write a tool about it. The homepage name animated one character at a time and extracted as loose letters. It came out of building",
  link: "a CRT that behaves like a CRT",
  after: ", which is where the same warning sits at the end.",
} as const;
