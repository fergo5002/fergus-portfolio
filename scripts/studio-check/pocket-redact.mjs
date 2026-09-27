import { readFile } from "node:fs/promises";
import { PDFDocument, StandardFonts, PDFName } from "pdf-lib";

/**
 * Pocket Redact: the example open and masked on arrival, then a two-page PDF
 * through the drop slot, email masks on both pages, undo and redo, zoom, a
 * clean rebuilt PDF that the verify pass reports solid and textless, that
 * cannot be downloaded until every page is inspected, and that holds no font.
 *
 * Runs under reduced motion, so the scan reveals its verdicts at once.
 */
export default async function pocketRedact({ page, open, button, save, assert }) {
  await open("pocket-redact");
  // The document is the stage: the example, with its mask, before anything is touched.
  await page.locator(".redact__paper img.redact__page").waitFor();
  assert.equal(await page.locator(".redact__marks .redact__mask").count(), 1, "the example opens with one mask");
  assert.equal(
    await page.locator(".redact__sheet").evaluate((sheet) => {
      const stage = sheet.closest(".bench-stage") ?? sheet.closest(".redact");
      return [...stage.querySelectorAll("p, button, input, output, label")].every(
        (el) => sheet.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING || sheet.contains(el),
      );
    }),
    true,
    "the page comes before every control and sentence on the stage",
  );

  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 2; i++) {
    const p = pdf.addPage([600, 800]);
    p.drawText(`Page ${i + 1} private@example.org`, {
      x: 60,
      y: 650,
      font,
      size: 22,
    });
  }
  const bytes = await pdf.save();
  await page.getByLabel("Open a file", { exact: true }).setInputFiles({
    name: "private.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(bytes),
  });
  await page.getByRole("button", { name: "Page 2, 0 masks", exact: true }).waitFor();
  // Find mode is a segmented control: one native radio per mode.
  await page.getByRole("radio", { name: "Emails", exact: true }).check();
  assert.equal(await page.locator(".redact__candidate").count(), 1, "the email is lit on the page");
  await button("Cover all").click();
  assert.equal(await page.locator(".redact__candidate").count(), 0, "a covered candidate stops being lit");
  await button("Undo").click();
  await button("Redo").click();
  for (let i = 0; i < 5; i++) await button("Zoom in").click();
  assert.equal(await page.locator(".redact__zoom").textContent(), "150%");
  await button("Fit page").click();
  assert.equal(await page.locator(".redact__zoom").textContent(), "100%");
  await page.getByRole("button", { name: "Page 2, 0 masks", exact: true }).click();
  await page.getByRole("radio", { name: "Emails", exact: true }).check();
  await button("Cover all").click();
  await button("Build clean PDF").click();
  await page.locator("img.redact__proof").waitFor();
  // The verify pass read the reopened file: one solid mask, the one text run gone.
  assert.equal(
    await page.locator(".redact__reading").textContent(),
    "1 mask solid black · text found 1 → 0",
  );
  assert(
    await page
      .getByRole("button", { name: "Download reviewed PDF (0/2)", exact: true })
      .isDisabled(),
  );
  await page
    .getByLabel("I have inspected this exported page", { exact: true })
    .check();
  await button("Page 2").click();
  await page
    .getByLabel("I have inspected this exported page", { exact: true })
    .check();
  const path = await save("Download reviewed PDF (2/2)"),
    clean = await PDFDocument.load(await readFile(path));
  assert.equal(clean.getPageCount(), 2);
  for (const p of clean.getPages()) {
    const fonts = p.node.Resources()?.lookup(PDFName.of("Font"));
    assert(!fonts || fonts.keys().length === 0);
  }
  await button("Back to editing").click();
}
