# F3 Tool Registry and Page Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the tools list out of `app/tools/page.tsx` into `content/tools/`, give every tool one page shell (`ToolPage`) with a privacy line and a "Can't see" list, record a `tool_run` event that never carries the input, and put a real-engine phone check on every live tool route in CI.

**Architecture:** A content registry (`content/tools/<slug>.ts`, collected and sorted in `content/tools/index.ts`) feeds four readers: the `/tools` index, the sitemap, `/llms.txt`, and each tool's page through `components/tools/ToolPage.tsx`. Headline-check is the first entry and moves onto the shell without changing what it does. The `tool_run` event is built by a pure whitelist in `lib/analytics.ts` and sent by `lib/tools/events.ts` through the existing server path (`captureServerEvent` inside `after()`) or the existing client queue in `PostHogAnalytics.tsx`. `scripts/phone-check.mjs` drives WebKit and Chromium through Playwright, samples contrast from screenshot pixels, and proves it can fail with a `--self-test` before it measures anything real.

**Tech Stack:** Next.js 15.5 App Router, React 19, TypeScript, vitest 2 (node environment, no DOM), hand-written CSS, PostHog over `fetch`, Playwright (new devDependency, the only one), sharp (already a devDependency, decodes the screenshots), GitHub Actions.

## Global Constraints

- Programme design: `docs/superpowers/specs/2026-09-03-toolshed-programme-design.md`. This plan is F3 (section 6, wave 0). Its acceptance line, verbatim: "Done when `/tools` lists headline-check from the registry and the phone check passes on it."
- Interfaces are **frozen** (design section 8, point 2). Other plans are being written against these exact names: `ToolEntry` with fields `slug, name, blurb, privacy, cantSee, status, order`; `content/tools/index.ts` exporting `tools` and `toolBySlug`; `components/tools/ToolPage.tsx` with props `{ tool: ToolEntry; children: ReactNode }`; `TOOL_RUN_EVENT = "tool_run"` with payload `{ tool: string; outcome: "ok" | "refused" | "error"; ms: number }`; `trackToolRun(payload)` in `lib/tools/events.ts`; `scripts/phone-check.mjs` with `--base` and `--routes`. Additions are allowed (extra exports, optional props). Renames and removals are not.
- Privacy line strings, verbatim from the interface block: browser => "Runs in your browser. Nothing leaves this tab."; server => "Runs on the server. Keeps a hashed IP for a day, nothing else."
- vitest only, `environment: "node"`, `include: ["**/*.test.ts"]`. No jsdom. React components cannot be mounted. Test pure logic in `lib/` and `content/`, and use source-grep coupling checks (the pattern in `lib/boot.test.ts` and `components/chrome.test.ts`) for wiring. Every coupling test says in its docblock that it is one.
- All copy lives in `content/*.ts`. Nothing new is hard-coded in a page or a component. Every string added passes `content/voice.test.ts` (no em dash, no en dash outside a date, British spelling).
- Hand-written CSS. `app/globals.css` stays the shell's stylesheet. A tool may own `app/tools/<slug>/tool.css`, imported by its own `page.tsx` (design section 2, rule 2). Nothing else about styling changes: no Tailwind, no CSS-in-JS.
- Every animation gated behind `prefers-reduced-motion: no-preference` in CSS or a `matchMedia` check in JS. Text contrast 4.5:1 or better on all three themes. Decorative text is drawn by CSS `content`, never written into the document.
- The only new dependency is `playwright` as a devDependency (design section 2, rule 3, listed by name). `npm install` may need `--legacy-peer-deps` because `@vercel/analytics` declares an optional `@sveltejs/kit` peer whose chain wants vite@8 against vitest's vite@5 (AGENTS.md, Analytics). A repo-wide `.npmrc` is forbidden: it would silently disable peer checks for `next` and `react` too.
- `tool_run` never carries the input. Not the URL, not the text, not a hash of either. Tool slug, outcome, milliseconds. That is the whole payload.
- Commit messages: lowercase `type(scope): declarative sentence`. British English, no em dashes, per `C:\Users\oreil\.claude\LANGUAGE.md`.
- Branch `toolshed/f3-tool-registry` in its own sibling worktree made through the wrapper, never reused, never removed by an agent. The repository is public after F0, so this ships as a pull request that needs the `check` and `mutation` jobs green.
- `scripts/mutation-check.mjs` has anchors in `lib/analytics.ts`, `components/analytics/PostHogAnalytics.tsx`, `app/api/mcp/route.ts` and `lib/posthog-server.ts`. Every edit to those files in this plan is additive and leaves the anchored lines byte-identical. Run the mutation check before the PR.
- Claims discipline (`C:\Users\oreil\.claude\CLAIMS.md`): every step that runs something says what its output proves and what it cannot see. Predictions about the first real phone-check run are labelled as guesses until the run happens.

---

## File structure

**Created**

