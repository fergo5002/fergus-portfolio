import { describe, it, expect } from "vitest";
import { createStore } from "./external-store";

type S = { n: number };
type E = { type: "inc" } | { type: "noop" };
const reduce = (s: S, e: E): S => (e.type === "inc" ? { n: s.n + 1 } : s);

describe("createStore", () => {
  it("starts at the initial state and reduces on dispatch", () => {
    const store = createStore(reduce, { n: 0 });
    expect(store.get()).toEqual({ n: 0 });
    store.dispatch({ type: "inc" });
    expect(store.get()).toEqual({ n: 1 });
  });

  it("notifies subscribers once per change, and not when the reducer returns the same object", () => {
    const store = createStore(reduce, { n: 0 });
    let calls = 0;
    store.subscribe(() => calls++);
    store.dispatch({ type: "inc" });
    store.dispatch({ type: "noop" });
    expect(calls).toBe(1);
  });

  it("returns a stable snapshot between changes, which is what useSyncExternalStore needs", () => {
    const store = createStore(reduce, { n: 0 });
    expect(store.get()).toBe(store.get());
    store.dispatch({ type: "inc" });
    expect(store.get()).toBe(store.get());
  });

  it("stops notifying after unsubscribe, even mid-notification", () => {
    const store = createStore(reduce, { n: 0 });
    let a = 0;
    let b = 0;
    const offA = store.subscribe(() => {
      a++;
      offB();
    });
    const offB = store.subscribe(() => b++);
    store.dispatch({ type: "inc" });
    store.dispatch({ type: "inc" });
    expect(a).toBe(2);
    expect(b).toBe(1);
    offA();
    store.dispatch({ type: "inc" });
    expect(a).toBe(2);
  });
});
