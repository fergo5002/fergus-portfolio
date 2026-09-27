import { describe, it, expect, beforeEach } from "vitest";
import {
  arcadeSession, bestFor, INITIALS_KEY, loadInitials, markArcadeEntered, markArcadeSeen, rememberBest, rememberPosted,
  resetArcadeSession, saveInitials, sessionBest, setArcadeBoards,
} from "@/lib/arcade/session";
import { OWNED_PREFIX, isOwnedKey } from "@/lib/forget";

beforeEach(() => resetArcadeSession());

describe("the session", () => {
  it("starts with the door unfound and no boards", () => {
    expect(arcadeSession()).toEqual({ seen: false, entered: false, boards: null, lastPosted: null });
  });

  it("remembers that the door was opened", () => {
    markArcadeSeen();
    expect(arcadeSession().seen).toBe(true);
  });

  it("holds the last snapshot the client fetched", () => {
    setArcadeBoards({ available: true, boards: [] });
    expect(arcadeSession().boards).toEqual({ available: true, boards: [] });
  });
});

describe("the one key the arcade may write", () => {
  it("is under the prefix forget already wipes, so forget needs no change", () => {
    expect(INITIALS_KEY.startsWith(OWNED_PREFIX)).toBe(true);
    expect(isOwnedKey(INITIALS_KEY)).toBe(true);
  });

  it("round-trips three characters", () => {
    const store = new Map<string, string>();
    saveInitials({ setItem: (k, v) => void store.set(k, v) }, "FOR");
    expect(store.get(INITIALS_KEY)).toBe("FOR");
    expect(loadInitials({ getItem: (k) => store.get(k) ?? null })).toBe("FOR");
  });

  it("writes nothing for initials that would never have been accepted", () => {
    const store = new Map<string, string>();
    saveInitials({ setItem: (k, v) => void store.set(k, v) }, "no");
    expect(store.size).toBe(0);
  });

  it("reads a missing, malformed or hostile value as nothing saved", () => {
    expect(loadInitials({ getItem: () => null })).toBeNull();
    expect(loadInitials({ getItem: () => "" })).toBeNull();
    expect(loadInitials({ getItem: () => "a very long string" })).toBeNull();
  });

  it("survives storage that throws, because private mode does", () => {
    expect(() => saveInitials({ setItem: () => { throw new Error("quota"); } }, "FOR")).not.toThrow();
    expect(loadInitials({ getItem: () => { throw new Error("blocked"); } })).toBeNull();
  });
});

describe("the run the visitor just posted", () => {
  it("is remembered for the tab so the table can light that row, and nowhere else", () => {
    resetArcadeSession();
    expect(arcadeSession().lastPosted).toBeNull();
    rememberPosted({ game: "poker", initials: "FOR", score: 1200 });
    expect(arcadeSession().lastPosted).toEqual({ game: "poker", initials: "FOR", score: 1200 });
    resetArcadeSession();
    expect(arcadeSession().lastPosted).toBeNull();
  });
});

describe("the power-cycle", () => {
  it("runs in full once per page lifetime: the Terminal marks the door seen before the room exists, so this is its own flag", () => {
    resetArcadeSession();
    markArcadeSeen();
    expect(arcadeSession().seen).toBe(true);
    expect(arcadeSession().entered).toBe(false);
    markArcadeEntered();
    markArcadeEntered();
    expect(arcadeSession().entered).toBe(true);
  });
});

/**
 * The HUD's BEST. Module state like everything else here: it dies with the
 * tab, and it is never written to storage, because the constitution allows the
 * arcade exactly one key and that key is the initials somebody posted.
 */
describe("the best a run is shown", () => {
  const snapshot = (score: number) => ({ available: true, boards: [{ game: "poker", rows: [{ initials: "TOP", score }] }] });

  it("is the board's top row until this tab beats it, and lives only in this tab", () => {
    expect(bestFor("poker", null)).toBe(0);
    expect(bestFor("poker", snapshot(900))).toBe(900);
    rememberBest("poker", 1200);
    expect(sessionBest("poker")).toBe(1200);
    expect(bestFor("poker", snapshot(900))).toBe(1200);
    expect(bestFor("signal", snapshot(900))).toBe(0);
    resetArcadeSession();
    expect(sessionBest("poker")).toBe(0);
  });

  it("never lowers a best and ignores a score that is not one", () => {
    rememberBest("signal", 500);
    rememberBest("signal", 300);
    for (const bad of [Number.NaN, -1, 1.5, Number.POSITIVE_INFINITY]) rememberBest("signal", bad);
    expect(sessionBest("signal")).toBe(500);
  });

  it("ignores a board that says it is unavailable", () => {
    expect(bestFor("poker", { available: false, boards: [{ game: "poker", rows: [{ initials: "OLD", score: 99 }] }] })).toBe(0);
  });
});
