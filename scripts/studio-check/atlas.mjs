import { readFile } from "node:fs/promises";
import { zipSync, strToU8 } from "fflate";

/** Atlas: search, inspect, focus, pin, a ZIP through the drop slot, save and reopen a map, the example, keys. */
export default async function atlas({ page, open, button, save, assert }) {
  await open("atlas");
  assert.equal(await page.locator(".atlas-canvas").count(), 1);
  await page
    .getByLabel("Search files and contents", { exact: true })
    .fill("Morning swim");
  await page
    .locator(".atlas-file-list button")
    .filter({ hasText: "Coast/Morning swim.md" })
    .click();
  await page
    .getByRole("heading", { name: "Morning swim.md", exact: true })
    .waitFor();
  await button("Focus neighbours").click();
  await button("Pin node").click();
  await button("Release node").click();
  await button("Whole map").click();
  const zip = zipSync({
    "notes/hello.md": strToU8("# hello\n[[other]]\nphosphor magnet"),
    "notes/other.md": strToU8("# other\nphosphor magnet"),
    "photo.dat": new Uint8Array([0, 1, 2, 3]),
  });
  await page
    .getByLabel("Choose files", { exact: true })
    .setInputFiles({
      name: "knowledge.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(zip),
    });
  await page
    .getByText("Finding connections…", { exact: true })
    .waitFor({ state: "hidden" });
  await page.waitForFunction(() =>
    document.querySelector(".lab-metrics dd")?.textContent === "3",
  );
  const saved = JSON.parse(
    await readFile(await save("Save map + extracted text"), "utf8"),
  );
  assert.equal(saved.files.length, 3);
  assert(saved.files.some((f) => f.status === "metadata"));
  await page
    .getByLabel("Open a saved map", { exact: true })
    .setInputFiles({
      name: "map.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(saved)),
    });
  await page
    .getByText("Finding connections…", { exact: true })
    .waitFor({ state: "hidden" });
  await button("Explore an example").click();
  await page.waitForFunction(() =>
    document.querySelector(".lab-metrics dd")?.textContent === "34",
  );
  const graph = page.locator(".atlas-canvas");
  await graph.scrollIntoViewIfNeeded();
  await graph.focus();
  await page.keyboard.press("+");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("0");
}
