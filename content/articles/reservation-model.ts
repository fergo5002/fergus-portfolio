/** An illustrative model, not production measurements or a booking service. */
export const reservationExample = {
  maximum: 240,
  lease: 90,
  renewEvery: 30,
  closeAt: 95,
  inspectAt: 195,
} as const;

export function leaseAt(elapsed: number, closedAt: number | null) {
  const { maximum, lease, renewEvery } = reservationExample;
  let expiresAt: number = lease;
  for (let heartbeat = renewEvery; heartbeat < maximum && heartbeat <= elapsed; heartbeat += renewEvery) {
    if (closedAt !== null && heartbeat >= closedAt) break;
    expiresAt = Math.min(heartbeat + lease, maximum);
  }
  const remaining = Math.max(0, expiresAt - elapsed);
  return { expiresAt, remaining, reserved: remaining > 0 };
}

export const reservationFigureCopy = {
  title: "Same countdown. Different reservation.",
  present: "Stay on the page",
  leave: "Close at 1:35",
  maximum: "On the original clock",
  inspection: "At 3:15 into checkout",
  reserved: "Still reserved",
  released: "Back on sale",
  heldDetail: "The browser kept renewing its lease.",
  releasedDetail: "The last lease expired at 3:00.",
  axis: "Seconds left on the server lease",
  choices: "Choose a checkout scenario",
  heldGraph: "Illustrative lease graph: regular renewals restore the lease to 90 seconds, until the original 4 minute deadline caps every renewal. The reservation expires at that deadline.",
  releasedGraph: "Illustrative lease graph: renewals stop when the page closes at 1 minute 35 seconds. The remaining lease reaches zero at 3 minutes, before the 4 minute maximum.",
  caption: "Illustrative model: a four-minute maximum, a 90-second lease, renewed every 30 seconds. No payment in progress. These are example timings, not production data.",
};
