/**
 * The cold boot in a real browser: what it types, who owns the reveal, the
 * skip, what reaches PostHog, and the beam's light on the tube.
 *
 * The boot is a timeline read off the one frame clock (lib/boot.ts), so this
 * watches it through the DOM it writes: the overlay's `data-phase`, the typed
 * text, and `html.booting`. Every browser context is fresh, so there is no
 * `fergusos_booted` in session storage and the page boots cold, and every tab
 * is brought to the front first, because a hidden tab gets no frames and would
 * only measure the watchdog.
 *
 * The machine readings are forced to values nothing else on the page could
 * produce (37 logical cores, the Chatham Islands' time zone), so a leak into a
 * request body is findable by string. Every request to /ingest is answered
 * here and never forwarded, so nothing reaches PostHog from a run.
 *
 * Three things have to be true before "no leak" means anything, and the check
 * proves each rather than assuming it (all three were false on the first run):
 *
 *  - PostHog is in the build: build with NEXT_PUBLIC_POSTHOG_KEY set to any
 *    value, for example phc_boot_check.
 *  - It is not filtering the browser out as a bot. posthog-js drops every
 *    event from a user agent containing "HeadlessChrome", so Chromium runs
 *    with an ordinary Chrome user agent here.
 *  - Autocapture is armed. posthog-js only arms it once the remote config says
 *    `autocapture_opt_out: false`, so the stand-in config says so, and a click
 *    on a real button after the boot has to come back as `$autocapture`.
 *
 * `--strip-no-capture` removes the class from the overlay just before the skip
 * click. That run is expected to FAIL the ingest check: it is the revert that
 * shows the check can see a leak at all.
 *
 *   REVISION_BASE=http://localhost:3233 node scripts/boot-check.mjs
 *     [--only chromium|webkit] [--shots dir] [--gpu] [--no-ingest] [--no-beam]
 *     [--no-shots] [--shots-only] [--beam-only] [--strip-no-capture]
 *
 * `--gpu` asks headless Chromium for the machine's GPU (ANGLE on D3D11) rather
 * than SwiftShader. Both are worth running: the software path is the one that
 * starved the old timeout-chain boot.
 */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { chromium, devices, webkit } from "playwright";

const base = process.env.REVISION_BASE || "http://localhost:3000";
const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const only = option("--only", "");
const shots = option("--shots", ".revision-check/boot");
const gpu = args.includes("--gpu");
const checkIngest = !args.includes("--no-ingest");
const checkBeam = !args.includes("--no-beam");
const stripNoCapture = args.includes("--strip-no-capture");
await mkdir(shots, { recursive: true });

/** What PostHog's /array/<token>/config would say for a project with autocapture on. */
const REMOTE_CONFIG = JSON.stringify({
  token: "phc_boot_check",
  hasFeatureFlags: false,
  autocapture_opt_out: false,
  captureDeadClicks: false,
  capturePerformance: false,
  autocaptureExceptions: false,
  elementsChainAsString: true,
  sessionRecording: false,
  heatmaps: false,
  surveys: false,
  siteApps: [],
});

const CORES = 37;
const ZONE = "Pacific/Chatham";
const LOCALE = "en-NZ";

const results = [];
let failed = 0;
const pass = (engine, label, evidence) => {
  results.push({ engine, label, ok: true, evidence });
  console.log(`PASS ${engine}: ${label}${evidence === undefined ? "" : ` ${JSON.stringify(evidence)}`}`);
};
const fail = (engine, label, error) => {
  failed++;
  results.push({ engine, label, ok: false, error: String(error?.stack || error) });
  console.log(`FAIL ${engine}: ${label}\n  ${String(error?.message || error)}`);
};
async function step(engine, label, fn) {
  try {
    const evidence = await fn();
    pass(engine, label, evidence);
  } catch (error) {
    fail(engine, label, error);
  }
}

