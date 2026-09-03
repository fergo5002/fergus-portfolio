# T1 Drift Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/tools/drift`: a visitor pastes samples of their own writing, the tab builds a voice profile, and a draft is measured against it with Burrows's Delta, sentence rhythm, punctuation habits, join rates and substitutions drawn from their own corpus. Everything runs in the browser, nothing is uploaded, and the profile is saved only if they press save.

**Architecture:** All the maths lives in `lib/tools/drift/*.ts` as pure functions with tests beside them, taking the reference statistics as an argument so every one of them is testable against a small synthetic corpus. The reference population for the z-scores is the site's own eleven articles: `lib/tools/drift/corpus.ts` turns them into plain text and computes the marker words with their means and standard deviations, once, on the server, and the page passes that table to the client component as a prop so the article bodies never enter the browser bundle. `app/tools/drift/page.tsx` renders through F3's `ToolPage` and hands `DriftTool.tsx` a worked example computed at build time, so the page is never an empty form. `check_voice(profile, draft)` joins the existing MCP server in `lib/mcp.ts` and returns the same numbers from the same functions.

**Tech Stack:** Next.js 15.5 App Router, React 19, TypeScript 5.7, vitest 2 (node environment, no jsdom), hand-written CSS, Playwright through `scripts/phone-check.mjs` (F3). **No new dependencies.**

## Global Constraints

- Programme design: `docs/superpowers/specs/2026-09-03-toolshed-programme-design.md`. This plan is T1 (section 6, wave 1). Its acceptance line, verbatim: "`/tools/drift`. Not an AI detector, and the first line says so. Paste ten things you wrote; the tab builds a voice profile (function-word frequencies, sentence-length rhythm, punctuation, joins) and measures Burrows' Delta between it and any draft, with the sentences pulling away and the substitutions your own corpus suggests. Profile saved only if the visitor presses save, in local storage, wiped by `forget`. Under 150 words the tool refuses to print a distance. MCP twin `check_voice(profile, draft)` on the existing server. Can't see: meaning, register shifts within one writer."
- **Dependencies that must be on `main` before Task 1 starts:** F3 (`content/tools/`, `components/tools/ToolPage.tsx`, `lib/tools/events.ts`, `scripts/phone-check.mjs`) and F2 (`lib/forget.ts`, exporting `OWNED_PREFIX`). Task 0 Step 1 checks both. If `lib/forget.ts` is missing, **stop and say so**; do not invent a second storage prefix, because `forget` would then not wipe this tool's key and the constitution's new clause would be false on the live site.
- Frozen interfaces this plan **consumes** and may not rename (design section 8, point 2): `ToolEntry` with fields `slug, name, blurb, privacy, cantSee, status, order`; `content/tools/index.ts` exporting `tools`, `liveTools`, `toolBySlug`, `toolShellCopy`; `components/tools/ToolPage.tsx` with props `{ tool: ToolEntry; children: ReactNode }` plus the optional `extraSchema` and `talk`; `TOOL_RUN_EVENT = "tool_run"` with payload `{ tool: string; outcome: "ok" | "refused" | "error"; ms: number }`; `trackToolRun(payload)` in `lib/tools/events.ts`; `scripts/phone-check.mjs` with `--base` and `--routes`; `OWNED_PREFIX = "fergusos:"` in `lib/forget.ts`.
- **Storage key: `fergusos:drift-profile`.** Exactly that string, because `lib/forget.test.ts` (F2) already asserts that `isOwnedKey` accepts `OWNED_PREFIX + "drift-profile"`. It is built from the imported `OWNED_PREFIX`, never retyped as a literal. Nothing else on this route writes to local storage, and nothing writes without a press.
- From `AGENTS.md`, Stack and conventions, verbatim: **"All editable content lives in `content/*.ts`: never hard-code copy in components."** Every string a visitor reads on this route lives in `content/tools/drift.ts`.
- From `AGENTS.md`, verbatim: **"Styling: hand-written CSS in `app/globals.css`. No Tailwind, no CSS-in-JS."** Amended by design section 2, rule 2: a tool may own `app/tools/<slug>/tool.css`, imported by its own `page.tsx`. Drift owns `app/tools/drift/tool.css` and touches `app/globals.css` not at all.
- From `AGENTS.md`, verbatim: **"Accessibility is non-negotiable: every animation must be gated behind `@media (prefers-reduced-motion: no-preference)` (CSS) or a `matchMedia` check (JS) with a static/instant fallback. Keep text contrast >= 4.5:1, alt text on images, visible focus."**
- From `AGENTS.md`, verbatim: **"Never pre-hide a scroll-revealed element with `clip-path`."** Hide with `opacity` and keep the clip inside the keyframes.
- From `AGENTS.md`, verbatim: **"Run `node scripts/mutation-check.mjs` if you touch a guard."** This plan adds six guards and six mutation rows, and Task 12 proves the suite can go red before it claims any of them work.
- From `AGENTS.md`, Commands, verbatim: **"Deploy: Vercel. The project is git-linked (`fergo5002/fergus-portfolio`, production branch `main`), so a push ships."** and **"Confirm every deployment the same way regardless: read `readyState` and `aliasAssigned` from `https://api.vercel.com/v13/deployments/<id>?teamId=<team>` ... Do not trust the CLI's exit code, and do not trust `vercel ls`, which renders `BLOCKED` as `UNKNOWN`."** Every Vercel CLI call passes `--token "$VERCEL_TOKEN_PERSONAL" --scope larry-pm`. Live host `https://fergusoreilly.dev`. `main` requires the `check` and `mutation` jobs, so this ships as a pull request.
- `content/voice.test.ts` scans **every** `.ts` and `.tsx` outside tests for a literal em dash, comments included. The demo draft in `content/tools/drift.ts` deliberately contains two em dashes, so they are written as `\u2014` escapes: the escape is not the character, the scan passes, and `content/tools/drift.test.ts` pins that the draft really does carry them so the demo cannot quietly lose its point.
- Tests are vitest only, `environment: "node"`, `include: ["**/*.test.ts"]`, beside the source. **No jsdom, so React cannot be mounted.** Component wiring is checked with source-grep coupling tests in the style of `lib/boot.test.ts` and `components/chrome.test.ts`, with comments stripped before matching so prose about a call cannot satisfy a check for the call. Every coupling test says in its docblock that it is one.
- No new dependencies, production or dev. Everything here is arithmetic over strings.
- Claims discipline (`C:\Users\oreil\.claude\CLAIMS.md`): every step that runs something says what its output proves and what it cannot see. Anything written before a run is labelled a guess. The word "fixed" is used only where the isolation test no longer reproduces **and** reverting brings the failure back.
- Commit messages: lowercase `type(scope): declarative sentence`. British English, no em dashes, per `C:\Users\oreil\.claude\LANGUAGE.md`.
- Branch `toolshed/t1-drift` in its own sibling worktree made through `workspaces.ps1`, never reused, never removed by an agent.

---

## The method, stated exactly

Written here once so no task has to guess, and so a reviewer can fail a task against it.

**Burrows's Delta.** The standard authorship-attribution distance. Take the most frequent words of a reference corpus, express each text as the relative frequency of each of those words, turn each frequency into a z-score using that word's mean and standard deviation **across the reference corpus's documents**, and take the mean absolute difference between two texts' z-score vectors. Formally, for marker set `M`, reference mean `mu(w)` and standard deviation `sigma(w)` over the `D` reference documents:

```
f(w, t)     = count of w in t / total words in t
z(w, t)     = (f(w, t) - mu(w)) / sigma(w)
Delta(a, b) = (1 / |M|) * sum over w in M of |z(w, a) - z(w, b)|
```

It is a **distance, not a verdict**. A low Delta says two texts use the commonest words at similar rates. It does not say the writing is good, it does not say who wrote it, and it says nothing at all about meaning.

**N, the marker count: 100, and here is why.** Burrows's usual starting point is the 150 most frequent words, and 150 is right for a corpus of novels. This reference corpus is eleven articles, so the standard deviation of a word is computed from eleven numbers, and a word that appears in only two of them has a standard deviation that is mostly an accident. Two rules follow, both enforced in code: a word must appear in **at least 6 of the 11 documents** (over half) to be a marker, and the list stops at **100** because past roughly the hundredth rank in a corpus this size the words stop being function words and start being subject words (`postgres`, `shopify`, `vercel`), which would measure what a text is about rather than how it is written. Both numbers are choices, not measurements. `MARKER_COUNT` and `MIN_DOCUMENT_SHARE` are exported constants so changing them is one line and one test.

**The floor: 150 words.** Under 150 words a Delta is noise, because most markers have a count of zero or one and the z-score is then reporting whether a word happened to occur at all. The tool refuses to print a distance below the floor and says why. What it still prints below the floor is only what is a plain count rather than a statistic: em dashes found, and substitution hits. A count of two em dashes is two em dashes at any length.

**The profile floor: 1,000 words.** Same argument pointed at the other text. Guessed, not measured. The tool prints the profile's word count either way so the visitor can weigh it themselves.

**Pooling.** A profile is built from the visitor's samples **concatenated**, not averaged piece by piece, because the pooled frequencies of ten short pieces are steadier than the mean of ten noisy vectors.

**Self-spread, instead of invented bands.** There are no thresholds in this tool, because a calibrated threshold would need a measurement nobody here has taken. Instead, when the visitor gives two or more samples that each clear the floor, the tool computes leave-one-out Deltas across their own samples: each piece against a profile built from the rest. That gives the range their own writing sits in, and the draft's Delta is reported beside it. "Your own pieces sit between 0.61 and 0.94 of each other. This draft is at 1.83" is a sentence the numbers actually support.

**Rhythm.** Sentence lengths in words: mean, population standard deviation, and the shape as five buckets (1 to 8, 9 to 16, 17 to 24, 25 to 32, 33 or more) held as shares so profile and draft compare directly. The sentence splitter is naive about abbreviations and the page says so.

**Punctuation habits.** Per 1,000 words: em dashes, en dashes, semicolons, exclamation marks, question marks, parenthetical pairs, contractions.

**Joins.** The share of sentences opening with "and", "but" or "so".

**Substitutions, from the visitor's own corpus.** A fixed bundled table of twenty-two pairs that actually matter (`utilise`/`use`, `leverage`/`help`, `commence`/`start`, `regarding`/`about`, `delve`/`dig`, `seamless`/`smooth`, `robust`/`solid` and the rest), each side listed as explicit word forms rather than stemmed, because a stemmer is a dependency and a guess. A row is emitted only when all three hold: the draft uses the formal form, the visitor's corpus uses it **zero** times, and the visitor's corpus uses the plain form **at least once**. That third condition is what makes the line evidence rather than a lecture. The table is small, honest and testable, and the page says outright that it is a fixed list and cannot find a substitution that is not on it.

**Which sentences pull hardest.** Not a Delta per sentence: a sentence is far too short for one, and printing a per-sentence Delta would be the exact error this tool exists to argue against. Instead the whole-text gap is attributed to sentences. For each marker `w`, take the **signed** gap `z(w, draft) - z(w, profile)`; keep only the positive ones, the words the draft uses **more** than the profile does. A sentence's pull is the sum of those contributions over its marker tokens. Words the draft underuses are deliberately not attributed, because their absence cannot be blamed on a sentence that happens to contain them.

---

## File structure

**Created**

| Path | Responsibility |
|---|---|
| `lib/tools/drift/text.ts` | Tokenising: `words`, `sentences`, `wordCount`, `splitPieces`. Nothing else knows how a word is defined. |
| `lib/tools/drift/text.test.ts` | Tokeniser tests, including the apostrophe and the naive-abbreviation limit. |
| `lib/tools/drift/corpus.ts` | The reference population: `buildReference`, `referenceDocuments`, the memoised `reference()`, `MARKER_COUNT`, `MIN_DOCUMENT_SHARE`. Server side only. |
| `lib/tools/drift/corpus.test.ts` | Marker selection, the two filters, and the real corpus's shape. |
| `lib/tools/drift/signals.ts` | Rhythm, punctuation and joins. Pure, no reference needed. |
| `lib/tools/drift/signals.test.ts` | Tests for the three. |
| `lib/tools/drift/substitutions.ts` | `PAIRS`, `countForms`, `countPairs`, `substitutions`. |
| `lib/tools/drift/substitutions.test.ts` | The three-condition rule, the forms, and the table's own shape. |
| `lib/tools/drift/profile.ts` | `VoiceProfile`, `relativeFrequencies`, `zScores`, `profileOf`, `MIN_PROFILE_WORDS`. |
| `lib/tools/drift/profile.test.ts` | Frequencies, z-scores, pooling. |
| `lib/tools/drift/delta.ts` | `MIN_DELTA_WORDS`, `delta`, `deltaOf`, `selfSpread`. |
| `lib/tools/drift/delta.test.ts` | Identity, symmetry, the reference-population property, leave-one-out spread. |
| `lib/tools/drift/report.ts` | `analyse`, `sentencePulls`, `METRIC_KEYS`, `BUCKET_KEYS`, `DriftReport`. |
| `lib/tools/drift/report.test.ts` | The floor refusal, what survives it, the metric rows, the pull attribution. |
| `lib/tools/drift/storage.ts` | `DRIFT_PROFILE_KEY`, `serialiseProfile`, `parseProfile`. |
| `lib/tools/drift/storage.test.ts` | Round trip, every rejection, and the "no free text is stored" guard. |
| `content/tools/drift.ts` | The `ToolEntry`, every string on the page, and the demo draft. |
| `content/tools/drift.test.ts` | Copy guards: the first line, the metric labels, the demo's em dashes. |
| `app/tools/drift/page.tsx` | Server component. Builds the reference and the worked example, renders through `ToolPage`. |
| `app/tools/drift/DriftTool.tsx` | The client component. Two text areas, four buttons, the report. |
| `app/tools/drift/tool.css` | The route's own stylesheet. |
| `app/tools/drift/page.test.ts` | Coupling checks: the shell, the stylesheet, the corpus staying server side, one `setItem`. |

**Modified**

| Path | Change |
|---|---|
| `content/tools/index.ts` | One alphabetical import line and one array entry. |
| `content/voice.test.ts` | `driftCopy`'s prose joins the `prose` array. The demo draft deliberately does not, with the reason written in. |
| `lib/mcp.ts` | The `check_voice` tool. |
| `lib/mcp.test.ts` | A `describe` for it: the round trip, the floor, a rejected profile. |
| `scripts/mutation-check.mjs` | Six rows for the six new guards. |
| `AGENTS.md` | Two sentences: where the reference corpus comes from, and the storage key. |
| `docs/superpowers/programme/toolshed-ledger.md`, `docs/PROGRESS.md` | State and evidence. |

**Not touched:** `app/globals.css`, `app/sitemap.ts`, `app/llms.txt/route.ts`. The sitemap and `/llms.txt` pick the route up on their own because F3 made them read `liveTools`, and Task 14 proves that rather than assuming it.

---

### Task 0: Worktree, branch and a green baseline

**Files:**
- Modify: `docs/superpowers/programme/toolshed-ledger.md`

**Interfaces:**
- Consumes: `main` with F2 and F3 merged
- Produces: the worktree path every later task runs in, written here as `$WT`, and the baseline test count

- [ ] **Step 1: Confirm the two dependencies are on main**

```bash
cd /c/Dev/fergus-portfolio
git fetch origin
git log origin/main --oneline -5
git show origin/main:lib/forget.ts | grep -n "OWNED_PREFIX"
git show origin/main:content/tools/index.ts | grep -n "toolShellCopy"
git show origin/main:components/tools/ToolPage.tsx | grep -n "cantSee"
git show origin/main:scripts/phone-check.mjs | grep -n "self-test"
```

Expected: `export const OWNED_PREFIX = "fergusos:";`, a `toolShellCopy` export, a `cantSee` map in the shell, and a `--self-test` flag in the phone check. If any of the four is missing, stop: F2 or F3 has not merged, and building on a missing interface is how two sub-projects end up with two storage prefixes. Say which one is missing and stop.

- [ ] **Step 2: Create the worktree through the wrapper**

```powershell
powershell -NoProfile -File C:\Users\oreil\.claude\scripts\workspaces\workspaces.ps1 create -Repository C:\Dev\fergus-portfolio -Branch toolshed/t1-drift
powershell -NoProfile -File C:\Users\oreil\.claude\scripts\workspaces\workspaces.ps1 path -Repository C:\Dev\fergus-portfolio -Branch toolshed/t1-drift
```

Expected: the second command prints a sibling path of `C:\Dev\fergus-portfolio`. Every `cd "$WT"` below means that path. Never `git worktree remove` it.

- [ ] **Step 3: Install and record the baseline**

```bash
cd "$WT"
npm ci
npx tsc --noEmit && npm test -- --reporter=dot 2>&1 | tail -3
```

Expected: `tsc` silent, then a `Tests  N passed` line. Write `N` down. Every later task compares against it, and a task that ends with fewer passing tests than it started with has broken something it did not write.

What this proves: the checkout builds and the suite is green before any of this work exists. What it cannot see: anything about the production build, which Task 13 runs.

- [ ] **Step 4: Open the ledger row and commit**

In `docs/superpowers/programme/toolshed-ledger.md`, set the T1 row's state to `**building**` and its branch to `toolshed/t1-drift`, then append to the Log:

```markdown
- 2026-09-03: T1 started in its own worktree on `toolshed/t1-drift`. Baseline before any change: tsc clean, N tests passing (fill N in). F2 and F3 confirmed on main by reading `OWNED_PREFIX`, `toolShellCopy`, `ToolPage` and the phone check's self-test flag out of `origin/main`.
```

```bash
cd "$WT"
git add docs/superpowers/programme/toolshed-ledger.md
git commit -m "docs(ledger): open the T1 drift row"
```

---

### Task 1: Tokenising

