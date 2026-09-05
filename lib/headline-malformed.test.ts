import { Worker } from "node:worker_threads";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";

it("finishes scanning unfinished quoted attributes and long tag names", async () => {
  // A worker gives a catastrophic-regex regression a real deadline. A Vitest
  // timeout alone cannot interrupt a synchronous expression that never yields.
  const results = await new Promise<string[]>((resolveResult, reject) => {
    const worker = new Worker(`
      const { parentPort, workerData } = require("node:worker_threads");
      import(workerData.url).then(({ checkHtml }) => {
        parentPort.postMessage(workerData.inputs.map(html => checkHtml(html).verdict));
      });
    `, { eval: true, execArgv: [], stdout: true, stderr: true, workerData: {
      url: pathToFileURL(resolve("lib/headline.ts")).href,
      inputs: [
        `<h1><span data-x=${'"x"'.repeat(25)} missing tag end</h1>`,
        `<h1 data-x=${'"x"'.repeat(25)} missing tag end`,
        `<h1><${"x".repeat(60_000)}</h1>`,
      ],
    } });
    const timer = setTimeout(() => { void worker.terminate(); reject(new Error("HTML scan exceeded 2 seconds")); }, 2_000);
    worker.once("message", value => { clearTimeout(timer); void worker.terminate(); resolveResult(value); });
    worker.once("error", error => { clearTimeout(timer); void worker.terminate(); reject(error); });
  });
  expect(results).toEqual(["clean", "no-h1-in-html", "clean"]);
});
