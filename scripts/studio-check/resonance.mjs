import { readFile } from "node:fs/promises";

/**
 * Resonance, under reduced motion: silent at rest however much you touch it,
 * a voice, the sequence, a live tempo change on the knob, a step, the
 * performance pad without a second audio context, stop, patch and WAV, and
 * sound that stops when the route is left.
 *
 * The motion half (the scope, the playhead, the trail, and the face fitting
 * one screen) is `scripts/studio-boundaries/resonance.mjs`.
 */
export default async function resonance({ page, open, button, save, assert, report }) {
  await open("resonance");
  // Nothing but a deliberate press may start sound: turn a knob, light a
  // step, drag the pad, pick a sound world, and still no AudioContext exists.
  await page.getByLabel("Tempo", { exact: true }).fill("100");
  await button("Voice 2, step 3").click();
  await page.locator(".reso__pad").click({ position: { x: 40, y: 40 } });
  await page.getByRole("radio", { name: "Glasshouse", exact: true }).check();
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.__studioAudio.length), 0, "no sound before a deliberate press");
  await page.getByRole("radio", { name: "After hours", exact: true }).check();

  await button("Play voice 1").click();
  await page.waitForFunction(() => window.__studioNotes > 0);
  await button("Play sequence").click();
  const count = await page.evaluate(() => window.__studioAudio.length);
  await page.getByLabel("Tempo", { exact: true }).fill("120");
  await button("Voice 1, step 2").click();
  await page.locator(".reso__pad").click({ position: { x: 50, y: 50 } });
  await page.waitForTimeout(350);
  assert.equal(await page.evaluate(() => window.__studioAudio.length), count);
  // Under reduced motion the playhead still says where the sequence is, a column at a time.
  await page.waitForFunction(() => document.querySelectorAll(".reso-cell[data-current]").length === 4);
  await button("Stop sound").click();
  await page.waitForFunction(() =>
    window.__studioAudio.every((c) => c.state === "closed"),
  );
  assert.equal(await page.locator(".reso-cell[data-current]").count(), 0, "stop puts the lamps out");
  const patch = JSON.parse(await readFile(await save("Save patch"), "utf8"));
  assert.equal(patch.bpm, 120);
  // The pad pressed while it played is in the saved patch (it opens dark).
  assert.equal(patch.voices[0].steps[1], true);
  // Opening a patch: a good one sets the face, a bad one is named and changes nothing.
  const picker = page.getByLabel("Open patch", { exact: true });
  await picker.setInputFiles({
    name: "slow.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...patch, bpm: 133 })),
  });
  await page.waitForFunction(() => document.querySelector(".reso__readout")?.textContent?.includes("133"));
  assert.equal(await page.getByLabel("Tempo", { exact: true }).inputValue(), "133");
  await picker.setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"format":"resonance-v1","voices":[{"note":999,"period":0}]}'),
  });
  await page.locator(".reso__error[role=alert]").waitFor();
  assert.equal(await page.getByLabel("Tempo", { exact: true }).inputValue(), "133", "a refused patch leaves the face alone");
  await page.getByLabel("Tempo", { exact: true }).fill("120");
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
