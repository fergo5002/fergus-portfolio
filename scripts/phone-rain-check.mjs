#!/usr/bin/env node
/** Read the live shader's canvas pixels with paired times, before/after the phone rain constants. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, devices } from "playwright";

const base = process.argv[2] || "http://127.0.0.1:3116";
const out = process.argv[3] || ".phone-check/rain";
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const results = [];
try {
  for (const mobile of [true, false]) for (const before of [true, false]) {
    const context = await browser.newContext(mobile ? { ...devices["Pixel 5"] } : { viewport: { width: 1440, height: 900 } });
    await context.addInitScript(({ before }) => {
      window.__rain = { samples: [], replaced: 0 };
      const names = new WeakMap();
      let frame = 0;
      for (const Type of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
        if (!Type) continue;
        const proto = Type.prototype;
        const source = proto.shaderSource, location = proto.getUniformLocation, uniform = proto.uniform1f;
        // This is the recovered pre-change rain only. Every other shader term,
        // the renderer, drawing buffer and page remain the current build.
        proto.shaderSource = function(shader, text) {
          if (before && text.includes("float rainGain = mix(1.0, 0.55, uMobile);")) {
            text = text.replace("float cols = mix(54.0, 48.0, uMobile);", "float cols = mix(54.0, 32.0, uMobile);")
              .replace("float rainGain = mix(1.0, 0.55, uMobile);", "float rainGain = 1.0;");
            window.__rain.replaced++;
          }
          return source.call(this, shader, text);
        };
        proto.getUniformLocation = function(program, name) {
          const result = location.call(this, program, name);
          if (result) names.set(result, name);
          return result;
        };
        proto.uniform1f = function(where, value) {
          const name = names.get(where);
          if (name === "uTime") value = 5 + frame / 30;
          if (name === "uRain") value = 0.32;
          if (name === "uBurnRate") value = 0;
          return uniform.call(this, where, value);
        };
        for (const method of ["drawArrays", "drawElements"]) {
          const draw = proto[method];
          proto[method] = function(...args) {
            const result = draw.apply(this, args);
            if (this.canvas.parentElement?.classList.contains("phosphor") && this.getParameter(this.FRAMEBUFFER_BINDING) === null) {
              frame++;
              if (frame > 15 && window.__rain.samples.length < 60) {
                const width = this.drawingBufferWidth, height = this.drawingBufferHeight;
                const w = Math.floor(width * 0.7), h = Math.floor(height * 0.5);
                const pixels = new Uint8Array(w * h * 4);
                this.readPixels(Math.floor(width * 0.15), Math.floor(height * 0.25), w, h, this.RGBA, this.UNSIGNED_BYTE, pixels);
                let sum = 0, peak = 0;
                for (let i = 0; i < pixels.length; i += 4) {
                  const value = 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
                  sum += value; peak = Math.max(peak, value);
                }
                window.__rain.samples.push({ frame, mean: sum / (w * h), peak, width, height });
              }
            }
            return result;
          };
        }
      }
    }, { before });
    const page = await context.newPage();
    await page.goto(`${base}/writing`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => window.__rain.samples.length === 60, null, { timeout: 45_000 });
    const measured = await page.evaluate(() => window.__rain);
    if (before) assert.equal(measured.replaced, 1, "the original rain shader must actually be installed");
    results.push({ mobile, before, ...measured });
    await writeFile(`${out}/report.json`, JSON.stringify(results, null, 2));
    console.log(`${mobile ? "phone" : "desktop"} ${before ? "before" : "after"}: ${JSON.stringify(measured.samples.reduce((a, s) => ({ mean: a.mean + s.mean / 60, peak: Math.max(a.peak, s.peak) }), { mean: 0, peak: 0 }))}`);
    await context.close();
  }
  const mean = row => row.samples.reduce((sum, sample) => sum + sample.mean, 0) / row.samples.length;
  assert(mean(results[1]) < mean(results[0]), "phone canvas must actually become dimmer");
  const desktopDifference = Math.abs(mean(results[3]) - mean(results[2]));
  assert(desktopDifference < 0.05, `desktop changed by ${desktopDifference}`);
  await writeFile(`${out}/report.json`, JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
