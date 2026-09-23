import type { Article } from "../articles";

export const timerReservation: Article = {
  slug: "the-timer-is-not-the-reservation",
  title: "The timer is not the reservation",
  description:
    "A checkout countdown makes a promise. A short server lease keeps it, and gives the space back when the person disappears. A small interactive explanation.",
  date: "2026-09-16",
  format: "visual-note",
  tags: ["Engineering", "Product"],
  summary:
    "A short visual explanation of reservation leases: renew whilst a checkout is active, cap renewal at the original deadline, and recover abandoned capacity without relying on a browser-close event. The interactive timeline uses illustrative timings, not customer data.",
  body: `A checkout timer is a small promise: this space is yours for a while. Drawing the countdown is easy. Keeping that promise when somebody closes their laptop is the interesting part.

The tempting solution is to release the reservation when the tab closes. Except [browsers do not reliably say goodbye](https://developer.mozilla.org/en-US/docs/Web/API/Window/unload_event), especially on phones. The server can be left holding space for somebody who has gone.

A short lease gives silence a meaning. Whilst the page is active, it asks the server to keep the reservation. Each successful renewal moves the lease forward, but never beyond the original checkout deadline. Stop hearing from the page and the lease runs out.

That is the shape I like: the ordinary path renews, the abandoned path expires, and neither needs a perfect final message.

Payment makes it more delicate. Somebody approving a bank challenge has also left your page. Treat that silence as abandonment and you can release space whilst they are paying. Payment state has to join the decision.

Like [the phosphor on this site](/writing/a-crt-that-behaves-like-a-crt), the visible effect needs a system underneath it. Otherwise the timer is just a very convincing animation.`,
};