/** Records every phase, the longest boot text, and when `booting` and the overlay went. */
function watcher({ cores }) {
  Object.defineProperty(Navigator.prototype, "hardwareConcurrency", { get: () => cores, configurable: true });
  // posthog-js drops every event from what it takes for a bot: `webdriver`
  // (which Playwright sets) or a HeadlessChrome brand in userAgentData. A
  // visitor's browser has neither, and the payload a visitor would send is
  // the thing under test, so the page is shown an ordinary browser.
  Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false, configurable: true });
  if ("userAgentData" in Navigator.prototype) {
    Object.defineProperty(Navigator.prototype, "userAgentData", { get: () => undefined, configurable: true });
  }
  const s = (window.__boot = {
    phases: [],
    maxText: "",
    started: null,
    revealedAt: null,
    revealedPhase: null,
    finished: null,
    bootingAtEnd: null,
    visibility: [document.visibilityState],
  });
  document.addEventListener("visibilitychange", () => s.visibility.push(document.visibilityState));
  // The skip's latency, measured from the click the page receives rather than
  // from when the driver started trying to click.
  document.addEventListener("click", () => { s.clickAt ??= performance.now(); }, true);
  const sample = () => {
    const boot = document.querySelector(".boot");
    const booting = document.documentElement.classList.contains("booting");
    if (boot) {
      if (s.started === null) s.bootingWhenMounted = booting;
      s.started ??= performance.now();
      const text = boot.textContent || "";
      if (text.length > s.maxText.length) s.maxText = text;
      const phase = boot.dataset.phase;
      if (phase && s.phases[s.phases.length - 1] !== phase) s.phases.push(phase);
      if (!booting && s.revealedAt === null) {
        s.revealedAt = performance.now();
        s.revealedPhase = phase;
      }
    } else if (s.started !== null && s.finished === null) {
      s.finished = performance.now();
      s.bootingAtEnd = booting;
      // finish() reveals the page and drops the overlay in one synchronous
      // commit (flushSync), so both usually arrive in the same mutation batch:
      // the reveal is then the same instant as the drop.
      if (!booting && s.revealedAt === null) {
        s.revealedAt = s.finished;
        s.revealedPhase = s.phases[s.phases.length - 1] ?? null;
        s.sameCommit = true;
      }
    }
  };
  new MutationObserver(sample).observe(document, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["class", "data-phase"],
  });
}

/**
 * Answers every /ingest request locally and keeps its decoded body. Scripts are
 * answered as (empty) scripts, the remote config as a config with autocapture
 * on, and events as accepted. Nothing is forwarded.
 */
async function captureIngest(context) {
  const bodies = [];
  await context.route("**/ingest/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const raw = request.postDataBuffer();
    let text = "";
    if (raw && raw.length) {
      try {
        text = gunzipSync(raw).toString("utf8");
      } catch {
        text = raw.toString("utf8");
        // posthog-js can also send base64 in a form field.
        const m = /(?:^|&)data=([^&]+)/.exec(text);
        if (m) {
          try {
            text = Buffer.from(decodeURIComponent(m[1]), "base64").toString("utf8");
          } catch {
            /* keep the raw text */
          }
        }
      }
    }
    bodies.push({ url: request.url(), path, method: request.method(), text });
    if (path.endsWith(".js")) await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    else if (/\/array\/[^/]+\/config$/.test(path)) await route.fulfill({ status: 200, contentType: "application/json", body: REMOTE_CONFIG });
    else await route.fulfill({ status: 200, contentType: "application/json", body: '{"status":"Ok"}' });
  });
  return bodies;
}

/** Waits until posthog-js has asked for its remote config, which it does once initialised. */
const posthogReady = (bodies, timeout = 15_000) =>
  new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      if (bodies.some((b) => /\/array\/[^/]+\/config$/.test(b.path))) resolve(true);
      else if (Date.now() - started > timeout) resolve(false);
      else setTimeout(tick, 50);
    };
    tick();
  });

