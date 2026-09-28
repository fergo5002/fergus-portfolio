/** `/tools/overlap`: two local files, a filtered download, a refused file, and the peer route's fallback. */
export default async function overlap({ page, go, shot, download, list, upload, assert }) {
  await go("overlap");
  // The page opens on the example lists, so a result is on screen at once.
  assert.ok(Number(await page.locator(".bench-metrics dd").first().innerText()) > 0, "opens on the example result");
  await page.getByRole("button", { name: "Try example lists" }).click();
  assert.ok(Number(await page.locator(".bench-metrics dd").first().innerText()) > 0);
  await page.locator("#local-list-0").setInputFiles(upload("first.csv", list([1,2,3,4,5,6])));
  await page.locator("#local-list-1").setInputFiles(upload("second.csv", list([4,5,6,7,8,9])));
  await page.waitForFunction(() => document.querySelector(".bench-metrics dd")?.textContent === "3");
  await page.locator("#overlap-search").fill("Person 4");
  assert.equal(await page.locator(".overlap-local-list li").count(), 1);
  const csv = await download(page.getByRole("button", { name: "Download this list" }));
  assert.match(csv.bytes.toString(), /Person 4/);
  assert.doesNotMatch(csv.bytes.toString(), /Person 5/);
  await shot("overlap");
  await page.locator("#local-list-1").setInputFiles(upload("broken.csv", "amount,date\n4,2026-01-01"));
  await page.getByText("That file has no usable LinkedIn profiles.", { exact: false }).waitFor();
  assert.equal(await page.locator(".bench-metrics").count(), 0);
  await page.getByRole("button", { name: "Connect with someone" }).click();
  await page.getByRole("button", { name: "Your file", exact: true }).click();
  await page.getByText("The room code service is not running", { exact: false }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Create a room", exact: true }).count(), 0);
}
