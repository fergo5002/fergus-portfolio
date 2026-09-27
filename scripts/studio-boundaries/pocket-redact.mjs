/**
 * Pocket Redact's boundary: the exported pixels under a mask are black and the
 * paper is white, read off the reopened clean copy. Runs with real motion, so
 * the burn plays and the scan sweeps; the reading line turns to its verdict
 * only once the sweep has passed, which proves the frame clock finished it.
 */
export default [
  [
    "redacted-pixels-and-moving-mask",
    async ({ page, open, b, assert }) => {
      await open("pocket-redact");
      await b("Example invoice").click();
      await page.locator(".redact__paper").waitFor();
      // Find mode is a segmented control now: one native radio per mode.
      await page.getByRole("radio", { name: "Emails", exact: true }).check();
      await b("Cover all").click();
      await b("Select / move").click();
      const svg = page.locator(".redact__marks"),
        box = await svg.boundingBox();
      const point = {
        x: box.x + (150 / 900) * box.width,
        y: box.y + (300 / 1160) * box.height,
      };
      await page.mouse.click(point.x, point.y);
      await page.keyboard.press("ArrowRight");
      await b("Undo").click();
      await b("Build clean PDF").click();
      await page.locator("img.redact__proof").waitFor();
      await page.locator(".redact__reading[data-ok]").waitFor({ timeout: 15000 });
      const pixel = await page
        .locator("img.redact__proof")
        .evaluate(async (img) => {
          await img.decode();
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0);
          return {
            black: [...ctx.getImageData(150, 300, 1, 1).data],
            white: [...ctx.getImageData(20, 20, 1, 1).data],
          };
        });
      assert.deepEqual(pixel.black, [0, 0, 0, 255]);
      assert.deepEqual(pixel.white, [255, 255, 255, 255]);
      return { ...pixel, reading: await page.locator(".redact__reading").textContent() };
    },
  ],
];