async function newPage(engine, name, extra = {}) {
  const browser =
    engine === "webkit"
      ? await webkit.launch()
      : await chromium.launch(gpu ? { args: ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist"] } : {});
  // An ordinary Chrome user agent: posthog-js treats "HeadlessChrome" as a bot
  // and sends nothing, which would make every privacy check below vacuous.
  const userAgent =
    engine === "chromium"
      ? `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browser.version()} Safari/537.36`
      : undefined;
  const device =
    engine === "webkit" ? { ...devices["iPhone 13"] } : { viewport: { width: 1440, height: 900 }, userAgent };
  const context = await browser.newContext({
    ...device,
    reducedMotion: "no-preference",
    timezoneId: ZONE,
    locale: LOCALE,
    ...extra,
  });
  await context.addInitScript(watcher, { cores: CORES });
  // Every page answers /ingest locally, whether or not the run judges it:
  // nothing a check does may reach PostHog, even under a dummy key.
  const ingest = await captureIngest(context);
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { browser, context, page, errors, name, ingest };
}

const phase = (page) => page.evaluate(() => document.querySelector(".boot")?.dataset.phase ?? null);
const ORDER = ["off", "head", "memory", "post", "devices", "punchline", "switch", "trace", "ready", "collapse", "done"];
const bootState = (page) =>
  page
    .evaluate(() => ({
      phases: window.__boot?.phases,
      now: document.querySelector(".boot")?.dataset.phase ?? null,
      booting: document.documentElement.classList.contains("booting"),
      finished: window.__boot?.finished ?? null,
      visibility: document.visibilityState,
      text: (document.querySelector(".boot")?.textContent ?? "").slice(-120),
    }))
    .catch((e) => String(e));
/** A labelled wait: on a timeout, says what it was waiting for and where the boot was. */
async function waitFor(page, label, fn, arg, timeout = 25_000) {
  try {
    await page.waitForFunction(fn, arg, { timeout, polling: 16 });
  } catch (error) {
    throw new Error(`timed out waiting for ${label}: ${JSON.stringify(await bootState(page))}`, { cause: error });
  }
}
/**
 * Waits until the boot has reached a phase or gone past it, and says where it
 * actually was if it never did. "Reached", not "is in": a screenshot can take
 * longer than a short phase lasts, and an exact-phase wait then never returns.
 */
async function waitPhase(page, wanted, timeout = 25_000) {
  try {
    await page.waitForFunction(
      ([w, order]) => {
        const boot = document.querySelector(".boot");
        // No overlay means gone only once there has been one.
        if (!boot) return window.__boot?.finished != null;
        return order.indexOf(boot.dataset.phase) >= order.indexOf(w);
      },
      [wanted, ORDER],
      { timeout, polling: 16 },
    );
  } catch (error) {
    const state = await page
      .evaluate(() => ({ phases: window.__boot?.phases, now: document.querySelector(".boot")?.dataset.phase ?? null, booting: document.documentElement.classList.contains("booting"), text: (document.querySelector(".boot")?.textContent ?? "").slice(-120) }))
      .catch(() => null);
    throw new Error(`never reached "${wanted}": ${JSON.stringify(state)}`, { cause: error });
  }
}

async function coldBoot(engine) {
  const phone = engine === "webkit";
  const run = await newPage(engine, "cold");
  const { page, browser, errors } = run;
  const ingest = checkIngest ? run.ingest : null;
  try {
    await page.goto(base + "/", { waitUntil: "commit" });
    await page.bringToFront();

    await step(engine, "the tab is in front, so the frame clock runs", async () => {
      const state = await page.evaluate(() => document.visibilityState);
      assert.equal(state, "visible");
      return state;
    });

    // No screenshots in this run: one takes longer than several phases last
    // here, and it would perturb the frame gaps the POST measures. The
    // moments are photographed by `moments()`, one fresh boot each.
    await waitFor(page, "the overlay to go", () => window.__boot.finished !== null, undefined, 40_000);

    const boot = await page.evaluate(() => window.__boot);

    await step(engine, "types /usr/tighsauna and never the retired name", async () => {
      assert.match(boot.maxText, /\/usr\/tighsauna/);
      assert.doesNotMatch(boot.maxText, /presterly/i);
      return boot.maxText.match(/mounting\s+\/usr\/\w+/)[0];
    });

    await step(engine, "reads this machine: its zone, and on a desktop its cores", async () => {
      assert.match(boot.maxText, new RegExp(ZONE.replace("/", "\\/")));
      assert.match(boot.maxText, new RegExp(LOCALE));
      if (phone) assert.doesNotMatch(boot.maxText, /logical core/);
      else assert.match(boot.maxText, new RegExp(`${CORES} logical cores`));
      assert.equal(boot.maxText.includes("CPU: Trinity"), !phone);
      const refresh = /(\d+) Hz/.exec(boot.maxText);
      return { zone: ZONE, cores: phone ? "not printed on a phone" : CORES, refresh: refresh ? `${refresh[1]} Hz` : "left out" };
    });

    await step(engine, "plays its phases in order, never back, and reaches the end", async () => {
      // The timeline is read off the frame clock, so a phase shorter than the
      // gap between two frames is stepped over rather than stretched: on a
      // slow machine the 130ms mode switch or the fold can pass between frames.
      // What must hold is the order, and that the words and the mark played.
      const expected = phone
        ? ["off", "head", "post", "devices", "punchline", "switch", "trace", "ready", "collapse", "done"]
        : ["off", "head", "memory", "post", "devices", "punchline", "switch", "trace", "ready", "collapse", "done"];
      const seen = boot.phases;
      const positions = seen.map((p) => expected.indexOf(p));
      assert.ok(positions.every((p) => p >= 0), `an unknown phase: ${seen}`);
      for (let i = 1; i < positions.length; i++) assert.ok(positions[i] > positions[i - 1], `out of order: ${seen}`);
      for (const needed of ["head", "devices", "trace"]) assert.ok(seen.includes(needed), `never showed ${needed}: ${seen}`);
      return { seen, steppedOver: expected.filter((p) => p !== "done" && !seen.includes(p)) };
    });

    await step(engine, "html.booting holds until the overlay goes", async () => {
      assert.equal(boot.bootingWhenMounted, true, "the page was not hidden when the overlay mounted");
      assert.notEqual(boot.revealedAt, null, "booting was never seen removed under the overlay, or the watcher missed it");
      // finish() removes the class and drops the overlay in one synchronous
      // commit. Before it did (2026-09-27) the overlay left at React's next
      // commit, behind a software-rendered frame, and outlived the reveal by
      // up to 284ms under load.
      assert.ok(["collapse", "done"].includes(boot.revealedPhase), `revealed during ${boot.revealedPhase}`);
      assert.ok(boot.finished - boot.revealedAt < 250, `overlay outlived the reveal by ${Math.round(boot.finished - boot.revealedAt)}ms`);
      assert.equal(boot.bootingAtEnd, false);
      return { revealedPhase: boot.revealedPhase, overlayGoneAfterMs: Math.round(boot.finished - boot.revealedAt), sameCommit: Boolean(boot.sameCommit), bootMs: Math.round(boot.finished - boot.started) };
    });

    await step(engine, "the page is fully visible afterwards", async () => {
      // Once the 680ms power-on flourish has finished with the page.
      await waitFor(page, "the power-on flourish to end", () => !document.querySelector(".power-on"), undefined, 5000);
      const state = await page.evaluate(() => ({
        booting: document.documentElement.classList.contains("booting"),
        overlay: !!document.querySelector(".boot"),
        screen: getComputedStyle(document.querySelector(".screen")).visibility,
        nav: getComputedStyle(document.querySelector(".nav")).visibility,
        status: getComputedStyle(document.querySelector(".statusbar")).visibility,
        powerOn: !!document.querySelector(".power-on"),
        origin: document.querySelector(".screen").style.transformOrigin,
        marker: sessionStorage.getItem("fergusos_booted"),
      }));
      assert.deepEqual(
        { booting: state.booting, overlay: state.overlay, screen: state.screen, nav: state.nav, status: state.status, powerOn: state.powerOn, origin: state.origin, marker: state.marker },
        { booting: false, overlay: false, screen: "visible", nav: "visible", status: "visible", powerOn: false, origin: "", marker: "1" },
      );
      await page.locator("h1.hero__name").waitFor({ state: "visible" });
      return state;
    });

    await step(engine, "no page errors", async () => {
      assert.deepEqual(errors, []);
    });

    return { boot, ingest };
  } finally {
    await browser.close();
  }
}

async function skipPartWay(engine) {
  const run = await newPage(engine, "skip");
  const { page, browser, errors } = run;
  const ingest = checkIngest ? run.ingest : null;
  try {
    await page.goto(base + "/", { waitUntil: "commit" });
    await page.bringToFront();
    // Skip on the worst possible target: the line that prints the zone, once
    // PostHog is listening, so a leak would have somewhere to go.
    const target = page.locator(".boot__lines", { hasText: "Host locale" });
    await target.waitFor({ state: "attached" });
    await page.waitForFunction(() => /Host locale\s+:\s+\S/.test(document.querySelector(".boot")?.textContent ?? ""), null, { polling: 16 });
    const listening = ingest ? await posthogReady(ingest, 4000) : false;
    if (stripNoCapture) await page.evaluate(() => document.querySelector(".boot")?.classList.remove("ph-no-capture"));
    const before = await phase(page);
    // `force`: the line is still typing, and Playwright would otherwise wait
    // for it to stop moving before it clicked.
    await (engine === "webkit" ? target.tap({ force: true }) : target.click({ force: true }));
    await page.locator(".boot").waitFor({ state: "detached", timeout: 3000 });

    await step(engine, "skip works part-way through", async () => {
      const state = await page.evaluate(() => ({
        booting: document.documentElement.classList.contains("booting"),
        screen: getComputedStyle(document.querySelector(".screen")).visibility,
        clickToGoneMs: Math.round(window.__boot.finished - window.__boot.clickAt),
      }));
      assert.equal(state.booting, false);
      assert.equal(state.screen, "visible");
      assert.ok(state.clickToGoneMs < 250, `the overlay outlived the skip by ${state.clickToGoneMs}ms`);
      await page.locator("h1.hero__name").waitFor({ state: "visible" });
      return { skippedDuring: before, clickToGoneMs: state.clickToGoneMs, posthogListeningAtClick: listening };
    });

    if (ingest) {
      // The positive control: a click autocapture should record, on a real
      // button, so "nothing leaked" cannot come from autocapture being off.
      await page.waitForTimeout(600);
      const prompt = page.locator(".statusbar__prompt");
      await (engine === "webkit" ? prompt.tap() : prompt.click());
      // Give PostHog its batch flush, then leave the page, which flushes again.
      await page.waitForTimeout(5000);
      await page.goto(base + "/experience", { waitUntil: "networkidle" });
      await page.waitForTimeout(2500);
    }
    await step(engine, "no page errors while skipping", async () => {
      assert.deepEqual(errors, []);
    });
    return { ingest };
  } finally {
    await browser.close();
  }
}

/**
 * A skip while the beam is drawing the mark must take the beam with it.
 *
 * Found 2026-09-27: `finish()` dropped the overlay but left the boot's frame
 * callback subscribed, so the timeline ran on behind the revealed page and
 * the beam kept tracing the mark into the phosphor for about 600ms after the
 * skip (and the mode switch's relay could still throw after one). Watched here
 * through the shader's own `uBeamCount` uploads, the one path the beam reaches
 * the tube by, with the overlay's presence recorded at each upload.
 */
async function skipDuringTrace(engine) {
  const run = await newPage(engine, "skip-trace");
  const { page, browser, errors } = run;
  try {
    await page.addInitScript(() => {
      const log = (window.__beamUploads = []);
      const names = new WeakMap();
      for (const Type of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
        if (!Type) continue;
        const proto = Type.prototype;
        const location = proto.getUniformLocation;
        const uniform1f = proto.uniform1f;
        proto.getUniformLocation = function (program, name) {
          const result = location.call(this, program, name);
          if (result) names.set(result, name);
          return result;
        };
        proto.uniform1f = function (where, value) {
          if (names.get(where) === "uBeamCount") log.push({ t: performance.now(), value, overlay: !!document.querySelector(".boot") });
          return uniform1f.call(this, where, value);
        };
      }
    });
    await page.goto(base + "/", { waitUntil: "commit" });
    await page.bringToFront();
    // Skip once the beam is seen drawing, not merely once the trace has begun:
    // on a phone the first beam frame can land after a tap at the phase's start,
    // and a skip before it tests nothing.
    await waitFor(page, "the beam to draw", () => window.__beamUploads.some((u) => u.value > 0 && u.overlay));
    const skippedIn = await phase(page);
    // The skip button hides while the tube is graphic; the overlay itself is
    // the skip, anywhere on it.
    await (engine === "webkit" ? page.touchscreen.tap(195, 120) : page.mouse.click(720, 200));
    await page.locator(".boot").waitFor({ state: "detached", timeout: 3000 });
    const goneAt = await page.evaluate(() => performance.now());
    await page.waitForTimeout(1500);
    await step(engine, "a skip mid-trace takes the beam with it", async () => {
      const r = await page.evaluate((goneAt) => {
        const all = window.__beamUploads;
        return {
          visibility: document.visibilityState,
          beamSeenBefore: all.some((u) => u.t <= goneAt && u.value > 0),
          litAfter: all.filter((u) => u.t > goneAt && u.value > 0).map((u) => ({ ms: Math.round(u.t - goneAt), points: u.value })),
        };
      }, goneAt);
      // The instrument first: a probe that never saw the beam proves nothing.
      assert.ok(r.beamSeenBefore, `INSTRUMENT DEGRADED, not a result: no beam upload seen before the skip (${JSON.stringify({ skippedIn, ...r })})`);
      assert.deepEqual(r.litAfter, [], `the beam kept drawing after the skip in ${skippedIn}`);
      return { skippedIn, visibility: r.visibility };
    });
    await step(engine, "no page errors while skipping mid-trace", async () => {
      assert.deepEqual(errors, []);
    });
  } finally {
    await browser.close();
  }
}

function judgeIngest(engine, captured) {
  const all = captured.flat();
  return step(engine, "no /ingest body carries the core count or the time zone", async () => {
    const withBody = all.filter((b) => b.text);
    assert.ok(withBody.length > 0, "no /ingest request had a body: PostHog did not run, so this proves nothing (build with NEXT_PUBLIC_POSTHOG_KEY)");
    // The instrument, proved before it is believed: events flowed, and
    // autocapture recorded the click on the terminal button.
    assert.ok(withBody.some((b) => b.text.includes("$pageview")), "PostHog sent no $pageview: it is not capturing, so silence proves nothing");
    assert.ok(
      withBody.some((b) => b.text.includes("$autocapture") && /statusbar__prompt/.test(b.text)),
      "autocapture did not record the control click on the terminal button, so it was not armed and silence proves nothing",
    );
    let nativeZone = 0;
    const leaks = [];
    for (const b of withBody) {
      // PostHog's own event properties include the browser's zone as
      // `$timezone` on every event, boot or no boot. That is PostHog's
      // collection, not the boot's, and it is counted and reported rather than
      // hidden. Everything else in the body is searched.
      const stripped = b.text.replace(/"\$timezone(?:_offset)?"\s*:\s*("[^"]*"|-?\d+)/g, () => {
        nativeZone++;
        return '"$timezone":"(stripped)"';
      });
      const probes = [ZONE, `${CORES} logical`, "Host CPU", "Host locale", "Host display", "Host memory"];
      const found = probes.filter((p) => stripped.includes(p));
      if (found.length) {
        const at = stripped.indexOf(found[0]);
        leaks.push({ url: b.url, found, around: stripped.slice(Math.max(0, at - 80), at + 120) });
      }
    }
    assert.deepEqual(leaks, []);
    const autocaptures = withBody.reduce((n, b) => n + (b.text.match(/"\$autocapture"/g) ?? []).length, 0);
    return { requests: all.length, withBody: withBody.length, autocaptureEvents: autocaptures, posthogOwnTimezoneFields: nativeZone };
  });
}

/**
 * Reads the tube's own pixels across the caret while the beam draws it.
 *
 * The canvas is behind the DOM, so this sees the phosphor and not the SVG.
 * Run twice: once as built, once with `uBeamGain` held at zero, so the
 * difference is the beam's deposit and nothing else. Reads straight after the
 * present pass draws, inside the same task, where the drawing buffer is still
 * intact.
 */
async function beamPixels(engine, zeroGain) {
  const run = await newPage(engine, zeroGain ? "beam-off" : "beam-on");
  const { page, browser } = run;
  try {
    await page.addInitScript(({ zeroGain }) => {
      const probe = (window.__beamProbe = { frames: [], program: 0 });
      const names = new WeakMap();
      for (const Type of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
        if (!Type) continue;
        const proto = Type.prototype;
        if (zeroGain) {
          const location = proto.getUniformLocation;
          const uniform1f = proto.uniform1f;
          proto.getUniformLocation = function (program, name) {
            const result = location.call(this, program, name);
            if (result) names.set(result, name);
            return result;
          };
          proto.uniform1f = function (where, value) {
            if (names.get(where) === "uBeamGain") value = 0;
            return uniform1f.call(this, where, value);
          };
        }
        const draw = proto.drawArrays;
        proto.drawArrays = function (...a) {
          const result = draw.apply(this, a);
          if (this.canvas.classList?.contains("phosphor__canvas") && this.getParameter(this.FRAMEBUFFER_BINDING) === null) {
            const boot = document.querySelector(".boot");
            const ph = boot?.dataset.phase ?? "gone";
            const mark = document.querySelector(".boot__mark");
            // The mark's box is remembered, so the column can still be read
            // after the overlay has gone, where the afterglow is.
            if (mark) probe.box = mark.getBoundingClientRect();
            // Read from the very first frame, record from the mode switch. On
            // ANGLE over D3D11 the first reads of this column cost the page
            // most of a second, and starting them at the switch froze the boot
            // there: its clock then correctly skipped the whole trace, and the
            // instrument had caused the very gap it reported (2026-09-27).
            const graphic = ["switch", "trace", "ready", "collapse", "done", "gone"].includes(ph);
            if (probe.box && probe.frames.length < 400) {
              const r = probe.box;
              const sx = this.drawingBufferWidth / innerWidth;
              const sy = this.drawingBufferHeight / innerHeight;
              // A column across the caret at its middle (x 41 in the icon's
              // grid), from 6 units above the stroke to 6 below.
              const x = Math.round((r.left + ((41 - 12) / 38) * r.width) * sx);
              const top = r.top + ((34 - 18) / 28) * r.height;
              const bottom = r.top + ((46 - 18) / 28) * r.height;
              const y0 = Math.round(this.drawingBufferHeight - bottom * sy);
              const h = Math.max(1, Math.round((bottom - top) * sy));
              const px = new Uint8Array(h * 4);
              this.readPixels(x, y0, 1, h, this.RGBA, this.UNSIGNED_BYTE, px);
              let peakG = 0;
              let sumG = 0;
              for (let i = 0; i < h; i++) {
                peakG = Math.max(peakG, px[i * 4 + 1]);
                sumG += px[i * 4 + 1];
              }
              const caret = mark ? Number(getComputedStyle(mark).getPropertyValue("--mark-b")) || 0 : 1;
              if (graphic) probe.frames.push({ t: performance.now(), phase: ph, caret, peakG, meanG: sumG / h, h });
            }
          }
          return result;
        };
      }
    }, { zeroGain });
    await page.goto(base + "/", { waitUntil: "commit" });
    await page.bringToFront();
    await waitFor(page, "the overlay to go", () => window.__boot.finished !== null, undefined, 45_000);
    // The afterglow is read off the frames after the overlay has gone.
    await page.waitForTimeout(900);
    const frames = await page.evaluate(() => window.__beamProbe.frames);
    const errors = [...new Set(run.errors)];
    if (errors.length) console.log(`  page errors during the ${zeroGain ? "beam-off" : "beam-on"} run: ${JSON.stringify(errors)}`);
    return frames;
  } finally {
    await browser.close();
  }
}

/**
 * The moments worth looking at, photographed on a paused clock.
 *
 * Playwright's fake clock stops the page's own time: its timers, animation
 * frames and performance.now() move only when this script moves them. So one
 * cold boot is stepped 30ms of its time at a time and each moment is
 * photographed while time stands still: a slow screenshot cannot make the next
 * moment late, and a slow machine cannot step over a short phase. CSS
 * animations run on the compositor's clock instead, so the page's power-on is
 * paused by hand for its photograph.
 *
 * What this cannot show is how the boot paces itself in real time; the other
 * runs are for that. The POST's refresh rate here is the fake clock's: every
 * fake frame is exactly 16ms apart, 62.5Hz, which reads as 60 Hz.
 */
const MOMENTS = [
  ["1-strike", "the line struck and the picture opening", () => {
    const boot = document.querySelector(".boot");
    const open = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--boot-open")) || 0;
    return boot?.dataset.phase === "head" && open > 0.25;
  }],
  ["2-post", "the visitor's machine read out in full", () => document.querySelector(".boot")?.dataset.phase === "devices"],
  ["3-devices", "the device lines down to the caffeine", () => document.querySelector(".boot")?.dataset.phase === "punchline"],
  ["4-trace", "the beam most of the way down the chevron", () => {
    const mark = document.querySelector(".boot__mark");
    return !!mark && Number(getComputedStyle(mark).getPropertyValue("--mark-a")) > 0.55;
  }],
  ["5-caret", "the beam on the caret", () => {
    const mark = document.querySelector(".boot__mark");
    return !!mark && Number(getComputedStyle(mark).getPropertyValue("--mark-b")) > 0.45;
  }],
  ["6-hold", "the mark held", () => document.querySelector(".boot")?.dataset.phase === "ready"],
  ["7-fold", "the fold half way", () => {
    const fold = document.querySelector(".boot__fold");
    return !!fold && Number(getComputedStyle(fold).getPropertyValue("--collapse")) > 0.5;
  }],
  ["8-reveal", "the page opening out of the line", () => !document.querySelector(".boot") && window.__boot?.finished != null],
];

async function moments(engine) {
  const run = await newPage(engine, "moments");
  const { page } = run;
  const caught = {};
  try {
    await page.clock.install({ time: new Date("2026-09-27T12:00:00Z") });
    await page.clock.pauseAt(new Date("2026-09-27T12:00:00.500Z"));
    await page.goto(base + "/", { waitUntil: "commit" });
    await page.bringToFront();
    await page.locator(".boot").waitFor({ state: "attached", timeout: 30_000 });
    let fakeMs = 0;
    for (const [label, what, until] of MOMENTS) {
      let reached = await page.evaluate(until);
      while (!reached && fakeMs < 15_000) {
        await page.clock.runFor(30);
        fakeMs += 30;
        reached = await page.evaluate(until);
      }
      if (!reached) {
        caught[label] = `missed: ${what}`;
        continue;
      }
      // The page's power-on is a CSS animation on the real clock: hold it
      // at 150ms, where it is a band opening out of the line.
      if (label === "8-reveal") await page.evaluate(() => { for (const a of document.getAnimations()) if (a.animationName === "power-on") { a.pause(); a.currentTime = 150; } });
      caught[label] = `${(await phase(page)) ?? "gone"} at ${fakeMs}ms`;
      await page.screenshot({ path: join(shots, `${engine}-${label}.png`) });
    }
    // And the page, settled: the flourish finished and the tube's own time run on.
    await page.evaluate(() => { for (const a of document.getAnimations()) if (a.animationName === "power-on") a.finish(); });
    await page.clock.runFor(1200);
    caught["9-settled"] = `${(await phase(page)) ?? "gone"} at ${fakeMs + 1200}ms`;
    await page.screenshot({ path: join(shots, `${engine}-9-settled.png`) });
  } catch (error) {
    caught.error = `missed: ${String(error.message).slice(0, 200)}`;
  } finally {
    await run.browser.close();
  }
  await step(engine, "screenshots of each moment, on a paused clock", async () => {
    const missed = Object.entries(caught).filter(([, v]) => String(v).startsWith("missed"));
    assert.deepEqual(missed, []);
    return caught;
  });
}

async function reducedMotion(engine) {
  const run = await newPage(engine, "reduced", { reducedMotion: "reduce" });
  const { page, browser } = run;
  try {
    await page.goto(base + "/", { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await step(engine, "never boots under reduced motion", async () => {
      const state = await page.evaluate(() => ({
        booting: document.documentElement.classList.contains("booting"),
        overlaySeen: window.__boot.started !== null,
      }));
      assert.deepEqual(state, { booting: false, overlaySeen: false });
      return state;
    });
  } finally {
    await browser.close();
  }
}

const engines = only ? [only] : ["chromium", "webkit"];

await step("server", "the boot's words are not in the server HTML", async () => {
  // Costume, typed on the client only, so it never reaches a crawler's text.
  // (The page's own JSON-LD does name tighsauna.com, which is why the probe
  // is the mount path and not the bare word.)
  const html = await (await fetch(base + "/")).text();
  for (const word of ["BIOS v", "/usr/tighsauna", "Memory Test", "Host CPU", "caffeine reserves", "skip &gt;"]) {
    assert.ok(!html.includes(word), `server HTML contains ${word}`);
  }
  return html.length;
});

for (const engine of args.includes("--beam-only") || args.includes("--shots-only") ? [] : engines) {
  const cold = await coldBoot(engine);
  const skip = await skipPartWay(engine);
  await skipDuringTrace(engine);
  if (checkIngest) await judgeIngest(engine, [cold.ingest ?? [], skip.ingest ?? []]);
  await reducedMotion(engine);
  if (!args.includes("--no-shots")) await moments(engine);
}

if (args.includes("--shots-only")) for (const engine of engines) await moments(engine);

if (checkBeam && !args.includes("--shots-only") && (!only || only === "chromium")) {
  // A degraded pair (a run that saw almost no frames in the window) is retried
  // up to three times, and the report says how many it took. It is never
  // counted as a result either way.
  const inWindow = (frames) =>
    frames.filter((f) => (f.phase === "trace" && f.caret > 0.3) || f.phase === "ready" || f.phase === "collapse").length;
  let on = [];
  let off = [];
  let attempts = 0;
  while (attempts < 3) {
    attempts++;
    on = await beamPixels("chromium", false);
    off = await beamPixels("chromium", true);
    if (inWindow(on) >= 3 && inWindow(off) >= 3) break;
    console.log(`  beam measurement attempt ${attempts} under-sampled (${inWindow(on)} and ${inWindow(off)} frames in the window), retrying`);
  }
  await step("chromium", "the beam's trail reaches the tube's pixels, below the clamp", async () => {
    const peak = (frames, pred) => Math.max(0, ...frames.filter(pred).map((f) => f.peakG));
    const count = (frames) => frames.reduce((c, f) => ({ ...c, [f.phase]: (c[f.phase] ?? 0) + 1 }), {});
    // The caret's column from the moment the beam reaches it: drawn, then held
    // by the retrace (the trail, which must stay under the clamp), then folded
    // (the collapsing line aims past the clamp on purpose, so it is reported
    // but not held to it). The window as a whole holds several frames even on
    // software WebGL, where frames arrive 80 to 200ms apart.
    const window_ = (f) => (f.phase === "trace" && f.caret > 0.3) || f.phase === "ready" || f.phase === "collapse";
    const trail = (f) => (f.phase === "trace" && f.caret > 0.3) || f.phase === "ready";
    const drawing = (f) => f.phase === "trace" && f.caret > 0.3;
    const holding = (f) => f.phase === "ready";
    const folding = (f) => f.phase === "collapse";
    // The first 250ms after the overlay went: the page is opening, and the
    // phosphor still holds the mark and the fold line.
    const goneAt = (frames) => frames.find((f) => f.phase === "gone")?.t ?? Infinity;
    const after = (frames) => (f) => f.phase === "gone" && f.t - goneAt(frames) < 250;
    const summary = {
      frames: { on: count(on), off: count(off) },
      drawnPeakGreen: { beam: peak(on, drawing), noBeam: peak(off, drawing) },
      holdPeakGreen: { beam: peak(on, holding), noBeam: peak(off, holding) },
      foldPeakGreen: { beam: peak(on, folding), noBeam: peak(off, folding) },
      afterglowPeakGreen: { beam: peak(on, after(on)), noBeam: peak(off, after(off)) },
      attempts,
    };
    // Instrument first: a run that saw almost no frames in the window measured
    // the machine, not the beam (headless GPU Chromium stalls for seconds at
    // times on this laptop, with or without a probe).
    assert.ok(
      on.filter(window_).length >= 3 && off.filter(window_).length >= 3 && on.some(trail) && off.some(trail),
      `INSTRUMENT DEGRADED, not a result: too few frames with the beam in the caret: ${JSON.stringify(summary.frames)}`,
    );
    const trailBeam = peak(on, trail);
    assert.ok(trailBeam > peak(off, trail) + 20, `no visible deposit: ${JSON.stringify(summary)}`);
    assert.ok(trailBeam < 250, `the trail is clipping: ${JSON.stringify(summary)}`);
    return summary;
  });
  await writeFile(join(shots, "beam-pixels.json"), JSON.stringify({ gpu, on, off }, null, 2));
}

await writeFile(join(shots, "report.json"), JSON.stringify({ base, gpu, results }, null, 2));
console.log(`\n${results.length - failed}/${results.length} checks passed${gpu ? " (GPU)" : " (software WebGL where headless)"}.`);
process.exitCode = failed ? 1 : 0;
