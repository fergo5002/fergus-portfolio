/**
 * The tab title while nobody is looking at it.
 *
 * A small piece of theatre: leave the tab and its name changes to "Come back",
 * come back and it is as you left it. It fits the machine the rest of the site
 * is pretending to be, and the tab strip is the one bit of chrome a visitor
 * still sees after they have gone.
 *
 * **This never touches what a crawler reads.** The swap happens on `blur` and
 * `visibilitychange`, neither of which a crawler fires, and the string lives in
 * a client module that renders nothing. The server HTML keeps the real title in
 * every case, which is the constraint AGENTS.md sets for text effects: decorate
 * the words, never replace them in the document. `document.title` is also the
 * wrong lever for search here anyway, since the `<title>` element is what gets
 * indexed and this rewrites it only after a human has already left.
 *
 * The document and window come in as arguments rather than being read off the
 * globals, so `lib/away.test.ts` can drive real browser event orderings in
 * vitest's node environment.
 */

/** Fergus's copy. The robot is the point; do not swap it for a wave. */
export const AWAY_TITLE = "Come back 🤖";

/** The slice of `document` this needs. */
export type AwayTarget = {
  title: string;
  hidden: boolean;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
};

/** The slice of `window` this needs. */
export type AwayWindow = {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
};

/**
 * Start watching for the visitor leaving. Returns the teardown.
 *
 * Both signals are bound on purpose, because they answer different questions:
 * `visibilitychange` catches switching tab, `blur` catches leaving the browser
 * for another application while this tab stays visible. Neither covers the
 * other, and "leaves the browser" is the whole brief.
 *
 * Binding both is also what makes the double-capture guard necessary: alt-tab
 * fires `blur` and then `visibilitychange`, so without `real` acting as a latch
 * the second one would record "Come back 🤖" as the title to restore, and the
 * tab would keep that name for the rest of the session.
 */
export function watchAway(doc: AwayTarget, win: AwayWindow): () => void {
  /** The real title, held only while the visitor is away. `null` means present. */
  let real: string | null = null;

  const leave = () => {
    if (real !== null) return; // Already away: never capture our own string.
    real = doc.title;
    doc.title = AWAY_TITLE;
  };

  const back = () => {
    if (real === null) return;
    // Only put the title back if it is still the one we set. If a route change
    // landed while the visitor was away, Next has already written the correct
    // title for the page they are now on, and restoring would replace it with
    // the name of the page they left.
    if (doc.title === AWAY_TITLE) doc.title = real;
    real = null;
  };

  const visibility = () => (doc.hidden ? leave() : back());

  // Deliberately no call to `visibility()` here. A tab opened in the background
  // starts hidden without ever having been visited, so greeting it with "come
  // back" would be false, and one middle-clicked link is rarely one tab. Only a
  // departure that actually happens earns the swap.
  doc.addEventListener("visibilitychange", visibility);
  win.addEventListener("blur", leave);
  win.addEventListener("focus", back);

  return () => {
    doc.removeEventListener("visibilitychange", visibility);
    win.removeEventListener("blur", leave);
    win.removeEventListener("focus", back);
    back(); // Unmounting while away must not weld "Come back" to the tab.
  };
}
