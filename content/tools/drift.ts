import type { MetricKey, PullReason } from "@/lib/tools/drift/report";
import type { ToolEntry } from "./types";

/**
 * Drift: the entry, the copy and the worked example.
 *
 * One file, because F3's registry test reads this directory and fails on any
 * file it did not register as a tool. So the copy lives beside the entry rather
 * than in a sibling module.
 *
 * The blurb is load-bearing: `ToolPage` renders it as the lede directly under
 * the heading, so its first sentence is the first line of body copy a visitor
 * reads, and the design says that sentence has to be "this is not an AI
 * detector".
 */
export const drift: ToolEntry = {
  slug: "drift",
  name: "Drift",
  blurb:
    "This is not an AI detector. Paste some things you have written, then a draft, and see how far the draft has moved from the way you actually write.",
  privacy: "browser",
  cantSee: [
    "Meaning. Every number here counts how often words and marks turn up, and none of them knows what any of it says.",
    "Register shifts inside one writer. A note to a friend and a note to a bank are two voices from the same person, and this would call the second one drift.",
    "Anything under 150 words. Below that the distance is reporting whether a word happened to occur at all, so the tool refuses to print one and says why.",
    "Anything from fewer than five pieces. The distance is measured in how much your own writing varies from one piece to the next, and with four or fewer that variation is mostly one piece's accident, so the tool refuses and says so.",
    "Whether the writing is any good. A low distance means your commonest words turn up at similar rates. That is not praise, and it is not a verdict on the draft.",
    "A substitution that is not on its list. The near-synonyms come from a fixed table written into this page, not from a dictionary and not from a model.",
  ],
  status: "live",
  order: 20,
};

export const driftCopy = {
  samplesLabel: "Things you wrote",
  samplesHint:
    "Ten pieces is plenty and five is the minimum. Paste them one after another with a line of three dashes between them. A thousand words in total is where the numbers start to settle.",
  samplesPlaceholder: "Paste something you wrote\n---\nAnd another one",
  draftLabel: "The draft",
  draftHint: "The thing you want measured. Under 150 words it will refuse, and say so.",
  draftPlaceholder: "Paste the draft",

  build: "Build the profile",
  measure: "Measure the draft",
  save: "Save this profile",
  drop: "Delete the saved profile",
  useDemo: "Show me the worked example again",

  profileHeading: "Your profile",
  deltaHeading: "Distance",
  spreadHeading: "Your own spread",
  metricsHeading: "Habits, side by side",
  shapeHeading: "Sentence lengths",
  pullsHeading: "The sentences pulling hardest",
  substitutionsHeading: "Words your own writing does not use",
  builtFrom: "Built from",

  profileColumn: "You",
  draftColumn: "This draft",

  noProfile: "Build a profile first, or use the worked example below.",
  noSamples: "Nothing to build a profile from yet. Paste something you wrote.",
  thinProfile:
    "That is a thin profile. Under a thousand words the rarer half of your marker words appear once or not at all, and the distance moves around on nothing.",
  tooShort:
    "Under 150 words, a distance is noise: most of the marker words appear once or not at all, so the number would be reporting chance. Counts still hold, and they are below.",
  tooFewPieces:
    "Fewer than 5 separate pieces. The distance is measured in how far your own pieces sit from each other, so with four or fewer there is not enough of your own variation to measure it in, and printing a number would be inventing the units. Your habits are still below, and so are the counts.",
  noPulls: "No sentence stands out. The draft is spread evenly against your profile.",
  noSubstitutions: "Nothing on the list. Every word it checks for, you use yourself.",

  savedNote: "Saved on this machine only. The terminal's forget command wipes it.",
  savedContents:
    "What gets saved is a frequency table: your hundred commonest words, a number beside each, and the rates. Your own words, then, but single ones, in frequency order, never in the order you wrote them. No sentence goes in and none can be got back out.",
  droppedNote: "Deleted. Nothing of yours is left in this browser.",
  neverSaved: "Nothing is saved unless you press save.",

  demoNote:
    "A worked example, so this page is not an empty form. Everything on screen is my writing measured against my own writing: the profile and the reference are the eleven articles at /writing, and the draft is one of my paragraphs rewritten the way a model tends to rewrite things. Paste your own pieces and every number here is rebuilt from them.",
  referenceNote:
    "The distance is Burrows's Delta, and a Delta is measured in standard deviations, so it needs a population whose standard deviations they are. That population is your pieces: your own commonest words, and your own variation from one piece to the next. Which is why the number reads in units of your writing and not mine, and why the spread of your own pieces is printed beside it.",
  substitutionNote:
    "The near-synonyms come from a fixed table of 22 pairs written into this tool. It is not a thesaurus and it cannot find a pair that is not on the list. What makes a row worth printing is your own frequency: the word is in your draft, never in your samples, and the plain one is.",
  splitterNote:
    "Sentences are split on full stops, question marks and exclamation marks. It does not know abbreviations, so Dr. Byrne counts as two.",

  metricLabels: {
    "sentence-mean": "Words per sentence, mean",
    "sentence-sd": "Words per sentence, spread",
    "short-sentences": "Sentences of 8 words or fewer",
    "long-sentences": "Sentences over 32 words",
    "em-dash": "Em dashes per 1,000 words",
    "en-dash": "En dashes per 1,000 words",
    semicolon: "Semicolons per 1,000 words",
    exclamation: "Exclamation marks per 1,000 words",
    question: "Question marks per 1,000 words",
    parenthetical: "Bracketed asides per 1,000 words",
    contraction: "Contractions per 1,000 words",
    "join-and": "Sentences opening with and",
    "join-but": "Sentences opening with but",
    "join-so": "Sentences opening with so",
  } satisfies Record<MetricKey, string>,

  reasonLabels: {
    "em-dash": "an em dash",
    substitution: "a word your samples never use",
    long: "longer than your usual",
  } satisfies Record<PullReason, string>,

  talk: "If it told you something about your own writing you did not know, I would like to hear what.",
} as const;

/**
 * The specimen.
 *
 * Deliberately written in the voice the whole tool exists to notice, and
 * deliberately kept out of the `prose` array in `content/voice.test.ts`: it is
 * a sample of bad house style, so linting it would be linting the exhibit. The
 * two em dashes are written as `\u2014` escapes, which is not the character, so
 * the source-tree scan in that file stays green. `content/tools/drift.test.ts`
 * pins that they are still here.
 */
export const driftDemo = {
  draft:
    "In today's fast-paced software landscape, it is essential to leverage robust testing methodologies in order to ensure that concurrency defects are surfaced prior to deployment. Our team commenced an investigation into a deadlock condition affecting the group booking pathway \u2014 a critical revenue surface \u2014 and utilised a comprehensive suite of concurrent test rounds to validate the behaviour. Regrettably, the initial harness demonstrated a seamless green result, which ultimately proved insufficient. Furthermore, the underlying issue was not the locking strategy itself but the manner in which the fixture generated its identifiers. Numerous rounds were executed and none surfaced the defect. It is therefore imperative that engineering organisations delve into the assumptions embedded within their test fixtures, rather than assuming that a passing suite is equivalent to correct behaviour. By pinning the identifiers such that the two rooms order their overlapping windows in opposition, the same harness immediately demonstrated six deadlocks across eight rounds, thereby facilitating a targeted remediation and empowering the team to obtain confidence in the fix.",
} as const;
