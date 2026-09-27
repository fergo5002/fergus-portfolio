/** Pocket Redact's boundary: the exported pixels under a mask are black and the paper is white. */
export default [
  [
    "redacted-pixels-and-moving-mask",
    async ({ page, open, b, assert }) => {
      await open("pocket-redact");
      await b("Try the example invoice").click();
      await page.locator(".redact-paper").waitFor();
      // Find mode is a segmented control now: one native radio per mode.
      await page.getByRole("radio", { name: "Email-like text", exact: true }).check();
      await b("Cover these text boxes").click();
      await b("Select / move").click();
      const svg = page.locator(".redact-paper>svg"),
        box = await svg.boundingBox();
      const point = {
        x: box.x + (150 / 900) * box.width,
        y: box.y + (300 / 1160) * box.height,
      };
      await page.mouse.click(point.x, point.y);
      await page.keyboard.press("ArrowRight");
      await b("Undo").click();
      await b("Build clean PDF").click();
      await page.locator(".redact-review>img").waitFor();
      const pixel = await page
        .locator(".redact-review>img")
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
      return pixel;
    },
  ],
];
