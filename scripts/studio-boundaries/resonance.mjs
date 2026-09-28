/**
 * Resonance with real motion on: the face fits one desktop screen, the scope
 * is dark at rest and draws what the analyser hears while the sequence plays,
 * the playhead moves, stop puts it all out, the pad's trail fades to nothing,
 * and under reduced motion the scope is a still.
 *
 * Prove the instrument first: every reading here depends on frames arriving,
 * and a hidden tab stops them, so each check records `visibilityState` and
 * fails on anything but "visible" rather than blaming the face.
 */

/** Pixels on a canvas with any light in them, and the rows they span. */
function readGlass(selector) {
  const canvas = document.querySelector(selector);
  if (!canvas || !canvas.width) return { lit: 0, top: -1, bottom: -1, hash: 0 };
  const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
  let lit = 0,
    top = -1,
    bottom = -1,
    hash = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 24) continue;
    const row = Math.floor((i >> 2) / canvas.width);
    lit++;
    if (top < 0) top = row;
    bottom = row;
    hash = (hash * 31 + (i >> 2)) | 0;
  }
  return { lit, top, bottom, hash, height: canvas.height };
}

async function instrument(page, assert) {
  const state = await page.evaluate(() => document.visibilityState);
  assert.equal(state, "visible", "the tab is hidden, so no frame will arrive: fix the instrument first");
}

async function counted(page) {
  await page.addInitScript(() => {
    const Native = window.AudioContext;
    window.__resoAudio = [];
    window.AudioContext = class extends Native {
      constructor(...args) {
        super(...args);
        window.__resoAudio.push(this);
      }
    };
  });
}

