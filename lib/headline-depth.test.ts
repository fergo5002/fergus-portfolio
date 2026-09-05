import { describe, expect, it } from "vitest";
import { checkHtml } from "./headline";

describe("deeply nested supplied markup", () => {
  it("reads a heading within the editor's input limit without overflowing the stack", () => {
    const html = `<h1>${"<span>".repeat(6_000)}Still readable${"</span>".repeat(6_000)}</h1>`;
    expect(html.length).toBeLessThan(100_000);
    expect(checkHtml(html)).toMatchObject({ verdict: "clean", browserText: "Still readable", crawlerText: "Still readable", characterElements: 0 });
  });

  it("preserves character boundaries inside nested wrappers", () => {
    const html = `<h1>${"<b>".repeat(20)}<span>A</span><span>B</span><span>C</span>${"</b>".repeat(20)}</h1>`;
    expect(checkHtml(html)).toMatchObject({ verdict: "fragmented", browserText: "ABC", crawlerText: "A B C", characterElements: 3 });
  });
});
