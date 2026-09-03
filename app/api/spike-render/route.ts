import { chromium as playwrightChromium, webkit, devices, type Browser } from "playwright-core";

/**
 * S2 spike: render one known page in a function and report timings.
 *
 * Spike code. Never merges. The only URL it ever loads is this site, fixed
 * below, so there is no fence question here; the real tool routes every
 * navigation through lib/fence.ts and this does not stand in for that.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TARGET = "https://fergusoreilly.dev";
const BOOT = Date.now();
let requestsOnThisInstance = 0;

type Engine = "webkit" | "chromium";

function log(event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ spike: "s2", t: Date.now(), event, ...fields }));
}

/** Width and height straight out of the PNG header, so no image library is needed. */
function pngSize(buf: Buffer): { width: number; height: number } {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

async function launch(engine: Engine, singleProcess: boolean): Promise<{ browser: Browser; executablePath: string; args: string[] }> {
  if (engine === "webkit") {
    const executablePath = webkit.executablePath();
    const browser = await webkit.launch({ headless: true, executablePath });
    return { browser, executablePath, args: [] };
  }
  // Imported lazily so a WebKit run does not pay for unpacking Chromium.
  const sparticuz = (await import("@sparticuz/chromium")).default;
  const executablePath = await sparticuz.executablePath();
  // `--single-process` is in sparticuz's default args for Lambda and is a
  // known cause of hangs under Playwright. The brief drove this from an env
  // var; a query flag does the same job without a branch-scoped preview
  // variable (the branch is never pushed, so branch scoping is refused) and
  // lets one deployment measure both. Default is to drop it, because the
  // 2026-09-03 18:27 probe on dpl_GnVk... failed at newPage with it in.
  const args = singleProcess
    ? sparticuz.args
    : sparticuz.args.filter((a) => a !== "--single-process");
  const browser = await playwrightChromium.launch({ headless: true, executablePath, args });
  return { browser, executablePath, args };
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const engine = (url.searchParams.get("engine") === "webkit" ? "webkit" : "chromium") as Engine;
  const widths = (url.searchParams.get("widths") ?? "390,320").split(",").map((w) => Number(w));
  const singleProcess = url.searchParams.get("single") === "1";

  requestsOnThisInstance += 1;
  const sinceBootMs = Date.now() - BOOT;
  const coldStart = requestsOnThisInstance === 1;
  const t0 = performance.now();
  const cpu0 = process.cpuUsage();
  const timings: Record<string, number> = {};
  const shots: Array<{ width: number; height: number; bytes: number; ms: number }> = [];
  let executablePath = "";
  let browser: Browser | null = null;

  log("start", { engine, widths, singleProcess, coldStart, sinceBootMs, requestsOnThisInstance });

  try {
    const launched = await launch(engine, singleProcess);
    browser = launched.browser;
    executablePath = launched.executablePath;
    timings.launchMs = Math.round(performance.now() - t0);

    for (const width of widths) {
      const tShot = performance.now();
      // iPhone 13 emulation: viewport, scale factor 3, touch, mobile UA. At
      // 320 only the width changes, which is the SE-class case the phone
      // rule in coding-policy names.
      const context = await browser.newContext({
        ...devices["iPhone 13"],
        viewport: { width, height: width === 390 ? 844 : 568 },
      });
      const page = await context.newPage();
      await page.goto(TARGET, { waitUntil: "networkidle", timeout: 25_000 });
      const png = await page.screenshot({ fullPage: false, type: "png" });
      await context.close();
      const size = pngSize(Buffer.from(png));
      shots.push({ ...size, bytes: png.byteLength, ms: Math.round(performance.now() - tShot) });
    }
  } catch (error) {
    const cpu = process.cpuUsage(cpu0);
    const body = {
      ok: false,
      engine,
      singleProcess,
      coldStart,
      executablePath,
      // Spike change (2026-09-03): the sparticuz launch args alone are over
      // 2,000 characters, so the brief's slice hid the browser's stderr. Elide
      // the args line and keep more of the tail.
      error: String(error).replace(/<launching> [^\n]*/g, "<launching> [args elided]").slice(0, 6000),
      totalMs: Math.round(performance.now() - t0),
      nodeCpuMs: Math.round((cpu.user + cpu.system) / 1000),
    };
    log("fail", body);
    return Response.json(body, { status: 500 });
  } finally {
    await browser?.close().catch(() => undefined);
  }

  const cpu = process.cpuUsage(cpu0);
  const body = {
    ok: true,
    engine,
    singleProcess,
    coldStart,
    sinceBootMs,
    requestsOnThisInstance,
    executablePath,
    shots,
    timings: { ...timings, totalMs: Math.round(performance.now() - t0) },
    // Node's own CPU only. The browser is a child process and is not in this
    // figure, so it is a floor, not the cost. The usage page has the ceiling.
    nodeCpuMs: Math.round((cpu.user + cpu.system) / 1000),
    memoryRssMb: Math.round(process.memoryUsage().rss / 1048576),
  };
  log("done", body);
  return Response.json(body);
}