export default [
  [
    "resonance-face-fits-one-desktop-screen",
    async ({ page, open, assert }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      try {
        await open("resonance");
        await page.locator(".reso__face").waitFor();
        const fit = await page.evaluate(() => {
          const root = getComputedStyle(document.documentElement);
          const px = (name) => parseFloat(root.getPropertyValue(name)) || 0;
          const stage = document.querySelector(".bench-stage").getBoundingClientRect();
          const face = document.querySelector(".reso__face");
          return {
            stage: Math.round(stage.height),
            face: Math.round(face.getBoundingClientRect().height),
            room: innerHeight - px("--nav-h") - px("--status-h"),
            first: face.firstElementChild.className,
            host: document.querySelector(".bench-stage").firstElementChild.firstElementChild.classList.contains("reso"),
          };
        });
        assert.equal(fit.first, "reso__screen", "the scope is the first thing on the face");
        assert.ok(fit.host, "the face is the first thing on the stage");
        assert.ok(fit.stage <= fit.room, `the stage is ${fit.stage}px for ${fit.room}px of screen`);
        return fit;
      } finally {
        await page.setViewportSize({ width: 1440, height: 1050 });
      }
    },
  ],
  [
    "resonance-scope-dark-at-rest-live-while-playing",
    async ({ page, open, b, assert }) => {
      await counted(page);
      await open("resonance");
      await page.locator(".reso__scope").waitFor();
      await page.locator(".reso__face").scrollIntoViewIfNeeded();
      await instrument(page, assert);
      await page.waitForTimeout(400);
      const rest = await page.evaluate(readGlass, ".reso__scope");
      assert.equal(rest.lit, 0, "the glass is dark at rest");
      assert.equal(await page.evaluate(() => window.__resoAudio.length), 0, "silent at rest");

      await b("Play sequence").click();
      await page.waitForFunction(() => document.querySelectorAll(".reso-cell[data-current]").length === 4);
      await page.waitForTimeout(1200);
      await instrument(page, assert);
      const live = await page.evaluate(readGlass, ".reso__scope");
      assert.ok(live.lit > 200, `the trace is drawn (${live.lit} lit pixels)`);
      // A flat line would span a pixel or two; a waveform spans many rows.
      assert.ok(live.bottom - live.top > 12, `the trace moves off the centre line (${live.top}..${live.bottom})`);
      const x1 = await page.locator(".reso__playhead").evaluate((el) => el.style.transform);
      await page.waitForTimeout(450);
      const x2 = await page.locator(".reso__playhead").evaluate((el) => el.style.transform);
      assert.ok(x1 && x2 && x1 !== x2, `the playhead sweeps (${x1} then ${x2})`);

      await b("Stop sound").click();
      await page.waitForFunction(() => window.__resoAudio.every((c) => c.state === "closed"));
      await page.waitForTimeout(300);
      const after = await page.evaluate(readGlass, ".reso__scope");
      assert.equal(after.lit, 0, "stop puts the glass out");
      assert.equal(await page.locator(".reso-cell[data-current]").count(), 0, "stop puts the lamps out");
      return { rest: rest.lit, live: live.lit, span: live.bottom - live.top, x1, x2, after: after.lit };
    },
  ],
  [
    "resonance-pad-trail-fades-to-nothing",
    async ({ page, open, assert }) => {
      // Record what reaches the trail's canvas as it happens. Pointer moves are
      // frame-aligned in Chromium and a headless frame lands every 250ms or so,
      // so one pixel sample at one instant can fall either side of the single
      // bright frame (it did: 0, then 235, on two runs of the same build).
      await page.addInitScript(() => {
        const calls = (window.__trail = { fill: 0, stroke: 0, clear: 0, peak: 0 });
        for (const name of ["fill", "stroke", "clearRect"]) {
          const native = CanvasRenderingContext2D.prototype[name];
          CanvasRenderingContext2D.prototype[name] = function (...args) {
            if (this.canvas?.classList?.contains("reso__trail")) {
              if (name === "clearRect") calls.clear++;
              else {
                calls[name]++;
                calls.peak = Math.max(calls.peak, this.globalAlpha);
              }
            }
            return native.apply(this, args);
          };
        }
      });
      await open("resonance");
      const pad = page.locator(".reso__pad");
      await pad.scrollIntoViewIfNeeded();
      await instrument(page, assert);
      const box = await pad.boundingBox();
      await page.mouse.move(box.x + 20, box.y + box.height - 20);
      await page.mouse.down();
      // In bursts, the way a real pointer reports: headless Chromium draws a
      // frame every 250ms or so, and one move per frame leaves a trail of a
      // point or two (measured: moves and frames both about 250ms apart).
      for (let i = 1; i <= 4; i++)
        await page.mouse.move(box.x + 20 + i * 40, box.y + box.height - 20 - i * 36, { steps: 10 });
      await page.mouse.up();
      const drawn = await page.evaluate(() => ({ ...window.__trail }));
      assert.ok(drawn.fill > 4 && drawn.stroke > 2, `the trail is drawn behind the finger (${JSON.stringify(drawn)})`);
      assert.ok(drawn.peak > 0.3, `and it glows (brightest point at ${drawn.peak.toFixed(2)})`);
      await page.waitForTimeout(1400);
      const gone = await page.evaluate(readGlass, ".reso__trail");
      assert.equal(gone.lit, 0, "the trail fades to nothing and the glass is cleared");
      // Then it lets go of the frame clock: no more frames touch its canvas.
      const settled = await page.evaluate(() => window.__trail.clear);
      await page.waitForTimeout(800);
      const later = await page.evaluate(() => window.__trail.clear);
      assert.equal(later, settled, "the faded trail takes no more frames");
      return { drawn, gone: gone.lit, clears: later };
    },
  ],
  [
    "resonance-reduced-motion-draws-a-still",
    async ({ page, open, b, assert }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      try {
        await open("resonance");
        await page.locator(".reso__face").scrollIntoViewIfNeeded();
        await instrument(page, assert);
        await b("Play sequence").click();
        await page.waitForFunction(() => document.querySelectorAll(".reso-cell[data-current]").length === 4);
        await page.waitForTimeout(500);
        const one = await page.evaluate(readGlass, ".reso__scope");
        await page.waitForTimeout(600);
        const two = await page.evaluate(readGlass, ".reso__scope");
        assert.ok(one.lit > 200, `a still of the patch is on the glass (${one.lit} lit pixels)`);
        assert.equal(two.hash, one.hash, "and it does not move");
        await b("Stop sound").click();
        return { lit: one.lit, still: two.hash === one.hash };
      } finally {
        await page.emulateMedia({ reducedMotion: "no-preference" });
      }
    },
  ],
];