| Path | Responsibility |
|---|---|
| `content/tools/types.ts` | The frozen `ToolEntry` type and nothing else. |
| `content/tools/headline-check.ts` | The first entry. Name, blurb, privacy, the "Can't see" lines. |
| `content/tools/index.ts` | Collects the entries, sorts by `order`, exports `tools`, `liveTools`, `toolBySlug`, and `toolShellCopy` (the shell's own strings: the two privacy lines, the "Can't see" heading, the index prompt). |
| `content/tools/index.test.ts` | Shape guards: unique slugs and orders, live entries have a page, every file in the folder is registered, registrations alphabetical. |
| `lib/tools/listing.ts` | Pure: turns entries into index rows with `href: string \| null`, so "soon renders unlinked" is a testable fact. |
| `lib/tools/listing.test.ts` | Tests for the above. |
| `lib/tools/events.ts` | `toolRunEvent(payload)` (pure) and `trackToolRun(payload)` (server path or client sink). |
| `lib/tools/events.test.ts` | Both paths, and the whitelist. |
| `lib/after.ts` | `afterResponse(work)`: the `after()` wrapper lifted out of `app/api/mcp/route.ts` so a server action can share it. |
| `components/tools/ToolPage.tsx` | The page shell. Server component. |
| `components/tools/ToolPage.test.ts` | Coupling check: the shell renders the parts in the order the interface says. |
| `app/tools/headline-check/tool.css` | The checker's own rules, moved out of `globals.css`. |
| `app/tools/headline-check/page.test.ts` | Coupling check: the page uses `ToolPage` and imports `tool.css`. |
| `app/tools/headline-check/actions.test.ts` | The action emits one `tool_run` per path out, with the right outcome, and never the URL. |
| `scripts/phone-check.mjs` | The phone check. |
| `scripts/phone-check-fixtures/bad.html`, `good.html` | The self-test's two pages. |

**Modified**

| Path | Change |
|---|---|
| `app/tools/page.tsx` | Reads the registry through `toolListing`. The hard-coded array goes. |
| `app/sitemap.ts` | Tool routes come from `liveTools`. |
| `app/sitemap.test.ts` | Asserts every live tool is listed and no `soon` one is. |
| `app/llms.txt/route.ts` | The Tools section is generated from `liveTools`. |
| `app/tools/headline-check/page.tsx` | Renders through `ToolPage`. Imports `./tool.css`. |
| `app/tools/headline-check/state.ts` | Drops the four keys the page no longer reads (`command`, `path`, `title`, `lede`). |
| `app/tools/headline-check/actions.ts` | Emits `tool_run` on every path out. Hashes the limiter key. |
| `app/globals.css` | Gains `.tool__privacy`, `.tool__cantsee*`, `.tools__title.is-soon`, `.tools__soon`; loses the `.hcheck*` block; nav links go from 40px to 44px on touch. |
| `app/globals.test.ts` | The new shell rules join the "no `--green-faint` for body text" list. |
| `lib/seo.ts` | `toolPath(slug)` and `toolPageSchema(tool, extra?)`. |
| `lib/seo.test.ts` | A `describe` for the two. |
| `lib/analytics.ts` | `TOOL_RUN_EVENT`, `ToolOutcome`, `ToolRunPayload`, `toolRunProperties`. |
| `lib/analytics.test.ts` | Constant, shape, whitelist. |
| `components/analytics/PostHogAnalytics.tsx` | Registers its `capture` as the client sink for tool runs. |
| `components/analytics/PostHogAnalytics.test.ts` | Coupling check that it does. |
| `app/api/mcp/route.ts` | Imports `afterResponse` from `lib/after.ts` instead of defining it. |
| `content/voice.test.ts` | Tool names, blurbs, "Can't see" lines and shell copy join the prose list. |
| `scripts/mutation-check.mjs` | One entry: the `tool_run` whitelist starts spreading its input. |
| `docs/measurement.md` | A `tool_run` row in the events table. |
| `.github/workflows/ci.yml` | The `phone` job. |
| `.gitignore` | `.phone-check/`. |
| `package.json`, `package-lock.json` | `playwright` devDependency and the `phone-check` script. |
| `docs/superpowers/programme/toolshed-ledger.md`, `docs/PROGRESS.md` | State and evidence. |

---

### Task 0: Worktree and branch

**Files:**
- Create: nothing in the tree

**Interfaces:**
- Consumes: `main` after F0 has merged (the `check` and `mutation` CI jobs exist and `main` requires them)
- Produces: a sibling worktree on `toolshed/f3-tool-registry` that every later task runs in

- [ ] **Step 1: Confirm F0 has landed**

```bash
cd /c/Dev/fergus-portfolio
git fetch origin
git log origin/main --oneline -5
test -f .github/workflows/ci.yml && echo "ci.yml present"
gh api repos/fergo5002/fergus-portfolio/branches/main/protection --jq '.required_status_checks.contexts'
```

Expected: `ci.yml present` and `["check","mutation"]`. If the protection call 404s, F0 Task 3 has not run; stop and say so rather than building on an unprotected `main`.

- [ ] **Step 2: Create the worktree through the wrapper**

```powershell
powershell -NoProfile -File C:\Users\oreil\.claude\scripts\workspaces\workspaces.ps1 create -Repository C:\Dev\fergus-portfolio -Branch toolshed/f3-tool-registry
powershell -NoProfile -File C:\Users\oreil\.claude\scripts\workspaces\workspaces.ps1 path -Repository C:\Dev\fergus-portfolio -Branch toolshed/f3-tool-registry
```

Expected: the second command prints the worktree path (a sibling of `C:\Dev\fergus-portfolio`). Every `cd` below means that path; the plan writes `$WT` for it. Never `git worktree remove` it.

- [ ] **Step 3: Install and prove the baseline is green**

```bash
cd "$WT"
npm ci
npx tsc --noEmit && npm test -- --reporter=dot 2>&1 | tail -3
```

Expected: `tsc` silent, and a `Tests  N passed` line with zero failures. Write `N` down: every later task's count is checked against it.

---

### Task 1: The registry

**Files:**
- Create: `content/tools/types.ts`
- Create: `content/tools/headline-check.ts`
- Create: `content/tools/index.ts`
- Test: `content/tools/index.test.ts`
- Modify: `content/voice.test.ts` (the `prose` array, after the `skills` spread)

**Interfaces:**
- Consumes: nothing
- Produces: `ToolEntry` (frozen), `tools: ToolEntry[]` sorted by `order`, `liveTools: ToolEntry[]`, `toolBySlug(slug: string): ToolEntry | undefined`, `toolShellCopy` with `indexCommand`, `indexPath`, `privacy.browser`, `privacy.server`, `cantSeeHeading`, `soonLabel`

- [ ] **Step 1: Write the failing shape tests**

```ts
// content/tools/index.test.ts
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { liveTools, toolBySlug, toolShellCopy, tools } from "./index";

/**
 * The registry guard, in the shape of `content/articles.test.ts`.
 *
 * Every rule here is a way a tool can be registered and then quietly not
 * exist: a live entry with no page behind it, a file in this folder nobody
 * added to the index, two tools claiming the same slot in the list. None of
 * them break a build, which is why they need a test.
 */

const HERE = join(process.cwd(), "content", "tools");

describe("tool registry", () => {
  it("has at least one tool, and headline-check is live", () => {
    expect(tools.length).toBeGreaterThan(0);
    expect(toolBySlug("headline-check")?.status).toBe("live");
  });

  it("has unique slugs", () => {
    const slugs = tools.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("has unique orders and is sorted by them ascending", () => {
    const orders = tools.map((t) => t.order);
    expect(new Set(orders).size).toBe(orders.length);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
  });

  it("resolves every slug and nothing else", () => {
    for (const t of tools) expect(toolBySlug(t.slug)?.name).toBe(t.name);
    expect(toolBySlug("no-such-tool")).toBeUndefined();
  });

  it("lists only live entries in liveTools", () => {
    expect(liveTools.every((t) => t.status === "live")).toBe(true);
    expect(liveTools.length).toBe(tools.filter((t) => t.status === "live").length);
  });

  /**
   * A file in this folder that the index does not import is a tool that is
   * written and unreachable. Read the directory rather than trust the list.
   */
  it("registers every tool file in the folder", () => {
    const files = readdirSync(HERE)
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .filter((f) => f !== "index.ts" && f !== "types.ts")
      .map((f) => f.replace(/\.ts$/, ""));
    expect(files.sort()).toEqual(tools.map((t) => t.slug).sort());
  });

  /**
   * Design section 8: registrations are alphabetical so two pull requests
   * rarely collide on the same line. Checked on the source, because that is
   * where the collision happens.
   */
  it("keeps the registration lines alphabetical", () => {
    const src = readFileSync(join(HERE, "index.ts"), "utf8");
    const imports = [...src.matchAll(/^import \{ \w+ \} from "\.\/([a-z0-9-]+)";$/gm)].map((m) => m[1]);
    expect(imports.length).toBe(tools.length);
    expect([...imports].sort()).toEqual(imports);
  });
});

describe.each(tools.map((t) => [t.slug, t] as const))("tool: %s", (_slug, tool) => {
  it("has a URL-safe slug", () => {
    expect(tool.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("has a page behind it if it is live", () => {
    const page = join(process.cwd(), "app", "tools", tool.slug, "page.tsx");
    if (tool.status === "live") expect(existsSync(page), page).toBe(true);
  });

  it("has a name that fits a heading and a blurb that fits an index row", () => {
    expect(tool.name.length).toBeGreaterThan(2);
    expect(tool.name.length).toBeLessThanOrEqual(40);
    expect(tool.blurb.length).toBeGreaterThanOrEqual(40);
    expect(tool.blurb.length).toBeLessThanOrEqual(220);
    expect(tool.blurb).not.toContain("\n");
  });

  it("says what it cannot see", () => {
    // Design section 6: the "can't see" lines are part of the deliverable and
    // a reviewer checks them against the code.
    expect(tool.cantSee.length).toBeGreaterThan(0);
    for (const line of tool.cantSee) {
      expect(line.length).toBeGreaterThanOrEqual(20);
      expect(line).toBe(line.trim());
    }
  });

  it("declares where it runs", () => {
    expect(["browser", "server"]).toContain(tool.privacy);
  });
});

describe("tool shell copy", () => {
  it("carries both privacy lines verbatim from the programme interface", () => {
    expect(toolShellCopy.privacy.browser).toBe("Runs in your browser. Nothing leaves this tab.");
    expect(toolShellCopy.privacy.server).toBe(
      "Runs on the server. Keeps a hashed IP for a day, nothing else.",
    );
  });

});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd "$WT" && npx vitest run content/tools/index.test.ts`
Expected: FAIL, `Cannot find module './index'` (or the equivalent resolution error).

- [ ] **Step 3: Write the type**

```ts
// content/tools/types.ts
/**
 * One tool in the registry. Frozen across the toolshed programme (design
 * section 8): every sub-project's plan was written against these names, so add
 * a field if you must and never rename or remove one.
 */
export type ToolEntry = {
  /** Route is `/tools/<slug>`. Lowercase, hyphenated, stable once published. */
  slug: string;
  name: string;
  /** One or two sentences. The index row, and the lede on the tool's own page. */
  blurb: string;
  /**
   * Renders the privacy line. `browser` => "Runs in your browser. Nothing
   * leaves this tab." `server` => "Runs on the server. Keeps a hashed IP for a
   * day, nothing else."
   */
  privacy: "browser" | "server";
  /** Printed at the foot of the tool page under "Can't see". */
  cantSee: string[];
  /** `soon` entries are listed on the index but not linked. */
  status: "live" | "soon";
  /** Index ordering, ascending. Leave gaps. */
  order: number;
};
```

- [ ] **Step 4: Write the first entry**

```ts
// content/tools/headline-check.ts
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
```

- [ ] **Step 5: Write the index**

```ts
// content/tools/index.ts
import type { ToolEntry } from "./types";
import { headlineCheck } from "./headline-check";

export type { ToolEntry } from "./types";

/**
 * The tool registry.
 *
 * One file per tool in this folder, one import line each, kept alphabetical
 * (`content/tools/index.test.ts` checks) so two pull requests adding tools
 * rarely touch the same line. `/tools`, the sitemap, `/llms.txt` and each
 * tool's page read from here and nowhere else, which is how a tool that is
 * added once shows up everywhere at once.
 */
const entries: ToolEntry[] = [headlineCheck];

/** Every tool, `soon` ones included, in index order. */
export const tools: ToolEntry[] = [...entries].sort((a, b) => a.order - b.order);

/** The ones with a page behind them. The sitemap and the phone check use this. */
export const liveTools: ToolEntry[] = tools.filter((t) => t.status === "live");

export function toolBySlug(slug: string): ToolEntry | undefined {
  return tools.find((t) => t.slug === slug);
}

/**
 * The shell's own words, per the house rule that copy lives in `content/`.
 * The two privacy lines are verbatim from the programme's interface block and
 * `content/tools/index.test.ts` pins them.
 */
export const toolShellCopy = {
  indexCommand: "ls -la ./tools",
  indexPath: "~/tools",
  privacy: {
    browser: "Runs in your browser. Nothing leaves this tab.",
    server: "Runs on the server. Keeps a hashed IP for a day, nothing else.",
  },
  cantSeeHeading: "Can't see",
  soonLabel: "soon",
} as const;
```

- [ ] **Step 6: Run the registry tests to see them pass**

Run: `cd "$WT" && npx vitest run content/tools/index.test.ts`
Expected: PASS. The "has a page behind it" case passes because `app/tools/headline-check/page.tsx` already exists.

- [ ] **Step 7: Put the new copy under the voice lint**

In `content/voice.test.ts`, add the import beside the others:

```ts
import { tools, toolShellCopy } from "@/content/tools";
```

and extend the `prose` array, immediately after the `...skills.map(...)` line:

```ts
    ...tools.flatMap((t) => [
      { where: `tools.${t.slug}.name`, text: t.name },
      { where: `tools.${t.slug}.blurb`, text: t.blurb },
      ...t.cantSee.map((line, i) => ({ where: `tools.${t.slug}.cantSee[${i}]`, text: line })),
    ]),
    { where: "toolShellCopy.privacy.browser", text: toolShellCopy.privacy.browser },
    { where: "toolShellCopy.privacy.server", text: toolShellCopy.privacy.server },
    { where: "toolShellCopy.cantSeeHeading", text: toolShellCopy.cantSeeHeading },
```

- [ ] **Step 8: Run the voice lint**

Run: `cd "$WT" && npx vitest run content/voice.test.ts`
Expected: PASS. If "keeps British spellings" fails on a blurb, fix the blurb, not the regex.

- [ ] **Step 9: Commit**

```bash
cd "$WT"
git add content/tools content/voice.test.ts
git commit -m "feat(tools): the registry, with headline-check as its first entry"
```

---
### Task 2: URL and schema helpers, and the sitemap reads the registry

**Files:**
- Modify: `lib/seo.ts` (after `articlePath`, near line 545)
- Modify: `lib/seo.test.ts` (new `describe` at the end)
- Modify: `app/sitemap.ts`
- Modify: `app/sitemap.test.ts`

**Interfaces:**
- Consumes: `liveTools` from Task 1
- Produces: `toolPath(slug: string): string` and `toolPageSchema(tool: Pick<ToolEntry, "slug" | "name" | "blurb">, extra?: JsonLdObject): JsonLdObject` in `lib/seo.ts`

- [ ] **Step 1: Write the failing schema tests**

Append to `lib/seo.test.ts`. Extend the existing `import { ... } from "./seo"` line with `toolPath`, `toolPageSchema`, and whichever of `SITE_URL`, `PERSON_ID`, `WEBSITE_ID`, `absolute`, `type JsonLdObject` it does not already carry (a duplicate name is a compile error, so it cannot slip).

```ts
describe("tool schemas", () => {
  it("builds tool paths from slugs", () => {
    expect(toolPath("headline-check")).toBe("/tools/headline-check");
  });

  it("declares a tool as a free WebApplication by the person, on the site", () => {
    const node = toolPageSchema({ slug: "x", name: "X", blurb: "Does x." });
    expect(node["@type"]).toBe("WebApplication");
    expect(node["@id"]).toBe(`${SITE_URL}/tools/x#app`);
    expect(node.url).toBe(`${SITE_URL}/tools/x`);
    expect(node.description).toBe("Does x.");
    expect(node.author).toEqual({ "@id": PERSON_ID });
    expect(node.isPartOf).toEqual({ "@id": WEBSITE_ID });
    expect((node.offers as JsonLdObject).price).toBe("0");
  });

  it("lets a page add an edge the registry does not carry", () => {
    // The headline checker's `isBasedOn` points at the article it came from.
    // That relationship is the page's, not the registry's.
    const node = toolPageSchema(
      { slug: "x", name: "X", blurb: "Does x." },
      { isBasedOn: absolute("/writing/y") },
    );
    expect(node.isBasedOn).toBe(`${SITE_URL}/writing/y`);
  });

  it("keeps the registry's identity even when extra tries to change it", () => {
    const node = toolPageSchema({ slug: "x", name: "X", blurb: "Does x." }, { name: "Other" });
    expect(node.name).toBe("X");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd "$WT" && npx vitest run lib/seo.test.ts`
Expected: FAIL, `toolPath is not a function` or a missing export error.

- [ ] **Step 3: Add the helpers to `lib/seo.ts`**

Add the type import beside the existing ones at the top:

```ts
import type { ToolEntry } from "@/content/tools/types";
```

Then, directly after `articlePath`:

```ts
export function toolPath(slug: string): string {
  return `/tools/${slug}`;
}

/**
 * A tool, declared as a thing somebody can use rather than as a page about
 * one. `WebApplication` is what an answer engine looks for when the question
 * is "is there a tool that checks X".
 *
 * Built from the registry entry so the graph cannot say something the index
 * does not. `extra` is spread **first** and the registry fields after it: a
 * page may add an edge the registry has no field for (`isBasedOn`, for the
 * headline checker's article), and may not rename the tool in the graph.
 */
export function toolPageSchema(
  tool: Pick<ToolEntry, "slug" | "name" | "blurb">,
  extra: JsonLdObject = {},
): JsonLdObject {
  const url = absolute(toolPath(tool.slug));
  return prune({
    ...extra,
    "@type": "WebApplication",
    "@id": `${url}#app`,
    name: tool.name,
    url,
    description: tool.blurb,
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Any",
    isPartOf: { "@id": WEBSITE_ID },
    author: { "@id": PERSON_ID },
    offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
  });
}
```

- [ ] **Step 4: Run the schema tests to see them pass**

Run: `cd "$WT" && npx vitest run lib/seo.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing sitemap test**

In `app/sitemap.test.ts`, add the imports:

```ts
import { liveTools, tools } from "@/content/tools";
import { toolPath } from "@/lib/seo";
```

(`toolPath` joins the existing `from "@/lib/seo"` import.) Then add inside `describe("sitemap")`, after the `/contact` case:

```ts
  /**
   * Tool routes come from the registry. A `soon` tool is a name on the index
   * and nothing else, so naming its route here would be the exact failure the
   * sitemap's docblock warns about. The `soon` half of this is vacuous until a
   * `soon` entry exists; `lib/tools/listing.test.ts` exercises that branch with
   * a fixture, and this one bites the day a real entry is added.
   */
  it("lists every live tool, and no soon one", () => {
    const listed = urls.filter((u) => u.startsWith(`${SITE_URL}/tools/`));
    expect(listed.sort()).toEqual(liveTools.map((t) => absolute(toolPath(t.slug))).sort());
    for (const t of tools) {
      if (t.status === "soon") expect(urls).not.toContain(absolute(toolPath(t.slug)));
    }
  });
```

- [ ] **Step 6: Run it to see it pass for the wrong reason, then make the sitemap honest**

Run: `cd "$WT" && npx vitest run app/sitemap.test.ts`
Expected: PASS, because the hard-coded `/tools/headline-check` line happens to equal the registry's one live tool. That is a test that cannot yet fail. Prove it can: temporarily change `order: 10` to `status: "soon"` in `content/tools/headline-check.ts`, re-run, and expect the new case to go red with the hard-coded URL still listed. Put `status: "live"` back before continuing.

- [ ] **Step 7: Make the sitemap read the registry**

In `app/sitemap.ts`, change the imports to:

```ts
import type { MetadataRoute } from "next";
import { absolute, articlePath, toolPath } from "@/lib/seo";
import { articles } from "@/content/articles";
import { liveTools } from "@/content/tools";
```

Delete the line `{ url: absolute("/tools/headline-check"), changeFrequency: "monthly", priority: 0.7 },` from `staticRoutes` (keep the `/tools` and `/mcp` lines and the comment above them). Then, after `articleRoutes`, add:

```ts
  // Live tools only, from the registry. A `soon` entry is listed on `/tools`
  // and has no page, and a sitemap that names a route which 404s is the exact
  // failure the docblock above is about.
  const toolRoutes: MetadataRoute.Sitemap = liveTools.map((t) => ({
    url: absolute(toolPath(t.slug)),
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  return [...staticRoutes, ...toolRoutes, ...articleRoutes];
```

and delete the old `return [...staticRoutes, ...articleRoutes];`.

- [ ] **Step 8: Run the whole suite**

Run: `cd "$WT" && npx tsc --noEmit && npm test -- --reporter=dot 2>&1 | tail -3`
Expected: `tsc` silent; the count is the Task 0 baseline plus the tests added in Tasks 1 and 2, zero failures. `content/articles.test.ts` ("only links internally to routes that exist") passes because both articles that link to `/tools/headline-check` still find it in the sitemap.

- [ ] **Step 9: Commit**

```bash
cd "$WT"
git add lib/seo.ts lib/seo.test.ts app/sitemap.ts app/sitemap.test.ts
git commit -m "feat(seo): tool paths and the tool schema come from the registry, and so does the sitemap"
```

---

### Task 3: `/tools` and `/llms.txt` read the registry

**Files:**
- Create: `lib/tools/listing.ts`
- Test: `lib/tools/listing.test.ts`
- Modify: `app/tools/page.tsx` (whole file)
- Test: `app/tools/page.test.ts`
- Modify: `app/llms.txt/route.ts` (the `## Tools` section, lines 88 to 90)
- Modify: `app/globals.css` (the `/tools` block, after `.tools__meta`, line 3039)
- Modify: `app/globals.test.ts` (the `it.each` list under "the prose rules use the token that passes")

**Interfaces:**
- Consumes: `tools`, `liveTools`, `toolShellCopy` (Task 1); `toolPath` (Task 2)
- Produces: `toolListing(entries: readonly ToolEntry[]): ToolRow[]` where `ToolRow = { slug; name; blurb; privacyLine; href: string | null; soon: boolean }`

- [ ] **Step 1: Write the failing listing tests**

```ts
// lib/tools/listing.test.ts
import { describe, it, expect } from "vitest";
import { toolListing } from "./listing";
import { tools, toolShellCopy } from "@/content/tools";
import type { ToolEntry } from "@/content/tools/types";

/**
 * The one decision the index page makes, tested as a value: a `soon` tool is
 * listed and not linked. The page cannot be mounted here (node environment,
 * no DOM), so the decision lives in a pure function and the page only maps
 * over its output. `app/tools/page.test.ts` checks the page really does that.
 */

const live: ToolEntry = {
  slug: "alpha",
  name: "Alpha",
  blurb: "Does alpha, in the browser, for anyone who asks.",
  privacy: "browser",
  cantSee: ["Anything it was not shown."],
  status: "live",
  order: 10,
};

const soon: ToolEntry = { ...live, slug: "beta", name: "Beta", privacy: "server", status: "soon", order: 20 };

describe("toolListing", () => {
  it("links a live tool to its route", () => {
    const [row] = toolListing([live]);
    expect(row.href).toBe("/tools/alpha");
    expect(row.soon).toBe(false);
  });

  it("lists a soon tool with no link at all", () => {
    const [row] = toolListing([soon]);
    expect(row.href).toBeNull();
    expect(row.soon).toBe(true);
    expect(row.name).toBe("Beta");
  });

  it("prints the privacy line that matches where the tool runs", () => {
    const [a, b] = toolListing([live, soon]);
    expect(a.privacyLine).toBe(toolShellCopy.privacy.browser);
    expect(b.privacyLine).toBe(toolShellCopy.privacy.server);
  });

  it("keeps the order it was given", () => {
    expect(toolListing([soon, live]).map((r) => r.slug)).toEqual(["beta", "alpha"]);
  });

  it("gives every real live tool a link and every real soon tool none", () => {
    for (const row of toolListing(tools)) {
      expect(row.href === null, row.slug).toBe(row.soon);
    }
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd "$WT" && npx vitest run lib/tools/listing.test.ts`
Expected: FAIL, cannot find `./listing`.

- [ ] **Step 3: Write the listing**

```ts
// lib/tools/listing.ts
import { toolShellCopy } from "@/content/tools";
import type { ToolEntry } from "@/content/tools/types";
import { toolPath } from "@/lib/seo";

export type ToolRow = {
  slug: string;
  name: string;
  blurb: string;
  privacyLine: string;
  /** `null` for a `soon` tool: listed, never linked. */
  href: string | null;
  soon: boolean;
};

/**
 * The rows `/tools` renders, as data.
 *
 * Pure so the one decision on that page, whether a name is a link, can be
 * asserted without mounting anything. A `soon` tool is a promise, and a promise
 * with an `<a>` on it is a 404 with a nice label.
 */
export function toolListing(entries: readonly ToolEntry[]): ToolRow[] {
  return entries.map((t) => ({
    slug: t.slug,
    name: t.name,
    blurb: t.blurb,
    privacyLine: toolShellCopy.privacy[t.privacy],
    href: t.status === "live" ? toolPath(t.slug) : null,
    soon: t.status === "soon",
  }));
}
```

- [ ] **Step 4: Run the listing tests to see them pass**

Run: `cd "$WT" && npx vitest run lib/tools/listing.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing page coupling test**

```ts
// app/tools/page.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A source-coupling check, and honest about being one: vitest runs in a
 * `node` environment here, so nothing mounts the page. `lib/tools/listing.test.ts`
 * proves the decision; this proves the page defers to it and no longer carries
 * a list of its own.
 */
const src = readFileSync(join(process.cwd(), "app", "tools", "page.tsx"), "utf8");

describe("/tools reads the registry", () => {
  it("renders rows from toolListing", () => {
    expect(src).toMatch(/toolListing\(tools\)/);
  });

  it("no longer hard-codes a tool", () => {
    expect(src).not.toContain('"/tools/headline-check"');
    expect(src).not.toMatch(/const tools = \[/);
  });

  it("links only when the row has an href", () => {
    expect(src).toMatch(/row\.href \?/);
  });

  it("builds the JSON-LD list from live tools only", () => {
    expect(src).toMatch(/liveTools\.map\(/);
  });
});
```

- [ ] **Step 6: Run it to see it fail**

Run: `cd "$WT" && npx vitest run app/tools/page.test.ts`
Expected: FAIL on all four.

- [ ] **Step 7: Rewrite the index page**

Replace `app/tools/page.tsx` in full:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import JsonLd from "@/components/JsonLd";
import PromptLine from "@/components/PromptLine";
import Scramble from "@/components/Scramble";
import Talk from "@/components/Talk";
import { profile } from "@/content/profile";
import { liveTools, toolShellCopy, tools } from "@/content/tools";
import { OG_IMAGE, breadcrumbSchema, canonical, collectionPageSchema, toolPath } from "@/lib/seo";
import { toolListing } from "@/lib/tools/listing";

const DESCRIPTION =
  "Small free tools, each one built because something went wrong here first and the fix was worth handing over.";

export const metadata: Metadata = {
  // Bare, because the root layout's title template appends the name.
  title: "Tools",
  description: DESCRIPTION,
  alternates: canonical("/tools"),
  openGraph: {
    title: `Tools · ${profile.shortName}`,
    description: DESCRIPTION,
    type: "website",
    url: "/tools",
    images: [OG_IMAGE],
  },
  twitter: { card: "summary_large_image", images: [OG_IMAGE] },
};

/**
 * The index, read from `content/tools/`. Adding a tool is one file in that
 * folder and one import line; this page has no list of its own any more.
 *
 * A `soon` entry gets its name and its blurb and no link, because a link to a
 * page that is not there is a 404 with a nice label. The decision is made in
 * `lib/tools/listing.ts`, where it can be tested.
 */
export default function ToolsPage() {
  const rows = toolListing(tools);

  return (
    <div className="stack">
      <JsonLd
        nodes={[
          collectionPageSchema({
            path: "/tools",
            name: `Tools · ${profile.shortName}`,
            description: DESCRIPTION,
            itemType: "WebApplication",
            items: liveTools.map((t) => ({
              name: t.name,
              url: toolPath(t.slug),
              description: t.blurb,
            })),
          }),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Tools", path: "/tools" },
          ]),
        ]}
      />
      <PromptLine command={toolShellCopy.indexCommand} path={toolShellCopy.indexPath} />
      <h1 className="page__title">
        <Scramble text="tools" speed={34} />
      </h1>
      <p className="page__lede">{DESCRIPTION}</p>

      <ul className="tools__list">
        {rows.map((row) => (
          <li key={row.slug} className="tools__item">
            {row.href ? (
              <Link href={row.href} className="tools__link">
                <h2 className="tools__title">{row.name}</h2>
              </Link>
            ) : (
              <h2 className="tools__title is-soon">
                {row.name}
                <span className="tools__soon">{toolShellCopy.soonLabel}</span>
              </h2>
            )}
            <p className="tools__blurb">{row.blurb}</p>
            <p className="tools__meta">{row.privacyLine}</p>
          </li>
        ))}
      </ul>

      <Talk line="If one of these is nearly what you need but not quite, tell me and I'll have a look." />
    </div>
  );
}
```

Note the one deliberate change to the JSON-LD: the list rows are typed `WebApplication` rather than left as bare `ListItem`s, for the reason `collectionPageSchema`'s docblock gives (a bare row says "row three" and nothing else).

- [ ] **Step 8: Style the soon state**

In `app/globals.css`, after the `.tools__meta` rule (line 3039, before the `/* ── the checker` banner), add:

```css
/* A tool that is promised and not built. Same row, no link, and the label is
   real text rather than CSS content because it is information, not costume:
   a visitor needs to read "soon" to know why the name does nothing. */
.tools__title.is-soon {
  color: var(--green);
}

.tools__soon {
  font-family: var(--font-body);
  font-size: 0.75rem;
  color: var(--amber);
  margin-left: var(--sp-2);
  vertical-align: middle;
}
```

`--font-body` is the body token defined at the top of the file (line 22). `--green` on `--bg` is the pairing `app/globals.test.ts` already proves clears 4.5:1 on all three themes. `globals.css` is CRLF; an editor that preserves line endings is fine, and the mutation check's anchors are written to tolerate either, but do not let a tool convert the whole file.

Then in `app/globals.test.ts`, add `".tools__blurb"` and `".tools__meta"` to the `it.each([...])` list under `"%s does not use --green-faint for body text"`. They were never guarded and they are reading surfaces.

- [ ] **Step 9: Generate the `/llms.txt` Tools section from the registry**

In `app/llms.txt/route.ts`, change the first import line to:

```ts
import { absolute, articlePath, sameAs, toolPath } from "@/lib/seo";
```

add beside the content imports:

```ts
import { liveTools, toolShellCopy } from "@/content/tools";
```

and replace the `## Tools` section body (the single `- Headline check: ...` line) with:

```ts
${liveTools
  .map(
    (t) =>
      `- ${t.name}: ${absolute(toolPath(t.slug))}. ${t.blurb} Free, no sign-up. ${toolShellCopy.privacy[t.privacy]}`,
  )
  .join("\n")}
```

- [ ] **Step 10: Run the suite and the type check**

Run: `cd "$WT" && npx tsc --noEmit && npm test -- --reporter=dot 2>&1 | tail -3`
Expected: `tsc` silent, zero failures, count up by the nine tests added in this task. `content/voice.test.ts` scans `app/` for em dashes, so the new page is under the lint too.

- [ ] **Step 11: Commit**

```bash
cd "$WT"
git add lib/tools/listing.ts lib/tools/listing.test.ts app/tools/page.tsx app/tools/page.test.ts app/llms.txt/route.ts app/globals.css app/globals.test.ts
git commit -m "feat(tools): the index and llms.txt list what the registry says, and a soon tool has no link"
```

---
### Task 4: `ToolPage`, the shell every tool renders through

**Files:**
- Create: `components/tools/ToolPage.tsx`
- Test: `components/tools/ToolPage.test.ts`
- Modify: `app/globals.css` (the `/tools` block, after `.tools__soon` from Task 3)
- Modify: `app/globals.test.ts` (the `it.each` list, plus one new `it`)

**Interfaces:**
- Consumes: `toolShellCopy` (Task 1); `toolPageSchema`, `toolPath` (Task 2); `PromptLine`, `Scramble`, `JsonLd`, `Talk`, `breadcrumbSchema` (existing)
- Produces: `ToolPage` default export, props `{ tool: ToolEntry; children: ReactNode; extraSchema?: JsonLdObject; talk?: string }`. The first two are the frozen contract; the other two are optional additions. Renders, in order: JSON-LD, `PromptLine`, `h1` (Scramble of the slug), lede (the blurb), the privacy line, `children`, the "Can't see" section, and `Talk` when `talk` is given.

- [ ] **Step 1: Write the failing coupling test**

```ts
// components/tools/ToolPage.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A source-coupling check. Vitest runs in a `node` environment here, so the
 * shell cannot be mounted; what this proves is that the parts the programme's
 * interface block names are present, in the order it names them, and that the
 * words come from `content/` rather than from this file.
 *
 * `lib/seo.test.ts` proves the schema node, `content/tools/index.test.ts` pins
 * the privacy strings. This is the glue between them.
 */
const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");
const src = read("components", "tools", "ToolPage.tsx").replace(/\/\*[\s\S]*?\*\//g, " ");
const css = read("app", "globals.css");

describe("ToolPage renders the shell in the interface's order", () => {
  const marks = [
    "<JsonLd",
    "<PromptLine",
    'className="page__title"',
    "<Scramble text={tool.slug}",
    'className="page__lede">{tool.blurb}',
    'className="tool__privacy">{toolShellCopy.privacy[tool.privacy]}',
    "{children}",
    'className="tool__cantsee"',
    "{tool.cantSee.map(",
  ];

  it("has every part", () => {
    for (const mark of marks) expect(src, mark).toContain(mark);
  });

  it("in that order", () => {
    const positions = marks.map((m) => src.indexOf(m));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("builds its JSON-LD from the registry entry", () => {
    expect(src).toMatch(/toolPageSchema\(tool, extraSchema\)/);
    expect(src).toMatch(/breadcrumbSchema\(/);
  });

  it("carries no copy of its own", () => {
    // The privacy lines and the heading live in content/tools/index.ts.
    expect(src).not.toContain("Runs in your browser");
    expect(src).not.toContain("Runs on the server");
    expect(src).not.toContain('"Can\'t see"');
    expect(src).toContain("toolShellCopy.cantSeeHeading");
  });

  it("renders the call to action last, and only when asked", () => {
    expect(src).toMatch(/\{talk \? <Talk line=\{talk\} \/> : null\}/);
    expect(src.indexOf("{talk ?")).toBeGreaterThan(src.indexOf('className="tool__cantsee"'));
  });
});

describe("the stylesheet has the shell's rules", () => {
  it("styles the privacy line and the can't see list", () => {
    for (const selector of [".tool__privacy", ".tool__cantsee", ".tool__cantsee-title", ".tool__cantsee-item"]) {
      expect(css, selector).toMatch(new RegExp(`^${selector.replace(".", "\\.")}\\s*\\{`, "m"));
    }
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd "$WT" && npx vitest run components/tools/ToolPage.test.ts`
Expected: FAIL, `ENOENT` on `components/tools/ToolPage.tsx`.

- [ ] **Step 3: Write the shell**

```tsx
// components/tools/ToolPage.tsx
import type { ReactNode } from "react";
import JsonLd from "@/components/JsonLd";
import PromptLine from "@/components/PromptLine";
import Scramble from "@/components/Scramble";
import Talk from "@/components/Talk";
import { toolShellCopy } from "@/content/tools";
import type { ToolEntry } from "@/content/tools/types";
import { breadcrumbSchema, toolPageSchema, toolPath, type JsonLdObject } from "@/lib/seo";

/**
 * The page every tool renders through.
 *
 * Server component, no state. It takes the registry entry and puts the same
 * five things around every tool: the prompt line, the heading, the lede (the
 * registry blurb, so the index and the page cannot disagree), the privacy
 * line, and the "Can't see" list at the foot. A tool that hides its blind spot
 * is worse than no tool, and putting the list in the shell means no tool can
 * forget it.
 *
 * The heading is the slug, not the name. Every other page on this site heads
 * itself the terminal way (`tools`, `contact`, `headline-check`), the name is
 * for the index, the breadcrumb and the graph, and keeping the slug is what
 * keeps the headline checker's h1 byte-identical through the move.
 *
 * `extraSchema` and `talk` are optional additions to the frozen `{ tool,
 * children }` contract: the first lets a page add an edge the registry has no
 * field for (`isBasedOn`), the second renders the site's call to action after
 * the list so it stays the last thing on the page, where it is everywhere else.
 */
export default function ToolPage({
  tool,
  children,
  extraSchema,
  talk,
}: {
  tool: ToolEntry;
  children: ReactNode;
  extraSchema?: JsonLdObject;
  talk?: string;
}) {
  return (
    <div className="stack">
      <JsonLd
        nodes={[
          toolPageSchema(tool, extraSchema),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Tools", path: "/tools" },
            { name: tool.name, path: toolPath(tool.slug) },
          ]),
        ]}
      />
      <PromptLine command={`./${tool.slug}`} path={toolShellCopy.indexPath} />
      <h1 className="page__title">
        <Scramble text={tool.slug} speed={34} />
      </h1>
      <p className="page__lede">{tool.blurb}</p>
      <p className="tool__privacy">{toolShellCopy.privacy[tool.privacy]}</p>

      {children}

      <section className="tool__cantsee" aria-labelledby="tool-cantsee">
        <h2 id="tool-cantsee" className="tool__cantsee-title">
          {toolShellCopy.cantSeeHeading}
        </h2>
        <ul className="tool__cantsee-list">
          {tool.cantSee.map((line) => (
            <li key={line} className="tool__cantsee-item">
              {line}
            </li>
          ))}
        </ul>
      </section>

      {talk ? <Talk line={talk} /> : null}
    </div>
  );
}
```

- [ ] **Step 4: Style the shell's parts**

In `app/globals.css`, after the `.tools__soon` rule added in Task 3 and before the `/* ── the checker` banner, add:

```css
/* ── the tool shell (components/tools/ToolPage.tsx) ────────────────────── */

/* Where the tool runs, said before anything is pasted into it. Amber, the
   weight of a panel title, because it is the one line a cautious visitor is
   looking for. The negative top margin cancels the lede's own bottom margin
   so this sits one stack gap under it rather than two. */
.tool__privacy {
  margin: calc(-1 * var(--sp-5)) 0 0;
  font-size: 0.82rem;
  color: var(--amber);
  text-shadow: none;
  max-width: 62ch;
}

/* What the tool cannot see, at the foot, where the answer is. Real text, not
   costume: a reviewer checks these lines against the code. */
.tool__cantsee {
  border-top: 1px solid var(--green-line);
  padding-top: var(--sp-4);
  max-width: 62ch;
}

.tool__cantsee-title {
  font-family: var(--font-screen);
  font-size: 1rem;
  color: var(--amber);
  margin: 0 0 var(--sp-3);
}

.tool__cantsee-list {
  margin: 0;
  padding-left: 1.2em;
  display: grid;
  gap: var(--sp-2);
}

.tool__cantsee-item {
  color: var(--green);
  text-shadow: none;
}
```

- [ ] **Step 5: Guard the new reading surfaces**

In `app/globals.test.ts`, add `".tool__cantsee-item"` and `".tool__privacy"` to the `it.each([...])` list under `"%s does not use --green-faint for body text"`. Then add, in the same `describe`, a case for the amber line, because amber has never been asserted as a reading colour and the privacy line is the first place it carries a sentence:

```ts
  /**
   * The privacy line is the first amber *sentence* on the site. Amber has
   * only ever been used for headings and single words, so nothing proved it
   * clears the floor as body text on every theme. Measured from the tokens.
   * If a theme fails here, the fix is `--green` on `.tool__privacy`, not a
   * looser number.
   */
  it("keeps the privacy line readable on every theme", () => {
    expect(rule(".tool__privacy")).toMatch(/color:\s*var\(--amber\)/);
    for (const [name, vars] of THEMES) {
      const amber = vars["--amber"] ?? tokens(":root")["--amber"];
      expect(ratio(hex(amber), hex(vars["--bg"])), name).toBeGreaterThanOrEqual(4.5);
    }
  });
```

- [ ] **Step 6: Run the tests**

Run: `cd "$WT" && npx tsc --noEmit && npx vitest run components/tools/ToolPage.test.ts app/globals.test.ts`
Expected: PASS. If "keeps the privacy line readable" fails on a theme, the number it prints is the finding: change `.tool__privacy` to `color: var(--green)`, change the assertion to match, and record the ratio in the commit message. Do not lower 4.5.

- [ ] **Step 7: Commit**

```bash
cd "$WT"
git add components/tools app/globals.css app/globals.test.ts
git commit -m "feat(tools): the page shell, with the privacy line and the can't-see list every tool renders"
```

---
### Task 5: Headline-check moves onto the shell, and its CSS moves out of `globals.css`

**Files:**
- Modify: `app/tools/headline-check/page.tsx` (whole file)
- Modify: `app/tools/headline-check/state.ts` (the first four keys of `headlineCopy`)
- Create: `app/tools/headline-check/tool.css`
- Modify: `app/globals.css` (the checker block, from the `/* ── the checker` banner to the end of the file, and one line in the TOOLS banner)
- Test: `app/tools/headline-check/page.test.ts`

**Interfaces:**
- Consumes: `ToolPage` (Task 4); `headlineCheck` entry (Task 1); `absolute`, `canonical`, `toolPath`, `OG_IMAGE` (existing and Task 2)
- Produces: nothing new. The route's behaviour is unchanged: same form, same action, same h1 text, same JSON-LD node with `isBasedOn`, same "why" section.

**What changes on the page, stated so nobody has to discover it:** the prompt line reads `./headline-check` instead of `curl -s $URL | strip-tags` (the registry has no per-tool command field, and it is CSS-drawn costume, not content); the lede is the registry blurb instead of `headlineCopy.lede` (the design says index and page say the same thing); a privacy line appears under the lede; a "Can't see" list appears above the call to action. Everything else is the same markup.

- [ ] **Step 1: Decide whether the checker's CSS is cleanly separable**

Read the block once before moving it: `sed -n '/── the checker/,$p' app/globals.css | grep -n "^\.\|^@" | grep -v "^\S*\.hcheck\|hcheck-"`.

Expected: only the `@media` and `@keyframes` lines print, and every rule inside every one of them is an `.hcheck*` selector. That is the case at the time of writing: the block is 64 `.hcheck` rules, two keyframes named `hcheck-*`, and three media blocks (`prefers-reduced-motion`, `max-width: 768px`, `hover: none`) that contain nothing but `.hcheck` rules. It reads shell custom properties (`--green`, `--bg-panel`, `--sp-*`, `--radius`, `--font-screen`, `--red`, `--amber`) and those cascade into any stylesheet on the page. It is separable. If the grep prints a non-`hcheck` selector, stop and leave the block where it is, and say so in the commit.

- [ ] **Step 2: Write the failing coupling test**

```ts
// app/tools/headline-check/page.test.ts
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A source-coupling check. The page cannot be mounted here (node environment),
 * so this proves three things by reading the files: the page renders through
 * `ToolPage` rather than assembling its own shell, its stylesheet is its own
 * file, and the shell's stylesheet no longer carries a rule that belongs to
 * this tool. The behavioural proof is Task 8's production-build check.
 */
const dir = join(process.cwd(), "app", "tools", "headline-check");
const read = (name: string) => readFileSync(join(dir, name), "utf8");
const page = read("page.tsx").replace(/\/\*[\s\S]*?\*\//g, " ");
const globals = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

describe("headline-check renders through the shell", () => {
  it("uses ToolPage with its registry entry", () => {
    expect(page).toMatch(/import ToolPage from "@\/components\/tools\/ToolPage"/);
    expect(page).toMatch(/import \{ headlineCheck as tool \} from "@\/content\/tools\/headline-check"/);
    expect(page).toMatch(/<ToolPage tool=\{tool\}/);
  });

  it("keeps the article edge on the graph", () => {
    expect(page).toMatch(/extraSchema=\{\{ isBasedOn: absolute\(ARTICLE_PATH\) \}\}/);
  });

  it("assembles no shell of its own", () => {
    for (const forbidden of ["<PromptLine", 'className="page__title"', "<JsonLd", "breadcrumbSchema("]) {
      expect(page, forbidden).not.toContain(forbidden);
    }
  });

  it("still renders the form and the why section", () => {
    expect(page).toContain("<HeadlineForm />");
    expect(page).toContain('className="hcheck__why"');
  });
});

describe("headline-check owns its stylesheet", () => {
  it("imports tool.css", () => {
    expect(page).toMatch(/import "\.\/tool\.css";/);
    expect(existsSync(join(dir, "tool.css"))).toBe(true);
  });

  it("has the checker's rules in it, motion gated", () => {
    const css = read("tool.css");
    expect(css).toMatch(/^\.hcheck__input\s*\{/m);
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\)/);
    expect(css).toMatch(/@keyframes hcheck-arrive/);
  });

  it("left nothing of itself in globals.css", () => {
    expect(globals).not.toMatch(/^\.hcheck/m);
    expect(globals).not.toContain("@keyframes hcheck-");
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `cd "$WT" && npx vitest run app/tools/headline-check/page.test.ts`
Expected: FAIL on every case.

- [ ] **Step 4: Move the CSS**

The checker block runs from the `/* ── the checker` banner to the end of `globals.css` (Tasks 3 and 4 added their rules *above* the banner, so this is still true). Move it with a script rather than by hand, so a partial cut is impossible:

```bash
cd "$WT"
node -e '
const fs = require("node:fs");
const css = fs.readFileSync("app/globals.css", "utf8");
const start = css.indexOf("/* ── the checker");
if (start < 0) throw new Error("no checker banner in globals.css");
const block = css.slice(start);
if (!/\.hcheck__alt \{[^}]*\}\s*\}\s*$/.test(block)) throw new Error("the checker block does not run to the end of the file; stop and look");
// globals.css is CRLF. The new file takes the same ending so nothing in it is mixed.
const eol = css.includes("\r\n") ? "\r\n" : "\n";
const header = `/* ==========================================================================
   /tools/headline-check
   --------------------------------------------------------------------------
   The checker'"'"'s own rules, moved here from app/globals.css on the programme
   rule that a tool owns app/tools/<slug>/tool.css and the shell keeps
   globals.css (design 2026-09-03, section 2). Imported by ./page.tsx, so it
   loads on this route only. It reads the shell'"'"'s custom properties (--green,
   --bg-panel, --sp-*, --radius, --font-screen, --red, --amber), which cascade
   in from globals.css; nothing here redefines one.

   Colour rules, both learnt in app/globals.test.ts: --green-dim is borderline
   on amber (4.45) and ice (4.46), so it appears once, on a placeholder, and
   never on anything a visitor has to read. --green-faint appears nowhere.
   Every animation is behind prefers-reduced-motion.
   ========================================================================== */

`;
fs.writeFileSync("app/tools/headline-check/tool.css", header.replace(/\n/g, eol) + block.trimEnd() + eol);
fs.writeFileSync("app/globals.css", css.slice(0, start).trimEnd() + eol);
console.log("moved", block.split("\n").length, "lines, eol", JSON.stringify(eol));
'
```

Expected: `moved 4xx lines, eol "\r\n"`. Then `git diff --stat app/globals.css` should show only deletions in that file (a rewritten-every-line diff means the line endings were converted; restore with `git checkout app/globals.css` and redo). Then edit the TOOLS banner near the top of the `/tools` block in `globals.css`: change its first line from `TOOLS (/tools and /tools/headline-check)` to `TOOLS (/tools, and the shell every tool renders through)` and add one line under it: `The headline checker's own rules live in app/tools/headline-check/tool.css.`

- [ ] **Step 5: Rewrite the page**

Replace `app/tools/headline-check/page.tsx` in full:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import ToolPage from "@/components/tools/ToolPage";
import { profile } from "@/content/profile";
import { headlineCheck as tool } from "@/content/tools/headline-check";
import { OG_IMAGE, absolute, canonical, toolPath } from "@/lib/seo";
import HeadlineForm from "./HeadlineForm";
import { ARTICLE_PATH } from "./state";
import "./tool.css";

const PATH = toolPath(tool.slug);

const DESCRIPTION =
  "Paste a URL and see how its h1 extracts for a crawler that reads HTML without running it. Catches per-character split-text animations that turn a headline into loose letters.";

export const metadata: Metadata = {
  // Bare, because the root layout's title template appends the name.
  title: tool.name,
  description: DESCRIPTION,
  alternates: canonical(PATH),
  openGraph: {
    title: `${tool.name} · ${profile.shortName}`,
    description: DESCRIPTION,
    type: "website",
    url: PATH,
    images: [OG_IMAGE],
  },
  twitter: { card: "summary_large_image", images: [OG_IMAGE] },
};

/**
 * `/tools/headline-check`.
 *
 * The article at `ARTICLE_PATH` explains why a per-character heading animation
 * costs you the words it decorates. This is the same check, pointed at anyone's
 * page, because an argument somebody has to take on trust is worth less than
 * one they can run against their own site in ten seconds.
 *
 * The shell (`ToolPage`) draws the prompt line, the heading, the lede, the
 * privacy line and the "Can't see" list from the registry entry. This file owns
 * the tool itself and the paragraph that says why it is worth ten seconds.
 * `isBasedOn` is the one edge the registry has no field for: it ties the tool
 * to the article so the two are one piece of work rather than two pages that
 * happen to link.
 */
export default function HeadlineCheckPage() {
  return (
    <ToolPage
      tool={tool}
      extraSchema={{ isBasedOn: absolute(ARTICLE_PATH) }}
      talk="If this found something on your site, I'd genuinely like to know what it was."
    >
      <HeadlineForm />

      <section className="hcheck__why" aria-labelledby="why-this-matters">
        <h2 id="why-this-matters" className="cdirect__title">
          Why this is worth ten seconds
        </h2>
        <p className="hcheck__why-body">
          Split a headline into one element per letter and a browser still paints the word. Plenty
          of the machinery that reads the web does not run a browser: link unfurlers, feed readers,
          archivers, and the fetchers behind AI answer engines. A good number of those strip the
          tags, normalise the whitespace, and hand the result to something else. That turns your
          best string into confetti, and nobody sends you a report about it.
        </p>
        <p className="hcheck__why-body">
          I found this on my own site, which is the only reason I trust it enough to write a tool
          about it. The homepage name animated one character at a time and extracted as loose
          letters. The full write-up, including what not to do about it, is here:{" "}
          <Link className="prose__link" href={ARTICLE_PATH}>
            your split-text animation is eating your headline
          </Link>
          .
        </p>
      </section>
    </ToolPage>
  );
}
```

- [ ] **Step 6: Drop the copy the page no longer reads**

In `app/tools/headline-check/state.ts`, delete these four lines from `headlineCopy`:

```ts
  command: "curl -s $URL | strip-tags",
  path: "~/tools",
  title: "headline-check",
  lede: "Paste a URL. See how its h1 comes out for something that reads HTML without running it, which is most of what reads the web now.",
```

and replace the docblock paragraph that begins `The copy lives here rather than in `content/`` with:

```ts
 * The form's copy lives here rather than in `content/`, which is where
 * AGENTS.md says copy belongs, because the original change was scoped to
 * `lib/`, `app/tools/` and the stylesheet. The page-level copy (name, blurb,
 * privacy, the "can't see" lines) moved to `content/tools/headline-check.ts`
 * with the toolshed programme; what is left is the form's own strings, and
 * moving them to `content/` is still a move rather than a rewrite.
```

- [ ] **Step 7: Run the coupling test, the types and the suite**

Run: `cd "$WT" && npx vitest run app/tools/headline-check/page.test.ts && npx tsc --noEmit && npm test -- --reporter=dot 2>&1 | tail -3`
Expected: PASS, `tsc` silent (it is what proves `HeadlineForm.tsx` and `actions.ts` never read the four deleted keys), zero failures.

- [ ] **Step 8: Build, and look at the served page**

```bash
cd "$WT"
npm run build 2>&1 | tail -15
```

Expected: the route table lists `/tools/headline-check` with no error, and no warning about a global CSS import (App Router allows one from any page). Then:

```bash
cd "$WT"
(npm start > .f3-server.log 2>&1 &) && sleep 4
HTML=$(curl -s http://localhost:3000/tools/headline-check)
echo "$HTML" | grep -o '<h1[^>]*>.\{0,120\}' | head -2
echo "$HTML" | grep -o 'tool__privacy">[^<]*'
echo "$HTML" | grep -o 'tool__cantsee-item">[^<]\{0,40\}' | wc -l
echo "$HTML" | grep -o '"@type":"WebApplication"' | wc -l
echo "$HTML" | grep -o '"isBasedOn":"[^"]*"'
echo "$HTML" | grep -o 'name="url"' | wc -l
for css in $(echo "$HTML" | grep -o '/_next/static/css/[^"]*\.css' | sort -u); do curl -s "http://localhost:3000$css" | grep -c "hcheck__input" ; done
```

Expected: an `<h1>` whose text is `headline-check`; the server privacy line; `3` can't-see items; `1` WebApplication node; `"isBasedOn":"https://fergusoreilly.dev/writing/split-text-is-costing-you-search"`; `1` url field; and at least one served stylesheet containing `hcheck__input`. Kill the server afterwards (`pkill -f "next start"` or close the process on Windows: `taskkill /F /IM node.exe` is too broad, so use `npx kill-port 3000` if installed, otherwise find the PID with `netstat -ano | findstr :3000`).

What this proves: the shell renders, the tool's stylesheet ships on the route, the graph kept its edge. What it does not prove: that the form still posts and returns a report (`actions.ts` is untouched in this task; Task 8 posts the form against a production build after Task 6 has changed it).

- [ ] **Step 9: Commit**

```bash
cd "$WT"
git add app/tools/headline-check app/globals.css
git commit -m "refactor(headline-check): render through the tool shell and own the checker's stylesheet"
```

---
### Task 6: The `tool_run` event

**Files:**
- Modify: `lib/analytics.ts` (new section after "Core Web Vitals", before "How the browser SDK is configured")
- Modify: `lib/analytics.test.ts` (new `describe`)
- Create: `lib/after.ts`
- Modify: `app/api/mcp/route.ts` (replace the local `afterResponse` with the import)
- Create: `lib/tools/events.ts`
- Test: `lib/tools/events.test.ts`
- Modify: `components/analytics/PostHogAnalytics.tsx` (one import, one call after `capture`)
- Modify: `components/analytics/PostHogAnalytics.test.ts` (one `it`)
- Modify: `app/tools/headline-check/actions.ts`
- Test: `app/tools/headline-check/actions.test.ts`
- Modify: `scripts/mutation-check.mjs` (two entries at the end of `MUTATIONS`)
- Modify: `docs/measurement.md` (one row in the events table)

**Interfaces:**
- Consumes: `captureServerEvent`, `ServerEvent` (`lib/posthog-server.ts`); the module-scope `capture` and `KEY` in `PostHogAnalytics.tsx`; `after` from `next/server`
- Produces: in `lib/analytics.ts`: `TOOL_RUN_EVENT = "tool_run"`, `type ToolOutcome = "ok" | "refused" | "error"`, `type ToolRunPayload = { tool: string; outcome: ToolOutcome; ms: number }`, `toolRunProperties(payload): { tool; outcome; ms }`. In `lib/tools/events.ts`: `toolRunEvent(payload): ServerEvent`, `trackToolRun(payload): Promise<void>`, `registerToolRunSink(sink)`, `resetToolRunSink()` (test seam). In `lib/after.ts`: `afterResponse(work: () => void | Promise<unknown>): void`.

**How the two paths work.** On the server (`typeof window === "undefined"`) `trackToolRun` awaits `captureServerEvent`, exactly as `app/api/mcp/route.ts` sends `mcp_tool_call`; the caller wraps it in `afterResponse` so the send happens after the reply and `after()` waits for the promise. In the browser it hands the event to a sink that `PostHogAnalytics.tsx` registers at module scope: the same bounded queue web vitals use, so a run before the SDK loads is not lost, and the same `KEY` gate, so development reports nothing. `lib/tools/events.ts` imports nothing from `next/server` and nothing marked `"use client"`, which is what lets one function be called from a server action and from a client component.

**Outcomes for the headline checker.** `ok`: a report came back. `refused`: the tool declined before doing any work (empty URL, too long, rate limited). `error`: it tried to read the page and could not. Every path out of the action records exactly one.

- [ ] **Step 1: Write the failing analytics tests**

Append to `lib/analytics.test.ts`, adding `TOOL_RUN_EVENT`, `toolRunProperties`, `type ToolOutcome`, `type ToolRunPayload` to the `from "./analytics"` import:

```ts
/**
 * The toolshed's one privacy rule, as a value: `tool_run` carries the slug,
 * the outcome and the time, and never the input. The whitelist is what makes
 * that true even for a caller who spreads their whole state into the payload.
 */
describe("tool runs", () => {
  it("names the event tool_run", () => {
    expect(TOOL_RUN_EVENT).toBe("tool_run");
  });

  it("records the slug, the outcome and the time, and nothing else", () => {
    const props = toolRunProperties({ tool: "headline-check", outcome: "ok", ms: 412.6 });
    expect(props).toEqual({ tool: "headline-check", outcome: "ok", ms: 413 });
    expect(Object.keys(props).sort()).toEqual(["ms", "outcome", "tool"]);
  });

  it("drops anything a careless caller spreads in, the URL above all", () => {
    const leaky = {
      tool: "headline-check",
      outcome: "error",
      ms: 5,
      url: "https://example.com/private?token=secret",
      input: "pasted text",
    } as ToolRunPayload;
    const props = toolRunProperties(leaky) as Record<string, unknown>;
    expect(props.url).toBeUndefined();
    expect(props.input).toBeUndefined();
    expect(JSON.stringify(props)).not.toContain("secret");
  });

  it("truncates the slug and clamps the time", () => {
    expect(toolRunProperties({ tool: "a".repeat(500), outcome: "ok", ms: 1 }).tool.length).toBeLessThanOrEqual(120);
    expect(toolRunProperties({ tool: "x", outcome: "ok", ms: -20 }).ms).toBe(0);
    expect(toolRunProperties({ tool: "x", outcome: "ok", ms: Number.NaN }).ms).toBe(0);
    expect(toolRunProperties({ tool: "", outcome: "ok", ms: 1 }).tool).toBe("unknown");
  });

  it("refuses to invent an outcome", () => {
    expect(toolRunProperties({ tool: "x", outcome: "won" as ToolOutcome, ms: 1 }).outcome).toBe("error");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd "$WT" && npx vitest run lib/analytics.test.ts`
Expected: FAIL, `TOOL_RUN_EVENT` is not exported.

- [ ] **Step 3: Add the section to `lib/analytics.ts`**

Insert between the "Core Web Vitals" section and "How the browser SDK is configured". `MCP_FIELD_LIMIT` (120) is already defined higher in the file and is reused on purpose: one truncation length for every caller-controlled label.

```ts
/* ------------------------------------------------------------------ */
/* Tool runs                                                            */
/* ------------------------------------------------------------------ */

/** One event per run of a `/tools/<slug>` tool, whatever the outcome. */
export const TOOL_RUN_EVENT = "tool_run" as const;

/**
 * `ok`: the tool produced its answer. `refused`: it declined before doing any
 * work (a budget, an empty or oversized input). `error`: it tried and could
 * not (the page would not fetch, the file would not parse).
 */
export type ToolOutcome = "ok" | "refused" | "error";

export type ToolRunPayload = { tool: string; outcome: ToolOutcome; ms: number };

const TOOL_OUTCOMES: readonly ToolOutcome[] = ["ok", "refused", "error"];

/**
 * The properties recorded for one tool run, and nothing else.
 *
 * Built field by field from a whitelist rather than by spreading the payload,
 * and that is the toolshed's whole privacy story in one function. A caller
 * who writes `{ ...state, tool, outcome, ms }` by accident hands over the
 * visitor's URL, and this drops it on the floor. The input never reaches
 * PostHog: not the URL, not the text, not a hash of either.
 *
 * `tool` is truncated like every other caller-controlled label here, `ms` is
 * clamped to a non-negative integer, and an outcome outside the three is
 * recorded as `error` rather than trusted.
 */
export function toolRunProperties(payload: ToolRunPayload): {
  tool: string;
  outcome: ToolOutcome;
  ms: number;
} {
  const tool = String(payload.tool ?? "").slice(0, MCP_FIELD_LIMIT) || "unknown";
  const outcome = TOOL_OUTCOMES.includes(payload.outcome) ? payload.outcome : "error";
  const ms = Number.isFinite(payload.ms) ? Math.max(0, Math.round(payload.ms)) : 0;
  return { tool, outcome, ms };
}
```

- [ ] **Step 4: Run the analytics tests to see them pass**

Run: `cd "$WT" && npx vitest run lib/analytics.test.ts`
Expected: PASS.

- [ ] **Step 5: Lift `afterResponse` into `lib/after.ts`**

```ts
// lib/after.ts
import { after } from "next/server";

/**
 * Schedule work for after the response, and shrug if that is not possible.
 *
 * `after` needs a request scope. It has one on every real request, and it does
 * **not** have one when a handler or an action is called directly, which is
 * exactly what `lib/mcp.test.ts` and `app/tools/headline-check/actions.test.ts`
 * do: they exercise the real code against a plain `Request` or `FormData` to
 * prove the behaviour without standing up a server. Six MCP tests went red the
 * moment `after` was first introduced.
 *
 * Catching is the right answer rather than a workaround, and it is the rule the
 * whole analytics layer is built on applied consistently: telemetry may not
 * change what the protocol answers, and a throw from the recording path would
 * do precisely that. The cost of the fallback is one unrecorded call in a
 * context where there was nothing worth recording anyway.
 *
 * There is deliberately no second guard on the presence of a PostHog key. It
 * would make the tests pass without ever running the work, and a guard that is
 * never exercised is decoration. `captureServerEvent` already returns `false`
 * without a key.
 *
 * `work` may return a promise. `after` waits for it, which is what keeps a
 * serverless function alive long enough for the capture to land.
 */
export function afterResponse(work: () => void | Promise<unknown>): void {
  try {
    after(work);
  } catch {
    // No request scope. Nothing to do, and nothing to say about it.
  }
}
```

Then in `app/api/mcp/route.ts`: delete the `import { after } from "next/server";` line, add `import { afterResponse } from "@/lib/after";` beside the other `@/lib` imports, and delete the local `afterResponse` function together with its docblock (the block that starts `/**\n * Schedule work for after the response`). The three lines the mutation check anchors (`observe(message);`, `withMcpClient(telemetry, request.headers.get("user-agent"))`, `mcpCallProperties(observed, reply.status)`) are untouched.

Run: `cd "$WT" && npx vitest run app/api/mcp lib/mcp.test.ts`
Expected: PASS. `telemetry.test.ts` mocks `next/server` for the whole module registry, so `lib/after.ts` gets the immediate `after` too.

- [ ] **Step 6: Write the failing events tests**

```ts
// lib/tools/events.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerToolRunSink, resetToolRunSink, toolRunEvent, trackToolRun } from "./events";

/**
 * Both ways out. On the server the event goes through `captureServerEvent`
 * over `fetch`, the same path `mcp_tool_call` takes. In a browser it goes to
 * whatever sink `PostHogAnalytics.tsx` registered, which is that component's
 * own queue. Neither path may ever see the input, and the whitelist in
 * `lib/analytics.ts` is tested there; here the question is only whether the
 * right door opens.
 */

const captured = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls.length ? JSON.parse(fetchMock.mock.calls[0][1].body) : null;

describe("toolRunEvent", () => {
  it("keys the server event on the tool, not on a person", () => {
    const event = toolRunEvent({ tool: "headline-check", outcome: "ok", ms: 12 });
    expect(event.event).toBe("tool_run");
    expect(event.distinctId).toBe("tool:headline-check");
    expect(event.properties).toEqual({ tool: "headline-check", outcome: "ok", ms: 12 });
  });
});

describe("trackToolRun", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const originalKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    fetchMock = vi.fn().mockResolvedValue(new Response('{"status":"Ok"}', { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetToolRunSink();
    if (originalKey === undefined) delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    else process.env.NEXT_PUBLIC_POSTHOG_KEY = originalKey;
  });

  it("sends through the server path when there is no window", async () => {
    await trackToolRun({ tool: "headline-check", outcome: "refused", ms: 3 });
    const body = captured(fetchMock);
    expect(body, "no capture was sent").not.toBeNull();
    expect(body.event).toBe("tool_run");
    expect(body.distinct_id).toBe("tool:headline-check");
    expect(body.properties.outcome).toBe("refused");
    // The guarantee server events never create a person, asserted at the
    // caller most likely to be hit by strangers.
    expect(body.properties.$process_person_profile).toBe(false);
  });

  it("sends nothing from the server without a project key", async () => {
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    await trackToolRun({ tool: "headline-check", outcome: "ok", ms: 3 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("hands the event to the registered sink when there is a window", async () => {
    vi.stubGlobal("window", {});
    const sink = vi.fn();
    registerToolRunSink(sink);
    await trackToolRun({ tool: "drift", outcome: "ok", ms: 80 });
    expect(sink).toHaveBeenCalledWith("tool_run", { tool: "drift", outcome: "ok", ms: 80 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("queues a browser event fired before the sink exists, and drains it on registration", async () => {
    vi.stubGlobal("window", {});
    await trackToolRun({ tool: "drift", outcome: "error", ms: 1 });
    const sink = vi.fn();
    registerToolRunSink(sink);
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink.mock.calls[0][0]).toBe("tool_run");
  });
});
```

- [ ] **Step 7: Run it to see it fail**

Run: `cd "$WT" && npx vitest run lib/tools/events.test.ts`
Expected: FAIL, cannot find `./events`.

- [ ] **Step 8: Write the events module**

```ts
// lib/tools/events.ts
import { TOOL_RUN_EVENT, toolRunProperties, type ToolRunPayload } from "@/lib/analytics";
import { captureServerEvent, type ServerEvent } from "@/lib/posthog-server";

/**
 * Recording one run of a tool, from wherever the run happened.
 *
 * Two callers, two paths, one function. A server action (the headline checker)
 * calls this inside `afterResponse`, and it goes out over `fetch` exactly as
 * `mcp_tool_call` does from `app/api/mcp/route.ts`. A browser-only tool
 * (Drift, Relief) calls it from a client component, and it goes to the sink
 * `components/analytics/PostHogAnalytics.tsx` registered, which is that
 * component's queue: bounded, drained when the SDK arrives, gated on the
 * project key so development reports nothing.
 *
 * This module imports nothing from `next/server` and nothing marked
 * `"use client"`, and that is what makes both callers possible. A `"use client"`
 * export called from the server throws at call time; `next/server` in a client
 * bundle fails at build time. So the client side is inverted: the component
 * registers itself here, and this file knows nothing about it.
 *
 * The payload is whitelisted in `lib/analytics.ts`. Nothing here adds a field.
 */

export type ToolRunSink = (event: string, properties: Record<string, unknown>) => void;

let clientSink: ToolRunSink | null = null;

/**
 * Runs that happen before the sink is registered. In practice that cannot
 * happen (the layout's analytics component evaluates before any tool renders),
 * and the queue costs six lines, so it is there rather than assumed.
 */
const BEFORE_SINK_LIMIT = 20;
const beforeSink: Array<{ event: string; properties: Record<string, unknown> }> = [];

/** Called once, at module scope, by `PostHogAnalytics.tsx`. */
export function registerToolRunSink(sink: ToolRunSink): void {
  clientSink = sink;
  for (const queued of beforeSink.splice(0)) sink(queued.event, queued.properties);
}

/** Test seam. Nothing in the application calls this. */
export function resetToolRunSink(): void {
  clientSink = null;
  beforeSink.length = 0;
}

/**
 * The server event for one run. Keyed `tool:<slug>` rather than on anything
 * about the visitor, so PostHog's unique counts read "how many tools ran"
 * and never "how many people", which a cookieless site cannot know and must
 * not pretend to. Person profiles are refused by `captureBody` regardless.
 */
export function toolRunEvent(payload: ToolRunPayload): ServerEvent {
  const properties = toolRunProperties(payload);
  return { event: TOOL_RUN_EVENT, distinctId: `tool:${properties.tool}`, properties };
}

/**
 * Record a run. Resolves once the server capture has been attempted, or at
 * once in the browser. Never throws: `captureServerEvent` has no throwing path
 * and a sink is a plain function call.
 */
export async function trackToolRun(payload: ToolRunPayload): Promise<void> {
  const event = toolRunEvent(payload);
  if (typeof window === "undefined") {
    await captureServerEvent(event);
    return;
  }
  if (clientSink) clientSink(event.event, event.properties);
  else if (beforeSink.length < BEFORE_SINK_LIMIT) {
    beforeSink.push({ event: event.event, properties: event.properties });
  }
}
```

- [ ] **Step 9: Run the events tests to see them pass**

Run: `cd "$WT" && npx vitest run lib/tools/events.test.ts`
Expected: PASS.

- [ ] **Step 10: Register the client sink, and guard the registration**

In `components/analytics/PostHogAnalytics.tsx`, add the import under the existing `@/lib/analytics` import:

```ts
import { registerToolRunSink } from "@/lib/tools/events";
```

and directly after the `capture` function (after its closing brace, before the `IDLE_TIMEOUT_MS` docblock), add:

```ts
/**
 * Browser-side tool runs (`lib/tools/events.ts`) arrive through the same
 * queue as web vitals, so a run that happens before the SDK loads is kept.
 * Gated on `KEY` like everything else here: development reports nothing.
 */
registerToolRunSink((event, properties) => {
  if (!KEY) return;
  capture(event, properties);
});
```

Do not touch the `const KEY = ...` line, the `void import("posthog-js")` line or the `pending.push` line: the mutation check anchors all three.

Then in `components/analytics/PostHogAnalytics.test.ts`, add inside the existing `describe`:

```ts
  /**
   * The client half of `tool_run`. `lib/tools/events.test.ts` proves a
   * registered sink receives the event; this proves this component is the
   * thing that registers one, and that it keeps the development gate.
   */
  it("hands browser-side tool runs to the same queue, behind the same gate", () => {
    expect(source).toMatch(
      /registerToolRunSink\(\(event, properties\) => \{\s*if \(!KEY\) return;\s*capture\(event, properties\);\s*\}\);/,
    );
  });
```

Run: `cd "$WT" && npx vitest run components/analytics`
Expected: PASS.

- [ ] **Step 11: Write the failing action tests**

```ts
// app/tools/headline-check/actions.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The headline checker records one `tool_run` on every path out of its
 * action, with the outcome that path means, and never the URL.
 *
 * Runs the real action. `next/server`'s `after` is replaced with something
 * that runs the callback at once (the real one needs a request scope, which is
 * why `lib/after.ts` catches). `next/headers` is replaced so the IP can be
 * chosen per test, because the limiter is real and keyed on it. The page fetch
 * is mocked: the fence and the parser have their own suites, and this file is
 * about what gets recorded, not about what gets fetched.
 */

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: (work: () => unknown) => work() };
});

let requestHeaders: Record<string, string> = {};
vi.mock("next/headers", () => ({ headers: async () => new Headers(requestHeaders) }));

vi.mock("@/lib/headline-fetch", () => ({ fetchPage: vi.fn() }));

const { headlineCheckAction } = await import("./actions");
const { INITIAL_TOOL_STATE } = await import("./state");
const { fetchPage } = await import("@/lib/headline-fetch");

const GOOD_PAGE = {
  ok: true as const,
  finalUrl: "https://example.com/",
  redirects: 0,
  html: "<html><body><h1>Hello there</h1></body></html>",
};

const form = (url: string) => {
  const fd = new FormData();
  fd.set("url", url);
  return fd;
};

/** Every capture body sent, in order. */
const sent = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls.map((c) => JSON.parse(c[1].body) as { event: string; properties: Record<string, unknown> });

describe("headline-check records a tool_run", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const originalKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    fetchMock = vi.fn().mockResolvedValue(new Response('{"status":"Ok"}', { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.mocked(fetchPage).mockResolvedValue(GOOD_PAGE);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(fetchPage).mockReset();
    if (originalKey === undefined) delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    else process.env.NEXT_PUBLIC_POSTHOG_KEY = originalKey;
  });

  it("ok: a report came back", async () => {
    requestHeaders = { "x-real-ip": "10.1.0.1" };
    const state = await headlineCheckAction(INITIAL_TOOL_STATE, form("example.com"));
    expect(state.status).toBe("done");

    const events = sent(fetchMock);
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("tool_run");
    expect(events[0].properties.tool).toBe("headline-check");
    expect(events[0].properties.outcome).toBe("ok");
    expect(typeof events[0].properties.ms).toBe("number");
  });

  it("error: the page could not be read", async () => {
    requestHeaders = { "x-real-ip": "10.1.0.2" };
    vi.mocked(fetchPage).mockResolvedValue({ ok: false, detail: "That address is private." } as never);
    const state = await headlineCheckAction(INITIAL_TOOL_STATE, form("http://10.0.0.1/"));
    expect(state.status).toBe("failed");
    expect(sent(fetchMock).map((e) => e.properties.outcome)).toEqual(["error"]);
  });

  it("refused: nothing was typed", async () => {
    requestHeaders = { "x-real-ip": "10.1.0.3" };
    const state = await headlineCheckAction(INITIAL_TOOL_STATE, form("   "));
    expect(state.status).toBe("invalid");
    expect(sent(fetchMock).map((e) => e.properties.outcome)).toEqual(["refused"]);
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it("refused: the courtesy limit", async () => {
    // BUCKET_SIZE is 6. The seventh call from one address is refused, and
    // the recording says so rather than reading as a seventh success.
    requestHeaders = { "x-real-ip": "10.1.0.4" };
    let state = INITIAL_TOOL_STATE;
    for (let i = 0; i < 7; i++) state = await headlineCheckAction(state, form("example.com"));
    expect(state.status).toBe("limited");
    const outcomes = sent(fetchMock).map((e) => e.properties.outcome);
    expect(outcomes).toHaveLength(7);
    expect(outcomes.slice(0, 6).every((o) => o === "ok")).toBe(true);
    expect(outcomes[6]).toBe("refused");
  });

  it("never sends the URL, on any path", async () => {
    const typed = "https://example.com/private-page?token=do-not-record";
    requestHeaders = { "x-real-ip": "10.1.0.5" };
    await headlineCheckAction(INITIAL_TOOL_STATE, form(typed));
    vi.mocked(fetchPage).mockResolvedValue({ ok: false, detail: "nope" } as never);
    await headlineCheckAction(INITIAL_TOOL_STATE, form(typed));
    for (const call of fetchMock.mock.calls) {
      expect(String(call[1].body)).not.toContain("do-not-record");
      expect(String(call[1].body)).not.toContain("private-page");
    }
  });

  it("still answers when PostHog is down", async () => {
    requestHeaders = { "x-real-ip": "10.1.0.6" };
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));
    const state = await headlineCheckAction(INITIAL_TOOL_STATE, form("example.com"));
    expect(state.status).toBe("done");
  });
});
```

- [ ] **Step 12: Run it to see it fail**

Run: `cd "$WT" && npx vitest run app/tools/headline-check/actions.test.ts`
Expected: FAIL: the action returns the right states, and `sent(fetchMock)` is empty on every case ("expected [] to have length 1").

- [ ] **Step 13: Make the action record every path out, and hash its limiter key**

Replace `app/tools/headline-check/actions.ts` in full. The docblocks about the header order are kept word for word; only the imports, the two helpers and the `record(...)` calls are new.

```ts
"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { afterResponse } from "@/lib/after";
import type { ToolOutcome } from "@/lib/analytics";
import { checkHtml } from "@/lib/headline";
import { fetchPage } from "@/lib/headline-fetch";
import { trackToolRun } from "@/lib/tools/events";
import { takeToken } from "./rate-limit";
import { MAX_URL_LENGTH, URL_FIELD, headlineCopy, type ToolState } from "./state";

const TOOL = "headline-check";

/**
 * The limiter's key: a hash of the address, not the address.
 *
 * The page says "keeps a hashed IP for a day, nothing else". The "for a day"
 * half is F4's Redis budget; until it lands this bucket lives in one process's
 * memory for at most a minute, which is less retention than the line claims,
 * not more. The "hashed" half is this function, so the line is true on the day
 * it ships. Same address, same bucket, which is all the limiter needs.
 */
function limiterKey(ip: string): string {
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

/**
 * Record one run. Called exactly once on every path out of the action, after
 * the reply has been decided, and never with the URL: `toolRunProperties`
 * would drop it anyway, and this call site does not offer it.
 */
function record(outcome: ToolOutcome, started: number): void {
  afterResponse(() => trackToolRun({ tool: TOOL, outcome, ms: Date.now() - started }));
}

/**
 * The server action the form posts to.
 *
 * Thin on purpose. The two things worth getting right, extracting a heading and
 * refusing to fetch an address this server should not reach, live in
 * `lib/headline.ts` and `lib/headline-fetch.ts` with tests against them: a
 * `"use server"` module is a network boundary, and logic behind one only ever
 * gets exercised by a stranger who has already pasted a URL.
 *
 * **Every path out of here carries a message.** There is no branch that returns
 * a bare failure, because "nothing happened" is the exact bug the rest of this
 * site has a rule about. And every path out records one `tool_run`: `refused`
 * when nothing was attempted, `error` when the fetch failed, `ok` otherwise.
 */
export async function headlineCheckAction(
  prev: ToolState,
  formData: FormData,
): Promise<ToolState> {
  const started = Date.now();

  // Counts answers, so the form can re-key its input and keep the URL in it.
  const seq = (prev?.seq ?? 0) + 1;

  const raw = String(formData.get(URL_FIELD) ?? "").trim();
  if (raw === "") {
    record("refused", started);
    return { status: "invalid", seq, url: "", message: headlineCopy.emptyUrl };
  }
  if (raw.length > MAX_URL_LENGTH) {
    record("refused", started);
    return { status: "invalid", seq, url: raw.slice(0, 200), message: headlineCopy.tooLong };
  }

  // Read before the fetch, so a refused visitor costs nothing outbound.
  //
  // `x-real-ip` first, and the LAST entry of `x-forwarded-for` after it. This
  // read the first entry of `x-forwarded-for` until 2026-08-21, and review was
  // right that it is the wrong end of the chain: `x-forwarded-for` accumulates
  // left to right, so the leftmost value is whatever the client sent and the
  // rightmost is what the nearest proxy appended. Keying a limiter on the
  // leftmost hands every caller a fresh bucket for the price of one header.
  //
  // Vercel does overwrite the header rather than append to it, so on this host
  // both ends are the same value. That is a fact about today's platform, not a
  // property of the code, and it is exactly the sort of assumption that stops
  // being true somewhere else.
  const header = await headers();
  const forwarded = header.get("x-forwarded-for") ?? "";
  const chain = forwarded
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const ip = header.get("x-real-ip")?.trim() || chain[chain.length - 1] || "unknown";
  if (!takeToken(limiterKey(ip))) {
    record("refused", started);
    return { status: "limited", seq, url: raw, message: headlineCopy.limited };
  }

  const page = await fetchPage(raw);
  if (!page.ok) {
    record("error", started);
    // `detail` is written for a person and always names the actual fault: the
    // scheme, the address, the status code, the content type.
    return { status: "failed", seq, url: raw, message: page.detail };
  }

  record("ok", started);
  return {
    status: "done",
    seq,
    url: raw,
    finalUrl: page.finalUrl,
    redirects: page.redirects,
    report: checkHtml(page.html),
  };
}
```

- [ ] **Step 14: Run the action tests, then the whole suite**

Run: `cd "$WT" && npx vitest run app/tools/headline-check && npx tsc --noEmit && npm test -- --reporter=dot 2>&1 | tail -3`
Expected: PASS, `tsc` silent, zero failures. `rate-limit.test.ts` is unaffected: it calls `takeToken` with its own keys.

- [ ] **Step 15: Teach the mutation check the two new guards**

Append to `MUTATIONS` in `scripts/mutation-check.mjs`, before the closing `];`:

```js
  {
    name: "PRIVACY: tool_run starts spreading its payload, so a careless caller ships the visitor's URL",
    file: "lib/analytics.ts",
    pattern: /  return \{ tool, outcome, ms \};/,
    replace:
      "  return { ...(payload as unknown as Record<string, unknown>), tool, outcome, ms } as { tool: string; outcome: ToolOutcome; ms: number };",
  },
  {
    name: "the headline checker stops recording a refused run, so refusals read as silence",
    file: "app/tools/headline-check/actions.ts",
    pattern: /    record\("refused", started\);\r?\n    return \{ status: "invalid", seq, url: "", message: headlineCopy\.emptyUrl \};/,
    replace: '    return { status: "invalid", seq, url: "", message: headlineCopy.emptyUrl };',
  },
```

Run: `cd "$WT" && node scripts/mutation-check.mjs 2>&1 | tail -8`
Expected: the last line reads `N/N mutations caught.` with `N` two higher than before and no `Survived` list. Takes a few minutes. An `ANCHOR-MISS` means a pattern above does not match the file as written; fix the pattern, not the file.

- [ ] **Step 16: Record the event in the measurement doc**

In `docs/measurement.md`, add to the events table after the `mcp_request` row:

```markdown
| `tool_run` | `lib/tools/events.ts`, from a tool's server action inside `after()`, or from a browser-only tool through the PostHog queue | `tool:<slug>` on the server, server-side hash in the browser | `tool`, `outcome` (`ok`, `refused`, `error`), `ms`. Never the input: the properties are whitelisted in `lib/analytics.ts` and the mutation check breaks that whitelist on purpose. |
```

- [ ] **Step 17: Commit**

```bash
cd "$WT"
git add lib/analytics.ts lib/analytics.test.ts lib/after.ts app/api/mcp/route.ts lib/tools/events.ts lib/tools/events.test.ts components/analytics app/tools/headline-check/actions.ts app/tools/headline-check/actions.test.ts scripts/mutation-check.mjs docs/measurement.md
git commit -m "feat(analytics): tool_run, recorded on every path out of a tool and never with the input"
```

---
### Task 7: The phone check, and the proof that it can fail

**Files:**
- Modify: `package.json` (devDependency `playwright`, script `phone-check`)
- Modify: `package-lock.json` (by `npm install`)
- Modify: `.gitignore` (add `.phone-check/`)
- Create: `scripts/phone-check.mjs`
- Create: `scripts/phone-check-fixtures/bad.html`
- Create: `scripts/phone-check-fixtures/good.html`

**Interfaces:**
- Consumes: `playwright` (`chromium`, `webkit`, `devices`), `sharp` (already installed, decodes PNG to raw RGBA), `/sitemap.xml` on the running site
- Produces: `node scripts/phone-check.mjs --base <url> --routes <a,b>` (exit 1 on any failure), `--from-sitemap` (adds every `/tools*` route the running site's sitemap lists), `--self-test` (fixtures only, no `--base` needed), `--out <dir>` (screenshots, default `.phone-check/`). Named failure lines of the form `FAIL <profile> <route> <check> <element> <detail>` where `<check>` is one of `overflow`, `input-font`, `tap-target`, `contrast`.

**Why `playwright` earns its place.** The design (section 9) says the phone check runs on real engines: WebKit, because that is what every iPhone renders with and no Chromium emulation of it exists, and a throttled Chromium for the Pixel. Playwright is the one package that ships a Linux and Windows WebKit build that can be driven from Node. `playwright-core` plus a separately installed browser would save nothing here, because the browser download is the cost either way. It is a devDependency: nothing in the site imports it.

**Why contrast is sampled from pixels.** `app/globals.test.ts` proves the tokens clear 4.5:1. That is a fact about the stylesheet, not about the screen: between the token and the eye sit the scanline overlay, the phosphor shader, `text-shadow` glow, translucent panels and whatever a theme does to `--bg`. CLAIMS.md rule 6, check the thing that ships. So the script screenshots the page and reads the pixels under each text run.

- [ ] **Step 1: Install Playwright and its two browsers**

```bash
cd "$WT"
npm install --save-dev playwright
```

If that fails with `ERESOLVE` naming `@sveltejs/kit` or `vite`, that is the `@vercel/analytics` optional peer (AGENTS.md, Analytics), and the documented answer is:

```bash
npm install --save-dev --legacy-peer-deps playwright
```

Do **not** add an `.npmrc`. Then:

```bash
cd "$WT"
npx playwright install webkit chromium
git diff --stat package.json package-lock.json
grep -n '"playwright"' package.json
```

Expected: `package.json` gains one line under `devDependencies`, the lockfile grows, and nothing else in `package.json` changes. Record the installed version in the ledger later.

Add the script to `package.json` `scripts`, alphabetically after `mutation` is not a script, so after `indexnow`:

```json
    "phone-check": "node scripts/phone-check.mjs",
```

And append to `.gitignore`:

```
# phone-check screenshots
.phone-check/
```

- [ ] **Step 2: Write the two fixtures**

`scripts/phone-check-fixtures/bad.html`, one planted fault of each kind plus a control for each:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>phone-check fixture: bad</title>
<style>
  body { margin: 16px; font: 16px/1.5 system-ui, sans-serif; color: #111; background: #fff; }
  label { display: inline-block; min-width: 44px; min-height: 44px; line-height: 44px; }
  /* Planted faults, one per check. */
  #wide { width: 600px; height: 20px; background: #eee; }
  #small { font-size: 14px; }
  #tiny, #optout { width: 30px; height: 30px; padding: 0; }
  #dim { color: #777; background: #666; }
  /* Controls that must pass. */
  #fine { color: #111; background: #fff; }
  #ok { font-size: 16px; }
  #big { min-width: 48px; min-height: 48px; }
</style>
</head>
<body>
<h1>Bad fixture</h1>
<p id="fine">Readable control paragraph, near-black on white.</p>
<p id="dim">Dim paragraph, grey on grey, which no thumb should have to read.</p>
<div id="wide"></div>
<p>
  <label for="small">Small</label> <input id="small" type="text" value="14px">
  <label for="ok">Fine</label> <input id="ok" type="text" value="16px">
</p>
<p>
  <button id="tiny" type="button">t</button>
  <button id="optout" type="button" data-small-target="fixture: proves the opt-out is honoured">o</button>
  <button id="big" type="button">Big enough</button>
</p>
</body>
</html>
```

`scripts/phone-check-fixtures/good.html`, the same page with every fault fixed, plus one inline link so the inline exemption is exercised and visible:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>phone-check fixture: good</title>
<style>
  body { margin: 16px; font: 16px/1.5 system-ui, sans-serif; color: #111; background: #fff; }
  label { display: inline-block; min-width: 44px; min-height: 44px; line-height: 44px; }
  #wide { width: 100%; height: 20px; background: #eee; }
  #small, #ok { font-size: 16px; }
  #tiny, #optout, #big { min-width: 48px; min-height: 48px; }
  #dim { color: #333; background: #fff; }
  #fine { color: #111; background: #fff; }
  #block { display: block; min-height: 48px; line-height: 48px; }
</style>
</head>
<body>
<h1>Good fixture</h1>
<p id="fine">Readable control paragraph, near-black on white.</p>
<p id="dim">Formerly dim paragraph, now dark grey on white, with <a id="inline" href="#fine">an inline link in a sentence</a> that is exempt from the tap-target rule.</p>
<div id="wide"></div>
<p>
  <label for="small">Small</label> <input id="small" type="text" value="16px">
  <label for="ok">Fine</label> <input id="ok" type="text" value="16px">
</p>
<p>
  <button id="tiny" type="button">t</button>
  <button id="optout" type="button">o</button>
  <button id="big" type="button">Big enough</button>
</p>
<a id="block" href="#fine">A block link, tall enough for a thumb</a>
</body>
</html>
```

- [ ] **Step 3: Write the script**

```js
#!/usr/bin/env node
/**
 * Phone check.
 *
 * Drives each route through three real mobile engines and fails on the four
 * things a resized desktop window cannot tell you:
 *
 *   overflow      the document is wider than the viewport (the widest element is named)
 *   input-font    an input, textarea or select whose computed font-size is under
 *                 16px (iOS zooms the whole page when one is focused)
 *   tap-target    a tappable element whose box is under 44 by 44 CSS px
 *   contrast      text whose composited contrast, sampled from the screenshot,
 *                 is under 4.5:1
 *
 * ## Why contrast is sampled from pixels rather than read from tokens
 *
 * `app/globals.test.ts` proves the colour tokens clear 4.5:1 against their
 * backgrounds. That is a fact about the stylesheet. It is not a fact about what
 * a visitor sees, because between the token and the eye sit the scanline
 * overlay, the phosphor shader, `text-shadow` glow, translucent panels and
 * whatever a theme does to `--bg`. Check the thing that ships. So this takes a
 * full-page screenshot, finds every element that has its own text, and reads
 * the pixels inside that text's rectangles. The foreground is estimated as the
 * 15% of pixels closest to the element's computed `color`; the background is
 * the per-channel median of the rest. WCAG contrast is computed on those two.
 *
 * It is an estimate, and the summary names the element so a person can look.
 * Things that fool it: a glow that fills most of a very small rect, text over a
 * photograph, text mid-fade. The last is why every context runs with
 * `prefers-reduced-motion: reduce`: the colour of a word halfway through a
 * fade is not the colour anybody reads, and the scrambled heading under
 * `no-preference` is a stream of random glyphs at the moment of the shot. The
 * four checks are about layout and colour, which do not depend on motion;
 * motion is On the glass's job, not this script's.
 *
 * ## Tap targets and inline links
 *
 * A link inside a sentence is exempt, the way WCAG 2.5.8 exempts it: an inline
 * `<a>` whose parent has more text than the link itself is listed as `inline`
 * in the summary and does not fail. Everything else under 44 by 44 fails
 * unless it carries `data-small-target="<reason>"`, and the reason is printed.
 * Buttons and inputs are never exempt.
 *
 * ## Profiles
 *
 *   iphone-390   WebKit, Playwright's iPhone 13 (390 by 844, DSF 3)
 *   iphone-320   WebKit, the same phone at the 1st-generation SE viewport
 *                (320 by 568, DSF 2), which is the narrowest screen still in use
 *   pixel-slow   Chromium, Pixel 5, CPU throttled 4x and the network held at
 *                DevTools' "Slow 4G" preset over CDP
 *
 * "Slow 4G" is what DevTools used to call "Slow 3G": 500 kbit/s each way with
 * the 0.8 factor DevTools applies (50,000 bytes per second) and 400 ms of
 * latency times its 5x multiplier (2,000 ms). Throttling does not change what
 * the four checks measure; it is there so a page that only settles after its
 * scripts load is measured after they load on a slow phone.
 *
 * ## Self-test
 *
 * `--self-test` serves two bundled fixtures and asserts that every planted
 * fault on the bad one is caught, on every profile, that the opt-out and the
 * controls are not reported, and that the good one passes clean. It runs
 * first in CI, before any real route, because a check that has never been
 * seen to fail is a ritual (CLAIMS.md, rule 1: prove the instrument first).
 *
 * Usage:
 *   node scripts/phone-check.mjs --self-test
 *   node scripts/phone-check.mjs --base http://localhost:3000 --routes /tools,/tools/headline-check
 *   node scripts/phone-check.mjs --base http://localhost:3000 --from-sitemap
 *   node scripts/phone-check.mjs --base http://localhost:3000 --from-sitemap --out .phone-check
 */
import { chromium, devices, webkit } from "playwright";
import sharp from "sharp";
import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES = join(ROOT, "scripts", "phone-check-fixtures");

const MIN_INPUT_FONT_PX = 16;
const MIN_TAP_PX = 44;
const MIN_CONTRAST = 4.5;

const SLOW_4G = { offline: false, downloadThroughput: 50_000, uploadThroughput: 50_000, latency: 2000 };
const CPU_THROTTLE_RATE = 4;

const PROFILES = [
  { id: "iphone-390", engine: "webkit", device: { ...devices["iPhone 13"] } },
  {
    id: "iphone-320",
    engine: "webkit",
    device: { ...devices["iPhone 13"], viewport: { width: 320, height: 568 }, deviceScaleFactor: 2 },
  },
  { id: "pixel-slow", engine: "chromium", device: { ...devices["Pixel 5"] }, throttle: true },
];

/* ------------------------------------------------------------------ */
/* Arguments                                                            */
/* ------------------------------------------------------------------ */

function parseArgs(argv) {
  const out = {
    base: "http://localhost:3000",
    routes: [],
    fromSitemap: false,
    selfTest: false,
    out: join(ROOT, ".phone-check"),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--base") out.base = argv[++i];
    else if (a === "--routes") out.routes = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--from-sitemap") out.fromSitemap = true;
    else if (a === "--self-test") out.selfTest = true;
    else if (a === "--out") out.out = argv[++i];
    else throw new Error(`unknown argument: ${a}`);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* In the page                                                          */
/* ------------------------------------------------------------------ */

/**
 * Runs inside the browser via `page.evaluate`. Self-contained on purpose:
 * Playwright serialises the function's source, so it may not reach anything
 * in this module's scope. Everything it needs arrives in the argument.
 */
function auditInPage({ minInput, minTap }) {
  const path = (el) => {
    const parts = [];
    let node = el;
    while (node && node !== document.body && parts.length < 4) {
      let part = node.tagName.toLowerCase();
      if (node.id) {
        parts.unshift(`${part}#${node.id}`);
        break;
      }
      const cls = [...node.classList].slice(0, 2).join(".");
      if (cls) part += `.${cls}`;
      const siblings = node.parentElement
        ? [...node.parentElement.children].filter((c) => c.tagName === node.tagName)
        : [];
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
      parts.unshift(part);
      node = node.parentElement;
    }
    return parts.join(" > ");
  };

  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const failures = [];
  const inline = [];
  const exempt = [];

  // 1. Overflow, naming the element whose right edge reaches furthest.
  const doc = document.scrollingElement || document.documentElement;
  if (doc.scrollWidth > window.innerWidth) {
    let widest = null;
    let edge = 0;
    for (const el of document.querySelectorAll("body *")) {
      if (!visible(el)) continue;
      const right = el.getBoundingClientRect().right + window.scrollX;
      if (right > edge) {
        edge = right;
        widest = el;
      }
    }
    failures.push({
      check: "overflow",
      el: widest ? path(widest) : "(unknown)",
      detail: `scrollWidth ${doc.scrollWidth} > innerWidth ${window.innerWidth}; widest right edge at ${Math.round(edge)}px`,
    });
  }

  // 2. Inputs under 16px.
  for (const el of document.querySelectorAll("input, textarea, select")) {
    if (!visible(el) || el.type === "hidden") continue;
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (size < minInput) failures.push({ check: "input-font", el: path(el), detail: `${size}px` });
  }

  // 3. Tap targets.
  for (const el of document.querySelectorAll("a, button, [role=button], input, select, textarea, label[for]")) {
    if (!visible(el) || el.type === "hidden") continue;
    const r = el.getBoundingClientRect();
    if (r.width >= minTap && r.height >= minTap) continue;
    const size = `${Math.round(r.width)}x${Math.round(r.height)}`;
    const reason = (el.getAttribute("data-small-target") || "").trim();
    if (reason) {
      exempt.push({ el: path(el), size, reason });
      continue;
    }
    const cs = getComputedStyle(el);
    const parentText = (el.parentElement?.textContent || "").trim();
    const ownText = (el.textContent || "").trim();
    if (el.tagName === "A" && cs.display === "inline" && parentText.length > ownText.length) {
      inline.push({ el: path(el), size });
      continue;
    }
    failures.push({ check: "tap-target", el: path(el), detail: size });
  }

  // 4. Text runs, for the contrast pass outside the page.
  const texts = [];
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.nodeValue || !node.nodeValue.trim()) continue;
    const el = node.parentElement;
    if (!el || seen.has(el) || !visible(el)) continue;
    if (el.closest("script, style, noscript, canvas, svg, template")) continue;
    seen.add(el);
    const cs = getComputedStyle(el);
    const rects = [];
    for (const child of el.childNodes) {
      if (child.nodeType !== Node.TEXT_NODE || !child.nodeValue.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(child);
      for (const r of range.getClientRects()) {
        if (r.width < 2 || r.height < 2) continue;
        rects.push({ x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height });
      }
    }
    if (rects.length) {
      texts.push({
        el: path(el),
        color: cs.color,
        fontSize: parseFloat(cs.fontSize),
        text: (el.textContent || "").trim().slice(0, 40),
        rects,
      });
    }
  }

  return {
    failures,
    inline,
    exempt,
    texts,
    innerWidth: window.innerWidth,
    scrollWidth: doc.scrollWidth,
    scrollHeight: doc.scrollHeight,
  };
}

/* ------------------------------------------------------------------ */
/* Contrast, from the pixels                                            */
/* ------------------------------------------------------------------ */

function parseColor(css) {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(css);
  if (!m) return null;
  const alpha = m[4] === undefined ? 1 : Number(m[4]);
  if (alpha === 0) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** WCAG relative luminance, the same formula as app/globals.test.ts. */
function luminance([r, g, b]) {
  const chan = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const medianColour = (pixels) => [0, 1, 2].map((i) => median(pixels.map((p) => p[i])));
const meanColour = (pixels) =>
  [0, 1, 2].map((i) => Math.round(pixels.reduce((s, p) => s + p[i], 0) / pixels.length));
const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

async function decode(png) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

/**
 * The estimate. Ink is the mean of the 15% of pixels nearest the computed
 * colour (at least eight); paper is the per-channel median of everything
 * else. Returns null when there is too little to sample or the text is
 * transparent.
 */
function sampleContrast(image, entry, scale) {
  const fg = parseColor(entry.color);
  if (!fg) return null;
  const pixels = [];
  for (const r of entry.rects) {
    const x0 = Math.max(0, Math.floor(r.x * scale));
    const y0 = Math.max(0, Math.floor(r.y * scale));
    const x1 = Math.min(image.width, Math.ceil((r.x + r.w) * scale));
    const y1 = Math.min(image.height, Math.ceil((r.y + r.h) * scale));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * image.width + x) * image.channels;
        pixels.push([image.data[i], image.data[i + 1], image.data[i + 2]]);
      }
    }
  }
  if (pixels.length < 32) return null;
  const ranked = pixels.map((p) => ({ p, d: dist2(p, fg) })).sort((a, b) => a.d - b.d);
  const n = Math.max(8, Math.floor(ranked.length * 0.15));
  const ink = meanColour(ranked.slice(0, n).map((x) => x.p));
  const paper = medianColour(ranked.slice(n).map((x) => x.p));
  return { ratio: contrast(ink, paper), ink, paper };
}

/* ------------------------------------------------------------------ */
/* One route, one profile                                               */
/* ------------------------------------------------------------------ */

async function checkRoute(browser, profile, url, outDir, label) {
  const context = await browser.newContext({ ...profile.device, reducedMotion: "reduce" });
  const page = await context.newPage();
  if (profile.throttle) {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE_RATE });
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", SLOW_4G);
  }
  const timeout = profile.throttle ? 120_000 : 45_000;
  await page.goto(url, { waitUntil: "networkidle", timeout });
  await page.waitForTimeout(500);

  const audit = await page.evaluate(auditInPage, { minInput: MIN_INPUT_FONT_PX, minTap: MIN_TAP_PX });
  const png = await page.screenshot({ fullPage: true, animations: "disabled", caret: "hide" });
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${label}.${profile.id}.png`), png);

  const image = await decode(png);
  // Measured, not assumed: a full-page shot is the page's CSS width times the
  // device scale factor, and on an overflowing page the page is wider than
  // the viewport.
  const scale = image.width / Math.max(audit.innerWidth, audit.scrollWidth);

  const contrastFailures = [];
  let sampled = 0;
  for (const entry of audit.texts) {
    const s = sampleContrast(image, entry, scale);
    if (!s) continue;
    sampled += 1;
    if (s.ratio < MIN_CONTRAST) {
      contrastFailures.push({
        check: "contrast",
        el: entry.el,
        detail: `${s.ratio.toFixed(2)}:1, ink rgb(${s.ink.join(",")}) on rgb(${s.paper.join(",")}), "${entry.text}"`,
      });
    }
  }

  await context.close();
  return {
    profile: profile.id,
    url,
    label,
    failures: [...audit.failures, ...contrastFailures],
    inline: audit.inline,
    exempt: audit.exempt,
    sampled,
  };
}

async function runAll(targets, outDir) {
  const results = [];
  for (const engineName of ["webkit", "chromium"]) {
    const browser = await (engineName === "webkit" ? webkit : chromium).launch();
    try {
      for (const profile of PROFILES.filter((p) => p.engine === engineName)) {
        for (const t of targets) results.push(await checkRoute(browser, profile, t.url, outDir, t.label));
      }
    } finally {
      await browser.close();
    }
  }
  return results;
}

/* ------------------------------------------------------------------ */
/* Reporting                                                            */
/* ------------------------------------------------------------------ */

const CHECKS = ["overflow", "input-font", "tap-target", "contrast"];

/** Prints the table and the failure lines. Returns true if anything failed. */
function printSummary(results) {
  const rows = results.map((r) => {
    const counts = CHECKS.map((c) => r.failures.filter((f) => f.check === c).length);
    return [r.label, r.profile, ...counts.map(String), String(r.sampled), counts.some((n) => n > 0) ? "FAIL" : "ok"];
  });
  const head = ["route", "profile", ...CHECKS, "sampled", "verdict"];
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join("  ");
  console.log(line(head));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const r of rows) console.log(line(r));

  let failed = false;
  for (const r of results) {
    for (const f of r.failures) {
      failed = true;
      console.log(`FAIL ${r.profile} ${r.label} ${f.check} ${f.el} ${f.detail}`);
    }
    for (const e of r.exempt) console.log(`exempt ${r.profile} ${r.label} tap-target ${e.el} ${e.size} (${e.reason})`);
    for (const i of r.inline) console.log(`inline ${r.profile} ${r.label} tap-target ${i.el} ${i.size}`);
  }
  return failed;
}

/* ------------------------------------------------------------------ */
/* Routes                                                               */
/* ------------------------------------------------------------------ */

function labelFor(route) {
  return route.replace(/^\//, "").replace(/\//g, "_") || "root";
}

/** Every `/tools*` path the running site's sitemap lists. */
async function routesFromSitemap(base) {
  const res = await fetch(new URL("/sitemap.xml", base));
  if (!res.ok) throw new Error(`sitemap.xml answered ${res.status}`);
  const xml = await res.text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => new URL(m[1]).pathname)
    .filter((p) => p === "/tools" || p.startsWith("/tools/"));
}

/* ------------------------------------------------------------------ */
/* Self-test                                                            */
/* ------------------------------------------------------------------ */

async function selfTest(args) {
  const server = createServer((req, res) => {
    const name = req.url === "/good" ? "good.html" : req.url === "/bad" ? "bad.html" : null;
    if (!name) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(readFileSync(join(FIXTURES, name)));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    const results = await runAll(
      [
        { label: "bad", url: `${base}/bad` },
        { label: "good", url: `${base}/good` },
      ],
      join(args.out, "self-test"),
    );
    const problems = [];
    const caught = (r, check, el) => r.failures.some((f) => f.check === check && f.el.includes(el));

    for (const r of results.filter((r) => r.label === "bad")) {
      for (const [check, el] of [
        ["overflow", "div#wide"],
        ["input-font", "input#small"],
        ["tap-target", "button#tiny"],
        ["contrast", "p#dim"],
      ]) {
        if (!caught(r, check, el)) problems.push(`${r.profile} bad: ${check} on ${el} was not caught`);
      }
      for (const [check, el] of [
        ["tap-target", "button#optout"],
        ["tap-target", "button#big"],
        ["input-font", "input#ok"],
        ["contrast", "p#fine"],
      ]) {
        if (caught(r, check, el)) problems.push(`${r.profile} bad: ${check} on ${el} was reported and must not be`);
      }
      if (!r.exempt.some((e) => e.el.includes("button#optout"))) {
        problems.push(`${r.profile} bad: the opt-out was not listed as exempt`);
      }
    }

    for (const r of results.filter((r) => r.label === "good")) {
      if (r.failures.length) {
        problems.push(
          `${r.profile} good: ${r.failures.length} failure(s) on a page with none: ${r.failures.map((f) => `${f.check} ${f.el}`).join("; ")}`,
        );
      }
      if (r.sampled < 3) problems.push(`${r.profile} good: only ${r.sampled} text elements sampled`);
      if (!r.inline.some((i) => i.el.includes("a#inline"))) {
        problems.push(`${r.profile} good: the inline link was not listed as inline`);
      }
    }

    printSummary(results);
    if (problems.length) {
      console.log("\nSELF-TEST FAILED");
      for (const p of problems) console.log(` - ${p}`);
      process.exitCode = 1;
    } else {
      console.log(
        `\nSELF-TEST OK: every planted fault caught on ${PROFILES.length} profiles, the clean page passed on all of them.`,
      );
      process.exitCode = 0;
    }
  } finally {
    server.close();
  }
}

/* ------------------------------------------------------------------ */
/* Main                                                                 */
/* ------------------------------------------------------------------ */

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfTest) return selfTest(args);

  let routes = args.routes;
  if (args.fromSitemap) routes = [...new Set([...routes, ...(await routesFromSitemap(args.base))])];
  if (routes.length === 0) throw new Error("no routes: pass --routes a,b or --from-sitemap");

  const targets = routes.map((r) => ({ label: labelFor(r), url: new URL(r, args.base).toString() }));
  console.log(`phone-check: ${targets.length} route(s) x ${PROFILES.length} profiles against ${args.base}`);
  const results = await runAll(targets, args.out);
  const failed = printSummary(results);
  console.log(failed ? "\nphone-check: FAILED" : "\nphone-check: passed");
  process.exitCode = failed ? 1 : 0;
}

main().catch((error) => {
  console.error(`phone-check: ${error.stack || error}`);
  process.exitCode = 2;
});
```

- [ ] **Step 4: Run the self-test and read what it says**

Run: `cd "$WT" && node scripts/phone-check.mjs --self-test`
Expected: a six-row table (`bad` and `good` on each of three profiles), four `FAIL` lines per `bad` row naming `div#wide`, `input#small`, `button#tiny` and `p#dim`, one `exempt` line per `bad` row for `button#optout`, one `inline` line per `good` row for `a#inline`, zero `FAIL` lines on any `good` row, and the last line `SELF-TEST OK`. Exit code 0 (`echo $?`).

If a `bad` row misses a fault, the check for it is broken and the fixture is right: fix the check. If a `good` row fails, either the fixture or the check is wrong; read the named element before touching either. If `p#dim` is not caught, print `s.ratio` for it and look at the screenshot in `.phone-check/self-test/bad.iphone-390.png` before changing the sampling.

- [ ] **Step 5: Prove the self-test itself can fail**

Comment out the `failures.push({ check: "input-font", ...` line in `auditInPage`, run `node scripts/phone-check.mjs --self-test`, and expect `SELF-TEST FAILED` with three `input-font on input#small was not caught` lines and exit code 1. Restore the line, run again, expect `SELF-TEST OK`. The plan does not commit until the second run.

- [ ] **Step 6: Commit**

```bash
cd "$WT"
git add package.json package-lock.json .gitignore scripts/phone-check.mjs scripts/phone-check-fixtures
git commit -m "feat(ci): the phone check, with a self-test that plants one fault of each kind and catches them"
```

---
### Task 8: Run the phone check on the real routes, and fix what it names

**Files:**
- Modify: whatever the run names. Predicted (guesses, untested, see below): `app/globals.css` (the `.nav__link` touch rule near line 1728), `app/tools/headline-check/tool.css` (the `(hover: none)` block at its end)

**Interfaces:**
- Consumes: the production build from Task 5, the script from Task 7
- Produces: the acceptance evidence for F3, verbatim in the ledger

**Predictions, written down before the run so the run can prove them wrong (CLAIMS.md, rule 2).** These are guesses from reading the CSS, and none has been observed:

1. `tap-target` on every `.nav__link` on every route: the touch rule says `min-height: 40px` while its own comment says 44 is the floor.
2. `tap-target` on `.hcheck__input` on `/tools/headline-check`: 8px padding above and below a 16px line and a 1px border is about 37px.
3. `inline` (not a failure) on the `prose__link` inside the "why" paragraph.
4. Unknown: the `Talk` block's `.talk__cta`, the status bar's `.machine__btn` controls, and whether the scanline overlay drags any sampled contrast under 4.5. The run will say.

- [ ] **Step 1: Build and start the production server**

```bash
cd "$WT"
npm run build 2>&1 | tail -5
(npm start > .f3-server.log 2>&1 &)
for i in $(seq 1 30); do curl -sf http://localhost:3000/tools > /dev/null && break; sleep 1; done
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/tools
```

Expected: `200`.

- [ ] **Step 2: Run the check from the sitemap, and keep the output**

```bash
cd "$WT"
node scripts/phone-check.mjs --base http://localhost:3000 --from-sitemap --out .phone-check | tee .phone-check/first-run.txt
echo "exit: $?"
```

Expected: the header line says `2 route(s) x 3 profiles` (`/tools` and `/tools/headline-check`), and then whatever it finds. Paste the table and every `FAIL`, `exempt` and `inline` line into the ledger log under a "F3 first phone-check run" heading before changing anything. That paste is the observation; everything after it is a fix.

- [ ] **Step 3: Fix each named failure in the file that owns it**

Rules: a shell failure (nav, status bar, `Talk`) is fixed in `app/globals.css`; a checker failure in `app/tools/headline-check/tool.css`. The threshold constants in the script are not touched. `data-small-target` is for a control that is deliberately small and has a reason a reviewer would accept written into the attribute; it is never for something a thumb is meant to hit.

If prediction 1 held, in `app/globals.css` change the touch rule for `.nav__link` (the block whose comment reads "Real touch targets. 44px is the floor") from `min-height: 40px;` to `min-height: 44px;`. `--nav-h` is 44px, so the links fill the bar and nothing else moves.

If prediction 2 held, append to the `@media (hover: none)` block at the end of `app/tools/headline-check/tool.css`:

```css
  /* Same floor as the buttons beside it. An input is tapped too. */
  .hcheck__input {
    min-height: 44px;
  }
```

For anything else the run names: look at the screenshot in `.phone-check/<route>.<profile>.png`, find the rule, pad or recolour it, and add one line to the ledger saying what was changed and why. A contrast failure is fixed by changing a colour token's *use* (a lighter token on that element), never by editing the token itself, because the tokens are proven on every theme in `app/globals.test.ts` and other surfaces depend on them.

- [ ] **Step 4: Rebuild, re-run, and confirm green**

```bash
cd "$WT"
pkill -f "next start" || true
npm run build 2>&1 | tail -3
(npm start > .f3-server.log 2>&1 &)
for i in $(seq 1 30); do curl -sf http://localhost:3000/tools > /dev/null && break; sleep 1; done
node scripts/phone-check.mjs --base http://localhost:3000 --from-sitemap --out .phone-check | tee .phone-check/second-run.txt
echo "exit: $?"
```

Expected: every row `ok`, no `FAIL` lines, `exit: 0`. On Windows, if `pkill` is not available, find the PID with `netstat -ano | findstr :3000` and `taskkill /PID <pid> /F`.

- [ ] **Step 5: Revert one fix to confirm the check saw it (CLAIMS.md, rule 3)**

Put the first fix back the way it was (for prediction 1: `min-height: 40px;`), rebuild, re-run against `/tools` only, and expect the exact `FAIL ... tap-target ... nav__link` lines to return. Then restore the fix, rebuild, re-run, expect green. Record both results in the ledger. If reverting the fix does **not** bring the failure back, the fix was not what made it pass, and the diagnosis is still open: stop and bisect before committing.

- [ ] **Step 6: Prove the form still works with JavaScript off**

The action changed in Task 6, and AGENTS.md says to prove this the way it was proved the first time. With the production server from Step 4 still running:

```bash
cd "$WT"
HTML=$(curl -s http://localhost:3000/tools/headline-check)
ACTION=$(echo "$HTML" | grep -o 'name="\$ACTION_ID_[0-9a-f]*"' | head -1 | sed 's/name="//;s/"$//')
echo "action field: $ACTION"
curl -s -X POST http://localhost:3000/tools/headline-check -F "$ACTION=" -F "url=example.com" \
  | grep -o 'hcheck__verdict is-[a-z0-9-]*\|hcheck__panel is-[a-z]*\|hcheck__error' | head -3
```

Expected: `action field: $ACTION_ID_<hash>` and then `hcheck__verdict is-clean` (example.com serves a plain `<h1>`). `hcheck__panel is-failed` means the fetch was refused or the machine is offline: read the panel body in the HTML before deciding which. The field name is Next's progressive-enhancement convention; if the grep finds nothing, read the hidden inputs in `$HTML` and use what is there.

Then stop the server.

- [ ] **Step 7: Run everything once more, and commit**

```bash
cd "$WT"
npx tsc --noEmit && npm test -- --reporter=dot 2>&1 | tail -3
git add -A app/globals.css app/tools/headline-check/tool.css
git status --short
git commit -m "fix(phone): what the first real phone check named, and nothing the check did not"
```

Expected: `git status --short` shows only the CSS files that the run made you touch. `.phone-check/` is ignored.

---

### Task 9: CI, the pull request, and the record

**Files:**
- Modify: `.github/workflows/ci.yml` (one new job)
- Modify: `docs/superpowers/programme/toolshed-ledger.md` (F3 row, log)
- Modify: `docs/PROGRESS.md` (new entry at the top)
- Modify: `AGENTS.md` (two sentences in "Stack & conventions")

**Interfaces:**
- Consumes: everything above
- Produces: a `phone` check on every pull request; F3 marked `live` with evidence

- [ ] **Step 1: Add the `phone` job**

Append to `.github/workflows/ci.yml` after the `mutation` job, and change the file's opening comment from "Two jobs." to "Three jobs." with one added sentence: "`phone` builds the site, serves it, proves the phone check can fail on its own fixtures, and then runs it on every live tool route the sitemap lists." The exact YAML:

```yaml
  phone:
    runs-on: ubuntu-latest
    timeout-minutes: 25
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      # Browser binaries are cached by lockfile hash; --with-deps still puts
      # the OS libraries WebKit needs on the runner, which is not cacheable.
      - uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ hashFiles('package-lock.json') }}
      - run: npx playwright install --with-deps webkit chromium
      - run: npm run build
        env:
          NEXT_PUBLIC_POSTHOG_KEY: ""
      - name: start the production server
        run: |
          nohup npm start > .phone-check-server.log 2>&1 &
          for i in $(seq 1 60); do
            if curl -sf http://localhost:3000/tools > /dev/null; then exit 0; fi
            sleep 1
          done
          echo "next start did not answer on :3000 within 60s"
          cat .phone-check-server.log
          exit 1
      # The instrument first. A check that has never been seen to fail proves
      # nothing when it passes.
      - name: prove the phone check can fail
        run: node scripts/phone-check.mjs --self-test --out .phone-check
      - name: phone check on every live tool route
        run: node scripts/phone-check.mjs --base http://localhost:3000 --from-sitemap --out .phone-check
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: phone-check-screenshots
          path: .phone-check/
          if-no-files-found: ignore
```

`NEXT_PUBLIC_POSTHOG_KEY` is empty on purpose, as in `check`: analytics compiles to a no-op and the served pages fire no beacons, so `networkidle` settles.

- [ ] **Step 2: Note the rules in AGENTS.md**

In "Stack & conventions", after the styling bullet that says hand-written CSS in `app/globals.css`, add to that bullet: "Since the toolshed programme (2026-09-03) a tool may own `app/tools/<slug>/tool.css`, imported by its own `page.tsx`; `globals.css` stays the shell's. The tools list lives in `content/tools/`, one file per tool, and every tool renders through `components/tools/ToolPage.tsx`." After the accessibility bullet add: "Every live tool route is driven through WebKit at 390 and 320 and a throttled Chromium in CI by `scripts/phone-check.mjs`, which fails on overflow, inputs under 16px, tap targets under 44px and sampled contrast under 4.5:1. A resized desktop window does not count."

- [ ] **Step 3: Push the branch and open the pull request**

```bash
cd "$WT"
git add .github/workflows/ci.yml AGENTS.md
git commit -m "ci: the phone job runs the self-test and then every live tool route"
git push -u origin toolshed/f3-tool-registry
gh pr create --title "feat(tools): the registry, the page shell, tool_run and the phone check" --body-file - <<'BODY'
F3 of the toolshed programme (`docs/superpowers/specs/2026-09-03-toolshed-programme-design.md`, section 6).

- `content/tools/` is the registry; `/tools`, the sitemap, `/llms.txt` and each tool page read from it. Headline-check is the first entry.
- `components/tools/ToolPage.tsx` is the shell: prompt line, heading, lede, privacy line, the tool, the "Can't see" list.
- Headline-check's CSS moved to `app/tools/headline-check/tool.css`. Its behaviour is unchanged; the visible differences are listed in Task 5 of the plan.
- `tool_run` is recorded on every path out of a tool with `{ tool, outcome, ms }` and never the input. The whitelist has a mutation.
- `scripts/phone-check.mjs` drives WebKit at 390 and 320 and a throttled Pixel, samples contrast from the screenshot, and proves it can fail with `--self-test`. The `phone` CI job runs it on every live tool route.
- One new devDependency: `playwright`.

Verified: unit suite, tsc, mutation check, the self-test, the phone check on both routes, and a no-JS POST of the form against a production build. Not verified: the live site (this is the PR), any theme other than the default under the phone check (it runs the default theme), and the `soon` rendering on a real entry (there is none yet; the fixture test covers the branch).

Plan: `docs/superpowers/plans/2026-09-03-toolshed-f3-tool-registry.md`.
BODY
gh pr checks --watch
```

Expected: `check`, `mutation` and `phone` all pass. If `phone` fails in CI and passed locally, download the `phone-check-screenshots` artifact and read the `FAIL` lines before touching anything: a Linux WebKit renders fonts differently from a Windows one, and a contrast sample can move a few hundredths. That is a finding about the estimate, not a licence to lower the floor.

- [ ] **Step 4: Require the new check on main**

Only after `phone` has passed at least once on the PR (GitHub needs to have seen the context name):

```bash
gh api -X PUT repos/fergo5002/fergus-portfolio/branches/main/protection \
  --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["check", "mutation", "phone"] },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
gh api repos/fergo5002/fergus-portfolio/branches/main/protection --jq '.required_status_checks.contexts'
```

Expected: `["check","mutation","phone"]`.

- [ ] **Step 5: Merge, and watch the deploy**

```bash
cd "$WT"
gh pr merge --squash --delete-branch=false
git fetch origin && git log origin/main --oneline -1
```

Then the F0 Task 4 protocol, verbatim: poll `https://api.vercel.com/v6/deployments?projectId=prj_NkKhUuc2coWnU08tOz2B1NPsf6Fx&teamId=team_SW7xEyTEz5ftQj3cIxulWxKG&limit=5&target=production` with `VERCEL_TOKEN_PERSONAL` until the merge SHA shows `READY`, then:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://fergusoreilly.dev/tools
curl -s https://fergusoreilly.dev/tools | grep -o 'tools__meta">[^<]*'
curl -s https://fergusoreilly.dev/tools/headline-check | grep -o 'tool__cantsee-item">[^<]\{0,30\}' | wc -l
curl -s https://fergusoreilly.dev/sitemap.xml | grep -o '<loc>[^<]*/tools[^<]*</loc>'
curl -s https://fergusoreilly.dev/llms.txt | grep -A2 '## Tools'
node scripts/phone-check.mjs --base https://fergusoreilly.dev --from-sitemap --out .phone-check-live
```

Expected: `200`; the server privacy line on the index; `3`; two `<loc>` lines (`/tools`, `/tools/headline-check`); the generated Tools section; and the phone check passing against production. Then paste a URL into the live form from a phone or the Chrome device profile and confirm a `tool_run` row with `outcome: ok` and no `url` property lands in PostHog project 569350 within a few minutes (Activity, filter `event = tool_run`). That last check is the only one that sees the event path end to end; without it the event is "sent", not "arrived".

- [ ] **Step 6: Record it**

Ledger: F3 row to `**live**` with the PR number and the deployment uid; log lines for the first phone-check run (pasted output), the fixes it caused, the revert-to-confirm result, the Playwright version installed, and the PostHog `tool_run` sighting (or its absence, stated). `docs/PROGRESS.md` gets a dated entry at the top in the file's voice, ending with a "Not verified:" sentence. Commit both straight to `main` (docs-only):

```bash
cd /c/Dev/fergus-portfolio
git checkout main && git pull
git add docs/superpowers/programme/toolshed-ledger.md docs/PROGRESS.md
git commit -m "docs(programme): f3 live, the registry and the phone check are in"
git push
```

Leave the worktree in place for repo hygiene.

---

## Self-review

**Spec coverage (design section 6, F3, and the interface block in the brief):**

| Requirement | Task |
|---|---|
| `content/tools/<slug>.ts` files and an index | 1 |
| The `/tools` page reads the registry; `soon` listed, unlinked | 3 (`toolListing`, page, coupling test) |
| The sitemap reads the registry | 2 |
| `components/tools/ToolPage.tsx`: title, lede, privacy line, body, "can't see" list, JSON-LD | 4 |
| Headline-check moves onto the shell without changing behaviour | 5, proved by 8 Step 6 |
| Per-tool stylesheet rule; headline-check's CSS moved if separable | 5 Steps 1 and 4 |
| `tool_run` with slug and outcome, never the input; client and server paths | 6 |
| `scripts/phone-check.mjs`: three profiles, four checks, named failures, exit code, summary table, pixel-sampled contrast explained in the header | 7 |
| `--self-test` on bundled fixtures with one fault of each kind | 7 Steps 2 to 5 |
| CI `phone` job: build, `next start`, wait, self-test, every live route from the registry, screenshots on failure | 9 Step 1 |
| "Done when `/tools` lists headline-check from the registry and the phone check passes on it" | 8 and 9 Step 5 |
| Every completion note states what was not verified (design section 9) | 9 Steps 3 and 6 |

Gaps found on review and fixed inline: the sitemap's `soon` assertion was vacuous on today's registry, so Task 2 Step 6 mutates the entry to prove the test bites, and `lib/tools/listing.test.ts` covers the branch with a fixture. `toolPath` was first written into `toolShellCopy` as well as `lib/seo.ts`; it now lives only in `lib/seo.ts` beside `articlePath`, and the registry copy has no function in it. The `--from-sitemap` flag was added because the CI job cannot import a TypeScript registry from a `.mjs` without a loader, and reading the served sitemap is also the check that ships rather than the check that was built.

**Deviation to flag to the coordinator:** the tap-target check exempts an inline `<a>` inside a sentence (WCAG 2.5.8's inline exception), listing it as `inline` rather than failing it. Without that, every prose link on the site fails at 44px and the only way through is `data-small-target` on each, which turns the opt-out into noise. Buttons, inputs and block links are never exempt. If the coordinator wants inline links to fail, delete the `if (el.tagName === "A" && cs.display === "inline" ...)` branch in `auditInPage` and the `a#inline` assertion in the self-test.

**Placeholder scan:** no `TBD`, `TODO`, "implement later", "add validation", "similar to Task N". Every code step shows the code. The one open-ended step is Task 8 Step 3 ("for anything else the run names"), and it is open-ended because the run has not happened; its two predicted fixes are written out, and the rule for any other fix is stated.

**Type consistency:** `ToolEntry` fields match the frozen block and are used by name in Tasks 1 to 5. `toolShellCopy.privacy[tool.privacy]` is indexed with the `"browser" | "server"` union in `ToolPage.tsx` and `listing.ts`. `toolPageSchema(tool, extra?)` is called as `toolPageSchema(tool, extraSchema)` in `ToolPage.tsx`, and `extraSchema` is `JsonLdObject | undefined`, which the default parameter accepts. `trackToolRun` returns `Promise<void>` and `afterResponse` accepts `() => void | Promise<unknown>`, so `record()` in `actions.ts` type-checks. `ToolOutcome` is imported as a type into `actions.ts` from `lib/analytics`. `ServerEvent.properties` is `Record<string, unknown> | undefined` and `toolRunEvent` always sets it. `liveTools` is used by the sitemap, the index page's JSON-LD and `llms.txt`; `tools` by the index rows; both come from Task 1.

**What this plan cannot see:** whether Linux WebKit in CI samples the same contrast as Windows WebKit locally (Task 9 Step 3 says what to do if not); whether Playwright's WebKit runs on this Windows machine at all (Task 7 Step 1 finds out before anything depends on it); the first real phone-check run, whose predictions are labelled as guesses in Task 8.
