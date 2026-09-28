/** `/tools/drift`: build a profile from five pieces, see the report go stale, measure, download. */
export default async function drift({ page, go, shot, download, assert }) {
  await go("drift");
  const samples = Array.from({ length: 5 }, (_, i) => Array.from({ length: 12 }, (_, j) => [
    "I write about the things I build, and the work is usually more useful when I explain what went wrong.",
    "We tried a small change in the morning. It made the page easier to read, but we still had questions.",
    "The team can test the result before we send it out. I think that is worth doing each time.",
    "Sometimes you need to stop and ask what the reader came for. A clear answer takes time and a little care.",
    "This is my WorkbenchFixture piece about making a useful tool. We can learn from a mistake and try again.",
  ][(i + j % (i + 1)) % 5]).join(" ")).join("\n---\n");
  const draft = Array(12).fill("I think the next useful change is a clearer page. We can test it with a reader and find out whether the words are doing their job.").join(" ");
  await page.getByLabel("Things you wrote", { exact: true }).fill(samples);
  await page.getByLabel("The draft", { exact: true }).fill(draft);
  await page.getByRole("button", { name: "Build the profile", exact: true }).click();
  await page.getByText("Your writing report", { exact: true }).waitFor();
  assert.equal(await page.locator(".drift__report .bench-warning").count(), 0);
  await page.getByLabel("The draft", { exact: true }).fill(draft + " And now it has changed.");
  await page.locator(".drift__report .bench-warning").waitFor();
  assert.equal(await page.getByRole("button", { name: "Download report", exact: true }).isDisabled(), true);
  await page.getByRole("button", { name: "Measure the draft", exact: true }).click();
  assert.equal(await page.locator(".drift__report .bench-warning").count(), 0);
  const report = await download(page.getByRole("button", { name: "Download report", exact: true }));
  assert.match(report.bytes.toString(), /Your writing report/);
  await shot("drift");
}
