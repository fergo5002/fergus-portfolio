import { describe, it, expect } from "vitest";
import { fetchBoards, readSnapshot, submitScore } from "@/lib/arcade/board-client";
import { arcadeCopy } from "@/content/arcade";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("readSnapshot", () => {
  it("accepts a well-formed available snapshot", () => {
    const body = { available: true, boards: [{ game: "pong", rows: [{ initials: "FOR", score: 10 }] }] };
    expect(readSnapshot(body)).toEqual(body);
  });

  it("treats anything it does not recognise as unavailable", () => {
    for (const body of [null, 42, "boards", {}, { available: true }, { available: true, boards: {} }]) {
      expect(readSnapshot(body).available, JSON.stringify(body)).toBe(false);
    }
  });

  it("drops a row it cannot trust rather than rendering it", () => {
    const body = {
      available: true,
      boards: [{ game: "pong", rows: [{ initials: "FOR", score: 10 }, { initials: "TOOLONG", score: 1 }, { initials: "CKK", score: "x" }] }],
    };
    expect(readSnapshot(body).boards[0].rows).toEqual([{ initials: "FOR", score: 10 }]);
  });
});

describe("fetchBoards", () => {
  it("returns the boards when the route answers properly", async () => {
    const body = { available: true, boards: [{ game: "pong", rows: [] }] };
    const snapshot = await fetchBoards(async () => jsonResponse(body));
    expect(snapshot.available).toBe(true);
  });

  it("says unavailable when the route is not there at all, which is today", async () => {
    // F4 is unmerged, so `app/api/board` may not exist. A 404 has to read the
    // same as a store that is missing, or the arcade breaks on the way to it.
    const snapshot = await fetchBoards(async () => new Response("Not found", { status: 404 }));
    expect(snapshot).toMatchObject({ available: false, boards: [] });
  });

  it("says unavailable when the store is missing behind a 200", async () => {
    const snapshot = await fetchBoards(async () => jsonResponse({ available: false, boards: [] }));
    expect(snapshot.available).toBe(false);
  });

  it("says unavailable when the network throws, and never rethrows", async () => {
    const snapshot = await fetchBoards(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(snapshot.available).toBe(false);
  });

  it("says unavailable when the body is not JSON", async () => {
    const snapshot = await fetchBoards(async () => new Response("<!doctype html>", { status: 200 }));
    expect(snapshot.available).toBe(false);
  });
});

describe("submitScore", () => {
  it("refuses locally before it sends anything, so the visitor sees why", async () => {
    let called = false;
    const result = await submitScore({ game: "pong", initials: "KKK", score: 10 }, async () => {
      called = true;
      return jsonResponse({});
    });
    expect(called).toBe(false);
    expect(result).toEqual({ ok: false, reason: arcadeCopy.initials.blocked });
  });

  it("posts the cleaned initials and a whole score", async () => {
    let sent: unknown = null;
    await submitScore({ game: "pong", initials: " f o r ", score: 42.7 }, async (_url, init) => {
      sent = JSON.parse(String((init as RequestInit).body));
      return jsonResponse({ ok: true, board: { game: "pong", rows: [] } });
    });
    expect(sent).toEqual({ game: "pong", initials: "FOR", score: 42 });
  });

  it("hands back the board the server returned", async () => {
    const board = { game: "pong", rows: [{ initials: "FOR", score: 42 }] };
    const result = await submitScore({ game: "pong", initials: "for", score: 42 }, async () =>
      jsonResponse({ ok: true, board }));
    expect(result).toEqual({ ok: true, board });
  });

  it("passes the server's own sentence through when it refuses", async () => {
    const result = await submitScore({ game: "pong", initials: "for", score: 42 }, async () =>
      jsonResponse({ reason: "three a day is the limit. try tomorrow." }, 429));
    expect(result).toEqual({ ok: false, reason: "three a day is the limit. try tomorrow." });
  });

  it("refuses to print a server sentence long enough to break the grid", async () => {
    const result = await submitScore({ game: "pong", initials: "for", score: 42 }, async () =>
      jsonResponse({ reason: "x".repeat(400) }, 429));
    expect(result).toEqual({ ok: false, reason: arcadeCopy.initials.refused });
  });

  it("never throws, whatever the network does", async () => {
    const result = await submitScore({ game: "pong", initials: "for", score: 1 }, async () => {
      throw new Error("offline");
    });
    expect(result.ok).toBe(false);
  });
});
