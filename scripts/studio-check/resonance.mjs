import { readFile } from "node:fs/promises";

/**
 * Resonance: a pad, the sequence, a live tempo change on the knob, a step, the
 * performance pad without a second audio context, stop, patch and WAV, and
 * sound that stops when the route is left.
 */
export default async function resonance({ page, open, button, save, assert, report }) {
  await open("resonance");
  await button("Play voice 1").click();
  await page.waitForFunction(() => window.__studioNotes > 0);
  await button("Play sequence").click();
  const count = await page.evaluate(() => window.__studioAudio.length);
  await page.getByLabel("Tempo", { exact: true }).fill("120");
  await page
    .getByRole("button", { name: "Voice 1, step 2", exact: true })
    .click();
  await page.locator(".music-xy").click({ position: { x: 50, y: 50 } });
  await page.waitForTimeout(350);
  assert.equal(await page.evaluate(() => window.__studioAudio.length), count);
  await button("Stop sound").click();
  await page.waitForFunction(() =>
    window.__studioAudio.every((c) => c.state === "closed"),
  );
  const patch = JSON.parse(await readFile(await save("Save patch"), "utf8"));
  assert.equal(patch.bpm, 120);
  const wav = await readFile(await save("Render 8 bars to WAV"));
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert(wav.length > 1_000_000);
  let peak = 0;
  for (let i = 44; i < wav.length; i += 2)
    peak = Math.max(peak, Math.abs(wav.readInt16LE(i)));
  assert(peak > 100 && peak < 32768);
  report.push({ name: "wav-pixels", bytes: wav.length, peak });
  await button("Play sequence").click();
  await page.locator("a.bench-back").click();
  await page.waitForFunction(() =>
    window.__studioAudio.length > 0 && window.__studioAudio.every((c) => c.state === "closed"),
  );
  await open("resonance");
}
