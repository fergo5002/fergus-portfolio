import type { MetricKey, PullReason } from "@/lib/tools/drift/report";
import type { Substitution } from "@/lib/tools/drift/substitutions";
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
    "Anything under 150 words. The tool uses that conservative floor because short drafts make marker counts sparse; it refuses to print a distance and says why.",
    "Anything from fewer than five pieces. Five is a conservative, uncalibrated floor for estimating variation, so the tool refuses a distance below it and says why.",
    "Whether the writing is any good. A low distance means your commonest words turn up at similar rates. That is not praise, and it is not a verdict on the draft.",
    "A substitution that is not on its list. The near-synonyms come from a fixed table written into this page, not from a dictionary and not from a model.",
  ],
  status: "live",
  order: 20,
};

export const driftCopy = {
  samplesLabel: "Things you wrote",
  samplesHint:
    "Five pieces is the conservative minimum and ten is a useful starting point. Paste them one after another with a line of three dashes between them. A thousand words in total is an uncalibrated rule of thumb, not a guarantee that the numbers have settled.",
  samplesPlaceholder: "Paste something you wrote\n---\nAnd another one",
  draftLabel: "The draft",
  draftHint:
    "The thing you want measured. The tool uses 150 words as a conservative, uncalibrated floor; below it, it refuses a distance and says so.",
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
  substitutionsHeading: "Words these samples do not use",
  builtFrom: "Built from",

  profileColumn: "You",
  draftColumn: "This draft",

  noProfile: "Build a profile first, or use the worked example below.",
  noSamples: "Nothing to build a profile from yet. Paste something you wrote.",
  thinProfile:
    "That is a thin profile. A thousand words is a conservative rule of thumb, not a calibrated boundary; with less text, sparse marker counts can make the distance less stable.",
  tooShort:
    "This tool uses 150 words as a conservative, uncalibrated floor because marker counts are sparse in short drafts. It will not print a distance below that floor. Counts still hold, and they are below.",
  tooFewPieces:
    "Fewer than 5 separate pieces. Five is this tool's conservative, uncalibrated floor for estimating your between-piece variation, so it will not print a distance. Your habits are still below, and so are the counts.",
  noPulls:
    "No sentence contains an overused marker word or one of the fixed flags. Underused words contribute to the distance but cannot honestly be assigned to one sentence.",
  noSubstitutions:
    "No row has all three pieces of evidence: a listed formal term in this draft, none in these samples, and its listed plain alternative in the samples.",
  substitutionRow: (row: Substitution) =>
    `These samples never use "${row.formal}". They use "${row.plain}", ${row.profilePlain} times. This draft uses "${row.formal}" ${row.draftCount} times.`,

  savedNote: "Saved on this machine only. The terminal's forget command wipes it.",
  savedContents:
    "What gets saved is a frequency table: up to one hundred marker words that passed the document and variation filters, a number beside each, and the rates. Your own words, then, but single ones, in frequency order, never in the order you wrote them. No sentence goes in and none can be got back out.",
  droppedNote: "Saved profile deleted. Your pasted samples and draft have also been cleared from this tab.",
  dropFailed:
    "This browser refused the deletion, so the saved profile may still be here. Try the terminal's forget command after storage access is restored.",
  neverSaved: "Nothing is saved unless you press save.",
  unsavedOverSaved:
    "This new profile is not saved. An older saved profile is still on this machine until you replace or delete it.",

  announceNoSamples: "No profile was built because no samples were provided.",
  announceRestored: "Saved Drift profile restored.",
  announceBuilt: "Visitor profile built. The displayed report now uses your samples.",
  announceMeasured: "Draft measurement updated.",
  announceRefused: "Draft measurement updated without a distance; read the explanation below.",
  announceSaved: "Drift profile saved on this machine.",
  announceSaveFailed: "This browser refused the save; no new profile was stored.",
  announceDeleted: "Saved profile and text in this tab cleared.",
  announceDeleteFailed: "Profile deletion failed; your current text and saved profile were retained.",
  announceDemo: "Worked example restored. Build your own profile before measuring your draft.",

  demoNote:
    "A worked example, so this page is not an empty form. The report below measures my example draft against a profile and reference built from the eleven articles at /writing. Paste your own pieces and every number in the report is rebuilt from them.",
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
