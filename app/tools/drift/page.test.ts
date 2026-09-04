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
  return readFileSync(join(process.cwd(), ...parts), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, " ");
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

  it("builds the worked example once, at module scope", () => {
    expect(page).toMatch(/^const demoReference = /m);
    expect(page).toMatch(/^const demoReport = /m);
    expect(page).toContain("analyse(");
  });

  it("is the only place the site's corpus is read", () => {
    // The articles are the worked example and nothing else. A visitor's
    // reference is built from their own pieces, in their own tab.
    expect(page).toContain('from "@/lib/tools/drift/corpus"');
    expect(tool).not.toContain("drift/corpus");
  });

  it("is listed as a live tool, so the sitemap and llms.txt pick it up", () => {
    expect(liveTools.map((t) => t.slug)).toContain("drift");
  });
});

describe("the client component", () => {
  it("is a client component", () => {
    expect(tool.startsWith('"use client"')).toBe(true);
  });

  it("builds the visitor's own reference in the tab", () => {
    // A value import, deliberately: `reference.ts` imports only the tokeniser,
    // so it costs a few hundred bytes and carries no article bodies. Sending
    // the visitor's writing to a server to build the table instead would break
    // the line on the page that says nothing leaves the tab.
    expect(tool).toMatch(/import \{[^}]*buildReference[^}]*\} from "@\/lib\/tools\/drift\/reference"/);
    expect(tool).toMatch(/setReference\(/);
    expect(tool).not.toContain('from "@/content/articles"');
  });

  it("measures against the reference in state, never the demo one", () => {
    // The demo reference is a prop and the initial state. Once the visitor has
    // pressed build, every call has to use theirs, and a stale `demoReference`
    // here would silently score their draft against my articles.
    expect(tool).toContain("analyse(profile, draft, reference, spread)");
    expect(tool).not.toMatch(/analyse\([^)]*demoReference/);
  });

  it("writes to local storage exactly once, in the save handler", () => {
    // The constitution's new clause: only what the visitor explicitly saved.
    // One setItem, and it is inside onSave, is the whole enforcement.
    expect([...tool.matchAll(/localStorage\.setItem/g)]).toHaveLength(1);
    expect(tool).toMatch(/function onSave\(\)[\s\S]*?localStorage\.setItem\(DRIFT_PROFILE_KEY/);
  });

  it("saves the reference with the profile, because z-scores without it have no units", () => {
    expect(tool).toContain("serialiseProfile(reference, profile, spread");
  });

  it("reads and clears the same key it writes", () => {
    expect(tool).toContain("localStorage.getItem(DRIFT_PROFILE_KEY)");
    expect(tool).toContain("localStorage.removeItem(DRIFT_PROFILE_KEY)");
    expect(tool).not.toMatch(/"fergusos:/);
  });

  it("re-measures the displayed draft when it restores a saved profile", () => {
    // Restoring only the reference/profile would leave the worked example's
    // report on screen under a note claiming the saved profile was active.
    // The first report after hydration must therefore use the saved table too.
    expect(tool).toContain(
      "setReport(analyse(stored.profile, driftDemo.draft, stored.reference, stored.spread))",
    );
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
