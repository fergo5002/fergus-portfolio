import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { zipSync, strToU8 } from "fflate";
import { PDFDocument, StandardFonts } from "pdf-lib";
import sharp from "sharp";

/**
 * Atlas's boundaries, in order: they share one page, so each starts where the
 * last one left it.
 */
export default [
  [
    "document-formats-and-media",
    async ({ page, open, save, assert }) => {
      await open("atlas");
      const docx = zipSync({
        "word/document.xml": strToU8(
          '<w:document xmlns:w="urn:test"><w:body><w:p><w:r><w:t>Secret orchid observatory</w:t></w:r></w:p></w:body></w:document>',
        ),
      });
      const pptx = zipSync({
        "ppt/slides/slide1.xml": strToU8(
          '<a:p xmlns:a="urn:test"><a:r><a:t>Constellation planning</a:t></a:r></a:p>',
        ),
      });
      const xlsx = zipSync({
        "xl/sharedStrings.xml": strToU8(
          "<sst><si><t>Orchid revenue</t></si></sst>",
        ),
        "xl/worksheets/sheet1.xml": strToU8(
          "<worksheet><sheetData><row><c><v>42</v></c></row></sheetData></worksheet>",
        ),
      });
      const pdf = await PDFDocument.create(),
        font = await pdf.embedFont(StandardFonts.Helvetica);
      pdf.addPage().drawText("The phosphor observatory", { font, size: 20 });
      const image = await sharp({
        create: { width: 80, height: 60, channels: 3, background: "#ee8800" },
      })
        .png()
        .toBuffer();
      const remote = [];
      page.on("request", (r) => {
        if (r.url().includes("never-load.invalid")) remote.push(r.url());
      });
      const files = [
        { name: "report.docx", buffer: docx },
        { name: "slides.pptx", buffer: pptx },
        { name: "sheet.xlsx", buffer: xlsx },
        { name: "paper.pdf", buffer: await pdf.save() },
        { name: "orange.png", buffer: image },
        {
          name: "source.html",
          buffer: strToU8(
            '<img src="https://never-load.invalid/private"><script>fetch("https://never-load.invalid/run")</script>',
          ),
        },
        { name: "mystery.bin", buffer: new Uint8Array([0, 3, 5]) },
      ];
      await page
        .getByLabel("Choose files", { exact: true })
        .setInputFiles(
          files.map((f) => ({
            name: f.name,
            mimeType: "application/octet-stream",
            buffer: Buffer.from(f.buffer),
          })),
        );
      await page.waitForFunction(() =>
        document.querySelector(".lab-metrics")?.textContent?.includes("Files7"),
      );
      const data = JSON.parse(
        await readFile(await save("Save map + extracted text"), "utf8"),
      );
      for (const [path, term] of [
        ["report.docx", "orchid"],
        ["slides.pptx", "Constellation"],
        ["sheet.xlsx", "42"],
        ["paper.pdf", "phosphor"],
      ])
        assert(data.files.find((f) => f.path === path).text.includes(term), path);
      assert.equal(remote.length, 0);
      await page
        .getByLabel("Search files and contents", { exact: true })
        .fill("orange.png");
      await page
        .locator(".atlas-file-list button")
        .filter({ hasText: "orange.png" })
        .click();
      await page.locator(".atlas-media").waitFor();
      await page.waitForFunction(
        () => document.querySelector("img.atlas-media")?.naturalWidth === 80,
      );
      await page.locator(".atlas-canvas").scrollIntoViewIfNeeded();
      await page.waitForTimeout(250);
      const picture = await sharp(await readFile(await save("Save map image"))).stats();
      assert.equal(picture.channels[3].min, 255);
      assert(picture.channels[1].max > 100, "Export should contain the visible graph, with an opaque background.");
      return { formats: 7, unexpectedRequests: remote.length };
    },
  ],
  [
    "one-thousand-file-map",
    async ({ page, out, button }) => {
      const files = Array.from({ length: 1000 }, (_, i) => ({
          path: `folder-${Math.floor(i / 50)}/note-${i}.md`,
          text: `# Note ${i}\n[[note-${(i + 1) % 1000}]]\n${["phosphor magnet", "orchid garden", "tide coast", "synth melody"][i % 4]}`,
          size: 80,
          kind: "md",
          status: "read",
        })),
        start = Date.now();
      await page
        .getByLabel("Open a saved map", { exact: true })
        .setInputFiles({
          name: "large-map.json",
          mimeType: "application/json",
          buffer: Buffer.from(JSON.stringify({ format: "atlas-v1", files })),
        });
      await page.waitForFunction(
        () =>
          document
            .querySelector(".lab-metrics")
            ?.textContent?.includes("Files1,000") ||
          document
            .querySelector(".lab-metrics")
            ?.textContent?.includes("Files1000"),
      );
      const elapsed = Date.now() - start;
      await page.locator(".atlas-canvas").scrollIntoViewIfNeeded();
      await page
        .getByLabel("Search files and contents", { exact: true })
        .fill("note-999.md");
      await page
        .locator(".atlas-file-list button")
        .filter({ hasText: "note-999.md" })
        .click();
      await page
        .getByRole("heading", { name: "note-999.md", exact: true })
        .waitFor();
      await button("Focus neighbours").click();
      await page.waitForTimeout(250);
      await page
        .locator(".atlas-workspace")
        .screenshot({ path: resolve(out, "atlas-focus.png") });
      return { files: 1000, importMs: elapsed };
    },
  ],
  [
    "archive-limit-preserves-current-map",
    async ({ page, assert }) => {
      const zip = zipSync(
        Object.fromEntries(
          Array.from({ length: 1001 }, (_, i) => [`f${i}.txt`, strToU8("hello")]),
        ),
      );
      await page
        .getByLabel("Choose files", { exact: true })
        .setInputFiles({
          name: "too-many.zip",
          mimeType: "application/zip",
          buffer: Buffer.from(zip),
        });
      await page
        .locator(".lab-error")
        .filter({ hasText: "Archive limit" })
        .waitFor();
      assert((await page.locator(".lab-metrics").textContent()).includes("1000"));
    },
  ],
  [
    "public-github",
    async ({ page, b, save, assert }) => {
      await page
        .getByText("Public GitHub repository", { exact: true })
        .first()
        .click();
      await page
        .getByLabel("Public GitHub repository", { exact: true })
        .fill("octocat/Hello-World");
      await b("Fetch repository").click();
      await page.waitForFunction(
        () =>
          document.querySelector(".lab-metrics")?.textContent?.includes("Files1") &&
          !document
            .querySelector(".lab-metrics")
            ?.textContent?.includes("Files1000"),
        {},
        { timeout: 60000 },
      );
      const data = JSON.parse(
        await readFile(await save("Save map + extracted text"), "utf8"),
      );
      assert(
        data.files.some(
          (f) => f.path === "README" && f.text.includes("Hello World"),
        ),
      );
      return { repository: "octocat/Hello-World", files: data.files.length };
    },
  ],
];
