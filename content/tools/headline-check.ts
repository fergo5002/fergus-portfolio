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
    "Paste a URL and see how its h1 comes out for something that reads HTML without running it. Catches split-text animations that turn a headline into loose letters.",
  privacy: "server",
  cantSee: [
    "Your stylesheet. It reads the served HTML and the style attributes in it, so a class that sets display:inline-block is invisible to it. One element per character is the signal that survives that.",
    "Anything JavaScript renders after load. If the heading arrives from a script, the served HTML has no h1 and that is what it reports.",
    "Pages behind a login. It fetches as a stranger with no cookies, so whatever a visitor has to sign in for is out of reach.",
  ],
  status: "live",
  order: 10,
};
