import { resolve } from "node:path";

/** Group Lore's boundaries, in order: a 25,000-message archive, then a cancelled read that must stay cancelled. */
export default [
  [
    "large-chat-filtering",
    async ({ page, open, out, assert }) => {
      await open("group-lore");
      const rows = Array.from({ length: 25000 }, (_, i) => ({
        sender: `Person ${i % 12}`,
        text: `Message ${i} orchid conversation`,
        at: Date.UTC(2026, 0, 1) + i * 60000,
      }));
      const file = {
          name: "large-chat.json",
          mimeType: "application/json",
          buffer: Buffer.from(JSON.stringify(rows)),
        },
        start = Date.now();
      // The formats moved from this label into the drop slot's chips (TXT, JSON, ZIP).
      await page.getByLabel("Import a chat", { exact: true }).setInputFiles(file);
      await page.waitForFunction(() =>
        document.querySelector(".lab-metrics")?.textContent?.includes("25,000"),
      );
      const elapsed = Date.now() - start;
      assert.equal(await page.locator(".lore-messages article").count(), 50);
      await page
        .getByLabel("Search message text", { exact: true })
        .fill("Message 24999 ");
      await page.waitForFunction(
        () => document.querySelectorAll(".lore-messages article").length === 1,
      );
      await page
        .locator(".studio-lore")
        .screenshot({ path: resolve(out, "lore-large.png") });
      return { messages: 25000, importMs: elapsed, renderedRows: 50 };
    },
  ],
  [
    "cancelled-chat-read-stays-cancelled",
    async ({ page, b, assert }) => {
      await b("Clear filters").click();
      // Hold the read until the test has clicked Cancel. A fixed 800ms delay raced
      // Playwright's actionability checks and disappeared before slower CI clicked.
      await page.evaluate(() => {
        const original = File.prototype.text;
        window.__originalStudioFileText = original;
        window.__studioReadFinished = false;
        File.prototype.text = async function () {
          if (this.name === "cancel-chat.json") {
            await new Promise((resolve) => { window.__releaseStudioRead = resolve; });
            const text = await original.call(this);
            window.__studioReadFinished = true;
            return text;
          }
          return original.call(this);
        };
      });
      try {
        await page.getByLabel("Import a chat", { exact: true }).setInputFiles({
          name: "cancel-chat.json",
          mimeType: "application/json",
          buffer: Buffer.from(JSON.stringify([{ sender: "Delayed", text: "Should not replace the archive", at: Date.now() }])),
        });
        await page.waitForFunction(() => typeof window.__releaseStudioRead === "function");
        await b("Cancel").click();
        await page.evaluate(() => window.__releaseStudioRead());
        await page.waitForFunction(() => window.__studioReadFinished);
        // Give an incorrectly started parser time to replace the existing archive.
        await page.waitForTimeout(1000);
        assert((await page.locator(".lab-metrics").textContent()).includes("25,000"));
      } finally {
        await page.evaluate(() => {
          window.__releaseStudioRead?.();
          File.prototype.text = window.__originalStudioFileText;
          delete window.__releaseStudioRead;
          delete window.__originalStudioFileText;
          delete window.__studioReadFinished;
        });
      }
    },
  ],
];
