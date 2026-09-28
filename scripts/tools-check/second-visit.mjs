import { demoCsv } from "../../lib/tools/second-visit/demo.ts";

/** `/tools/second-visit`: the made-up sauna, a horizon change, the report, a real file, a broken mapping. */
export default async function secondVisit({ page, go, shot, download, upload, assert }) {
  await go("second-visit");
  await page.getByRole("button", { name: "Or try it on a made-up sauna", exact: true }).click();
  await page.locator(".sv__big").waitFor();
  assert.match(await page.locator(".sv__big").innerText(), /^\d+\.\d+%$/);
  await page.waitForFunction(() => !document.querySelector(".sv__setup")?.open);
  const firstEstimate = await page.locator(".sv__big").innerText();
  await page.getByRole("button", { name: "30 days", exact: true }).click();
  assert.notEqual(await page.locator(".sv__big").innerText(), firstEstimate);
  await shot("second-visit");
  const html = await download(page.getByRole("button", { name: /report/i }).last());
  assert.match(html.bytes.toString(), /<!doctype html>/i);
  const customerCount = await page.locator(".sv__results .bench-metrics dd").first().innerText();
  const fileCsv = demoCsv().trimEnd().split("\n").map((line, i) => `${line},${i === 0 ? "note" : "WorkbenchFixture"}`).join("\n");
  await page.getByLabel("Choose a file", { exact: true }).setInputFiles(upload("bookings.csv", fileCsv));
  await page.getByText("Your retention report", { exact: true }).waitFor();
  assert.equal(await page.locator(".sv__results .bench-metrics dd").first().innerText(), customerCount);
  await page.getByText("Review the file and column mapping", { exact: true }).click();
  await page.getByLabel("Visit or order date", { exact: true }).selectOption("-1");
  assert.equal(await page.locator(".sv__results").count(), 0);
  await page.getByRole("button", { name: "How many come back", exact: true }).click();
  await page.locator(".sv__message").waitFor();
  assert.equal(await page.locator(".sv__results").count(), 0);
  await page.getByLabel("Choose a file", { exact: true }).setInputFiles(upload("broken.csv", "wrong,columns\nnot,a booking"));
  await page.waitForFunction(() => document.querySelector(".sv")?.getAttribute("aria-busy") === "false");
  assert.equal(await page.locator(".sv__results").count(), 0);
}
