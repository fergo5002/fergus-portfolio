/** Prove It: pick an explanation, predict, buy one test, commit with confidence, read the debrief, move on. */
export default async function proveIt({ page, open, button, save, assert }) {
  await open("prove-it");
  await page.locator(".detective-hypotheses button").nth(1).click();
  await page
    .getByLabel("Before you test: what result would change your mind?", {
      exact: true,
    })
    .fill("A provider rejection on both requests would change my mind.");
  await page
    .locator(".detective-tests button")
    .filter({ hasText: "Compare a direct fast POST" })
    .click();
  await page
    .getByLabel("Confidence in your selected explanation", { exact: true })
    .fill("90");
  await button("Commit your conclusion").click();
  await page
    .getByRole("heading", {
      name: "You found it. And you can show why.",
      exact: true,
    })
    .waitFor();
  assert.equal(await page.locator(".detective-comparison tbody tr").count(), 3);
  await save("Download case report");
  await button("Next unsolved case").click();
  await page
    .getByRole("heading", { name: "The third coffee machine", exact: true })
    .waitFor();
}
