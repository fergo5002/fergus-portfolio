/** `/tools`: the board links to the five featured tools exactly once. */
export default async function index({ page, go, shot, assert }) {
  await go("");
  assert.deepEqual(
    (await page.locator(".bench-card__link").evaluateAll(links => links.map(link => link.getAttribute("href")))).sort(),
    ["atlas", "pocket-redact", "group-lore", "relief", "resonance"].map(slug => `/tools/${slug}`).sort(),
    "the board links to the five featured tools exactly once",
  );
  // Every card carries a preview the server drew, and the tool's one sentence.
  assert.equal(await page.locator(".bench-card .bench-preview").count(), 5, "every card has a preview");
  assert.equal(await page.locator(".bench-card__purpose").count(), 5, "every card has its one sentence");
  await shot("index");
}
