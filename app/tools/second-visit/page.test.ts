import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TIGH_CREDIT, secondVisit } from "@/content/tools/second-visit";

/** A coupling check on the server component. Not a render; see the note in
 *  `SecondVisitTool.test.ts`. */
const source = readFileSync(join(process.cwd(), "app", "tools", "second-visit", "page.tsx"), "utf8").replace(
  /\r\n/g,
  "\n",
);
const styles = readFileSync(join(process.cwd(), "app", "tools", "second-visit", "tool.css"), "utf8").replace(
  /\r\n/g,
  "\n",
);

describe("the page", () => {
  it("was actually read", () => {
    expect(source).toContain("export default function SecondVisitPage");
  });

  it("renders through the shared shell, so the privacy line and the list are there", () => {
    expect(source).toContain("ToolPage");
    expect(source).toContain("tool={tool}");
  });

  it("imports the registry entry rather than restating it", () => {
    expect(source).toContain('from "@/content/tools/second-visit"');
    expect(secondVisit.privacy).toBe("browser");
  });

  it("owns its own stylesheet and nothing else's", () => {
    expect(source).toContain('import "./tool.css"');
    expect(source).not.toContain("globals.css");
  });

  it("keeps native file controls inside a 320px WebKit grid", () => {
    expect(styles).toMatch(/\.sv \{[^}]*min-width: 0;[^}]*\}/);
    expect(styles).toMatch(/\.sv__input, \.sv__select, \.sv__file \{[^}]*width: 100%;[^}]*min-width: 0;[^}]*\}/);
  });

  it("carries the credit as an edge in the graph, when there is one", () => {
    if (TIGH_CREDIT) expect(source).toContain("isBasedOn");
    expect(source).toContain("TIGH_CREDIT");
  });

  it("is a server component: the island is imported, not inlined", () => {
    expect(source).not.toContain('"use client"');
    expect(source).toContain("SecondVisitTool");
  });
});

