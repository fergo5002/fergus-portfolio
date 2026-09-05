import { expect, it } from "vitest";
import { checkHtml } from "@/lib/headline";
import { fixSnippet } from "./state";

it("the suggested fix actually passes the checker without duplicating the headline", () => {
  const result = checkHtml(fixSnippet("Build something worth reading"));
  expect(result.verdict).toBe("clean");
  expect(result.browserText).toBe("Build something worth reading");
  expect(result.crawlerText).toBe(result.browserText);
});
it("escapes untrusted heading markup in the suggested HTML", () => {
  expect(fixSnippet('<img src=x onerror=alert(1)> & text')).not.toContain("<img");
  expect(fixSnippet("Fish & chips")).toContain("Fish &amp; chips");
});
