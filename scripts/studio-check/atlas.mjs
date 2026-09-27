import { readFile } from "node:fs/promises";
import { zipSync, strToU8 } from "fflate";

/**
 * Pixels the map canvas (or its ghost layer) has drawn, as a count and a
 * checksum, read straight off the canvas. A count of zero is a blank stage.
 */
export async function canvasInk(page, selector = ".atlas-canvas") {
  return page.evaluate((sel) => {
    const c = document.querySelector(sel);
    const data = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let lit = 0,
      sum = 0;
    for (let i = 3; i < data.length; i += 4)
      if (data[i]) {
        lit++;
        sum = (sum + data[i - 3] * 3 + data[i - 2] * 5 + data[i - 1] * 7 + data[i] * (i % 97)) % 2147483647;
      }
    return { lit, sum };
  }, selector);
}

/**
 * The page position of a file node's centre, found the way a person finds
 * one: a solid disc in the phosphor colour. Only file dots are solid discs of
 * that colour (lines are translucent, folders are the accent, labels are
 * thin), so the first 7 by 7 block of it is a node.
 */
export async function aNode(page) {
  return page.evaluate(() => {
    const c = document.querySelector(".atlas-canvas");
    const ink = getComputedStyle(c).getPropertyValue("--green").trim();
    const probe = document.createElement("canvas").getContext("2d");
    probe.fillStyle = ink;
    probe.fillRect(0, 0, 1, 1);
    const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
    const { width: w, height: h } = c;
    const data = c.getContext("2d").getImageData(0, 0, w, h).data;
    const is = (x, y) => {
      const i = (y * w + x) * 4;
      return data[i + 3] === 255 && Math.abs(data[i] - r) < 12 && Math.abs(data[i + 1] - g) < 12 && Math.abs(data[i + 2] - b) < 12;
    };
    const rect = c.getBoundingClientRect();
    const scale = w / rect.width;
    // Start below the reading band, so the probe never lands under it.
    for (let y = Math.round(90 * scale); y < h - 4; y += 2)
      for (let x = 4; x < w - 4; x += 2) {
        let solid = true;
        for (let dy = -3; dy <= 3 && solid; dy++) for (let dx = -3; dx <= 3 && solid; dx++) solid = is(x + dx, y + dy);
        if (solid) return { x: rect.left + x / scale, y: rect.top + y / scale };
      }
    return null;
  });
}

const reading = (page) => page.locator(".atlas-reading").first();

/**
 * Atlas, reduced motion: the map drawn at once on the example, find and
 * Enter, pointing at a node, the inspector, focus and pin, the list, a ZIP
 * through the drop slot, save and reopen a map, back to the example, keys.
 */
export default async function atlas({ page, open, button, save, assert }) {
  await open("atlas");
  // Before hydration the stage holds the server's picture of the map; wait for the instrument.
  await page.locator(".atlas-canvas").waitFor();
  assert.equal(await page.locator(".atlas-canvas").count(), 1);
  await page.waitForFunction(() => document.querySelector(".atlas-reading")?.dataset.files === "34");
  assert.match(await reading(page).textContent(), /^Example notebook · 34 files · 32 read · \d+ connections$/);
  assert((await canvasInk(page)).lit > 2000, "the example map is drawn on arrival");
  await page.waitForTimeout(600);
  assert.equal((await canvasInk(page, ".atlas-ghost")).lit, 0, "no phosphor, no beam under reduced motion");

  // Point at a node: one line, its name, type and connections.
  const node = await aNode(page);
  assert(node, "found a node on the map");
  await page.mouse.move(node.x, node.y);
  await page.waitForFunction(() => / · md · \d+ connections?$/.test(document.querySelector(".atlas-reading")?.textContent ?? ""));
  await page.mouse.move(5, 5);

  // find ›, then Enter walks the matches, choosing each.
  const find = page.getByLabel("Search files and contents", { exact: true });
  await find.fill("Morning swim");
  await page.locator(".atlas-find__count").waitFor();
  await find.press("Enter");
  await page.getByRole("heading", { name: "Morning swim.md", exact: true }).waitFor();
  assert.match(await reading(page).textContent(), /^Morning swim\.md · md · \d+ connections$/);
  await button("Focus neighbours").click();
  await button("Pin node").click();
  await button("Release node").click();
  await button("Whole map").click();
  await button("Close").click();
  await page.locator(".atlas-inspector").waitFor({ state: "detached" });
  await find.fill("");

  // The list reaches every file.
  await page.locator(".atlas-list > summary").click();
  assert.equal(await page.locator(".atlas-list__item").count(), 40);
  await page.locator(".atlas-list__item").filter({ hasText: "Coast/Tide notes.md" }).click();
  await page.getByRole("heading", { name: "Tide notes.md", exact: true }).waitFor();

  const zip = zipSync({
    "notes/hello.md": strToU8("# hello\n[[other]]\nphosphor magnet"),
    "notes/other.md": strToU8("# other\nphosphor magnet"),
    "photo.dat": new Uint8Array([0, 1, 2, 3]),
  });
  await page.getByLabel("Choose files", { exact: true }).setInputFiles({
    name: "knowledge.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(zip),
  });
  await page.getByText("Finding connections…", { exact: true }).waitFor({ state: "hidden" });
  await page.waitForFunction(() => document.querySelector(".atlas-reading")?.dataset.files === "3");
  assert.match(await reading(page).textContent(), /^3 files · 2 read · \d+ connections?$/, "an imported map is not called the example");
  assert.equal(await page.locator(".atlas-inspector").count(), 0, "a new map opens with nothing inspected");
  const saved = JSON.parse(await readFile(await save("Save map"), "utf8"));
  assert.equal(saved.format, "atlas-v1");
  assert.equal(saved.files.length, 3);
  assert(saved.files.some((f) => f.status === "metadata"));
  assert(saved.files.some((f) => f.text.includes("phosphor magnet")), "a saved map carries the extracted text, as the line beside the button says");
  await page.getByLabel("Open a saved map", { exact: true }).setInputFiles({
    name: "map.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(saved)),
  });
  await page.getByText("Finding connections…", { exact: true }).waitFor({ state: "hidden" });
  await page.waitForFunction(() => document.querySelector(".atlas-reading")?.dataset.files === "3");
  // The map itself takes a drop. Synthetic: a real desktop drag cannot be
  // driven headless, so this proves the stage's handler, not the OS path.
  const dropped = await page.evaluateHandle(() => {
    const d = new DataTransfer();
    d.items.add(new File(["# first\n[[second]]\norchid lantern"], "first.md", { type: "text/markdown" }));
    d.items.add(new File(["# second\norchid lantern"], "second.md", { type: "text/markdown" }));
    return d;
  });
  for (const type of ["dragenter", "dragover", "drop"]) await page.dispatchEvent(".atlas-graph", type, { dataTransfer: dropped });
  await page.waitForFunction(() => document.querySelector(".atlas-reading")?.dataset.files === "2");

  await button("Back to the example").click();
  await page.waitForFunction(() => document.querySelector(".atlas-reading")?.dataset.files === "34");
  assert.equal(await button("Back to the example").count(), 0, "the way back goes once it is back");

  const graph = page.locator(".atlas-canvas");
  await graph.scrollIntoViewIfNeeded();
  await graph.focus();
  const before = await canvasInk(page);
  await page.keyboard.press("+");
  await page.keyboard.press("ArrowLeft");
  assert.notEqual((await canvasInk(page)).sum, before.sum, "the keys move the map");
  await page.keyboard.press("0");
}
