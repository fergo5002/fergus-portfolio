import { describe, expect, it } from "vitest";
import { leaseAt, reservationExample } from "./reservation-model";

describe("illustrative reservation lease", () => {
  it("renews a present customer's lease without extending the original deadline", () => {
    expect(leaseAt(29, null)).toEqual({ expiresAt: 90, remaining: 61, reserved: true });
    expect(leaseAt(30, null)).toEqual({ expiresAt: 120, remaining: 90, reserved: true });
    expect(leaseAt(239, null)).toEqual({ expiresAt: 240, remaining: 1, reserved: true });
    expect(leaseAt(240, null).reserved).toBe(false);
  });

  it("lets the last lease expire when the customer closes the page", () => {
    expect(leaseAt(95, 95).expiresAt).toBe(180);
    expect(leaseAt(179, 95).remaining).toBe(1);
    expect(leaseAt(180, 95)).toEqual({ expiresAt: 180, remaining: 0, reserved: false });
  });

  it("does not invent a renewal at the exact moment the page closes", () => {
    expect(leaseAt(30, 30).expiresAt).toBe(90);
  });

  it("shows the same visible maximum with different actual reservation states", () => {
    const { inspectAt, closeAt, maximum } = reservationExample;
    expect(maximum - inspectAt).toBe(45);
    expect(leaseAt(inspectAt, null).reserved).toBe(true);
    expect(leaseAt(inspectAt, closeAt).reserved).toBe(false);
  });

  it("keeps every plotted second within both expiry bounds", () => {
    for (const closedAt of [null, reservationExample.closeAt]) {
      for (let elapsed = 0; elapsed <= reservationExample.maximum; elapsed++) {
        const state = leaseAt(elapsed, closedAt);
        expect(state.remaining).toBeGreaterThanOrEqual(0);
        expect(state.remaining).toBeLessThanOrEqual(reservationExample.lease);
        expect(state.expiresAt).toBeLessThanOrEqual(reservationExample.maximum);
      }
    }
  });
});
