import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { zipSync, strToU8 } from "fflate";
import { PDFDocument, StandardFonts } from "pdf-lib";
import sharp from "sharp";
import { aNode, canvasInk } from "../studio-check/atlas.mjs";

const files = (page) => page.evaluate(() => document.querySelector(".atlas-reading")?.dataset.files);

/**
 * Atlas's boundaries, with real motion on, in order: they share one page, so
 * each starts where the last one left it.
 */
export default [
  [
    "phosphor-only-while-seen",
    async ({ page, open, assert }) => {
      await open("atlas");
      await page.waitForFunction(() => document.querySelector(".atlas-reading")?.dataset.files === "34");
      const visible = await page.evaluate(() => document.visibilityState);
      assert.equal(visible, "visible", "a hidden tab gets no frames, so nothing below would mean anything");
      // The beam walks the links on the example as soon as the map is on screen.
      await page.waitForTimeout(900);
      const one = await canvasInk(page, ".atlas-ghost");
      await page.waitForTimeout(400);
      const two = await canvasInk(page, ".atlas-ghost");
      assert(one.lit > 0, "the beam leaves phosphor on the example");
      assert.notEqual(one.sum, two.sum, "and it moves");
      // Off screen the clock is unsubscribed: the ghost stops where it was.
      // A short window, so the page is long enough to scroll the whole map away.
      const size = page.viewportSize();
      await page.setViewportSize({ width: size.width, height: 420 });
      await page.evaluate(() => {
        const r = document.querySelector(".atlas-canvas").getBoundingClientRect();
        window.scrollTo(0, window.scrollY + r.bottom + 40);
      });
      await page.waitForTimeout(500);
      const off = await page.evaluate(() => document.querySelector(".atlas-canvas").getBoundingClientRect().bottom);
      assert(off < 0, `the map is off screen (${off})`);
      const gone = await canvasInk(page, ".atlas-ghost");
      await page.waitForTimeout(700);
      const still = await canvasInk(page, ".atlas-ghost");
      assert.equal(gone.sum, still.sum, "off screen the map costs nothing");
      await page.setViewportSize(size);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(700);
      assert.notEqual((await canvasInk(page, ".atlas-ghost")).sum, still.sum, "back on screen the beam walks again");
      return { ghostPixels: one.lit };
    },
  ],
  [
    "a-scroll-passes-the-map-until-it-is-chosen",
    async ({ page, assert }) => {
      const canvas = page.locator(".atlas-canvas");
      const box = await canvas.boundingBox();
      const x = box.x + box.width / 2,
        y = box.y + box.height / 2 + 40;
      await page.evaluate(() => document.activeElement?.blur());
      await page.mouse.move(x, y);
      const top = await page.evaluate(() => window.scrollY);
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(900);
      const scrolled = await page.evaluate(() => window.scrollY);
      assert(scrolled > top + 100, `an unchosen map lets the wheel scroll the page (${top} to ${scrolled})`);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(600);
      // A click on empty map gives it focus, and then the wheel zooms it instead.
      const again = await canvas.boundingBox();
      await page.mouse.click(again.x + 30, again.y + again.height - 30);
      const before = await canvasInk(page);
      const from = await page.evaluate(() => window.scrollY);
      await page.mouse.move(again.x + again.width / 2, again.y + again.height / 2);
      await page.mouse.wheel(0, -300);
      await page.waitForTimeout(700);
      assert.equal(await page.evaluate(() => window.scrollY), from, "a chosen map keeps the wheel");
      assert.notEqual((await canvasInk(page)).sum, before.sum, "and zooms");
      await page.keyboard.press("0");
      await page.evaluate(() => document.activeElement?.blur());
    },
  ],
  [
    "pointing-and-dragging",
    async ({ page, assert }) => {
      await page.evaluate(() => window.scrollTo(0, 0));
      // Off the map, so nothing is pointed at and every dot is at full ink.
      await page.mouse.move(2, 2);
      await page.waitForTimeout(400);
      const node = await aNode(page);
      assert(node, "found a node");
      await page.mouse.move(node.x, node.y);
      await page.waitForFunction(() => / · md · \d+ connections?$/.test(document.querySelector(".atlas-reading")?.textContent ?? ""));
      // Drag it: the node follows, the ghost shows where it has been.
      await page.mouse.down();
      for (let i = 1; i <= 12; i++) {
        await page.mouse.move(node.x + i * 9, node.y + i * 5);
        await page.waitForTimeout(16);
      }
      const trail = await canvasInk(page, ".atlas-ghost");
      await page.mouse.up();
      assert(trail.lit > 200, "a dragged node leaves a phosphor trail");
      // A press without a drag chooses: the inspector slides in.
      await page.waitForTimeout(600);
      const moved = await aNode(page);
      await page.mouse.click(moved.x, moved.y);
      await page.locator(".atlas-inspector").waitFor();
      await page.keyboard.press("Escape");
      return { trailPixels: trail.lit };
    },
  ],
  [
    "document-formats-and-media",
    async ({ page, save, assert }) => {
      const docx = zipSync({
        "word/document.xml": strToU8(
          '<w:document xmlns:w="urn:test"><w:body><w:p><w:r><w:t>Secret orchid observatory</w:t></w:r></w:p></w:body></w:document>',
        ),
      });
      const pptx = zipSync({
        "ppt/slides/slide1.xml": strToU8('<a:p xmlns:a="urn:test"><a:r><a:t>Constellation planning</a:t></a:r></a:p>'),
      });
      const xlsx = zipSync({
        "xl/sharedStrings.xml": strToU8("<sst><si><t>Orchid revenue</t></si></sst>"),
        "xl/worksheets/sheet1.xml": strToU8("<worksheet><sheetData><row><c><v>42</v></c></row></sheetData></worksheet>"),
      });
      const pdf = await PDFDocument.create(),
        font = await pdf.embedFont(StandardFonts.Helvetica);
      pdf.addPage().drawText("The phosphor observatory", { font, size: 20 });
      const image = await sharp({ create: { width: 80, height: 60, channels: 3, background: "#ee8800" } })
        .png()
        .toBuffer();
      const remote = [];
      page.on("request", (r) => {
        if (r.url().includes("never-load.invalid")) remote.push(r.url());
      });
      const input = [
        { name: "report.docx", buffer: docx },
        { name: "slides.pptx", buffer: pptx },
        { name: "sheet.xlsx", buffer: xlsx },
        { name: "paper.pdf", buffer: await pdf.save() },
        { name: "orange.png", buffer: image },
        {
          name: "source.html",
          buffer: strToU8('<img src="https://never-load.invalid/private"><script>fetch("https://never-load.invalid/run")</script>'),
        },
        { name: "mystery.bin", buffer: new Uint8Array([0, 3, 5]) },
      ];
      await page.getByLabel("Choose files", { exact: true }).setInputFiles(
        input.map((f) => ({ name: f.name, mimeType: "application/octet-stream", buffer: Buffer.from(f.buffer) })),
      );
      await page.waitForFunction(() => document.querySelector(".atlas-reading")?.dataset.files === "7");
      const data = JSON.parse(await readFile(await save("Save map"), "utf8"));
      for (const [path, term] of [
        ["report.docx", "orchid"],
        ["slides.pptx", "Constellation"],
        ["sheet.xlsx", "42"],
        ["paper.pdf", "phosphor"],
      ])
        assert(data.files.find((f) => f.path === path).text.includes(term), path);
      assert.equal(remote.length, 0);
      const find = page.getByLabel("Search files and contents", { exact: true });
      await find.fill("orange.png");
      await find.press("Enter");
      await page.locator(".atlas-media").waitFor();
      await page.waitForFunction(() => document.querySelector("img.atlas-media")?.naturalWidth === 80);
      await find.fill("");
      await page.locator(".atlas-canvas").scrollIntoViewIfNeeded();
      await page.waitForTimeout(250);
      const picture = await sharp(await readFile(await save("Save image"))).stats();
      assert.equal(picture.channels[3].min, 255);
      assert(picture.channels[1].max > 100, "Export should contain the visible graph, with an opaque background.");
      return { formats: 7, unexpectedRequests: remote.length };
    },
  ],
  [
    "one-thousand-file-map",
    async ({ page, out, button }) => {
      const input = Array.from({ length: 1000 }, (_, i) => ({
          path: `folder-${Math.floor(i / 50)}/note-${i}.md`,
          text: `# Note ${i}\n[[note-${(i + 1) % 1000}]]\n${["phosphor magnet", "orchid garden", "tide coast", "synth melody"][i % 4]}`,
          size: 80,
          kind: "md",
          status: "read",
        })),
        start = Date.now();
      await page.getByLabel("Open a saved map", { exact: true }).setInputFiles({
        name: "large-map.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify({ format: "atlas-v1", files: input })),
      });
      await page.waitForFunction(() => document.querySelector(".atlas-reading")?.dataset.files === "1000");
      const elapsed = Date.now() - start;
      await page.locator(".atlas-canvas").scrollIntoViewIfNeeded();
      const find = page.getByLabel("Search files and contents", { exact: true });
      await find.fill("note-999.md");
      await find.press("Enter");
      await page.getByRole("heading", { name: "note-999.md", exact: true }).waitFor();
      await button("Focus neighbours").click();
      await page.waitForTimeout(600);
      await page.locator(".atlas-stage").screenshot({ path: resolve(out, "atlas-focus.png") });
      await button("Whole map").click();
      await find.fill("");
      return { files: 1000, importMs: elapsed };
    },
  ],
  [
    "archive-limit-preserves-current-map",
    async ({ page, assert }) => {
      const zip = zipSync(Object.fromEntries(Array.from({ length: 1001 }, (_, i) => [`f${i}.txt`, strToU8("hello")])));
      await page.getByLabel("Choose files", { exact: true }).setInputFiles({
        name: "too-many.zip",
        mimeType: "application/zip",
        buffer: Buffer.from(zip),
      });
      await page.locator(".atlas-error").filter({ hasText: "Archive limit" }).waitFor();
      assert.equal(await files(page), "1000", "a refused archive leaves the map that was there");
    },
  ],
  [
    "public-github",
    async ({ page, b, save, assert }) => {
      await page.getByLabel("Public GitHub repository", { exact: true }).fill("octocat/Hello-World");
      await b("Fetch").click();
      await page.waitForFunction(
        () => {
          const n = document.querySelector(".atlas-reading")?.dataset.files;
          return n && n !== "1000";
        },
        {},
        { timeout: 60000 },
      );
      const data = JSON.parse(await readFile(await save("Save map"), "utf8"));
      assert(data.files.some((f) => f.path === "README" && f.text.includes("Hello World")));
      return { repository: "octocat/Hello-World", files: data.files.length };
    },
  ],
];
