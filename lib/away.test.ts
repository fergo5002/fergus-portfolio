import { describe, it, expect } from "vitest";
import { AWAY_TITLE, watchAway, type AwayTarget, type AwayWindow } from "@/lib/away";

/**
 * Vitest runs in a `node` environment here, so there is no `document` to drive.
 * `watchAway` takes its document and window as arguments for exactly that
 * reason, and this file hands it a fake it can steer frame by frame.
 *
 * What that buys: every ordering below is a real sequence a browser produces
 * (blur before hide when you alt-tab, hide with no blur when you switch tabs),
 * and each one is asserted rather than reasoned about. What it cannot see: that
 * the events fire at all in a real browser, or that Chrome renders the emoji in
 * the tab strip. Those were checked by hand against the deployment.
 */

type Fake = AwayTarget & AwayWindow & { fire(type: string): void; listeners(): number };

function fakeTab(title = "Fergus O'Reilly · Founder"): Fake {
  const bound = new Map<string, Set<() => void>>();
  return {
    title,
    hidden: false,
    addEventListener(type, fn) {
      if (!bound.has(type)) bound.set(type, new Set());
      bound.get(type)!.add(fn);
    },
    removeEventListener(type, fn) {
      bound.get(type)?.delete(fn);
    },
    fire(type) {
      for (const fn of bound.get(type) ?? []) fn();
    },
    listeners() {
      let n = 0;
      for (const set of bound.values()) n += set.size;
      return n;
    },
  };
}

describe("the away title", () => {
  it("is Fergus's copy, verbatim", () => {
    expect(AWAY_TITLE).toBe("Come back 🤖");
  });

  it("swaps the title when the tab is hidden, and puts it back on return", () => {
    const tab = fakeTab();
    watchAway(tab, tab);

    tab.hidden = true;
    tab.fire("visibilitychange");
    expect(tab.title).toBe(AWAY_TITLE);

    tab.hidden = false;
    tab.fire("visibilitychange");
    expect(tab.title).toBe("Fergus O'Reilly · Founder");
  });

  it("swaps on window blur too, so leaving the browser entirely counts", () => {
    const tab = fakeTab();
    watchAway(tab, tab);

    // The tab is still visible: the visitor moved to another application.
    tab.fire("blur");
    expect(tab.title).toBe(AWAY_TITLE);

    tab.fire("focus");
    expect(tab.title).toBe("Fergus O'Reilly · Founder");
  });

  /**
   * The regression this exists for. Alt-tabbing away fires `blur` and then
   * `visibilitychange`, so a naive implementation captures the title twice and
   * the second capture reads "Come back", which is then restored forever.
   */
  it("never captures the away title as the real one", () => {
    const tab = fakeTab();
    watchAway(tab, tab);

    tab.fire("blur");
    tab.hidden = true;
    tab.fire("visibilitychange");
    expect(tab.title).toBe(AWAY_TITLE);

    tab.hidden = false;
    tab.fire("visibilitychange");
    tab.fire("focus");
    expect(tab.title).toBe("Fergus O'Reilly · Founder");
  });

  /**
   * A tab opened in the background was never visited, so "Come back" would be a
   * false claim, and a middle-click that opens five links would put it on all
   * five before any of them is read. Only a real departure earns the swap.
   */
  it("stays quiet on a tab that starts hidden and was never visited", () => {
    const tab = fakeTab();
    tab.hidden = true;
    watchAway(tab, tab);
    expect(tab.title).toBe("Fergus O'Reilly · Founder");
  });

  /**
   * Click a link, then immediately switch tabs: the route change lands while the
   * visitor is away and Next writes the new route's title over the away one.
   * Restoring the captured title then puts the PREVIOUS page's name on the
   * current page. So a title that is no longer ours is left alone.
   */
  it("does not clobber a title something else set while the visitor was away", () => {
    const tab = fakeTab();
    watchAway(tab, tab);

    tab.hidden = true;
    tab.fire("visibilitychange");
    expect(tab.title).toBe(AWAY_TITLE);

    tab.title = "Projects · Fergus O'Reilly"; // Next, finishing a route change.

    tab.hidden = false;
    tab.fire("visibilitychange");
    expect(tab.title).toBe("Projects · Fergus O'Reilly");
  });

  it("unbinds everything on cleanup", () => {
    const tab = fakeTab();
    const stop = watchAway(tab, tab);
    expect(tab.listeners()).toBeGreaterThan(0);
    stop();
    expect(tab.listeners()).toBe(0);

    tab.hidden = true;
    tab.fire("visibilitychange");
    expect(tab.title).toBe("Fergus O'Reilly · Founder");
  });

  /** Unmounting while away must not leave "Come back" welded to the tab. */
  it("restores the real title if it is torn down while away", () => {
    const tab = fakeTab();
    const stop = watchAway(tab, tab);

    tab.fire("blur");
    expect(tab.title).toBe(AWAY_TITLE);

    stop();
    expect(tab.title).toBe("Fergus O'Reilly · Founder");
  });
});
