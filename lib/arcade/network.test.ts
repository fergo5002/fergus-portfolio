import { expect, it } from "vitest";
import { decodePacket, snapshotFor } from "./network";
import { createGame } from "./engine";
it("accepts bounded multiplayer state and rejects unrelated game state", () => {
  const state = createGame("pong", 5, "online");
  expect(decodePacket(JSON.stringify({ type: "state", state: snapshotFor(state), paused: false }), "pong")?.type).toBe("state");
  expect(decodePacket(JSON.stringify({ type: "state", state: snapshotFor(state), paused: false }), "snake")).toBeNull();
  expect(decodePacket("x".repeat(60_000), "pong")).toBeNull();
});
it("only permits the opponent's controls and bounds coordinate arrays", () => {
  expect(decodePacket(JSON.stringify({ type: "input", keys: ["p2up"], presses: ["p2action"] }), "pong")?.type).toBe("input");
  expect(decodePacket(JSON.stringify({ type: "input", keys: ["left"], presses: [] }), "pong")).toBeNull();
  const state = snapshotFor(createGame("snake", 1, "online")); state.snake = Array(500).fill({ x: 1, y: 1 });
  expect(decodePacket(JSON.stringify({ type: "state", state, paused: false }), "snake")).toBeNull();
});
