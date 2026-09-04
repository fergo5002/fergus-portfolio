import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * The three properties that make this tool auditable by reading, and a grep
 * for each. Coupling checks, not renders: vitest is in a node environment
 * here.
 *
 * They exist because the tool's promise is about what it does **not** do, and
 * absence is exactly the thing a behavioural test cannot show. A unit test can
 * prove the exchange sends hashes; only a grep can prove nothing else in the
 * tool quietly opened a second door.
 */

const dirs = [
  join(process.cwd(), "lib", "tools", "overlap"),
  join(process.cwd(), "app", "tools", "overlap"),
];

/**
 * Comments come out first, and that is not a convenience.
 *
 * Two of these greps look for the name of a thing, and the docblock that
 * explains why a module is the only one allowed to touch that thing has to
 * name it. `protocol.ts` says in prose that `RTCPeerConnection` is the part it
 * does not test, and a grep over the raw file reads that as a second door.
 * Newlines are kept so nothing shifts, in the manner of `content/voice.test.ts`.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => "\n".repeat((m.match(/\n/g) ?? []).length))
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

const files = dirs.flatMap((dir) =>
  readdirSync(dir)
    .filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"))
    .map((f) => ({
      path: join(dir, f),
      name: f,
      text: stripComments(readFileSync(join(dir, f), "utf8").replace(/\r\n/g, "\n")),
    })),
);

describe("the tool writes nothing to the visitor's machine", () => {
  it("has files to check, so an empty sweep cannot pass for a clean one", () => {
    expect(files.length).toBeGreaterThanOrEqual(10);
  });

  it.each(files.map((f) => [f.name, f.text] as const))("%s touches no storage API", (_name, text) => {
    for (const api of ["localStorage", "sessionStorage", "indexedDB", "document.cookie", "caches."]) {
      expect(text).not.toContain(api);
    }
  });
});

describe("one door out", () => {
  it("calls fetch in relay-client.ts and nowhere else", () => {
    const callers = files.filter((f) => /\bfetch\s*\(/.test(f.text)).map((f) => f.name);
    expect(callers).toEqual(["relay-client.ts"]);
  });

  it("names RTCPeerConnection in webrtc.ts and nowhere else", () => {
    const users = files.filter((f) => f.text.includes("RTCPeerConnection")).map((f) => f.name);
    expect(users).toEqual(["webrtc.ts"]);
  });

  /**
   * Every absolute URL in the tool, and there are only two kinds it may hold:
   * LinkedIn's own download page, and the STUN host, which is not an http URL
   * and so is pinned by its own assertion in `webrtc.test.ts` instead. The
   * page's copy lives in `content/`, outside both directories, which is why
   * nothing here matches the LinkedIn link in practice; a hit is a finding.
   */
  it("holds no URL to anywhere but LinkedIn's own download page", () => {
    const urls = files.flatMap((f) => [...f.text.matchAll(/https?:\/\/[^\s"'`)]+/g)].map((m) => m[0]));
    for (const url of urls) {
      expect(url.startsWith("https://www.linkedin.com/"), `unexpected URL ${url}`).toBe(true);
    }
  });

  it("opens no socket of its own beside the data channel", () => {
    for (const file of files) {
      expect(file.text, file.name).not.toMatch(/new WebSocket|EventSource|navigator\.sendBeacon/);
    }
  });
});

describe("the page says the thing the code does", () => {
  it("tells the visitor forget has nothing to wipe", async () => {
    const { overlapCopy } = await import("@/content/tools/overlap");
    expect(overlapCopy.honesty.storage).toContain("forget");
  });
});
