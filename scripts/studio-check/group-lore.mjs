import { readFile } from "node:fs/promises";

/** Group Lore: filter by an hour, an anonymous summary with no message text, the portrait, a Telegram import. */
export default async function groupLore({ page, open, button, save, assert }) {
  await open("group-lore");
  const first = page.locator(".lore-heat-row button:not(:disabled)").first();
  await first.click();
  assert((await page.locator(".lore-messages article").count()) > 0);
  await button("Clear filters").click();
  await page.getByLabel("Search message text", { exact: true }).fill("coffee");
  await page.waitForTimeout(200);
  const summary = JSON.parse(
    await readFile(await save("Download anonymous summary"), "utf8"),
  );
  assert(!JSON.stringify(summary).includes("coffee"));
  await button("Clear filters").click();
  await button("Make a portrait").click();
  const svg = await readFile(await save("Download portrait SVG"), "utf8");
  assert(svg.includes("The shape of us"));
  // The formats moved from this label into the drop slot's chips (TXT, JSON, ZIP).
  await page
    .getByLabel("Import a chat", { exact: true })
    .setInputFiles({
      name: "telegram.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          messages: [
            {
              type: "message",
              date: "2026-09-01T10:00:00",
              from: "Private Name",
              text: ["hello ", { text: "there" }],
            },
          ],
        }),
      ),
    });
  await page.waitForFunction(() =>
    document.querySelector(".lab-metrics")?.textContent?.includes("Messages1"),
  );
  assert.equal(await page.locator(".lore-messages article").count(), 1);
  await button("Explore an example").click();
  await page.waitForFunction(() =>
    document.querySelector(".lab-metrics")?.textContent?.includes("Messages84"),
  );
}
