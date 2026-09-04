import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import ts from "typescript";
import { secondVisitCopy } from "@/content/tools/second-visit";

/**
 * A coupling check on the client component, not a render. Vitest runs in
 * `node` here and there is no jsdom, so nothing below mounts anything. It reads
 * the source and asserts on its text. CRLF is normalised first, because git
 * hands this checkout CRLF and CI LF for the same file.
 */
const source = readFileSync(join(process.cwd(), "app", "tools", "second-visit", "SecondVisitTool.tsx"), "utf8").replace(
  /\r\n/g,
  "\n",
);

describe("the island is wired to the things it claims", () => {
  it("was actually read", () => {
    expect(source).toContain("export default function SecondVisitTool");
    expect(source.startsWith('"use client"')).toBe(true);
  });

  it("takes its work through the runner rather than doing it inline", () => {
    expect(source).toContain("makeRunner()");
    expect(source).toContain("dispose()");
  });

  it("rounds the duration to the nearest hundred milliseconds", () => {
    expect(source).toMatch(/Math\.round\(ms \/ 100\) \* 100/);
  });

  it("reports a run with three fields and no fourth", () => {
    const calls = source.match(/trackToolRun\(\{[^}]*\}\)/g) ?? [];
    expect(calls.length).toBeGreaterThan(2);
    for (const call of calls) {
      const fields = call
        .replace(/^trackToolRun\(\{/, "")
        .replace(/\}\)$/, "")
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part !== "");
      expect(fields, call).toHaveLength(3);
      expect(fields[0]).toContain("tool:");
      expect(fields[1]).toContain("outcome:");
      expect(fields[2]).toContain("ms:");
    }
  });

  it("revokes every object URL it creates", () => {
    const created = (source.match(/createObjectURL/g) ?? []).length;
    const revoked = (source.match(/revokeObjectURL/g) ?? []).length;
    expect(created).toBeGreaterThan(0);
    expect(revoked).toBeGreaterThanOrEqual(1);
  });

  it("refuses a file that is too big before reading it", () => {
    expect(source).toContain("MAX_BYTES");
    expect(source).toContain("refusals.tooBig");
  });

  it("does not hide parser truncation, skipped rows or ambiguous dates", () => {
    expect(source).toContain("parsed.truncated");
    expect(source).toContain("parsed.skipped");
    expect(source).toContain("ambiguousDates");
    expect(source).toContain("ignoredRows");
  });

  it("says when the numbers are no longer the production model's", () => {
    expect(source).toContain("usingProductionParams");
    expect(source).toContain("honesty.changed");
  });

  it("does not silently hide towns from the bundled table", () => {
    expect(source).toContain("townOptions()");
    expect(source).not.toMatch(/townOptions\(\)\.slice/);
  });

  it("writes no sentence of its own", () => {
    /**
     * A long string literal with a space in it is prose, and prose in a
     * component is copy that escaped `content/`. Import paths, class names and
     * MIME types have no spaces, so the rule needs no allow-list to maintain.
     */
    const file = ts.createSourceFile("SecondVisitTool.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const literals: string[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) literals.push(node.text);
      ts.forEachChild(node, visit);
    };
    visit(file);
    const offenders = literals.filter((text) => text.length >= 25 && text.includes(" "));
    expect(offenders).toEqual([]);
  });

  it("draws every word from the content file", () => {
    expect(source).toContain('from "@/content/tools/second-visit"');
    expect(Object.keys(secondVisitCopy)).toContain("refusals");
  });
});