**Files:**
- Create: `lib/tools/drift/text.ts`
- Test: `lib/tools/drift/text.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `type Sentence = { text: string; words: string[]; start: number }`, `words(text: string): string[]`, `wordCount(text: string): number`, `sentences(text: string): Sentence[]`, `splitPieces(text: string): string[]`

Everything downstream counts words, and if two modules disagree about what a word is then every number in the tool is quietly wrong. So one module owns it.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/tools/drift/text.test.ts
import { describe, it, expect } from "vitest";
import { sentences, splitPieces, wordCount, words } from "./text";

describe("words", () => {
  it("lowercases and drops punctuation", () => {
    expect(words("The Quick, brown fox.")).toEqual(["the", "quick", "brown", "fox"]);
  });

  it("keeps an apostrophe inside a word and normalises the curly one", () => {
    expect(words("don't. It\u2019s fine")).toEqual(["don't", "it's", "fine"]);
  });

  it("drops bare numbers, so a table of figures cannot shift a frequency", () => {
    expect(words("we shipped 12 of 15 in 2026")).toEqual(["we", "shipped", "of", "in"]);
  });

  it("keeps accented letters as one word", () => {
    expect(words("caf\u00e9 na\u00efve")).toEqual(["caf\u00e9", "na\u00efve"]);
  });

  it("returns nothing for empty and whitespace-only input", () => {
    expect(words("")).toEqual([]);
    expect(words("   \n  ")).toEqual([]);
    expect(wordCount("")).toBe(0);
  });
});

describe("sentences", () => {
  it("splits on terminators and keeps the offset of each", () => {
    const list = sentences("One two. Three four! Five?");
    expect(list.map((s) => s.text)).toEqual(["One two.", "Three four!", "Five?"]);
    expect(list.map((s) => s.words.length)).toEqual([2, 2, 1]);
    expect(list[1].start).toBe(9);
  });

  it("keeps a closing quote or bracket with its sentence", () => {
    expect(sentences('He said "no." Then he left.').map((s) => s.text)).toEqual([
      'He said "no."',
      "Then he left.",
    ]);
  });

  it("treats a trailing fragment with no terminator as a sentence", () => {
    expect(sentences("Done. And one more").map((s) => s.text)).toEqual(["Done.", "And one more"]);
  });

  it("is naive about abbreviations, which the page says out loud", () => {
    // Not a bug being tested in: a real abbreviation list is a dictionary, and
    // the tool would rather state the limit than pretend to a lexicon.
    expect(sentences("Ask Dr. Byrne.").map((s) => s.text)).toEqual(["Ask Dr.", "Byrne."]);
  });

  it("returns nothing for empty input", () => {
    expect(sentences("")).toEqual([]);
    expect(sentences("   ")).toEqual([]);
  });
});

describe("splitPieces", () => {
  it("splits on a line of three or more dashes and drops the empties", () => {
    expect(splitPieces("one\n---\ntwo\n-----\n\n\nthree\n---\n   ")).toEqual([
      "one",
      "two",
      "three",
    ]);
  });

  it("treats text with no separator as one piece", () => {
    expect(splitPieces("just the one")).toEqual(["just the one"]);
  });

  it("returns nothing for empty input", () => {
    expect(splitPieces("")).toEqual([]);
    expect(splitPieces("---")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd "$WT" && npx vitest run lib/tools/drift/text.test.ts`
Expected: FAIL, cannot resolve `./text`.

- [ ] **Step 3: Write the module**

```ts
// lib/tools/drift/text.ts
/**
 * What counts as a word, and what counts as a sentence.
 *
 * One module owns both, because every number this tool prints is a ratio over
 * one of them. Two modules with two slightly different tokenisers would produce
 * a Delta, a rhythm and a substitution count that quietly disagree, and nothing
 * would fail.
 *
 * Numbers are dropped on purpose. The reference corpus is this site's articles,
 * several of which carry tables and charts, and a run of figures would push
 * every relative frequency down without saying anything about how anyone
 * writes.
 *
 * Each function builds its own regular expression rather than sharing a
 * module-level one. A regex literal evaluated inside a function body is a fresh
 * object per call, so `lastIndex` cannot leak between calls: `lib/markdown.ts`
 * builds its inline regex the same way and for the same reason.
 */

/** One sentence, with its words already tokenised and its offset in the source. */
export type Sentence = {
  /** The sentence, trimmed. */
  text: string;
  /** Its words, lowercased, per `words`. */
  words: string[];
  /** Index of its first character in the text it came from. */
  start: number;
};

/**
 * Words, lowercased, apostrophes kept inside a word and normalised to the
 * straight one so "don't" and "don\u2019t" are the same token.
 */
export function words(text: string): string[] {
  const re = /\p{L}+(?:['\u2019]\p{L}+)*/gu;
  const out: string[] = [];
  for (const m of text.matchAll(re)) out.push(m[0].toLowerCase().replace(/\u2019/g, "'"));
  return out;
}

export function wordCount(text: string): number {
  return words(text).length;
}

/**
 * Sentences, split on a run of terminators plus any closing quote or bracket.
 *
 * Naive about abbreviations: "Dr. Byrne" is two sentences to this. Fixing that
 * needs an abbreviation dictionary, and the tool would rather print the limit
 * on the page than ship a half-dictionary that is wrong in a different way.
 */
export function sentences(text: string): Sentence[] {
  const re = /[^.!?]+(?:[.!?]+["'\u2019)\]]*|$)/gu;
  const out: Sentence[] = [];
  for (const m of text.matchAll(re)) {
    const raw = m[0];
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue;
    const lead = raw.length - raw.trimStart().length;
    out.push({ text: trimmed, words: words(trimmed), start: (m.index ?? 0) + lead });
  }
  return out;
}

/**
 * The visitor's samples, separated by a line of three or more dashes.
 *
 * One text area rather than a growing list of them, because on a 320px screen a
 * list of ten text areas is a scroll marathon, and because a separator is
 * something a person can paste. The separator is stated in the label.
 */
export function splitPieces(text: string): string[] {
  return text
    .split(/^\s*-{3,}\s*$/m)
    .map((piece) => piece.trim())
    .filter((piece) => piece.length > 0);
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd "$WT" && npx vitest run lib/tools/drift/text.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
cd "$WT"
git add lib/tools/drift/text.ts lib/tools/drift/text.test.ts
git commit -m "feat(drift): tokenise words, sentences and pasted pieces"
```

---

### Task 2: The reference corpus and the marker set

**Files:**
- Create: `lib/tools/drift/corpus.ts`
- Test: `lib/tools/drift/corpus.test.ts`

**Interfaces:**
- Consumes: `words` from `./text`; `articles` from `@/content/articles`; `toPlainText` from `@/lib/markdown`
- Produces: `MARKER_COUNT = 100`, `MIN_DOCUMENT_SHARE = 6`, `type Reference = { markers: string[]; mean: Record<string, number>; sd: Record<string, number>; documents: number; totalWords: number }`, `buildReference(documents: string[]): Reference`, `referenceDocuments(): string[]`, `reference(): Reference`

A Delta needs a reference population, and the honest thing is to name it: this one is the eleven articles in `content/articles/`. `referenceDocuments` and `reference` import the corpus, so this module is server side. Every other module in `lib/tools/drift/` takes a `Reference` as an argument and imports nothing from here except the type, which is what lets the client component work from a table passed down as a prop.

**Two guards live here and both get a mutation row in Task 13.** A marker must appear in at least `MIN_DOCUMENT_SHARE` documents, and a word whose standard deviation is zero is dropped rather than divided by.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/tools/drift/corpus.test.ts
import { describe, it, expect } from "vitest";
import {
  MARKER_COUNT,
  MIN_DOCUMENT_SHARE,
  buildReference,
  reference,
  referenceDocuments,
} from "./corpus";
import { words } from "./text";

/** Six documents, so a word in five of them is over the share and one in four is under. */
function docs(...bodies: string[]): string[] {
  return bodies;
}

describe("buildReference", () => {
  it("ranks markers by total frequency across the corpus", () => {
    // "the" appears 10 times and "a" 8, both in all six documents and both
    // varying between them. "cat", "dog" and "bird" appear exactly once in
    // every document, so their standard deviation is zero and they are dropped
    // by the guard two tests below.
    const ref = buildReference(
      docs(
        "the cat the dog a bird",
        "the cat the dog a bird",
        "the cat a dog a bird",
        "the cat the dog a bird",
        "the cat the dog a bird",
        "the cat a dog a bird",
      ),
    );
    expect(ref.markers[0]).toBe("the");
    expect(ref.markers).toContain("a");
    expect(ref.documents).toBe(6);
    expect(ref.totalWords).toBe(36);
  });

  it("drops a word that appears in fewer than MIN_DOCUMENT_SHARE documents", () => {
    // "zeugma" is frequent, but only in one document. A standard deviation from
    // one non-zero reading is an accident, not a habit.
    const ref = buildReference(
      docs(
        "zeugma zeugma zeugma zeugma zeugma the cat",
        "the cat a dog",
        "the cat a dog",
        "the cat a dog",
        "the cat a dog",
        "the cat a bird",
      ),
    );
    expect(ref.markers).not.toContain("zeugma");
    expect(ref.markers).toContain("the");
  });

  it("drops a word whose frequency never varies, because its z-score is a division by zero", () => {
    // "the" is exactly one of two words in every document, so its standard
    // deviation is 0. Keeping it would put Infinity into every Delta.
    const ref = buildReference(docs("the cat", "the dog", "the bird", "the fish", "the cat", "the dog"));
    expect(ref.markers).not.toContain("the");
    for (const w of ref.markers) expect(ref.sd[w], w).toBeGreaterThan(0);
  });

  it("never returns more than MARKER_COUNT markers", () => {
    const many = Array.from({ length: 400 }, (_, i) => `word${i}`).join(" ");
    const ref = buildReference(docs(many, `${many} extra`, many, `${many} extra`, many, `${many} extra`));
    expect(ref.markers.length).toBeLessThanOrEqual(MARKER_COUNT);
  });

  it("gives every marker a finite mean and a positive standard deviation", () => {
    const ref = buildReference(
      docs(
        "the cat sat on the mat and the dog watched",
        "a cat and a dog and the mat",
        "the dog sat and the cat watched the mat",
        "and the mat and a dog and a cat",
        "the cat and the dog on a mat",
        "a dog and the cat and the mat",
      ),
    );
    expect(ref.markers.length).toBeGreaterThan(0);
    for (const w of ref.markers) {
      expect(Number.isFinite(ref.mean[w]), w).toBe(true);
      expect(ref.sd[w], w).toBeGreaterThan(0);
    }
  });

  it("returns an empty marker set for an empty corpus rather than throwing", () => {
    expect(buildReference([]).markers).toEqual([]);
    expect(buildReference(["", "", "", "", "", ""]).markers).toEqual([]);
  });
});

