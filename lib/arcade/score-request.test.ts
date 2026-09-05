import { expect, it } from "vitest";
import { scoreRequest } from "./score-request";
const request = (body: string, headers: Record<string, string> = {}) => new Request("https://example.com/api/board", { method: "POST", body, headers: { "content-type": "application/json", ...headers } });
it("accepts same-origin JSON and refuses a cross-site score", async () => {
  expect(await scoreRequest(request('{"score":1}', { origin: "https://example.com" }))).toEqual({ score: 1 });
  await expect(scoreRequest(request("{}", { origin: "https://elsewhere.com" }))).rejects.toMatchObject({ status: 403 });
  await expect(scoreRequest(request("{}", { "sec-fetch-site": "cross-site" }))).rejects.toMatchObject({ status: 403 });
});
it("bounds the actual body, not just a claimed Content-Length", async () => {
  await expect(scoreRequest(request('"' + "x".repeat(2048) + '"'))).rejects.toMatchObject({ status: 413 });
  await expect(scoreRequest(request("{}", { "content-length": "9999" }))).rejects.toMatchObject({ status: 413 });
  await expect(scoreRequest(request("not json"))).rejects.toMatchObject({ status: 400 });
  await expect(scoreRequest(request("{}", { "content-type": "text/plain" }))).rejects.toMatchObject({ status: 415 });
});
