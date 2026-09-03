import type { HeadingReport, Verdict } from "@/lib/headline";

/**
 * The contract between the server action and the form, plus the tool's copy.
 *
 * Separate from `actions.ts` because a `"use server"` module may only export
 * async functions: putting the initial state or a copy object in there is a
 * build error, and putting the types in there drags the module that fetches
 * arbitrary URLs into the client bundle's import graph.
 *
 * The form's copy lives here rather than in `content/`, which is where
 * AGENTS.md says copy belongs, because the original change was scoped to
 * `lib/`, `app/tools/` and the stylesheet. The page-level copy (name, blurb,
 * privacy, the "can't see" lines) moved to `content/tools/headline-check.ts`
 * with the toolshed programme; what is left is the form's own strings, and
 * moving them to `content/` is still a move rather than a rewrite.
 */

export const URL_FIELD = "url";

/** Longer than any real URL. Refused before anything is fetched. */
export const MAX_URL_LENGTH = 2048;

export type ToolState =
  | { status: "idle"; seq: number }
  /** The visitor can fix this one themselves, so it renders under the field. */
  | { status: "invalid"; seq: number; url: string; message: string }
  | { status: "limited"; seq: number; url: string; message: string }
  /** We could not get the page. The reason is always said out loud. */
  | { status: "failed"; seq: number; url: string; message: string }
  | {
      status: "done";
      seq: number;
      url: string;
      finalUrl: string;
      redirects: number;
      report: HeadingReport;
    };

/**
 * `seq` counts answers, exactly as `lib/contact.ts` does and for the same
 * reason: React resets a form once its action resolves, and re-keying the input
 * on this counter is what brings the URL back with it.
 */
export const INITIAL_TOOL_STATE: ToolState = { status: "idle", seq: 0 };

export const ARTICLE_PATH = "/writing/split-text-is-costing-you-search";

export const headlineCopy = {
  label: "Page URL",
  placeholder: "example.com/page",
  submit: "Check the heading",
  checking: "Fetching",

  emptyUrl: "Type a URL first. Something like example.com/page.",
  tooLong: "That is longer than any URL I am willing to fetch.",
  limited:
    "That is a few too many checks in a row from this address. Give it a minute and try again.",

  browserLabel: "What a person sees",
  crawlerLabel: "What a tag stripper gets",

  fixTitle: "The fix, from the article",
  fixLead:
    "Render the text twice. Once fragmented for the animation, once whole for everything that reads text.",
  fixNote:
    "Use the clip-rect pattern for the hidden copy, not display:none or visibility:hidden. Both of those remove it from the accessibility tree and are fairly read as content you have chosen not to show.",
  fixCopy: "Copy the snippet",
  fixCopied: "Copied",
  fixCopyFailed: "The clipboard refused. Select the snippet and copy it by hand.",
  readMore: "Read the whole piece",

  limits:
    "This reads the HTML the server sends and the style attributes in it. It cannot see your stylesheet, so a class that sets display:inline-block is invisible to it. One element per character is the signal that survives that, and it is the one this leans on.",
} as const;

export const VERDICTS: Record<Verdict, { title: string; body: string }> = {
  clean: {
    title: "Clean",
    body: "The heading comes through as one contiguous string. Whatever it is doing visually, it is not costing you the words.",
  },
  fragmented: {
    title: "Fragmented",
    body: "The heading is built out of pieces. A browser reassembles it and something that strips tags out of the HTML does not, so the strongest string on the page arrives as loose letters.",
  },
  "no-h1-in-html": {
    title: "No h1 in the served HTML",
    body: "Nothing that reads the HTML without running your JavaScript can find a top-level heading on this page. Whatever renders it later, a lot of the machinery that reads the web now never gets there.",
  },
};

/** Trimmed for display so a very long heading cannot blow out the snippet. */
function forSnippet(text: string): string {
  const clean = text.trim() || "Your headline";
  return clean.length > 120 ? `${clean.slice(0, 117)}...` : clean;
}

/**
 * The fix from the article, with the visitor's own heading in it.
 *
 * Printed rather than described, because "render a hidden copy" is the sort of
 * instruction everybody agrees with and nobody acts on.
 */
export function fixSnippet(headline: string): string {
  const text = forSnippet(headline);
  const [first = "A", second = "B"] = [...text];
  return [
    "<h1>",
    `  <span class="visually-hidden">${text}</span>`,
    '  <span aria-hidden="true">',
    `    <span class="ch">${first}</span><span class="ch">${second}</span>...`,
    "  </span>",
    "</h1>",
  ].join("\n");
}
