import { readFile } from "node:fs/promises";
import { PDFDocument, StandardFonts, PDFName } from "pdf-lib";

/**
 * Pocket Redact: a two-page PDF through the drop slot, email masks on both
 * pages, undo and redo, zoom, a clean rebuilt PDF that cannot be downloaded
 * until every page is reviewed, and no font left in the output.
 */
export default async function pocketRedact({ page, open, button, save, assert }) {
  await open("pocket-redact");
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
  await page
    .getByLabel("Open a document or image", { exact: true })
    .setInputFiles({
      name: "private.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(bytes),
    });
  await page.getByRole("button", { name: "Page 2, 0 masks", exact: true }).waitFor();
  // Find mode is a segmented control now: one native radio per mode.
  await page.getByRole("radio", { name: "Email-like text", exact: true }).check();
  await button("Cover these text boxes").click();
  await button("Undo").click();
  await button("Redo").click();
  await page.getByLabel("Zoom", { exact: true }).fill("150");
  await button("Fit page").click();
  await page
    .getByRole("button", { name: "Page 2, 0 masks", exact: true })
    .click();
  await page.getByRole("radio", { name: "Email-like text", exact: true }).check();
  await button("Cover these text boxes").click();
  await button("Build clean PDF").click();
  await page.locator(".redact-review").waitFor();
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
