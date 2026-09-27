/** `/tools/headline-check`: the HTML playground, with pasted script never run. */
export default async function headline({ page, go, shot, assert }) {
  await go("headline-check");
  // The stage opens on the split-letter example, already read both ways.
  await page.waitForFunction(() => document.querySelector(".headline-lab__verdict")?.textContent === "Fragmented");
  await page.getByRole("button", { name: "Readable example", exact: true }).first().click();
  await page.waitForFunction(() => document.querySelector(".headline-lab__verdict")?.textContent === "Clean");
  await page.locator("#headline-source").fill('<h1>WorkbenchFixture &amp; readable words</h1><script>window.__unsafeHeadline = true</script>');
  await page.waitForFunction(() => document.querySelector(".headline-lab .hcheck__string")?.textContent === "WorkbenchFixture & readable words");
  assert.equal(await page.evaluate(() => window.__unsafeHeadline), undefined);
  await page.locator("#headline-source").fill(`<h1>${"<span>".repeat(6000)}WorkbenchFixture still readable${"</span>".repeat(6000)}</h1>`);
  await page.waitForFunction(() => document.querySelector(".headline-lab .hcheck__string")?.textContent === "WorkbenchFixture still readable");
  const unfinished = `<span data-x=${'"x"'.repeat(25)} missing tag end`;
  await page.locator("#headline-source").fill(`<h1>${unfinished}</h1>`);
  await page.waitForFunction(expected => document.querySelector(".headline-lab .hcheck__string")?.textContent === expected, unfinished);
  await page.getByRole("button", { name: "Split-letter example", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".headline-lab__verdict")?.textContent === "Fragmented");
  await shot("headline");
}
