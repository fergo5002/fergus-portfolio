import { describe, it, expect, beforeEach } from "vitest";
import {
  arcadeSession, INITIALS_KEY, loadInitials, markArcadeEntered, markArcadeSeen, rememberPosted, resetArcadeSession,
  saveInitials, setArcadeBoards,
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
    rememberPosted({ game: "bounce", initials: "FOR", score: 1200 });
    expect(arcadeSession().lastPosted).toEqual({ game: "bounce", initials: "FOR", score: 1200 });
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