describe("the site's own corpus", () => {
  it("is every published article, as plain text", () => {
    const documents = referenceDocuments();
    expect(documents.length).toBeGreaterThanOrEqual(11);
    for (const d of documents) expect(words(d).length).toBeGreaterThan(300);
    // toPlainText drops fenced code, so no article body reaches the corpus with
    // a listing in it. If this starts failing, the markdown parser changed.
    expect(documents.join(" ")).not.toContain("```");
  });

  it("produces a full marker set from it", () => {
    const ref = reference();
    expect(ref.markers.length).toBe(MARKER_COUNT);
    expect(ref.documents).toBe(referenceDocuments().length);
    expect(ref.totalWords).toBeGreaterThan(5000);
    // The commonest words of English prose. If the top of this list stops
    // looking like function words, the tokeniser or the corpus has changed.
    expect(ref.markers.slice(0, 10)).toContain("the");
    expect(ref.markers.slice(0, 10)).toContain("and");
  });

  it("is memoised, so the page pays for it once", () => {
    expect(reference()).toBe(reference());
  });

  it("keeps every marker in at least MIN_DOCUMENT_SHARE of the articles", () => {
    const ref = reference();
    const documents = referenceDocuments().map((d) => new Set(words(d)));
    for (const w of ref.markers) {
      const seen = documents.filter((set) => set.has(w)).length;
      expect(seen, `${w} appears in ${seen} documents`).toBeGreaterThanOrEqual(MIN_DOCUMENT_SHARE);
    }
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd "$WT" && npx vitest run lib/tools/drift/corpus.test.ts`
Expected: FAIL, cannot resolve `./corpus`.

- [ ] **Step 3: Write the module**

```ts
// lib/tools/drift/corpus.ts
import { articles } from "@/content/articles";
import { toPlainText } from "@/lib/markdown";
import { words } from "./text";

/**
 * The reference population for the z-scores.
 *
 * Burrows's Delta is a distance measured in standard deviations, and a standard
 * deviation has to be a standard deviation of something. That something is this
 * site's own articles, and the page says so, because a Delta whose reference
 * population is unnamed is a number with no units.
 *
 * This module is the only one under `lib/tools/drift/` that imports the corpus.
 * Everything else takes a `Reference` as an argument, which is what lets the
 * page compute this once on the server and hand the resulting table to the
 * browser as a prop: about a hundred words and two hundred numbers, instead of
 * sixty kilobytes of article bodies in the client bundle.
 */

/**
 * How many markers. Burrows's own starting point is 150, which suits a corpus
 * of novels. Eleven articles is not that: past roughly the hundredth rank the
 * words here stop being function words and start being subject words, and a
 * subject word measures what a text is about rather than how it is written.
 * A choice, not a measurement.
 */
export const MARKER_COUNT = 100;

/**
 * A marker must appear in at least this many reference documents. With eleven
 * documents, six is over half. Below that the word's standard deviation is
 * computed mostly from zeroes and reports an accident of topic.
 */
export const MIN_DOCUMENT_SHARE = 6;

export type Reference = {
  /** Marker words, most frequent first. Length is at most `MARKER_COUNT`. */
  markers: string[];
  /** Mean relative frequency of each marker across the documents. */
  mean: Record<string, number>;
  /** Population standard deviation of the same. Always greater than zero. */
  sd: Record<string, number>;
  documents: number;
  totalWords: number;
};

/**
 * Build the table from a set of documents.
 *
 * Exported separately from `reference()` so every test can build one from six
 * short strings instead of reasoning about the real corpus.
 */
export function buildReference(documents: string[]): Reference {
  const perDoc = documents.map((doc) => {
    const tokens = words(doc);
    const counts = new Map<string, number>();
    for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
    return { counts, length: tokens.length };
  });

  const totals = new Map<string, number>();
  const seenIn = new Map<string, number>();
  for (const doc of perDoc) {
    for (const [word, count] of doc.counts) {
      totals.set(word, (totals.get(word) ?? 0) + count);
      seenIn.set(word, (seenIn.get(word) ?? 0) + 1);
    }
  }

  const ranked = [...totals.entries()]
    .filter(([word]) => (seenIn.get(word) ?? 0) >= MIN_DOCUMENT_SHARE)
    // Ties broken alphabetically so the marker set is deterministic. A set that
    // depended on Map insertion order would make every stored profile a
    // different shape from one build to the next.
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([word]) => word);

  const markers: string[] = [];
  const mean: Record<string, number> = {};
  const sd: Record<string, number> = {};

  for (const word of ranked) {
    if (markers.length >= MARKER_COUNT) break;
    const rates = perDoc.map((doc) => (doc.length === 0 ? 0 : (doc.counts.get(word) ?? 0) / doc.length));
    const m = rates.reduce((a, b) => a + b, 0) / rates.length;
    const variance = rates.reduce((a, b) => a + (b - m) * (b - m), 0) / rates.length;
    const s = Math.sqrt(variance);
    // A word that varies not at all cannot be turned into a z-score: the
    // division is by zero and every Delta downstream becomes NaN. It also
    // carries no information about who wrote anything, so dropping it costs
    // nothing.
    if (s === 0) continue;
    markers.push(word);
    mean[word] = m;
    sd[word] = s;
  }

  return {
    markers,
    mean,
    sd,
    documents: documents.length,
    totalWords: perDoc.reduce((total, doc) => total + doc.length, 0),
  };
}

/** Every published article, as plain text. Code blocks are already dropped by `toPlainText`. */
export function referenceDocuments(): string[] {
  return articles.map((article) => toPlainText(article.body));
}

let memo: Reference | null = null;

/**
 * The table, built once. Called at module scope by the page (so it runs at
 * build time, the route being static) and by the MCP tool.
 */
export function reference(): Reference {
  if (memo === null) memo = buildReference(referenceDocuments());
  return memo;
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd "$WT" && npx vitest run lib/tools/drift/corpus.test.ts`
Expected: PASS, 10 tests.

**Three of those assertions are predictions, not measurements, and this run is what settles them.** Written down first so the run can prove them wrong (CLAIMS.md, rule 2): that eleven articles yield at least 100 words appearing in six or more of them with a non-zero standard deviation; that the corpus totals more than 5,000 words; and that "the" and "and" land in the top ten markers. If the first is wrong, do **not** delete the assertion: record the real number in the ledger, set `MARKER_COUNT` to it, and write one line in the module's docblock saying the corpus, not the theory, chose the number. If the third is wrong, stop and read the tokeniser, because something is eating function words.

What this proves once green: the marker set is deterministic, both filters bite, and the real corpus fills the marker list. What it cannot see: whether a hundred is the right number for a corpus this size. Nothing here measures that.

- [ ] **Step 5: Record the corpus size, since the page will state it**

```bash
cd "$WT"
npx vitest run lib/tools/drift/corpus.test.ts --reporter=verbose 2>&1 | tail -20
node -e "process.stdout.write('measured in the test above\n')"
```

Add one line to the ledger log with the observed `documents` and `totalWords` from `reference()`. The page prints those two numbers from the live object rather than from a hard-coded string, so the ledger line is a record of what was true on this date, not a source of truth.

- [ ] **Step 6: Commit**

```bash
cd "$WT"
git add lib/tools/drift/corpus.ts lib/tools/drift/corpus.test.ts
git commit -m "feat(drift): build the reference marker set from the site's own articles"
```

---

### Task 3: Rhythm, punctuation and joins

**Files:**
- Create: `lib/tools/drift/signals.ts`
- Test: `lib/tools/drift/signals.test.ts`

**Interfaces:**
- Consumes: `sentences`, `words` from `./text`
- Produces: `BUCKET_EDGES`, `type Rhythm = { sentences: number; meanWords: number; sdWords: number; buckets: number[] }`, `type Punctuation = { emDash: number; enDash: number; semicolon: number; exclamation: number; question: number; parenthetical: number; contraction: number }`, `type Joins = { and: number; but: number; so: number; any: number }`, `rhythmOf(text)`, `punctuationOf(text)`, `joinsOf(text)`, `countEmDashes(text)`

None of these needs a reference population, so they are separate from the Delta and testable on two sentences.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/tools/drift/signals.test.ts
import { describe, it, expect } from "vitest";
import { BUCKET_EDGES, countEmDashes, joinsOf, punctuationOf, rhythmOf } from "./signals";

describe("rhythmOf", () => {
  it("counts sentences and their mean length in words", () => {
    const r = rhythmOf("One two three. Four five.");
    expect(r.sentences).toBe(2);
    expect(r.meanWords).toBeCloseTo(2.5, 10);
  });

  it("reports the population standard deviation, so one sentence has none", () => {
    expect(rhythmOf("One two three.").sdWords).toBe(0);
    // Lengths 2 and 4: mean 3, population sd 1.
    expect(rhythmOf("One two. Three four five six.").sdWords).toBeCloseTo(1, 10);
  });

  it("puts each sentence in a bucket and reports the buckets as shares", () => {
    const short = "One two.";
    const long = `${"word ".repeat(40).trim()}.`;
    const r = rhythmOf(`${short} ${long}`);
    expect(r.buckets).toHaveLength(BUCKET_EDGES.length + 1);
    expect(r.buckets[0]).toBeCloseTo(0.5, 10);
    expect(r.buckets[r.buckets.length - 1]).toBeCloseTo(0.5, 10);
    expect(r.buckets.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it("returns zeroes for empty input rather than NaN", () => {
    const r = rhythmOf("");
    expect(r.sentences).toBe(0);
    expect(r.meanWords).toBe(0);
    expect(r.sdWords).toBe(0);
    expect(r.buckets.every((b) => b === 0)).toBe(true);
  });
});

describe("punctuationOf", () => {
  it("counts each habit per thousand words", () => {
    // Ten words, one semicolon: 100 per thousand.
    const p = punctuationOf("one two three four five; six seven eight nine ten");
    expect(p.semicolon).toBeCloseTo(100, 10);
    expect(p.exclamation).toBe(0);
  });

  it("counts em dashes and en dashes separately", () => {
    const p = punctuationOf("a \u2014 b \u2013 c d e f g h i j");
    expect(p.emDash).toBeGreaterThan(0);
    expect(p.enDash).toBeGreaterThan(0);
    expect(p.emDash).toBeCloseTo(p.enDash, 10);
  });

  it("counts a parenthetical as one, not two", () => {
    const p = punctuationOf("one two (three four) five six seven eight nine ten");
    expect(p.parenthetical).toBeCloseTo(100, 10);
  });

  it("counts contractions including the curly apostrophe", () => {
    const p = punctuationOf("don't it\u2019s we'll one two three four five six seven");
    expect(p.contraction).toBeCloseTo(300, 10);
  });

  it("returns zeroes for empty input rather than dividing by zero", () => {
    const p = punctuationOf("");
    for (const value of Object.values(p)) expect(value).toBe(0);
  });
});

describe("joinsOf", () => {
  it("reports the share of sentences opening with and, but or so", () => {
    const j = joinsOf("And one. But two. So three. Four five.");
    expect(j.and).toBeCloseTo(0.25, 10);
    expect(j.but).toBeCloseTo(0.25, 10);
    expect(j.so).toBeCloseTo(0.25, 10);
    expect(j.any).toBeCloseTo(0.75, 10);
  });

  it("only counts the opening word, not the word anywhere in the sentence", () => {
    expect(joinsOf("One and two and three.").and).toBe(0);
  });

  it("returns zeroes for empty input", () => {
    expect(joinsOf("")).toEqual({ and: 0, but: 0, so: 0, any: 0 });
  });
});

describe("countEmDashes", () => {
  it("counts the character, which is what survives under the word floor", () => {
    expect(countEmDashes("a \u2014 b \u2014 c")).toBe(2);
    expect(countEmDashes("a - b \u2013 c")).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd "$WT" && npx vitest run lib/tools/drift/signals.test.ts`
Expected: FAIL, cannot resolve `./signals`.

- [ ] **Step 3: Write the module**

```ts
// lib/tools/drift/signals.ts
import { sentences, words } from "./text";

/**
 * The three habits that are not Burrows's Delta.
 *
 * A Delta is a single number about word frequencies. These are the parts of a
 * voice a reader would actually name: how long the sentences are and how much
 * they vary, which marks somebody reaches for, and whether they start sentences
 * with a conjunction. None of them needs a reference population, so none of
 * them takes one, and all of them are testable on two sentences.
 *
 * Everything is a rate rather than a count, so a profile and a draft of very
 * different lengths compare. Punctuation is per thousand words; buckets and
 * joins are shares of the sentences.
 */

/** Upper bounds, in words, of the first four sentence-length buckets. */
export const BUCKET_EDGES = [8, 16, 24, 32] as const;

export type Rhythm = {
  sentences: number;
  meanWords: number;
  /** Population standard deviation. One sentence has none, and that is 0, not NaN. */
  sdWords: number;
  /** Shares, one per bucket, `BUCKET_EDGES.length + 1` of them, summing to 1. */
  buckets: number[];
};

export type Punctuation = {
  emDash: number;
  enDash: number;
  semicolon: number;
  exclamation: number;
  question: number;
  parenthetical: number;
  contraction: number;
};

export type Joins = { and: number; but: number; so: number; any: number };

export function rhythmOf(text: string): Rhythm {
  const lengths = sentences(text)
    .map((s) => s.words.length)
    .filter((n) => n > 0);
  const buckets = new Array<number>(BUCKET_EDGES.length + 1).fill(0);
  const n = lengths.length;
  if (n === 0) return { sentences: 0, meanWords: 0, sdWords: 0, buckets };

  const mean = lengths.reduce((a, b) => a + b, 0) / n;
  const variance = lengths.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n;
  for (const length of lengths) {
    const found = BUCKET_EDGES.findIndex((edge) => length <= edge);
    buckets[found === -1 ? BUCKET_EDGES.length : found] += 1;
  }
  return {
    sentences: n,
    meanWords: mean,
    sdWords: Math.sqrt(variance),
    buckets: buckets.map((count) => count / n),
  };
}

export function punctuationOf(text: string): Punctuation {
  const total = words(text).length;
  const per = (count: number) => (total === 0 ? 0 : (count * 1000) / total);
  const count = (re: RegExp) => [...text.matchAll(re)].length;
  return {
    emDash: per(count(/\u2014/g)),
    enDash: per(count(/\u2013/g)),
    semicolon: per(count(/;/g)),
    exclamation: per(count(/!/g)),
    question: per(count(/\?/g)),
    // A pair counts once. Counting brackets would double every parenthesis and
    // make an unclosed one look like a habit.
    parenthetical: per(count(/\([^)]*\)/g)),
    contraction: per(count(/\p{L}+['\u2019](?:t|s|d|ll|ve|re|m)\b/giu)),
  };
}

export function joinsOf(text: string): Joins {
  const list = sentences(text);
  const n = list.length;
  if (n === 0) return { and: 0, but: 0, so: 0, any: 0 };
  let and = 0;
  let but = 0;
  let so = 0;
  for (const sentence of list) {
    const first = sentence.words[0];
    if (first === "and") and += 1;
    else if (first === "but") but += 1;
    else if (first === "so") so += 1;
  }
  return { and: and / n, but: but / n, so: so / n, any: (and + but + so) / n };
}

/**
 * Raw em dashes, not a rate.
 *
 * This is the one signal the tool still prints under the word floor, because
 * two em dashes are two em dashes in a text of any length. A rate over
 * forty words would be a statistic, and statistics are what the floor refuses.
 */
export function countEmDashes(text: string): number {
  return [...text.matchAll(/\u2014/g)].length;
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd "$WT" && npx vitest run lib/tools/drift/signals.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
cd "$WT"
git add lib/tools/drift/signals.ts lib/tools/drift/signals.test.ts
git commit -m "feat(drift): measure sentence rhythm, punctuation habits and joins"
```

---

### Task 4: The substitution table

**Files:**
- Create: `lib/tools/drift/substitutions.ts`
- Test: `lib/tools/drift/substitutions.test.ts`

**Interfaces:**
- Consumes: `words` from `./text`
- Produces: `type Pair = { id: string; formal: string[]; plain: string[] }`, `PAIRS: Pair[]`, `type PairCounts = Record<string, { formal: number; plain: number }>`, `countForms(tokens: string[], forms: string[]): number`, `countPairs(text: string): PairCounts`, `type Substitution = { id: string; formal: string; plain: string; draftCount: number; profilePlain: number }`, `substitutionsFrom(pairs: PairCounts, draft: string): Substitution[]`

**How near-synonyms are known without a network call.** They are not inferred and there is no thesaurus. There is a fixed table of twenty-two pairs written into this file, each side as explicit word forms, because the alternative is a stemmer (a dependency, and a guess about morphology) or an API call (which would break "nothing leaves this tab"). The frequency evidence is the visitor's own: a row is emitted only when the draft uses the formal form, the corpus uses it zero times, **and** the corpus uses the plain form at least once. That last condition is the one that turns the line from an opinion into a fact about their writing.

`countPairs` is what a saved profile stores, and it is deliberately the only vocabulary the profile keeps: forty-four counters, no words of the visitor's own. A saved profile therefore cannot be read back into anything they wrote.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/tools/drift/substitutions.test.ts
import { describe, it, expect } from "vitest";
import { PAIRS, countForms, countPairs, substitutionsFrom } from "./substitutions";
import { words } from "./text";

describe("the table itself", () => {
  it("has unique ids and at least one form on each side", () => {
    const ids = PAIRS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const pair of PAIRS) {
      expect(pair.formal.length, pair.id).toBeGreaterThan(0);
      expect(pair.plain.length, pair.id).toBeGreaterThan(0);
    }
  });

  it("holds every form lowercased, because the tokeniser lowercases", () => {
    for (const pair of PAIRS) {
      for (const form of [...pair.formal, ...pair.plain]) expect(form, form).toBe(form.toLowerCase());
    }
  });

  it("names the id after its first formal form, so a report row is traceable", () => {
    for (const pair of PAIRS) expect(pair.id).toBe(pair.formal[0].replace(/ /g, "-"));
  });

  it("carries the pairs the house style actually cares about", () => {
    const ids = PAIRS.map((p) => p.id);
    for (const id of ["utilise", "leverage", "commence", "regarding", "delve", "seamless", "robust"]) {
      expect(ids, id).toContain(id);
    }
  });
});

describe("countForms", () => {
  it("counts whole tokens, never a substring", () => {
    expect(countForms(words("we use it and reuse it and the user used it"), ["use", "used"])).toBe(2);
  });

  it("counts a multi-word form as one hit", () => {
    expect(countForms(words("prior to the meeting, and prior to lunch"), ["prior to"])).toBe(2);
    expect(countForms(words("a prior commitment"), ["prior to"])).toBe(0);
  });

  it("returns zero for an empty token list", () => {
    expect(countForms([], ["use"])).toBe(0);
  });
});

describe("countPairs", () => {
  it("counts both sides of every pair in one pass", () => {
    const counts = countPairs("We utilise the thing. We also use the other thing and use it again.");
    expect(counts.utilise).toEqual({ formal: 1, plain: 2 });
  });

  it("has an entry for every pair, so a profile shape is fixed", () => {
    const counts = countPairs("");
    expect(Object.keys(counts).sort()).toEqual(PAIRS.map((p) => p.id).sort());
    for (const value of Object.values(counts)) expect(value).toEqual({ formal: 0, plain: 0 });
  });
});

describe("substitutionsFrom", () => {
  const corpus = "We use the tool. We use it again and we use it daily. It helps and it helps a lot.";

  it("names a formal word the writer has never used, when they use the plain one", () => {
    const rows = substitutionsFrom(countPairs(corpus), "We utilise the tool to utilise the data.");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "utilise", formal: "utilise", plain: "use", draftCount: 2 });
    expect(rows[0].profilePlain).toBe(3);
  });

  it("says nothing when the writer does use the formal word themselves", () => {
    const own = countPairs(`${corpus} I utilise it when the mood takes me.`);
    expect(substitutionsFrom(own, "We utilise the tool.")).toEqual([]);
  });

  it("says nothing when there is no evidence of the plain word either", () => {
    // No "use" anywhere in the corpus, so there is nothing to claim they write
    // instead. Silence beats a guess.
    expect(substitutionsFrom(countPairs("Nothing relevant here at all."), "We utilise it.")).toEqual([]);
  });

  it("says nothing when the draft does not use the formal word", () => {
    expect(substitutionsFrom(countPairs(corpus), "We use the tool.")).toEqual([]);
  });

  it("sorts by how often the draft leans on it", () => {
    const counts = countPairs("We use it and we help with it and we start it. Use, help, start.");
    const rows = substitutionsFrom(counts, "We utilise and leverage and leverage and leverage it.");
    expect(rows.map((r) => r.id)).toEqual(["leverage", "utilise"]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd "$WT" && npx vitest run lib/tools/drift/substitutions.test.ts`
Expected: FAIL, cannot resolve `./substitutions`.

- [ ] **Step 3: Write the module**

```ts
// lib/tools/drift/substitutions.ts
import { words } from "./text";

/**
 * The substitutions the visitor's own corpus suggests.
 *
 * No thesaurus, no model, no network. A fixed table of the pairs that actually
 * matter, each side written out as explicit forms, because the alternatives are
 * a stemmer (a dependency and a guess about morphology) and an API call (which
 * would break the promise on the page that nothing leaves the tab).
 *
 * The table on its own would be a lecture. What makes a row evidence is the
 * visitor's own frequency: it is printed only when the draft uses the formal
 * word, their corpus uses it zero times, and their corpus uses the plain word
 * at least once. All three, every time.
 *
 * This is also the whole vocabulary a saved profile keeps: forty-four counters
 * and not one word of the visitor's own text, so a saved profile cannot be read
 * back into anything they wrote.
 *
 * Adding a pair is one entry here and one row in the test. It cannot find a
 * substitution that is not in this list, and the page says so.
 */

export type Pair = {
  /** The first formal form, hyphenated. Used as the report row's key. */
  id: string;
  /** The forms to look for in the draft. First one is the display form. */
  formal: string[];
  /** The forms that count as evidence the writer says it plainly. */
  plain: string[];
};

export const PAIRS: Pair[] = [
  { id: "utilise", formal: ["utilise", "utilises", "utilised", "utilising", "utilize", "utilizes", "utilized", "utilizing"], plain: ["use", "uses", "used", "using"] },
  { id: "leverage", formal: ["leverage", "leverages", "leveraged", "leveraging"], plain: ["help", "helps", "helped", "helping"] },
  { id: "commence", formal: ["commence", "commences", "commenced", "commencing"], plain: ["start", "starts", "started", "starting"] },
  { id: "regarding", formal: ["regarding", "concerning"], plain: ["about"] },
  { id: "delve", formal: ["delve", "delves", "delved", "delving"], plain: ["dig", "digs", "dug", "digging"] },
  { id: "seamless", formal: ["seamless", "seamlessly"], plain: ["smooth", "smoothly"] },
  { id: "robust", formal: ["robust"], plain: ["solid", "sturdy"] },
  { id: "elevate", formal: ["elevate", "elevates", "elevated", "elevating"], plain: ["lift", "lifts", "lifted", "lifting"] },
  { id: "empower", formal: ["empower", "empowers", "empowered", "empowering"], plain: ["let", "lets", "letting"] },
  { id: "streamline", formal: ["streamline", "streamlines", "streamlined", "streamlining"], plain: ["simplify", "simplifies", "simplified", "simplifying"] },
  { id: "furthermore", formal: ["furthermore", "moreover"], plain: ["and", "also"] },
  { id: "thus", formal: ["thus", "hence"], plain: ["so"] },
  { id: "additionally", formal: ["additionally"], plain: ["also"] },
  { id: "numerous", formal: ["numerous"], plain: ["many", "lots"] },
  { id: "obtain", formal: ["obtain", "obtains", "obtained", "obtaining"], plain: ["get", "gets", "got", "getting"] },
  { id: "purchase", formal: ["purchase", "purchases", "purchased", "purchasing"], plain: ["buy", "buys", "bought", "buying"] },
  { id: "sufficient", formal: ["sufficient", "sufficiently"], plain: ["enough"] },
  { id: "demonstrate", formal: ["demonstrate", "demonstrates", "demonstrated", "demonstrating"], plain: ["show", "shows", "showed", "shown", "showing"] },
  { id: "facilitate", formal: ["facilitate", "facilitates", "facilitated", "facilitating"], plain: ["help", "helps", "helped", "helping"] },
  { id: "terminate", formal: ["terminate", "terminates", "terminated", "terminating"], plain: ["end", "ends", "ended", "ending"] },
  { id: "prior-to", formal: ["prior to"], plain: ["before"] },
  { id: "in-order-to", formal: ["in order to"], plain: ["to"] },
];

/** Both counts for one pair, as a saved profile stores them. */
export type PairCounts = Record<string, { formal: number; plain: number }>;

/**
 * How many times any of `forms` appears in `tokens`.
 *
 * Token scanning rather than a regular expression, for two reasons. A regex
 * with a word boundary would need a lookbehind to avoid eating the separator
 * between two adjacent hits, and lookbehind is missing from WebKit before
 * Safari 16.4, which is a real iPhone this site is meant to work on. And
 * multi-word forms ("prior to") are exact over tokens and fiddly over text.
 */
export function countForms(tokens: string[], forms: string[]): number {
  let found = 0;
  for (const form of forms) {
    const parts = form.split(" ");
    for (let i = 0; i + parts.length <= tokens.length; i += 1) {
      let hit = true;
      for (let k = 0; k < parts.length; k += 1) {
        if (tokens[i + k] !== parts[k]) {
          hit = false;
          break;
        }
      }
      if (hit) found += 1;
    }
  }
  return found;
}

/** Both sides of every pair, in one pass over the text. Always a full table. */
export function countPairs(text: string): PairCounts {
  const tokens = words(text);
  const out: PairCounts = {};
  for (const pair of PAIRS) {
    out[pair.id] = {
      formal: countForms(tokens, pair.formal),
      plain: countForms(tokens, pair.plain),
    };
  }
  return out;
}

export type Substitution = {
  id: string;
  /** The word in the draft. */
  formal: string;
  /** The word their own corpus uses instead. */
  plain: string;
  /** How many times the draft uses the formal form. */
  draftCount: number;
  /** How many times their corpus uses the plain form. The evidence. */
  profilePlain: number;
};

/**
 * The rows worth printing, most-leaned-on first.
 *
 * The `counts.formal > 0` guard is the one that keeps this honest: a writer who
 * does say "utilise" gets told nothing about "utilise".
 */
export function substitutionsFrom(pairs: PairCounts, draft: string): Substitution[] {
  const tokens = words(draft);
  const out: Substitution[] = [];
  for (const pair of PAIRS) {
    const draftCount = countForms(tokens, pair.formal);
    if (draftCount === 0) continue;
    const counts = pairs[pair.id] ?? { formal: 0, plain: 0 };
    if (counts.formal > 0) continue;
    if (counts.plain === 0) continue;
    out.push({
      id: pair.id,
      formal: pair.formal[0],
      plain: pair.plain[0],
      draftCount,
      profilePlain: counts.plain,
    });
  }
  return out.sort((a, b) => b.draftCount - a.draftCount || a.id.localeCompare(b.id));
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd "$WT" && npx vitest run lib/tools/drift/substitutions.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
cd "$WT"
git add lib/tools/drift/substitutions.ts lib/tools/drift/substitutions.test.ts
git commit -m "feat(drift): suggest substitutions from the visitor's own frequencies"
```

---

### Task 5: The voice profile

**Files:**
- Create: `lib/tools/drift/profile.ts`
- Test: `lib/tools/drift/profile.test.ts`

**Interfaces:**
- Consumes: `type Reference` from `./corpus` (a **type-only** import, so no corpus code reaches the browser), `words` from `./text`, `rhythmOf`/`punctuationOf`/`joinsOf` and their types from `./signals`, `countPairs` and `type PairCounts` from `./substitutions`
- Produces: `PROFILE_VERSION = 1`, `MIN_PROFILE_WORDS = 1000`, `type VoiceProfile`, `relativeFrequencies(tokens: string[], markers: string[]): Record<string, number>`, `zScores(freq: Record<string, number>, ref: Reference): Record<string, number>`, `profileOf(pieces: string[], ref: Reference): VoiceProfile`

- [ ] **Step 1: Write the failing tests**

```ts
// lib/tools/drift/profile.test.ts
import { describe, it, expect } from "vitest";
import { buildReference } from "./corpus";
import { MIN_PROFILE_WORDS, profileOf, relativeFrequencies, zScores } from "./profile";
import { words } from "./text";

/** Six documents whose "and" and "here" rates vary, so both survive both filters. */
function doc(joins: number): string {
  return Array.from({ length: 40 }, (_, i) =>
    i < joins ? "And the cat was a thing." : "The cat was a thing here.",
  ).join(" ");
}

const ref = buildReference([doc(1), doc(2), doc(3), doc(4), doc(5), doc(6)]);

describe("the fixture reference", () => {
  it("keeps only the two words that vary", () => {
    expect([...ref.markers].sort()).toEqual(["and", "here"]);
  });
});

describe("relativeFrequencies", () => {
  it("divides each marker's count by the total tokens", () => {
    const freq = relativeFrequencies(words("and and here there"), ["and", "here"]);
    expect(freq.and).toBeCloseTo(0.5, 10);
    expect(freq.here).toBeCloseTo(0.25, 10);
  });

  it("gives a marker that never appears a frequency of zero, not undefined", () => {
    expect(relativeFrequencies(words("nothing relevant"), ["and"])).toEqual({ and: 0 });
  });

  it("returns zeroes for an empty token list rather than dividing by zero", () => {
    expect(relativeFrequencies([], ["and", "here"])).toEqual({ and: 0, here: 0 });
  });
});

describe("zScores", () => {
  it("is the distance from the reference mean in reference standard deviations", () => {
    const freq = { and: ref.mean.and + 2 * ref.sd.and, here: ref.mean.here };
    const z = zScores(freq, ref);
    expect(z.and).toBeCloseTo(2, 10);
    expect(z.here).toBeCloseTo(0, 10);
  });

  it("covers every marker and nothing else", () => {
    expect(Object.keys(zScores({}, ref)).sort()).toEqual([...ref.markers].sort());
  });
});

describe("profileOf", () => {
  it("pools the pieces rather than averaging them", () => {
    // Pooled: 2 "and" in 7 tokens. Averaged it would be the mean of 1/2 and 1/5.
    const pooled = profileOf(["and here", "here here and here here"], ref);
    expect(pooled.words).toBe(7);
    expect(pooled.freq.and).toBeCloseTo(2 / 7, 10);
  });

  it("counts the pieces it was given, ignoring blank ones", () => {
    expect(profileOf(["one thing", "   ", "another thing"], ref).pieces).toBe(2);
  });

  it("carries the rhythm, punctuation, joins and pair counts", () => {
    const p = profileOf(["And it works; it does. We use it."], ref);
    expect(p.rhythm.sentences).toBe(2);
    expect(p.punctuation.semicolon).toBeGreaterThan(0);
    expect(p.joins.and).toBeCloseTo(0.5, 10);
    expect(p.pairs.utilise).toEqual({ formal: 0, plain: 1 });
  });

  it("stamps its version, so a stored profile from a later shape is refusable", () => {
    expect(profileOf(["anything at all"], ref).version).toBe(1);
  });

  it("survives an empty profile without producing NaN", () => {
    const empty = profileOf([], ref);
    expect(empty.words).toBe(0);
    expect(empty.pieces).toBe(0);
    for (const value of Object.values(empty.z)) expect(Number.isFinite(value)).toBe(true);
  });

  it("states a floor for a profile worth trusting", () => {
    expect(MIN_PROFILE_WORDS).toBe(1000);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd "$WT" && npx vitest run lib/tools/drift/profile.test.ts`
Expected: FAIL, cannot resolve `./profile`.

- [ ] **Step 3: Write the module**

```ts
// lib/tools/drift/profile.ts
import type { Reference } from "./corpus";
import { joinsOf, punctuationOf, rhythmOf, type Joins, type Punctuation, type Rhythm } from "./signals";
import { countPairs, type PairCounts } from "./substitutions";
import { words } from "./text";

/**
 * A voice profile: everything the tool knows about how somebody writes.
 *
 * `import type { Reference }` and nothing else from `./corpus`, deliberately. A
 * type import is erased at compile time, so this module can run in the browser
 * with the reference table arriving as a plain object from the server. A value
 * import here would drag every article body into the client bundle.
 *
 * The only vocabulary a profile keeps is `pairs`, forty-four counters over the
 * fixed substitution table. There is no field in this type that holds a word
 * the visitor wrote, which is what makes saving one to local storage a small
 * thing rather than a promise to keep their prose safe.
 */

export const PROFILE_VERSION = 1;

/**
 * Below this, a profile is thin enough that the rarer half of the marker set
 * has counts of zero or one and the z-scores mostly report chance. Guessed from
 * how Delta behaves rather than measured here; the tool prints the profile's
 * word count either way so the visitor can weigh it themselves.
 */
export const MIN_PROFILE_WORDS = 1000;

export type VoiceProfile = {
  version: typeof PROFILE_VERSION;
  /** How many samples went in. */
  pieces: number;
  /** Total words across them. */
  words: number;
  /** Relative frequency of each reference marker. */
  freq: Record<string, number>;
  /** The same, as z-scores against the reference population. */
  z: Record<string, number>;
  rhythm: Rhythm;
  punctuation: Punctuation;
  joins: Joins;
  pairs: PairCounts;
};

export function relativeFrequencies(tokens: string[], markers: string[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  const out: Record<string, number> = {};
  for (const marker of markers) {
    out[marker] = tokens.length === 0 ? 0 : (counts.get(marker) ?? 0) / tokens.length;
  }
  return out;
}

export function zScores(freq: Record<string, number>, ref: Reference): Record<string, number> {
  const out: Record<string, number> = {};
  for (const marker of ref.markers) {
    out[marker] = ((freq[marker] ?? 0) - ref.mean[marker]) / ref.sd[marker];
  }
  return out;
}

/**
 * Build a profile from the visitor's samples.
 *
 * The samples are pooled, not averaged. Ten short pieces averaged piece by
 * piece is the mean of ten noisy vectors; the same ten concatenated is one
 * vector with ten times the counts behind it, and that is the steadier of the
 * two by a long way.
 */
export function profileOf(pieces: string[], ref: Reference): VoiceProfile {
  const used = pieces.filter((piece) => piece.trim().length > 0);
  const text = used.join("\n\n");
  const tokens = words(text);
  const freq = relativeFrequencies(tokens, ref.markers);
  return {
    version: PROFILE_VERSION,
    pieces: used.length,
    words: tokens.length,
    freq,
    z: zScores(freq, ref),
    rhythm: rhythmOf(text),
    punctuation: punctuationOf(text),
    joins: joinsOf(text),
    pairs: countPairs(text),
  };
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd "$WT" && npx vitest run lib/tools/drift/profile.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
cd "$WT"
git add lib/tools/drift/profile.ts lib/tools/drift/profile.test.ts
git commit -m "feat(drift): build a pooled voice profile against the reference markers"
```

---

### Task 6: Burrows's Delta and the self-spread

**Files:**
- Create: `lib/tools/drift/delta.ts`
- Test: `lib/tools/drift/delta.test.ts`

**Interfaces:**
- Consumes: `type Reference` from `./corpus`, `profileOf`/`relativeFrequencies`/`zScores`/`type VoiceProfile` from `./profile`, `words` from `./text`
- Produces: `MIN_DELTA_WORDS = 150`, `delta(a: Record<string, number>, b: Record<string, number>, markers: string[]): number`, `deltaOf(profile: VoiceProfile, draft: string, ref: Reference): number`, `type SelfSpread = { pieces: number; min: number; median: number; max: number }`, `selfSpread(pieces: string[], ref: Reference): SelfSpread | null`

- [ ] **Step 1: Write the failing tests**

```ts
// lib/tools/drift/delta.test.ts
import { describe, it, expect } from "vitest";
import { buildReference } from "./corpus";
import { MIN_DELTA_WORDS, delta, deltaOf, selfSpread } from "./delta";
import { profileOf } from "./profile";
import { wordCount } from "./text";

function doc(joins: number): string {
  return Array.from({ length: 40 }, (_, i) =>
    i < joins ? "And the cat was a thing." : "The cat was a thing here.",
  ).join(" ");
}

const ref = buildReference([doc(1), doc(2), doc(3), doc(4), doc(5), doc(6)]);

describe("the floor", () => {
  it("is 150 words, the length below which a Delta is noise", () => {
    expect(MIN_DELTA_WORDS).toBe(150);
  });

  it("is cleared by the fixture documents, so the fixtures test what they claim", () => {
    expect(wordCount(doc(1))).toBeGreaterThanOrEqual(MIN_DELTA_WORDS);
  });
});

describe("delta", () => {
  it("is zero between a vector and itself", () => {
    expect(delta({ and: 1.5, here: -0.5 }, { and: 1.5, here: -0.5 }, ["and", "here"])).toBe(0);
  });

  it("is the mean absolute difference across the markers", () => {
    expect(delta({ and: 2, here: 0 }, { and: 0, here: 1 }, ["and", "here"])).toBeCloseTo(1.5, 10);
  });

  it("is symmetric", () => {
    const a = { and: 2, here: -1 };
    const b = { and: -0.5, here: 3 };
    expect(delta(a, b, ref.markers)).toBeCloseTo(delta(b, a, ref.markers), 10);
  });

  it("treats a missing marker as zero rather than producing NaN", () => {
    expect(delta({}, { and: 2, here: 0 }, ["and", "here"])).toBeCloseTo(1, 10);
  });

  it("is zero for an empty marker set instead of dividing by zero", () => {
    expect(delta({}, {}, [])).toBe(0);
  });
});

describe("deltaOf", () => {
  it("is zero between a profile and the text it was built from", () => {
    const text = doc(3);
    expect(deltaOf(profileOf([text], ref), text, ref)).toBeCloseTo(0, 12);
  });

  it("grows as the draft moves away from the profile", () => {
    const profile = profileOf([doc(1)], ref);
    const near = deltaOf(profile, doc(2), ref);
    const far = deltaOf(profile, doc(6), ref);
    expect(far).toBeGreaterThan(near);
  });
});

describe("selfSpread", () => {
  it("returns null with fewer than two samples over the floor", () => {
    expect(selfSpread([], ref)).toBeNull();
    expect(selfSpread([doc(1)], ref)).toBeNull();
    expect(selfSpread([doc(1), "too short to count"], ref)).toBeNull();
  });

  it("measures each sample against a profile built from the others", () => {
    const spread = selfSpread([doc(1), doc(3), doc(6)], ref);
    expect(spread).not.toBeNull();
    expect(spread?.pieces).toBe(3);
    expect(spread?.min).toBeLessThanOrEqual(spread?.median ?? 0);
    expect(spread?.median).toBeLessThanOrEqual(spread?.max ?? 0);
    expect(spread?.min).toBeGreaterThan(0);
  });

  it("is a range of their own writing, not a threshold anybody invented", () => {
    // Six near-identical samples sit closer together than three spread ones.
    const tight = selfSpread([doc(3), doc(3), doc(3)], ref);
    const loose = selfSpread([doc(1), doc(3), doc(6)], ref);
    expect(tight?.max ?? 1).toBeLessThan(loose?.max ?? 0);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd "$WT" && npx vitest run lib/tools/drift/delta.test.ts`
Expected: FAIL, cannot resolve `./delta`.

- [ ] **Step 3: Write the module**

```ts
// lib/tools/drift/delta.ts
import type { Reference } from "./corpus";
import { profileOf, relativeFrequencies, zScores, type VoiceProfile } from "./profile";
import { words } from "./text";

/**
 * Burrows's Delta.
 *
 * For a marker set M with reference mean mu(w) and standard deviation sigma(w)
 * taken across the reference corpus's documents:
 *
 *     f(w, t)     = count of w in t / total words in t
 *     z(w, t)     = (f(w, t) - mu(w)) / sigma(w)
 *     Delta(a, b) = (1 / |M|) * sum over w in M of |z(w, a) - z(w, b)|
 *
 * It is a distance and not a verdict. Two texts with a small Delta use the
 * commonest words at similar rates. That is the whole claim. It says nothing
 * about who wrote either one, nothing about whether either is any good, and
 * nothing whatsoever about meaning.
 */

/**
 * The floor.
 *
 * Under 150 words most markers have a count of zero or one, so the z-score is
 * reporting whether a word happened to occur at all rather than how often
 * somebody reaches for it. The tool refuses to print a distance below this and
 * says why, which is the whole reason the constant is exported rather than
 * buried in a comparison.
 */
export const MIN_DELTA_WORDS = 150;

/** Mean absolute difference between two z-score vectors over the markers. */
export function delta(
  a: Record<string, number>,
  b: Record<string, number>,
  markers: string[],
): number {
  if (markers.length === 0) return 0;
  let total = 0;
  for (const marker of markers) total += Math.abs((a[marker] ?? 0) - (b[marker] ?? 0));
  return total / markers.length;
}

/** The distance from a profile to one draft. */
export function deltaOf(profile: VoiceProfile, draft: string, ref: Reference): number {
  const z = zScores(relativeFrequencies(words(draft), ref.markers), ref);
  return delta(profile.z, z, ref.markers);
}

export type SelfSpread = {
  /** How many samples were long enough to take part. */
  pieces: number;
  min: number;
  median: number;
  max: number;
};

/**
 * How far the visitor's own pieces sit from each other.
 *
 * This exists so the tool never has to invent a threshold. A calibrated band
 * ("over 1.5 means it is not you") would need a measurement nobody here has
 * taken, and printing one would be exactly the unearned confidence this whole
 * tool argues against. Instead: leave one piece out, build a profile from the
 * rest, measure the piece against it, and repeat. The result is the range their
 * own writing already occupies, and the draft's Delta is printed beside it.
 *
 * Samples under the floor are dropped rather than measured, and fewer than two
 * survivors returns null, because a range needs two points.
 */
export function selfSpread(pieces: string[], ref: Reference): SelfSpread | null {
  const usable = pieces.filter((piece) => words(piece).length >= MIN_DELTA_WORDS);
  if (usable.length < 2) return null;

  const values: number[] = [];
  for (let i = 0; i < usable.length; i += 1) {
    const rest = usable.filter((_, j) => j !== i);
    values.push(deltaOf(profileOf(rest, ref), usable[i], ref));
  }
  values.sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  const median =
    values.length % 2 === 1 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
  return { pieces: usable.length, min: values[0], median, max: values[values.length - 1] };
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd "$WT" && npx vitest run lib/tools/drift/delta.test.ts`
Expected: PASS, 12 tests.

One assertion is a prediction: `spread?.min` greater than zero on three different fixture documents. If it comes back exactly zero, the fixtures are not varying the way the reference thinks they are, and the corpus fixture is the thing to read, not the Delta.

- [ ] **Step 5: Commit**

```bash
cd "$WT"
git add lib/tools/drift/delta.ts lib/tools/drift/delta.test.ts
git commit -m "feat(drift): measure Burrows's Delta and the writer's own spread"
```

---

### Task 7: The report, the floor refusal and the sentences that pull

**Files:**
- Create: `lib/tools/drift/report.ts`
- Test: `lib/tools/drift/report.test.ts`

**Interfaces:**
- Consumes: `type Reference` from `./corpus`, `MIN_DELTA_WORDS`/`deltaOf`/`type SelfSpread` from `./delta`, `relativeFrequencies`/`zScores`/`type VoiceProfile` from `./profile`, `BUCKET_EDGES`/`countEmDashes` from `./signals`, `PAIRS`/`substitutionsFrom`/`type Substitution` from `./substitutions`, `sentences`/`wordCount`/`words` from `./text`
- Produces: `METRIC_KEYS`, `BUCKET_KEYS`, `type MetricKey`, `type MetricRow`, `type ShapeRow`, `type PullReason`, `type SentencePull`, `type DriftReport`, `sentencePulls(profile, draft, ref, limit?)`, `analyse(profile, draft, ref, spread?)`

**What survives the floor and what does not.** Under 150 words `analyse` returns `status: "too-short"` with `delta`, `selfSpread`, `metrics`, `shape` and `pulls` all empty or null. What it still returns is `emDashes` and `substitutions`, because those are counts rather than statistics: two em dashes are two em dashes in a text of any length. Everything that divides by a length is refused.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/tools/drift/report.test.ts
import { describe, it, expect } from "vitest";
import { buildReference } from "./corpus";
import { MIN_DELTA_WORDS } from "./delta";
import { profileOf } from "./profile";
import { BUCKET_KEYS, METRIC_KEYS, analyse, sentencePulls } from "./report";
import { BUCKET_EDGES } from "./signals";
import { wordCount } from "./text";

function doc(joins: number): string {
  return Array.from({ length: 40 }, (_, i) =>
    i < joins ? "And the cat was a thing." : "The cat was a thing here.",
  ).join(" ");
}

const ref = buildReference([doc(1), doc(2), doc(3), doc(4), doc(5), doc(6)]);
const profile = profileOf([doc(1)], ref);

/** 180 words: twenty sentences leaning on "and", ten leaning on "here". */
const draft = [
  ...Array.from({ length: 20 }, () => "And the cat was a thing."),
  ...Array.from({ length: 10 }, () => "The cat was a thing here."),
].join(" ");

describe("the bucket labels", () => {
  it("are derived from the edges, so the two cannot drift apart", () => {
    expect(BUCKET_KEYS).toEqual(["1-8", "9-16", "17-24", "25-32", "33+"]);
    expect(BUCKET_KEYS).toHaveLength(BUCKET_EDGES.length + 1);
  });
});

describe("analyse under the floor", () => {
  const short = "We utilise the thing \u2014 briefly.";

  it("refuses every statistic and says which floor it refused against", () => {
    const report = analyse(profile, short, ref);
    expect(report.status).toBe("too-short");
    expect(report.floor).toBe(MIN_DELTA_WORDS);
    expect(report.words).toBe(wordCount(short));
    expect(report.delta).toBeNull();
    expect(report.selfSpread).toBeNull();
    expect(report.metrics).toEqual([]);
    expect(report.shape).toEqual([]);
    expect(report.pulls).toEqual([]);
  });

  it("still reports the counts, because a count is a count at any length", () => {
    const withPlain = profileOf(["We use it. We use it again. It is used daily."], ref);
    const report = analyse(withPlain, short, ref);
    expect(report.emDashes).toBe(1);
    expect(report.substitutions.map((s) => s.id)).toEqual(["utilise"]);
  });
});

describe("analyse over the floor", () => {
  it("prints a distance and every metric row exactly once, in order", () => {
    const report = analyse(profile, draft, ref);
    expect(report.status).toBe("ok");
    expect(report.words).toBeGreaterThanOrEqual(MIN_DELTA_WORDS);
    expect(report.delta).not.toBeNull();
    expect(Number.isFinite(report.delta ?? NaN)).toBe(true);
    expect(report.metrics.map((m) => m.key)).toEqual([...METRIC_KEYS]);
    expect(report.shape.map((s) => s.key)).toEqual([...BUCKET_KEYS]);
  });

  it("puts the profile and the draft side by side in every row", () => {
    const report = analyse(profile, draft, ref);
    const join = report.metrics.find((m) => m.key === "join-and");
    expect(join?.profile).toBeCloseTo(1 / 40, 10);
    expect(join?.draft).toBeCloseTo(20 / 30, 10);
  });

  it("passes a self-spread through untouched when it is given one", () => {
    const spread = { pieces: 3, min: 0.2, median: 0.4, max: 0.9 };
    expect(analyse(profile, draft, ref, spread).selfSpread).toEqual(spread);
  });
});

describe("sentencePulls", () => {
  it("blames only the sentences carrying words the draft overuses", () => {
    // The draft leans on "and" and uses "here" less than the profile does.
    // A sentence containing an underused word is not the reason it is
    // underused, so it must not be listed at all.
    const pulls = sentencePulls(profile, draft, ref);
    expect(pulls.length).toBeGreaterThan(0);
    for (const pull of pulls) expect(pull.text.startsWith("And")).toBe(true);
  });

  it("ranks by pull and caps the list", () => {
    const pulls = sentencePulls(profile, draft, ref, 3);
    expect(pulls).toHaveLength(3);
    expect(pulls[0].pull).toBeGreaterThanOrEqual(pulls[1].pull);
    expect(pulls[0].pull).toBeGreaterThan(0);
  });

  it("names an em dash, a formal word and an unusually long sentence as reasons", () => {
    const flagged = `${draft} We utilise it \u2014 ${"very ".repeat(40)}slowly.`;
    const pulls = sentencePulls(profile, flagged, ref, 30);
    const last = pulls.find((p) => p.text.includes("utilise"));
    expect(last?.reasons).toContain("em-dash");
    expect(last?.reasons).toContain("substitution");
    expect(last?.reasons).toContain("long");
  });

  it("returns nothing for a draft with no pull and no reasons", () => {
    // Neither marker is overused here: no "and" at all, and no "here" either,
    // so both signed gaps are negative and nothing is attributed.
    expect(sentencePulls(profile, "The cat was a thing.", ref)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd "$WT" && npx vitest run lib/tools/drift/report.test.ts`
Expected: FAIL, cannot resolve `./report`.

- [ ] **Step 3: Write the module**

```ts
// lib/tools/drift/report.ts
import type { Reference } from "./corpus";
import { MIN_DELTA_WORDS, deltaOf, type SelfSpread } from "./delta";
import { relativeFrequencies, zScores, type VoiceProfile } from "./profile";
import { BUCKET_EDGES, countEmDashes, joinsOf, punctuationOf, rhythmOf } from "./signals";
import { PAIRS, substitutionsFrom, type Substitution } from "./substitutions";
import { sentences, wordCount, words } from "./text";

/**
 * One measurement of one draft against one voice profile.
 *
 * The floor is the important part. Under `MIN_DELTA_WORDS` this returns
 * `status: "too-short"` and every statistic is null or empty: no distance, no
 * rates, no attribution. What it still returns is the two things that are
 * counts rather than statistics, em dashes and substitution hits, because two
 * em dashes are two em dashes in a text of any length and refusing to say so
 * would be pedantry rather than rigour.
 *
 * The shape is nullable fields rather than a discriminated union so that one
 * object serialises to JSON for the MCP twin and renders in one component
 * without a branch per field. `status` is still the thing to read first, and
 * the tests pin that every statistic is empty when it says "too-short".
 */

/** Every metric row the report can emit, in the order it prints them. */
export const METRIC_KEYS = [
  "sentence-mean",
  "sentence-sd",
  "short-sentences",
  "long-sentences",
  "em-dash",
  "en-dash",
  "semicolon",
  "exclamation",
  "question",
  "parenthetical",
  "contraction",
  "join-and",
  "join-but",
  "join-so",
] as const;

export type MetricKey = (typeof METRIC_KEYS)[number];

/** Bucket labels, derived from the edges so a change to one changes both. */
export const BUCKET_KEYS: string[] = [
  ...BUCKET_EDGES.map((edge, i) => `${i === 0 ? 1 : BUCKET_EDGES[i - 1] + 1}-${edge}`),
  `${BUCKET_EDGES[BUCKET_EDGES.length - 1] + 1}+`,
];

export type MetricRow = { key: MetricKey; profile: number; draft: number };
export type ShapeRow = { key: string; profile: number; draft: number };

export type PullReason = "em-dash" | "substitution" | "long";

export type SentencePull = {
  /** Position in the draft, so the page can point at it. */
  index: number;
  text: string;
  pull: number;
  reasons: PullReason[];
};

export type DriftReport = {
  status: "ok" | "too-short";
  words: number;
  floor: number;
  /** A count, printed at any length. */
  emDashes: number;
  /** Counts, printed at any length. */
  substitutions: Substitution[];
  delta: number | null;
  selfSpread: SelfSpread | null;
  metrics: MetricRow[];
  shape: ShapeRow[];
  pulls: SentencePull[];
};

/**
 * Which sentences carry the drift.
 *
 * Not a Delta per sentence. A sentence is far too short for one, and printing a
 * per-sentence Delta would be the exact error this tool exists to argue
 * against. This attributes the whole-text gap instead: for each marker, take
 * the signed gap between the draft's z-score and the profile's, keep only the
 * positive ones (the words the draft uses **more**), and give each sentence the
 * sum of those contributions over the marker words it contains.
 *
 * The sign matters. A word the draft underuses cannot be blamed on a sentence
 * that happens to contain it; the absence lives in the sentences that do not,
 * which is not a sentence-level fact at all. Taking the absolute value here
 * would list innocent sentences and read convincing while doing it.
 *
 * `reasons` are separate from `pull` on purpose: they are flags, not scores,
 * and mixing them into one number would invent a unit. The `substitution` flag
 * only catches single-word formal forms, so "prior to" is missed here while
 * still appearing in the report's substitution rows.
 */
export function sentencePulls(
  profile: VoiceProfile,
  draft: string,
  ref: Reference,
  limit = 5,
): SentencePull[] {
  const draftZ = zScores(relativeFrequencies(words(draft), ref.markers), ref);
  const over: Record<string, number> = {};
  for (const marker of ref.markers) {
    const gap = draftZ[marker] - profile.z[marker];
    if (gap > 0) over[marker] = gap / ref.markers.length;
  }

  const formal = new Set(PAIRS.flatMap((pair) => pair.formal).filter((form) => !form.includes(" ")));
  const longFloor = profile.rhythm.meanWords + 2 * profile.rhythm.sdWords;

  return sentences(draft)
    .map((sentence, index) => {
      let pull = 0;
      for (const word of sentence.words) pull += over[word] ?? 0;
      const reasons: PullReason[] = [];
      if (sentence.text.includes("\u2014")) reasons.push("em-dash");
      if (sentence.words.some((word) => formal.has(word))) reasons.push("substitution");
      if (profile.rhythm.sentences > 0 && sentence.words.length > longFloor) reasons.push("long");
      return { index, text: sentence.text, pull, reasons };
    })
    .filter((sentence) => sentence.pull > 0 || sentence.reasons.length > 0)
    .sort((a, b) => b.pull - a.pull || a.index - b.index)
    .slice(0, limit);
}

export function analyse(
  profile: VoiceProfile,
  draft: string,
  ref: Reference,
  spread: SelfSpread | null = null,
): DriftReport {
  const count = wordCount(draft);
  const base = {
    words: count,
    floor: MIN_DELTA_WORDS,
    emDashes: countEmDashes(draft),
    substitutions: substitutionsFrom(profile.pairs, draft),
  };

  if (count < MIN_DELTA_WORDS) {
    return {
      ...base,
      status: "too-short",
      delta: null,
      selfSpread: null,
      metrics: [],
      shape: [],
      pulls: [],
    };
  }

  const rhythm = rhythmOf(draft);
  const punctuation = punctuationOf(draft);
  const joins = joinsOf(draft);
  const last = profile.rhythm.buckets.length - 1;

  const metrics: MetricRow[] = [
    { key: "sentence-mean", profile: profile.rhythm.meanWords, draft: rhythm.meanWords },
    { key: "sentence-sd", profile: profile.rhythm.sdWords, draft: rhythm.sdWords },
    { key: "short-sentences", profile: profile.rhythm.buckets[0], draft: rhythm.buckets[0] },
    { key: "long-sentences", profile: profile.rhythm.buckets[last], draft: rhythm.buckets[last] },
    { key: "em-dash", profile: profile.punctuation.emDash, draft: punctuation.emDash },
    { key: "en-dash", profile: profile.punctuation.enDash, draft: punctuation.enDash },
    { key: "semicolon", profile: profile.punctuation.semicolon, draft: punctuation.semicolon },
    { key: "exclamation", profile: profile.punctuation.exclamation, draft: punctuation.exclamation },
    { key: "question", profile: profile.punctuation.question, draft: punctuation.question },
    { key: "parenthetical", profile: profile.punctuation.parenthetical, draft: punctuation.parenthetical },
    { key: "contraction", profile: profile.punctuation.contraction, draft: punctuation.contraction },
    { key: "join-and", profile: profile.joins.and, draft: joins.and },
    { key: "join-but", profile: profile.joins.but, draft: joins.but },
    { key: "join-so", profile: profile.joins.so, draft: joins.so },
  ];

  return {
    ...base,
    status: "ok",
    delta: deltaOf(profile, draft, ref),
    selfSpread: spread,
    metrics,
    shape: BUCKET_KEYS.map((key, i) => ({
      key,
      profile: profile.rhythm.buckets[i] ?? 0,
      draft: rhythm.buckets[i] ?? 0,
    })),
    pulls: sentencePulls(profile, draft, ref),
  };
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd "$WT" && npx vitest run lib/tools/drift/report.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
cd "$WT"
git add lib/tools/drift/report.ts lib/tools/drift/report.test.ts
git commit -m "feat(drift): assemble the report and refuse a distance under the floor"
```

---

### Task 8: Saving, and the promise about what is saved

**Files:**
- Create: `lib/tools/drift/storage.ts`
- Test: `lib/tools/drift/storage.test.ts`

**Interfaces:**
- Consumes: `OWNED_PREFIX` from `@/lib/forget` (F2), `PROFILE_VERSION`/`type VoiceProfile` from `./profile`, `type SelfSpread` from `./delta`
- Produces: `DRIFT_PROFILE_KEY = "fergusos:drift-profile"`, `SAVED_VERSION = 1`, `type SavedProfile = { version: 1; savedAt: string; profile: VoiceProfile; spread: SelfSpread | null }`, `serialiseProfile(profile, spread, savedAt): string`, `parseProfile(value: unknown): SavedProfile | null`

`parseProfile` takes `unknown` and accepts either the JSON string local storage holds or the object the MCP tool is handed, so the browser and the server validate identically. Anything it does not fully recognise is `null`, never a partly-built object: a half-valid profile would produce numbers that look fine and mean nothing.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/tools/drift/storage.test.ts
import { describe, it, expect } from "vitest";
import { OWNED_PREFIX, isOwnedKey } from "@/lib/forget";
import { buildReference } from "./corpus";
import { profileOf } from "./profile";
import { DRIFT_PROFILE_KEY, parseProfile, serialiseProfile } from "./storage";

function doc(joins: number): string {
  return Array.from({ length: 40 }, (_, i) =>
    i < joins ? "And the cat was a thing." : "The cat was a thing here.",
  ).join(" ");
}

const ref = buildReference([doc(1), doc(2), doc(3), doc(4), doc(5), doc(6)]);
const profile = profileOf([doc(3)], ref);
const spread = { pieces: 2, min: 0.1, median: 0.2, max: 0.3 };
const saved = serialiseProfile(profile, spread, "2026-09-03T12:00:00.000Z");

describe("the key", () => {
  it("is the one forget already knows about", () => {
    expect(DRIFT_PROFILE_KEY).toBe(`${OWNED_PREFIX}drift-profile`);
    expect(isOwnedKey(DRIFT_PROFILE_KEY)).toBe(true);
  });
});

describe("round trip", () => {
  it("parses back to the same numbers from the string", () => {
    const back = parseProfile(saved);
    expect(back?.profile.freq).toEqual(profile.freq);
    expect(back?.profile.z).toEqual(profile.z);
    expect(back?.spread).toEqual(spread);
    expect(back?.savedAt).toBe("2026-09-03T12:00:00.000Z");
  });

  it("parses an already-decoded object, which is how the MCP tool is handed one", () => {
    expect(parseProfile(JSON.parse(saved))?.profile.words).toBe(profile.words);
  });

  it("accepts a profile with no spread", () => {
    expect(parseProfile(serialiseProfile(profile, null, "2026-09-03T12:00:00.000Z"))?.spread).toBeNull();
  });
});

describe("refusals", () => {
  const cases: [string, unknown][] = [
    ["not JSON at all", "{{{"],
    ["not an object", 42],
    ["null", null],
    ["a wrong envelope version", { ...JSON.parse(saved), version: 2 }],
    ["a wrong profile version", { ...JSON.parse(saved), profile: { ...profile, version: 9 } }],
    ["a missing savedAt", { ...JSON.parse(saved), savedAt: undefined }],
    ["a non-numeric frequency", { ...JSON.parse(saved), profile: { ...profile, freq: { and: "lots" } } }],
    ["a NaN z-score", { ...JSON.parse(saved), profile: { ...profile, z: { and: Number.NaN } } }],
    ["a missing rhythm", { ...JSON.parse(saved), profile: { ...profile, rhythm: undefined } }],
    ["buckets that are not numbers", { ...JSON.parse(saved), profile: { ...profile, rhythm: { ...profile.rhythm, buckets: ["a"] } } }],
    ["a malformed pair count", { ...JSON.parse(saved), profile: { ...profile, pairs: { utilise: { formal: 1 } } } }],
  ];

  it.each(cases)("returns null for %s", (_name, value) => {
    expect(parseProfile(value)).toBeNull();
  });
});

describe("what a saved profile contains", () => {
  /**
   * The page promises the saved profile is counts, not prose. This walks the
   * serialised object and asserts the only string VALUE in it is the timestamp.
   * Object keys are marker words from this site's own corpus and the fixed pair
   * ids, so no word the visitor wrote is stored on either side of the colon.
   */
  function stringPaths(value: unknown, path = ""): string[] {
    if (typeof value === "string") return [path];
    if (Array.isArray(value)) return value.flatMap((v, i) => stringPaths(v, `${path}[${i}]`));
    if (value !== null && typeof value === "object") {
      return Object.entries(value).flatMap(([k, v]) => stringPaths(v, path ? `${path}.${k}` : k));
    }
    return [];
  }

  it("stores no free text at all", () => {
    const withProse = profileOf(["My private notes about a thing nobody should read. " + doc(2)], ref);
    const json = JSON.parse(serialiseProfile(withProse, null, "2026-09-03T12:00:00.000Z"));
    expect(stringPaths(json)).toEqual(["savedAt"]);
  });

  it("is small enough to sit in local storage without thinking about it", () => {
    expect(saved.length).toBeLessThan(200_000);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd "$WT" && npx vitest run lib/tools/drift/storage.test.ts`
Expected: FAIL, cannot resolve `./storage`.

- [ ] **Step 3: Write the module**

```ts
// lib/tools/drift/storage.ts
import { OWNED_PREFIX } from "@/lib/forget";
import type { SelfSpread } from "./delta";
import { PROFILE_VERSION, type VoiceProfile } from "./profile";

/**
 * Saving a profile, and the promise that goes with it.
 *
 * The key is built from `OWNED_PREFIX`, never retyped, because `forget` finds
 * what it wipes by that prefix and a hand-typed literal that drifted by one
 * character would leave a key on somebody's machine that the site claims to
 * have removed. `lib/forget.test.ts` already asserts this exact key is owned.
 *
 * Nothing here writes. The component writes, once, in the handler behind the
 * save button, because the constitution now says the site keeps only what the
 * visitor explicitly saved.
 *
 * `parseProfile` takes `unknown` so the browser (which has a string) and the
 * MCP tool (which has an object) validate through the same function, and it
 * returns null rather than a partly-built object: half a profile produces
 * numbers that look fine and mean nothing.
 */

export const DRIFT_PROFILE_KEY = `${OWNED_PREFIX}drift-profile`;

export const SAVED_VERSION = 1;

export type SavedProfile = {
  version: typeof SAVED_VERSION;
  /** ISO timestamp, the only free-form string in the whole record. */
  savedAt: string;
  profile: VoiceProfile;
  spread: SelfSpread | null;
};

export function serialiseProfile(
  profile: VoiceProfile,
  spread: SelfSpread | null,
  savedAt: string,
): string {
  const record: SavedProfile = { version: SAVED_VERSION, savedAt, profile, spread };
  return JSON.stringify(record);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  return isObject(value) && Object.values(value).every(isFiniteNumber);
}

function hasNumbers(value: unknown, keys: string[]): boolean {
  return isObject(value) && keys.every((key) => isFiniteNumber(value[key]));
}

function isProfile(value: unknown): value is VoiceProfile {
  if (!isObject(value)) return false;
  if (value.version !== PROFILE_VERSION) return false;
  if (!hasNumbers(value, ["pieces", "words"])) return false;
  if (!isNumberRecord(value.freq) || !isNumberRecord(value.z)) return false;
  const rhythm = value.rhythm;
  if (!hasNumbers(rhythm, ["sentences", "meanWords", "sdWords"])) return false;
  if (!isObject(rhythm) || !Array.isArray(rhythm.buckets) || !rhythm.buckets.every(isFiniteNumber)) {
    return false;
  }
  const punctuation = ["emDash", "enDash", "semicolon", "exclamation", "question", "parenthetical", "contraction"];
  if (!hasNumbers(value.punctuation, punctuation)) return false;
  if (!hasNumbers(value.joins, ["and", "but", "so", "any"])) return false;
  if (!isObject(value.pairs)) return false;
  return Object.values(value.pairs).every((counts) => hasNumbers(counts, ["formal", "plain"]));
}

function isSpread(value: unknown): value is SelfSpread {
  return hasNumbers(value, ["pieces", "min", "median", "max"]);
}

export function parseProfile(value: unknown): SavedProfile | null {
  let decoded: unknown = value;
  if (typeof value === "string") {
    try {
      decoded = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!isObject(decoded)) return null;
  if (decoded.version !== SAVED_VERSION) return null;
  if (typeof decoded.savedAt !== "string" || decoded.savedAt.length === 0) return null;
  if (!isProfile(decoded.profile)) return null;
  if (decoded.spread !== null && decoded.spread !== undefined && !isSpread(decoded.spread)) {
    return null;
  }
  return {
    version: SAVED_VERSION,
    savedAt: decoded.savedAt,
    profile: decoded.profile,
    spread: isSpread(decoded.spread) ? decoded.spread : null,
  };
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd "$WT" && npx vitest run lib/tools/drift/storage.test.ts`
Expected: PASS, 17 tests (six named cases plus the eleven refusals).

- [ ] **Step 5: Run the whole suite and the type checker**

```bash
cd "$WT"
npx tsc --noEmit && npm test -- --reporter=dot 2>&1 | tail -3
```

Expected: `tsc` silent, and the baseline count from Task 0 plus everything added since. What this proves: the seven pure modules type-check together and nothing already in the repo broke. What it cannot see: anything about React, the page, or the browser.

- [ ] **Step 6: Commit**

```bash
cd "$WT"
git add lib/tools/drift/storage.ts lib/tools/drift/storage.test.ts
git commit -m "feat(drift): save a profile as counts under the forget-owned key"
```

---

### Task 9: The registry entry, the copy and the worked example

**Files:**
- Create: `content/tools/drift.ts`
- Test: `content/tools/drift.test.ts`
- Modify: `content/tools/index.ts` (one import line, one array entry)
- Modify: `content/voice.test.ts` (the `prose` array)

**Interfaces:**
- Consumes: `type ToolEntry` from `./types`; `METRIC_KEYS`, `type MetricKey`, `type PullReason` from `@/lib/tools/drift/report`
- Produces: `drift: ToolEntry`, `driftCopy` (every string on the route, including `metricLabels: Record<MetricKey, string>` and `reasonLabels: Record<PullReason, string>`), `driftDemo: { draft: string }`

Everything in this folder is one file per tool, because F3's registry test reads the directory and fails on a file it did not register. So the entry, the copy and the demo specimen all live in `content/tools/drift.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
// content/tools/drift.test.ts
import { describe, it, expect } from "vitest";
import { METRIC_KEYS } from "@/lib/tools/drift/report";
import { PAIRS } from "@/lib/tools/drift/substitutions";
import { MIN_DELTA_WORDS } from "@/lib/tools/drift/delta";
import { wordCount } from "@/lib/tools/drift/text";
import { toolBySlug } from "./index";
import { drift, driftCopy, driftDemo } from "./drift";

describe("the registry entry", () => {
  it("is registered and live", () => {
    expect(toolBySlug("drift")).toBe(drift);
    expect(drift.status).toBe("live");
    expect(drift.privacy).toBe("browser");
  });

  it("says what it is not, first, because that is the whole framing", () => {
    // The blurb is the lede `ToolPage` renders straight under the heading, so
    // this sentence is the first line of body copy on the page.
    expect(drift.blurb.startsWith("This is not an AI detector.")).toBe(true);
  });

  it("names the four things it cannot see", () => {
    const joined = drift.cantSee.join(" ").toLowerCase();
    expect(joined).toContain("meaning");
    expect(joined).toContain("register");
    expect(joined).toContain("150 words");
    expect(joined).toContain("praise");
  });
});

describe("the copy", () => {
  it("has a label for every metric the report can emit, and no orphans", () => {
    expect(Object.keys(driftCopy.metricLabels).sort()).toEqual([...METRIC_KEYS].sort());
  });

  it("has a label for every pull reason", () => {
    expect(Object.keys(driftCopy.reasonLabels).sort()).toEqual(["em-dash", "long", "substitution"]);
  });

  it("names the reference population, because a Delta without one is not a distance", () => {
    expect(driftCopy.referenceNote).toContain("/writing");
  });

  it("says the substitution list is fixed and how long it is", () => {
    expect(driftCopy.substitutionNote).toContain(String(PAIRS.length));
  });

  it("quotes the floor from the constant rather than retyping it", () => {
    expect(driftCopy.tooShort).toContain(String(MIN_DELTA_WORDS));
  });
});

describe("the demo draft", () => {
  it("clears the floor, so the worked example shows a real distance", () => {
    expect(wordCount(driftDemo.draft)).toBeGreaterThan(MIN_DELTA_WORDS);
  });

  it("carries the em dashes it is meant to demonstrate", () => {
    // Deliberately outside the house-style lint: it is a specimen of the thing
    // the lint exists to stop, written with escapes so the source-tree scan in
    // `content/voice.test.ts` stays green. If this ever reads zero, somebody
    // has tidied the demo and taken its point with it.
    expect([...driftDemo.draft.matchAll(/\u2014/g)]).toHaveLength(2);
  });

  it("uses words the site's own corpus never uses", () => {
    for (const word of ["utilise", "leverage", "seamless", "delve"]) {
      expect(driftDemo.draft.toLowerCase(), word).toContain(word);
    }
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd "$WT" && npx vitest run content/tools/drift.test.ts`
Expected: FAIL, cannot resolve `./drift`.

- [ ] **Step 3: Write the content file**

```ts
// content/tools/drift.ts
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
    "Whether the writing is any good. A low distance means the commonest words turn up at similar rates. That is not praise, and it is not a verdict on the draft.",
    "A substitution that is not on its list. The near-synonyms come from a fixed table written into this page, not from a dictionary and not from a model.",
  ],
  status: "live",
  order: 20,
};

export const driftCopy = {
  samplesLabel: "Things you wrote",
  samplesHint:
    "Ten pieces is plenty. Paste them one after another with a line of three dashes between them. A thousand words in total is where the numbers start to settle.",
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

  profileColumn: "You",
  draftColumn: "This draft",

  noProfile: "Build a profile first, or use the worked example below.",
  noSamples: "Nothing to build a profile from yet. Paste something you wrote.",
  thinProfile:
    "That is a thin profile. Under a thousand words the rarer half of the marker words appear once or not at all, and the distance moves around on nothing.",
  tooShort:
    "Under 150 words, a distance is noise: most of the marker words appear once or not at all, so the number would be reporting chance. Counts still hold, and they are below.",
  noPulls: "No sentence stands out. The draft is spread evenly against your profile.",
  noSubstitutions: "Nothing on the list. Every word it checks for, you use yourself.",

  savedNote: "Saved on this machine only. The terminal's forget command wipes it.",
  droppedNote: "Deleted. Nothing of yours is left in this browser.",
  neverSaved: "Nothing is saved unless you press save.",

  demoNote:
    "A worked example, so this page is not an empty form. The profile is my own writing, the articles at /writing. The draft is one of my paragraphs rewritten the way a model tends to rewrite things.",
  referenceNote:
    "The distance is Burrows's Delta. It needs a reference population to be a distance from, and this one is my own writing: the articles at /writing, as plain text. Naming it is the honest part.",
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
```

- [ ] **Step 4: Register it**

In `content/tools/index.ts`, add the import above `headlineCheck` (the lines are alphabetical and F3's test checks that):

```ts
import { drift } from "./drift";
```

and put it in the array:

```ts
const entries: ToolEntry[] = [drift, headlineCheck];
```

- [ ] **Step 5: Put the copy under the house-style lint**

In `content/voice.test.ts`, add to the imports:

```ts
import { driftCopy } from "@/content/tools/drift";
```

and extend the `prose` array, after the tool entries F3 added:

```ts
    // Every visible string on /tools/drift except the demo draft, which is a
    // specimen of bad house style on purpose: linting the exhibit would be
    // linting the point. `content/tools/drift.test.ts` guards it instead.
    ...Object.entries(driftCopy)
      .filter(([, value]) => typeof value === "string")
      .map(([key, value]) => ({ where: `driftCopy.${key}`, text: value as string })),
    ...Object.entries(driftCopy.metricLabels).map(([key, value]) => ({
      where: `driftCopy.metricLabels.${key}`,
      text: value,
    })),
```

- [ ] **Step 6: Run the lint, the registry and the new tests**

```bash
cd "$WT"
npx vitest run content/tools/drift.test.ts content/tools/index.test.ts content/voice.test.ts
```

Expected: PASS on all three. If the British-spelling rule fails on a copy string, fix the string, never the regex. If the registry test fails on "has a page behind it", that is expected until Task 10 creates `app/tools/drift/page.tsx`: run the other two now and come back to `content/tools/index.test.ts` at the end of Task 10.

- [ ] **Step 7: Commit**

```bash
cd "$WT"
git add content/tools/drift.ts content/tools/drift.test.ts content/tools/index.ts content/voice.test.ts
git commit -m "feat(drift): register the tool and write its copy and worked example"
```

---

### Task 10: The page

**Files:**
- Create: `app/tools/drift/page.tsx`
- Create: `app/tools/drift/DriftTool.tsx`
- Create: `app/tools/drift/tool.css`
- Test: `app/tools/drift/page.test.ts`

**Interfaces:**
- Consumes: `ToolPage` (F3), `drift`/`driftCopy`/`driftDemo`, every `lib/tools/drift/*` module, `trackToolRun` from `@/lib/tools/events` (F3), `useSystem` from `@/components/system/SystemProvider`
- Produces: the route `/tools/drift`, which the sitemap and `/llms.txt` pick up on their own through `liveTools`

**The split, and why it is where it is.** `page.tsx` is a server component and the only thing that touches `lib/tools/drift/corpus.ts`. It builds the reference table once (at build time, the route being static) and passes it down as a prop: about a hundred words and two hundred numbers in the RSC payload, instead of sixty kilobytes of article bodies in the client bundle. It also computes the worked example there, so the first paint already has a filled-in report and the page is never an empty shell. `DriftTool.tsx` imports the reference **as a type only**, and the coupling test in this task fails if that ever becomes a value import.

- [ ] **Step 1: Write the failing coupling tests**

```ts
// app/tools/drift/page.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { liveTools } from "@/content/tools";

/**
 * Coupling checks, not behaviour tests.
 *
 * Vitest runs in a node environment with no DOM (`vitest.config.ts`), so React
 * cannot be mounted here. These assert on the source text instead, in the shape
 * of `lib/boot.test.ts`. Comments are stripped first, so prose about a call
 * cannot satisfy a check for the call.
 */
function read(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), "utf8").replace(/\/\*[\s\S]*?\*\//g, " ");
}

const page = read("app", "tools", "drift", "page.tsx");
const tool = read("app", "tools", "drift", "DriftTool.tsx");
const css = read("app", "tools", "drift", "tool.css");

describe("the page", () => {
  it("renders through the shared tool shell", () => {
    expect(page).toContain('from "@/components/tools/ToolPage"');
    expect(page).toMatch(/<ToolPage[\s\S]*tool=\{drift\}/);
  });

  it("imports its own stylesheet and never touches globals.css", () => {
    expect(page).toContain('import "./tool.css"');
    expect(css).toMatch(/\.drift__/);
  });

  it("builds the reference and the worked example once, at module scope", () => {
    expect(page).toMatch(/^const reference = /m);
    expect(page).toMatch(/^const demoReport = /m);
    expect(page).toContain("analyse(");
  });

  it("is listed as a live tool, so the sitemap and llms.txt pick it up", () => {
    expect(liveTools.map((t) => t.slug)).toContain("drift");
  });
});

describe("the client component", () => {
  it("is a client component", () => {
    expect(tool.startsWith('"use client"')).toBe(true);
  });

  it("never pulls the corpus into the browser bundle", () => {
    // A value import here would drag every article body into the client chunk.
    // The reference arrives as a prop; the type is erased at compile time.
    expect(tool).toContain('import type { Reference } from "@/lib/tools/drift/corpus"');
    expect(tool).not.toMatch(/import \{[^}]*\} from "@\/lib\/tools\/drift\/corpus"/);
    expect(tool).not.toContain('from "@/content/articles"');
  });

  it("writes to local storage exactly once, in the save handler", () => {
    // The constitution's new clause: only what the visitor explicitly saved.
    // One setItem, and it is inside onSave, is the whole enforcement.
    expect([...tool.matchAll(/localStorage\.setItem/g)]).toHaveLength(1);
    expect(tool).toMatch(/function onSave\(\)[\s\S]*?localStorage\.setItem\(DRIFT_PROFILE_KEY/);
  });

  it("reads and clears the same key it writes", () => {
    expect(tool).toContain("localStorage.getItem(DRIFT_PROFILE_KEY)");
    expect(tool).toContain("localStorage.removeItem(DRIFT_PROFILE_KEY)");
    expect(tool).not.toMatch(/"fergusos:/);
  });

  it("records a run without the text", () => {
    // `tool_run` carries the slug, the outcome and the milliseconds. Not the
    // draft, not the samples, not a hash of either (F3's whitelist).
    const sent = tool.match(/trackToolRun\(\{[\s\S]*?\}\);/)?.[0] ?? "";
    expect(sent).toContain('tool: "drift"');
    expect(sent).toContain("outcome:");
    expect(sent).toContain("ms:");
    expect(sent).not.toContain("draft");
    expect(sent).not.toContain("samples");
  });
});

describe("the stylesheet", () => {
  it("keeps inputs at 16px, which is what stops iOS zooming on focus", () => {
    expect(css).toMatch(/\.drift__input\s*\{[^}]*font-size:\s*16px/);
  });

  it("never dims its text with the two tokens that fail on two of the three themes", () => {
    // `app/globals.test.ts` measured it: --green-dim on --bg is 4.67 on green,
    // 4.45 on amber and 4.46 on ice, so it passes on the theme a developer is
    // looking at and fails on the two a visitor reaches with four characters at
    // the terminal. --green-faint is 4.88 on green and worse elsewhere.
    expect(css).not.toMatch(/color:\s*var\(--green-dim\)/);
    expect(css).not.toMatch(/color:\s*var\(--green-faint\)/);
  });

  it("gives every control a 44px floor", () => {
    expect(css).toMatch(/\.drift__button\s*\{[^}]*min-height:\s*44px/);
  });

  it("lets a wide table scroll inside itself rather than the page", () => {
    expect(css).toMatch(/\.drift__scroll\s*\{[^}]*overflow-x:\s*auto/);
  });

  it("gates its one animation behind reduced motion", () => {
    expect(css).toContain("@media (prefers-reduced-motion: no-preference)");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd "$WT" && npx vitest run app/tools/drift/page.test.ts`
Expected: FAIL, `ENOENT` on `app/tools/drift/page.tsx`.

- [ ] **Step 3: Write the server component**

```tsx
// app/tools/drift/page.tsx
import type { Metadata } from "next";
import ToolPage from "@/components/tools/ToolPage";
import { profile } from "@/content/profile";
import { drift, driftDemo } from "@/content/tools/drift";
import { OG_IMAGE, canonical } from "@/lib/seo";
import { selfSpread } from "@/lib/tools/drift/delta";
import { reference as buildReferenceTable, referenceDocuments } from "@/lib/tools/drift/corpus";
import { profileOf } from "@/lib/tools/drift/profile";
import { analyse } from "@/lib/tools/drift/report";
import DriftTool from "./DriftTool";
import "./tool.css";

const PATH = "/tools/drift";

export const metadata: Metadata = {
  title: "Drift",
  description: drift.blurb,
  alternates: canonical(PATH),
  openGraph: {
    title: `Drift \u00b7 ${profile.shortName}`,
    description: drift.blurb,
    type: "website",
    url: PATH,
    images: [OG_IMAGE],
  },
  twitter: { card: "summary_large_image", images: [OG_IMAGE] },
};

/**
 * `/tools/drift`.
 *
 * This is the only module on the route that touches the corpus. It builds the
 * reference table once, here, which happens at build time because the route is
 * static, and hands it to the client as a prop: a hundred words and two hundred
 * numbers, rather than sixty kilobytes of article bodies in the browser bundle.
 *
 * The worked example is computed here too, so the first paint carries a filled
 * report instead of an empty form. Its profile is this site's own writing,
 * which is also the reference population, so the demo shows both halves of the
 * measurement at once: what a writer's own spread looks like, and what a
 * rewrite of one of their paragraphs does to it.
 */
const reference = buildReferenceTable();
const demoDocuments = referenceDocuments();
const demoProfile = profileOf(demoDocuments, reference);
const demoSpread = selfSpread(demoDocuments, reference);
const demoReport = analyse(demoProfile, driftDemo.draft, reference, demoSpread);

export default function DriftPage() {
  return (
    <ToolPage tool={drift}>
      <DriftTool
        reference={reference}
        demoProfile={demoProfile}
        demoSpread={demoSpread}
        demoReport={demoReport}
      />
    </ToolPage>
  );
}
```

- [ ] **Step 4: Write the client component**

```tsx
// app/tools/drift/DriftTool.tsx
"use client";

import { useEffect, useId, useState } from "react";
import { useSystem } from "@/components/system/SystemProvider";
import { driftCopy, driftDemo } from "@/content/tools/drift";
import type { Reference } from "@/lib/tools/drift/corpus";
import { selfSpread, type SelfSpread } from "@/lib/tools/drift/delta";
import { MIN_PROFILE_WORDS, profileOf, type VoiceProfile } from "@/lib/tools/drift/profile";
import { analyse, type DriftReport } from "@/lib/tools/drift/report";
import { DRIFT_PROFILE_KEY, parseProfile, serialiseProfile } from "@/lib/tools/drift/storage";
import { splitPieces } from "@/lib/tools/drift/text";
import { trackToolRun } from "@/lib/tools/events";

/**
 * The tool.
 *
 * Everything here is arithmetic in this tab. There is no action, no fetch and
 * no server call: the reference table arrived as a prop and every function it
 * feeds is pure. That is what lets the privacy line say what it says.
 *
 * Local storage is touched in exactly three places and never on a timer: read
 * once on mount (a profile the visitor saved on a previous visit), written in
 * `onSave`, removed in `onDrop`. `app/tools/drift/page.test.ts` counts the
 * writes, because "saved only if they press save" is a promise and a promise
 * needs a test.
 *
 * Every storage call sits in a try/catch. Safari in private mode throws on
 * `setItem` rather than failing quietly, and a tool that dies on a browser
 * setting is worse than one that cannot remember anything.
 */
export default function DriftTool({
  reference,
  demoProfile,
  demoSpread,
  demoReport,
}: {
  reference: Reference;
  demoProfile: VoiceProfile;
  demoSpread: SelfSpread | null;
  demoReport: DriftReport;
}) {
  const uid = useId();
  const { audio } = useSystem();

  const [samples, setSamples] = useState("");
  const [draft, setDraft] = useState(driftDemo.draft);
  const [profile, setProfile] = useState<VoiceProfile>(demoProfile);
  const [spread, setSpread] = useState<SelfSpread | null>(demoSpread);
  const [report, setReport] = useState<DriftReport>(demoReport);
  const [mine, setMine] = useState(false);
  const [note, setNote] = useState<string>(driftCopy.demoNote);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = parseProfile(window.localStorage.getItem(DRIFT_PROFILE_KEY));
      if (!stored) return;
      setProfile(stored.profile);
      setSpread(stored.spread);
      setSavedAt(stored.savedAt);
      setMine(true);
      setNote(driftCopy.savedNote);
    } catch {
      // Storage blocked. Nothing to restore, and nothing to say about it.
    }
  }, []);

  function onBuild() {
    const pieces = splitPieces(samples);
    if (pieces.length === 0) {
      setNote(driftCopy.noSamples);
      return;
    }
    const built = profileOf(pieces, reference);
    setProfile(built);
    setSpread(selfSpread(pieces, reference));
    setMine(true);
    setSavedAt(null);
    setNote(built.words < MIN_PROFILE_WORDS ? driftCopy.thinProfile : driftCopy.neverSaved);
  }

  function onMeasure() {
    const started = Date.now();
    const next = analyse(profile, draft, reference, spread);
    setReport(next);
    void trackToolRun({
      tool: "drift",
      outcome: next.status === "ok" ? "ok" : "refused",
      ms: Date.now() - started,
    });
  }

  function onSave() {
    const now = new Date().toISOString();
    const record = serialiseProfile(profile, spread, now);
    try {
      window.localStorage.setItem(DRIFT_PROFILE_KEY, record);
      setSavedAt(now);
      setNote(driftCopy.savedNote);
    } catch {
      setNote(driftCopy.neverSaved);
    }
  }

  function onDrop() {
    try {
      window.localStorage.removeItem(DRIFT_PROFILE_KEY);
    } catch {
      // Nothing to do: if it cannot be removed it was never written.
    }
    setSavedAt(null);
    setNote(driftCopy.droppedNote);
  }

  function onDemo() {
    setProfile(demoProfile);
    setSpread(demoSpread);
    setReport(demoReport);
    setDraft(driftDemo.draft);
    setMine(false);
    setNote(driftCopy.demoNote);
  }

  const samplesId = `${uid}-samples`;
  const draftId = `${uid}-draft`;
  const number = (value: number) => value.toFixed(2);

  return (
    <div className="drift">
      <p className="drift__note" role="status">
        {note}
      </p>

      <div className="drift__fields">
        <div className="drift__field">
          <label className="drift__label" htmlFor={samplesId}>
            {driftCopy.samplesLabel}
          </label>
          <p className="drift__hint">{driftCopy.samplesHint}</p>
          <textarea
            id={samplesId}
            className="drift__input"
            rows={8}
            value={samples}
            placeholder={driftCopy.samplesPlaceholder}
            onChange={(e) => setSamples(e.target.value)}
            onKeyDown={() => audio.key()}
          />
          <div className="drift__actions">
            <button type="button" className="drift__button" onClick={onBuild}>
              {driftCopy.build}
            </button>
            <button type="button" className="drift__button" onClick={onSave} disabled={!mine}>
              {driftCopy.save}
            </button>
            <button type="button" className="drift__button" onClick={onDrop} disabled={savedAt === null}>
              {driftCopy.drop}
            </button>
          </div>
        </div>

        <div className="drift__field">
          <label className="drift__label" htmlFor={draftId}>
            {driftCopy.draftLabel}
          </label>
          <p className="drift__hint">{driftCopy.draftHint}</p>
          <textarea
            id={draftId}
            className="drift__input"
            rows={8}
            value={draft}
            placeholder={driftCopy.draftPlaceholder}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={() => audio.key()}
          />
          <div className="drift__actions">
            <button type="button" className="drift__button" onClick={onMeasure}>
              {driftCopy.measure}
            </button>
            <button type="button" className="drift__button" onClick={onDemo}>
              {driftCopy.useDemo}
            </button>
          </div>
        </div>
      </div>

      <section className="drift__report" aria-live="polite">
        <h2 className="drift__heading">{driftCopy.deltaHeading}</h2>
        {report.status === "too-short" ? (
          <p className="drift__refusal">{driftCopy.tooShort}</p>
        ) : (
          <p className="drift__delta">{number(report.delta ?? 0)}</p>
        )}
        <p className="drift__hint">{driftCopy.referenceNote}</p>

        {spread ? (
          <p className="drift__spread">
            {driftCopy.spreadHeading}: {number(spread.min)} to {number(spread.max)}, median{" "}
            {number(spread.median)}, over {spread.pieces} pieces.
          </p>
        ) : null}

        <h2 className="drift__heading">{driftCopy.substitutionsHeading}</h2>
        {report.substitutions.length === 0 ? (
          <p className="drift__hint">{driftCopy.noSubstitutions}</p>
        ) : (
          <ul className="drift__list">
            {report.substitutions.map((row) => (
              <li key={row.id} className="drift__item">
                You have never written &quot;{row.formal}&quot;. You write &quot;{row.plain}&quot;,{" "}
                {row.profilePlain} times. This draft uses &quot;{row.formal}&quot; {row.draftCount}{" "}
                times.
              </li>
            ))}
          </ul>
        )}
        <p className="drift__hint">{driftCopy.substitutionNote}</p>

        {report.status === "ok" ? (
          <>
            <h2 className="drift__heading">{driftCopy.metricsHeading}</h2>
            <div className="drift__scroll">
              <table className="drift__table">
                <thead>
                  <tr>
                    <th scope="col">{driftCopy.metricsHeading}</th>
                    <th scope="col">{driftCopy.profileColumn}</th>
                    <th scope="col">{driftCopy.draftColumn}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.metrics.map((row) => (
                    <tr key={row.key}>
                      <th scope="row">{driftCopy.metricLabels[row.key]}</th>
                      <td>{number(row.profile)}</td>
                      <td>{number(row.draft)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h2 className="drift__heading">{driftCopy.shapeHeading}</h2>
            <div className="drift__scroll">
              <table className="drift__table">
                <thead>
                  <tr>
                    <th scope="col">{driftCopy.shapeHeading}</th>
                    <th scope="col">{driftCopy.profileColumn}</th>
                    <th scope="col">{driftCopy.draftColumn}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.shape.map((row) => (
                    <tr key={row.key}>
                      <th scope="row">{row.key}</th>
                      <td>{number(row.profile)}</td>
                      <td>{number(row.draft)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="drift__hint">{driftCopy.splitterNote}</p>

            <h2 className="drift__heading">{driftCopy.pullsHeading}</h2>
            {report.pulls.length === 0 ? (
              <p className="drift__hint">{driftCopy.noPulls}</p>
            ) : (
              <ol className="drift__list">
                {report.pulls.map((pull) => (
                  <li key={pull.index} className="drift__item">
                    <span className="drift__sentence">{pull.text}</span>
                    <span className="drift__reasons">
                      {pull.reasons.map((reason) => driftCopy.reasonLabels[reason]).join(", ")}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </>
        ) : null}
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Write the stylesheet**

```css
/* app/tools/drift/tool.css */
/* The route's own rules. `app/globals.css` stays the shell's stylesheet
   (design section 2, rule 2), so nothing here appends to it. */

.drift {
  display: grid;
  gap: var(--sp-4);
}

.drift__fields {
  display: grid;
  gap: var(--sp-4);
  grid-template-columns: 1fr;
}

@media (min-width: 900px) {
  .drift__fields {
    grid-template-columns: 1fr 1fr;
  }
}

.drift__label {
  display: block;
  font-weight: 600;
  margin-bottom: 0.25rem;
}

/* `--green`, not `--green-dim`. The dim token measures 4.45 against the
   background on the amber theme and 4.46 on ice, so it passes on the theme a
   developer happens to be looking at and fails on the two a visitor reaches by
   typing four characters at the terminal. `app/globals.test.ts` has the
   numbers. Hint text is still body text. */
.drift__hint {
  color: var(--green);
  margin: 0 0 var(--sp-2);
}

/* 16px exactly. Anything smaller and iOS zooms the viewport on focus, which
   drops the visitor into a horizontally scrolled page they did not ask for. */
.drift__input {
  width: 100%;
  box-sizing: border-box;
  font: inherit;
  font-size: 16px;
  line-height: 1.5;
  color: var(--green);
  background: var(--bg-panel);
  border: 1px solid var(--green-line);
  padding: 0.75rem;
  resize: vertical;
}

.drift__input:focus-visible {
  outline: 2px solid var(--amber);
  outline-offset: 2px;
}

.drift__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

/* 44px is the floor `scripts/phone-check.mjs` fails below. */
.drift__button {
  min-height: 44px;
  min-width: 44px;
  padding: 0 1rem;
  font: inherit;
  font-size: 16px;
  color: var(--green);
  background: transparent;
  border: 1px solid var(--green-line);
  cursor: pointer;
}

.drift__button[disabled] {
  opacity: 0.5;
  cursor: not-allowed;
}

.drift__delta {
  font-size: 2.5rem;
  margin: 0;
}

.drift__refusal,
.drift__note,
.drift__spread {
  margin: 0;
}

/* A wide table scrolls inside its own box. The page body never scrolls
   sideways, which is the thing the phone check fails on. */
.drift__scroll {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.drift__table {
  width: 100%;
  border-collapse: collapse;
  min-width: 20rem;
}

.drift__table th,
.drift__table td {
  text-align: left;
  padding: 0.35rem 0.75rem 0.35rem 0;
  border-bottom: 1px solid var(--green-line);
  white-space: nowrap;
}

.drift__list {
  margin: 0;
  padding-left: 1.25rem;
  display: grid;
  gap: 0.5rem;
}

.drift__sentence {
  display: block;
}

.drift__reasons {
  display: block;
  color: var(--amber);
}

@media (prefers-reduced-motion: no-preference) {
  .drift__delta {
    animation: drift-settle 240ms ease-out both;
  }

  @keyframes drift-settle {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
}
```

- [ ] **Step 6: Run the coupling tests, the registry test and the type checker**

```bash
cd "$WT"
npx vitest run app/tools/drift/page.test.ts content/tools/index.test.ts
npx tsc --noEmit
```

Expected: PASS on both files, `tsc` silent. The registry's "has a page behind it if it is live" case passes now that `page.tsx` exists.

What this proves: the wiring is what the plan says it is, and the types line up. What it cannot see: anything about how the page looks or behaves in a browser. That is Task 13's job, and no claim about rendering is allowed before it.

- [ ] **Step 7: Build, then look at it**

```bash
cd "$WT"
npm run build 2>&1 | tail -8
(npm start > .t1-server.log 2>&1 &)
for i in $(seq 1 30); do curl -sf http://localhost:3000/tools/drift > /dev/null && break; done
curl -s http://localhost:3000/tools/drift | grep -c "This is not an AI detector"
curl -s http://localhost:3000/sitemap.xml | grep -c "/tools/drift"
curl -s http://localhost:3000/llms.txt | grep -ci "drift"
```

Expected: the build succeeds, the first grep returns 1 or more (the lede is server-rendered), and the sitemap and `/llms.txt` both mention the route without either file being edited, which is F3's registry doing its job.

- [ ] **Step 8: Commit**

```bash
cd "$WT"
git add app/tools/drift
git commit -m "feat(drift): add the tool page, its client component and its stylesheet"
```

---

### Task 11: The MCP twin

**Files:**
- Modify: `lib/mcp.ts` (one entry at the end of `TOOLS`, and its imports)
- Modify: `lib/mcp.test.ts` (one `describe`)

**Interfaces:**
- Consumes: `reference` from `@/lib/tools/drift/corpus`, `parseProfile` from `@/lib/tools/drift/storage`, `analyse` from `@/lib/tools/drift/report`, the existing `readString`, `toolError` and `structured` helpers in `lib/mcp.ts`
- Produces: the MCP tool `check_voice`, which `TOOL_NAMES`, `toolDescriptors()`, `/mcp` and `/llms.txt` pick up with no further edits

`lib/mcp.ts` stays pure: no `Request`, no `Response`, no clock, no filesystem. Everything `check_voice` calls is arithmetic over strings, so that holds. The request size is already bounded by `MAX_BODY_BYTES` (256,000), which is the honest bound on the draft; no second cap is added, because two limits with one reason between them is how the wrong one gets edited later.

- [ ] **Step 1: Write the failing tests**

```ts
// appended to lib/mcp.test.ts, after the last tools/call describe
import { buildReference } from "@/lib/tools/drift/corpus";
import { profileOf } from "@/lib/tools/drift/profile";
import { serialiseProfile } from "@/lib/tools/drift/storage";

describe("check_voice", () => {
  function doc(joins: number): string {
    return Array.from({ length: 40 }, (_, i) =>
      i < joins ? "And the cat was a thing." : "The cat was a thing here.",
    ).join(" ");
  }

  const localRef = buildReference([doc(1), doc(2), doc(3), doc(4), doc(5), doc(6)]);
  const saved = JSON.parse(
    serialiseProfile(profileOf([doc(1)], localRef), null, "2026-09-03T12:00:00.000Z"),
  );

  const draft = [
    ...Array.from({ length: 20 }, () => "And the cat was a thing."),
    ...Array.from({ length: 10 }, () => "The cat was a thing here."),
  ].join(" ");

  it("is listed", () => {
    expect(TOOL_NAMES).toContain("check_voice");
  });

  it("measures a draft against a saved profile", () => {
    const result = call("check_voice", { profile: saved, draft });
    const payload = result.structuredContent as Record<string, unknown>;
    expect(payload.status).toBe("ok");
    expect(typeof payload.delta).toBe("number");
    expect(Array.isArray(payload.metrics)).toBe(true);
  });

  it("refuses a distance under the floor and says so in words", () => {
    const result = call("check_voice", { profile: saved, draft: "Short. Far too short." });
    const payload = result.structuredContent as Record<string, unknown>;
    expect(payload.status).toBe("too-short");
    expect(payload.delta).toBeNull();
    expect((result.content[0] as { text: string }).text.toLowerCase()).toContain("150");
  });

  it("names the reference population in the result, because a Delta needs one", () => {
    const payload = call("check_voice", { profile: saved, draft }).structuredContent as {
      reference: { documents: number; totalWords: number; markers: number };
    };
    expect(payload.reference.documents).toBeGreaterThan(0);
    expect(payload.reference.markers).toBeGreaterThan(0);
  });

  it("returns a tool error, not a protocol error, for a profile it does not recognise", () => {
    const result = call("check_voice", { profile: { nope: true }, draft });
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain("Drift profile");
  });

  it("returns a tool error when the draft is missing", () => {
    expect(call("check_voice", { profile: saved }).isError).toBe(true);
  });
});
```

Note that the profile in these tests is built against a **fixture** reference while the tool measures against the **site's** reference. That is deliberate and is exactly what a real caller does: their saved profile carries z-scores computed against whatever reference the page gave them. The tool's own docblock has to say that the two must match, and the next step's description says it in words a model will read.

- [ ] **Step 2: Run it to see it fail**

Run: `cd "$WT" && npx vitest run lib/mcp.test.ts`
Expected: FAIL on `TOOL_NAMES` not containing `check_voice`, and on unknown tool for every `call`.

- [ ] **Step 3: Add the tool**

Add to the imports at the top of `lib/mcp.ts`:

```ts
import { reference as driftReference } from "@/lib/tools/drift/corpus";
import { analyse as analyseDrift } from "@/lib/tools/drift/report";
import { parseProfile as parseDriftProfile } from "@/lib/tools/drift/storage";
```

and append this entry to the `TOOLS` array, after `list_experience`:

```ts
  {
    name: "check_voice",
    title: "Measure a draft against a voice profile",
    description:
      "Burrows's Delta, sentence rhythm, punctuation rates, join rates and substitution hits for a draft against a voice profile saved from /tools/drift. Pass the profile object exactly as that tool exports it. A draft under 150 words gets the counts and no distance, because a Delta under that length reports chance rather than habit. This is not an AI detector: a low distance means the commonest words appear at similar rates, and nothing more. The profile's z-scores were computed against this site's own articles as the reference population, so a profile built anywhere else will not compare.",
    inputSchema: {
      type: "object",
      properties: {
        profile: {
          type: "object",
          description: "The saved profile object from /tools/drift, unchanged.",
        },
        draft: { type: "string", minLength: 1, description: "The draft to measure." },
      },
      required: ["profile", "draft"],
      additionalProperties: false,
    },
    run(args) {
      const draft = readString(args, "draft");
      if (!draft.ok) return draft.error;

      const saved = parseDriftProfile(args.profile);
      if (!saved) {
        return toolError(
          "`profile` is not a Drift profile. Paste the JSON object that /tools/drift saves, unchanged.",
        );
      }

      const ref = driftReference();
      const report = analyseDrift(saved.profile, draft.value, ref, saved.spread);
      const payload = {
        ...report,
        reference: {
          documents: ref.documents,
          totalWords: ref.totalWords,
          markers: ref.markers.length,
          source: absolute("/writing"),
        },
      };

      if (report.status === "too-short") {
        return {
          content: text(
            `${report.words} words, and the floor is ${report.floor}. Under 150 words a Delta reports whether a word happened to occur at all, so no distance is printed. The counts still hold: ${report.emDashes} em dash(es), ${report.substitutions.length} substitution(s).`,
          ),
          structuredContent: payload,
        };
      }
      return structured(payload);
    },
  },
```

- [ ] **Step 4: Run the MCP suite**

```bash
cd "$WT"
npx vitest run lib/mcp.test.ts
```

Expected: PASS, including the pre-existing "exposes no tool that `tools/call` cannot dispatch" case, which calls every tool with no arguments and requires a tool error rather than a JSON-RPC error. `check_voice` with no arguments returns `toolError` from `readString`, so it satisfies that.

- [ ] **Step 5: Confirm the documentation surfaces picked it up by themselves**

```bash
cd "$WT"
npx vitest run app/ lib/mcp.test.ts --reporter=dot 2>&1 | tail -3
grep -n "TOOL_NAMES" app/llms.txt/route.ts
grep -n "toolDescriptors" app/mcp/page.tsx
```

Expected: green, and both greps hit. `/mcp` and `/llms.txt` list tools from `toolDescriptors()` and `TOOL_NAMES`, so neither file is edited and both gain the tool. Task 13 checks that on the live site rather than trusting the grep.

- [ ] **Step 6: Commit**

```bash
cd "$WT"
git add lib/mcp.ts lib/mcp.test.ts
git commit -m "feat(mcp): add check_voice, the MCP twin of the drift tool"
```

---

### Task 12: Prove the tests can fail, then wire the guards into the mutation check

**Files:**
- Modify: `scripts/mutation-check.mjs` (six entries)
- Temporarily modify then restore: `lib/tools/drift/delta.ts`

**Interfaces:**
- Consumes: every module from Tasks 1 to 10
- Produces: six mutation rows, and the evidence that the suite goes red when a guard is broken

A guard that survives its own mutation is decoration, and a suite nobody has watched fail is a ritual rather than a check. This task does both, in that order, and neither claim in the ledger is allowed before the corresponding run.

- [ ] **Step 1: Break the floor on purpose and watch the suite notice**

In `lib/tools/drift/delta.ts`, change one character:

```ts
export const MIN_DELTA_WORDS = 1;
```

Then:

```bash
cd "$WT"
npx vitest run lib/tools/drift/report.test.ts lib/tools/drift/delta.test.ts 2>&1 | tail -25
```

Expected: **FAIL**, and specifically these, not something vague:
- `the floor > is 150 words, the length below which a Delta is noise`, expected 150, received 1.
- `analyse under the floor > refuses every statistic and says which floor it refused against`, because `status` is now `"ok"`.

Write both failure lines into the ledger. That paste is the observation. If the suite goes green with the floor at 1, stop: the floor is not tested and every claim about it in this plan is unearned.

- [ ] **Step 2: Put it back and confirm the failure goes with it**

```bash
cd "$WT"
git checkout -- lib/tools/drift/delta.ts
npx vitest run lib/tools/drift/report.test.ts lib/tools/drift/delta.test.ts 2>&1 | tail -5
```

Expected: PASS. The pair of runs is the revert-to-confirm step from `CLAIMS.md` rule 3: the failure appeared when the guard was broken and disappeared when it was restored, which is what earns the word "tested" for the floor. It says nothing about the other five guards, which is what Step 3 is for.

- [ ] **Step 3: Add the six mutation rows**

In `scripts/mutation-check.mjs`, append to the `MUTATIONS` array, after the registry entries:

```js
  // ── drift: the six guards, each with the test that catches it ──
  {
    name: "drift prints a distance under the 150-word floor",
    file: "lib/tools/drift/report.ts",
    pattern: /if \(count < MIN_DELTA_WORDS\) \{/,
    replace: "if (false) {",
  },
  {
    name: "drift keeps a marker whose standard deviation is zero (every Delta becomes NaN)",
    file: "lib/tools/drift/corpus.ts",
    pattern: /    if \(s === 0\) continue;/,
    replace: "    if (false) continue;",
  },
  {
    name: "drift accepts a marker from a single document, so topic reads as voice",
    file: "lib/tools/drift/corpus.ts",
    pattern: />= MIN_DOCUMENT_SHARE\)/,
    replace: ">= 0)",
  },
  {
    name: "drift lectures a writer about a word they use themselves",
    file: "lib/tools/drift/substitutions.ts",
    pattern: /    if \(counts\.formal > 0\) continue;/,
    replace: "    if (false) continue;",
  },
  {
    name: "drift blames sentences for words the draft UNDERuses",
    file: "lib/tools/drift/report.ts",
    pattern: /if \(gap > 0\) over\[marker\] = gap \/ ref\.markers\.length;/,
    replace: "over[marker] = Math.abs(gap) / ref.markers.length;",
  },
  {
    name: "drift saves a profile nobody pressed save for",
    file: "app/tools/drift/DriftTool.tsx",
    pattern: /      const stored = parseProfile\(window\.localStorage\.getItem\(DRIFT_PROFILE_KEY\)\);/,
    replace:
      "      const stored = parseProfile(window.localStorage.getItem(DRIFT_PROFILE_KEY));\n      window.localStorage.setItem(DRIFT_PROFILE_KEY, serialiseProfile(demoProfile, demoSpread, new Date().toISOString()));",
  },
```

- [ ] **Step 4: Run the mutation check**

```bash
cd "$WT"
node scripts/mutation-check.mjs 2>&1 | tail -20
```

Expected: every drift row prints `RED`, and the final line reads `N/N mutations caught.` with no `Survived` block. An `ANCHOR-MISS` line is a failure, not a skip: it means the guard is not being mutated at all, and the anchor has to be fixed against the file as written, never the file loosened to fit the anchor.

This run takes a while: each mutation runs the whole suite, and there are more than sixty rows before these six.

- [ ] **Step 5: Commit**

```bash
cd "$WT"
git add scripts/mutation-check.mjs
git commit -m "test(drift): mutate the six guards and prove each one is load-bearing"
```

---

### Task 13: The phone check, at 390 and 320, on a real engine

**Files:**
- Modify: whatever the run names, and only in `app/tools/drift/tool.css`

**Interfaces:**
- Consumes: `scripts/phone-check.mjs` (F3), the production build
- Produces: the phone evidence for T1, pasted verbatim into the ledger

The design's rule, and the one thing this site refuses to fudge: **a resized desktop window does not count.** WebKit at 390 and at 320 because that is what an iPhone renders with, and a throttled Chromium Pixel beside it.

**Predictions, written before the run so the run can prove them wrong (CLAIMS.md rule 2). All four are guesses from reading the CSS, and none has been observed:**

1. No `overflow` failures. The two tables are inside `.drift__scroll` with `overflow-x: auto` and a `min-width` of 20rem, which is 320px exactly, so at 320 the table should fill the viewport and scroll inside itself rather than pushing the body.
2. No `input-font` failures. Both text areas are `.drift__input` at a literal `16px`.
3. No `tap-target` failures on `.drift__button` (44px floor, set) but possibly one on the disabled buttons if the script measures a disabled control, which is unknown behaviour in the script and worth reading rather than guessing.
4. Unknown, and the most likely place to find something: `contrast` on `.drift__reasons`, which is `--amber` on the page background, and on the table's bottom borders. `--amber` measured against `--bg` is comfortable on the green theme; the run is the first time it has been sampled through the scanline overlay and the phosphor shader on this route.

- [ ] **Step 1: Build and serve**

```bash
cd "$WT"
pkill -f "next start" || true
npm run build 2>&1 | tail -5
(npm start > .t1-server.log 2>&1 &)
for i in $(seq 1 30); do curl -sf http://localhost:3000/tools/drift > /dev/null && break; done
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/tools/drift
```

Expected: `200`.

- [ ] **Step 2: Run the check and keep the output**

```bash
cd "$WT"
node scripts/phone-check.mjs --base http://localhost:3000 --routes /tools/drift --out .phone-check | tee .phone-check/t1-first-run.txt
echo "exit: $?"
```

Expected: a header naming `1 route(s) x 3 profiles`, then whatever it finds. **Paste the whole output into the ledger under "T1 first phone-check run" before changing a single line.** That paste is the observation; everything after it is a fix.

- [ ] **Step 3: Fix each named failure in the file that owns it**

Every fix goes in `app/tools/drift/tool.css`. The thresholds in the script are not touched, and `app/globals.css` is not touched: a shell failure on this route would be a shell failure on every route, and that is F3's ground, not T1's. If the run names one, record it in the ledger and leave it.

A `contrast` failure is fixed by using a lighter token on that element (`--green` or `--amber-bright`), never by editing the token: the tokens are proven on all three themes in `app/globals.test.ts` and other surfaces depend on them.

A `tap-target` failure on something a thumb is meant to hit is fixed by padding it. `data-small-target` is only for a control that is deliberately small with a reason a reviewer would accept written into the attribute, and nothing on this page qualifies.

- [ ] **Step 4: Rebuild, re-run, confirm green**

```bash
cd "$WT"
pkill -f "next start" || true
npm run build 2>&1 | tail -3
(npm start > .t1-server.log 2>&1 &)
for i in $(seq 1 30); do curl -sf http://localhost:3000/tools/drift > /dev/null && break; done
node scripts/phone-check.mjs --base http://localhost:3000 --routes /tools/drift --out .phone-check
echo "exit: $?"
pkill -f "next start" || true
```

Expected: `exit: 0` and no `FAIL` lines.

What this proves: on WebKit at 390 and 320 and on a throttled Chromium Pixel, the route has no horizontal overflow, no input under 16px, no tap target under 44px, and no sampled text contrast under 4.5:1. What it cannot see: whether the tool is pleasant to use on a phone, whether the tables are readable at 320, or anything about a real iPhone GPU. A person still has to look, and Task 14 does that on the live site.

- [ ] **Step 5: Commit**

```bash
cd "$WT"
git add app/tools/drift/tool.css
git commit -m "fix(drift): meet the phone floors the check named"
```

If the run was clean and nothing changed, skip the commit and say so in the ledger. A clean first run is a finding worth recording, not a step to fake.

---

### Task 14: Documentation, the pull request, and the live check

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/PROGRESS.md`
- Modify: `docs/superpowers/programme/toolshed-ledger.md`

**Interfaces:**
- Consumes: everything above, and the `check` and `mutation` CI jobs required on `main`
- Produces: `/tools/drift` live on `https://fergusoreilly.dev`, with the deployment id and the evidence in the ledger

- [ ] **Step 1: Two sentences in AGENTS.md**

In "Stack and conventions", at the end of the bullet F3 added about `content/tools/` and `ToolPage`, append:

```markdown
  `/tools/drift` measures Burrows's Delta against a reference population, and that population is
  this site's own articles: `lib/tools/drift/corpus.ts` is the only module allowed to import
  `content/articles`, because a value import from a client component would put every article body
  in the browser bundle. It saves a profile under `fergusos:drift-profile`, built from
  `OWNED_PREFIX` so `forget` wipes it, and it writes that key in exactly one place, behind the save
  button. `app/tools/drift/page.test.ts` counts the writes.
```

- [ ] **Step 2: Update PROGRESS.md and the ledger**

`docs/PROGRESS.md`: tick T1 and add a decision-log line naming the reference corpus, the marker count and the floor, with the numbers the corpus test actually observed.

The ledger: set the T1 row to `**pr**`, and put the four observations in the Log, each labelled with its rung:

```markdown
- 2026-09-03: T1 built. Observed: tsc clean; N tests passing (was M at baseline); mutation check
  caught all six drift guards; the phone check passed on /tools/drift at 390, 320 and the throttled
  Pixel after the fixes in Task 13 (or first time, if it did). Reference corpus measured at D
  documents and W words with 100 markers. Not verified at this point: anything on the live site.
```

- [ ] **Step 3: Push and open the pull request**

```bash
cd "$WT"
npx tsc --noEmit && npm test -- --reporter=dot 2>&1 | tail -3
git add AGENTS.md docs/PROGRESS.md docs/superpowers/programme/toolshed-ledger.md
git commit -m "docs(drift): record the corpus, the storage key and the T1 evidence"
git push -u origin toolshed/t1-drift
gh pr create --title "T1: Drift, a voice-drift tool that is not an AI detector" --body "$(cat <<'BODY'
Adds `/tools/drift`.

Paste samples of your own writing, then a draft, and the tab reports Burrows's Delta between
them, the sentences pulling hardest away, and the substitutions your own corpus suggests.
Everything runs in the browser. The profile is saved only if you press save, under
`fergusos:drift-profile`, and `forget` wipes it.

The reference population for the z-scores is this site's own articles, and the page says so,
because a Delta needs a population to be a distance from.

Under 150 words the tool refuses to print a distance and says why. Counts still print.

`check_voice(profile, draft)` joins the MCP server and returns the same numbers from the same
functions.

Six new guards, six mutation rows, all caught. The phone check passes at 390 and 320 on WebKit
and on a throttled Chromium Pixel.

Not verified in this PR: anything on the live site. The post-deploy check follows the merge.
BODY
)"
```

Expected: the PR opens, and the `check` and `mutation` jobs start. Wait for both green. A red `mutation` job with a `Survived` line is a guard that does nothing, and it is fixed by making the test bite, never by deleting the row.

- [ ] **Step 4: Merge, then find the deployment the way AGENTS.md says**

```bash
gh pr merge --squash --delete-branch=false
sleep 20
curl -s "https://api.vercel.com/v6/deployments?projectId=$VERCEL_PROJECT_ID&teamId=$VERCEL_TEAM_ID&target=production&limit=3" \
  -H "Authorization: Bearer $VERCEL_TOKEN_PERSONAL" | head -c 2000
```

Then read `readyState`, `aliasAssigned` and `meta.githubCommitSha` from `v13/deployments/<id>`. Expected: `READY`, `aliasAssigned` true, and the SHA equal to the squash-merge commit. **Do not** run `vercel ls`, which renders `BLOCKED` as `UNKNOWN` and reads like "still building", and do not trust the CLI's exit code.

- [ ] **Step 5: Exercise the exact flow on the live site, on a phone engine**

A 200 on the route is not a pass. Drive the real thing:

```bash
cd "$WT"
node --input-type=module -e "$(cat <<'JS'
import { devices, webkit } from "playwright";

const sample = Array.from({ length: 60 }, (_, i) =>
  i % 3 === 0
    ? "So I wrote it down and it turned out fine."
    : "The thing works and I use it every day here.",
).join(" ");

const browser = await webkit.launch();
const context = await browser.newContext(devices["iPhone 13"]);
const page = await context.newPage();
await page.goto("https://fergusoreilly.dev/tools/drift", { waitUntil: "networkidle" });

console.log("lede:", (await page.locator("p.page__lede").first().innerText()).slice(0, 40));
console.log("demo delta:", await page.locator(".drift__delta").first().innerText());

await page.locator("textarea").first().fill(sample);
await page.getByRole("button", { name: "Build the profile" }).click();
await page.getByRole("button", { name: "Measure the draft" }).click();
console.log("after measure:", await page.locator(".drift__delta, .drift__refusal").first().innerText());

await page.locator("textarea").nth(1).fill("Far too short to measure.");
await page.getByRole("button", { name: "Measure the draft" }).click();
console.log("refusal:", await page.locator(".drift__refusal").first().innerText());

console.log("stored before save:", await page.evaluate(() => window.localStorage.getItem("fergusos:drift-profile")));
await page.getByRole("button", { name: "Save this profile" }).click();
console.log("stored after save:", (await page.evaluate(() => window.localStorage.getItem("fergusos:drift-profile")))?.slice(0, 40));

await browser.close();
JS
)"
```

Expected, and each line is the observation for one claim:
- `lede:` starts `This is not an AI detector.`
- `demo delta:` a number, so the page was not an empty form on arrival.
- `after measure:` a number.
- `refusal:` the under-the-floor sentence, containing `150`.
- `stored before save:` `null`. **This is the one that matters most**: it is the constitution's clause, live. If it prints anything else, the tool is writing without being asked and that is a stop-and-fix, not a note.
- `stored after save:` a JSON prefix.

Then the phone check against production:

```bash
cd "$WT"
node scripts/phone-check.mjs --base https://fergusoreilly.dev --routes /tools/drift
```

Expected: exit 0.

- [ ] **Step 6: Check the MCP twin on the live server**

```bash
curl -s https://fergusoreilly.dev/api/mcp -H "Content-Type: application/json" -H "Accept: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | grep -c check_voice
curl -s https://fergusoreilly.dev/llms.txt | grep -c check_voice
```

Expected: both non-zero, and neither file was edited to make it so.

- [ ] **Step 7: Check the event landed**

In PostHog, look for `tool_run` with `tool: "drift"` from the run in Step 5, within a few minutes. If pageviews are arriving but this is not, read the `cookieless_server_hash_mode` note in AGENTS.md before blaming the tool: with that project setting off, browser events get `200 {"status":"Ok"}` and are silently dropped while server events keep arriving.

Confirm the payload carries `tool`, `outcome` and `ms` and nothing else. If any text appears in it, that is a stop-and-fix.

- [ ] **Step 8: Close the ledger**

Set the T1 row to `**live**` with the deployment uid, and write the final log line stating both halves:

```markdown
- 2026-09-03: T1 live. Verified on https://fergusoreilly.dev/tools/drift with a WebKit iPhone 13:
  the lede reads "This is not an AI detector", the worked example rendered a distance on arrival,
  a built profile measured a draft, a 5-word draft got the refusal naming 150, local storage was
  null before save and held the record after it, the phone check passed at 390 and 320 and on the
  throttled Pixel, tools/list carries check_voice, and the tool_run event arrived with slug,
  outcome and milliseconds only.
  Not verified: the marker count of 100 is a choice and nothing here measures whether it is the
  right one; the Delta has not been compared against any published implementation, so "this is
  Burrows's Delta" rests on the formula in the docblock and the tests, not on an external oracle;
  the substitution table is 22 pairs chosen by hand and its coverage is unmeasured; and nothing
  has been tried on a physical iPhone, only on the WebKit engine one ships.
```

- [ ] **Step 9: Commit the ledger straight to main**

```bash
cd /c/Dev/fergus-portfolio
git checkout main && git pull
git add docs/superpowers/programme/toolshed-ledger.md docs/PROGRESS.md
git commit -m "docs(ledger): T1 drift is live, with what was and was not verified"
git push
```

Docs-only commits may land on `main` directly (AGENTS.md, Commands).

---

## Self-review

Run against the spec with fresh eyes, per the writing-plans skill. Gaps found were fixed inline before this plan was saved; each is listed with what changed.

**1. Spec coverage.** Walking design section 6, T1, clause by clause:

| Spec clause | Task |
|---|---|
| `/tools/drift` | 10 |
| "Not an AI detector, and the first line says so" | 9 (the blurb, which `ToolPage` renders as the lede, pinned by a test) |
| "Paste ten things you wrote" | 9 (copy), 10 (one text area, dash separator), 1 (`splitPieces`) |
| "the tab builds a voice profile" | 5 |
| function-word frequencies | 2, 5 |
| sentence-length rhythm | 3 |
| punctuation | 3 |
| joins | 3 |
| "measures Burrows' Delta" | 6 |
| "the sentences pulling away" | 7 (`sentencePulls`) |
| "the substitutions your own corpus suggests" | 4 |
| "Profile saved only if the visitor presses save, in local storage" | 8, 10, and the mutation row in 12 |
| "wiped by `forget`" | 8 (the key is built from `OWNED_PREFIX`, which is what `forget` scans for) |
| "Under 150 words the tool refuses to print a distance" | 6, 7, and proved failable in 12 |
| "MCP twin `check_voice(profile, draft)`" | 11 |
| "Can't see: meaning, register shifts within one writer" | 9, plus the two the prompt adds (under the floor, and a low Delta is not praise) |
| Demo state, no empty shell (design section 6 preamble) | 9, 10 |
| Everything in the browser, nothing uploaded | 10 (no action, no fetch; the reference arrives as a prop) |
| The bundled reference corpus is named on the page | 2, 9 (`referenceNote`), 10 |
| Phone check at 390 and 320 on a real engine (section 9) | 13 |
| Mutation check on every new guard (section 9) | 12 |
| "can't see" list on the page, checked against the code | 9 (F3's `ToolPage` renders it; the reviewer checks it against `lib/tools/drift/*`) |
| `tool_run` with slug and outcome, never the input | 10, checked live in 14 |

Two gaps found and closed while writing this: the spec's "ten pieces" needed a way to separate them, which became `splitPieces` in Task 1 rather than a growing list of text areas (a list of ten text areas at 320px is a scroll marathon); and nothing in the spec said what happens under the floor to things that are counts rather than statistics, so Task 7 states the split and tests it.

**2. Placeholder scan.** No "TBD", no "add error handling", no "similar to Task N", no "write tests for the above". Every code step carries the code. Three places name a thing that has not happened yet, and all three are labelled as predictions with the action to take if they are wrong: the real corpus yielding 100 markers (Task 2 Step 4), the self-spread minimum being above zero (Task 6 Step 4), and the four phone-check guesses (Task 13). That is the CLAIMS.md pattern, not a placeholder.

**3. Type consistency.** Checked name by name across tasks:

- `Reference` is produced in Task 2 and consumed as `type Reference` in Tasks 5, 6, 7 and 10. Every consumer takes it as an argument, so `corpus.ts` is imported for its value in exactly two places: `page.tsx` and `lib/mcp.ts`, both server side.
- `VoiceProfile` is produced in Task 5 and consumed in 6, 7, 8, 10, 11 with the same field names throughout: `version, pieces, words, freq, z, rhythm, punctuation, joins, pairs`.
- `SelfSpread` is produced in Task 6 (`delta.ts`) and consumed in 7, 8, 10, 11. It lives in `delta.ts` rather than `report.ts` because `selfSpread` computes it; `report.ts` imports the type from there, and Task 7's Interfaces block says so.
- `PairCounts` is produced in Task 4 and is the type of `VoiceProfile.pairs` in Task 5 and of `isProfile`'s check in Task 8.
- `MetricKey` and `PullReason` are produced in Task 7 and consumed by `driftCopy.metricLabels` and `reasonLabels` in Task 9 with `satisfies`, so a new metric key breaks the content file at compile time rather than rendering `undefined`.
- `analyse(profile, draft, ref, spread?)` has the same four-parameter shape in Task 7, Task 10 and Task 11.
- `DRIFT_PROFILE_KEY` is one constant, built from `OWNED_PREFIX`, used in Task 10's three storage calls and asserted in Tasks 8 and 10.
- One inconsistency was found and fixed: an early draft had `substitutions(profile, draft)` taking a whole profile, which would have forced `lib/mcp.ts` to build a profile it already had. It is `substitutionsFrom(pairs, draft)` throughout now, taking only the counts, and Task 7's `analyse` passes `profile.pairs`.
- A second was found and fixed: the coupling test in Task 10 originally matched `trackToolRun({ tool: "drift", outcome:` on one line while the component wrote the call across four. The test now matches the whole call and asserts on its contents, which is what it meant to check anyway.

**4. What this plan does not do, said plainly.** It does not compare the Delta implementation against a published one, so "this is Burrows's Delta" rests on the formula in the docblock and the tests around it. It does not measure whether 100 markers is better than 150 for a corpus of eleven articles; it argues for it and makes it one line to change. It does not let a visitor import a profile from a file, only build one or reload the saved one. And it adds no way to compare two people's voices, which would need the profile to travel and is a different tool with a different privacy line.
