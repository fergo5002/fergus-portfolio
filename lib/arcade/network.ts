import { createGame, type GameId, type GameState } from "./engine";
import type { Opened } from "@/lib/tools/overlap/webrtc";

export type Link = { opened: Opened; host: boolean; game: GameId; close(): void };
const KEYS = new Set(["p2up", "p2down", "p2left", "p2right", "p2action"]);
const FIELDS = ["seed", "time", "score", "over", "won", "level", "lives", "combo", "charge", "event", "player", "rival", "ball", "points", "rally", "serve", "snake", "snake2", "direction", "direction2", "queued", "queued2", "food", "moveClock", "phase", "phase2", "charge2", "snakesAlive", "eventAt"] as const;
export function snapshotFor(s: GameState) {
  const base = createGame(s.id, 0, "online");
  for (const k of FIELDS) Object.assign(base, { [k]: s[k] });
  return base;
}
export type Packet = { type: "input"; keys: string[]; presses: string[] } | { type: "state"; state: GameState; paused: boolean } | { type: "start"; seed: number } | { type: "pause"; paused: boolean };
function validShape(v: unknown, sample: unknown, depth = 0): boolean {
  if (depth > 5 || v === null) return false;
  if (typeof sample === "number") return typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 0xffffffff;
  if (typeof sample === "boolean") return typeof v === "boolean";
  if (typeof sample === "string") return typeof v === "string" && v.length <= 80;
  if (Array.isArray(sample)) {
    if (!Array.isArray(v) || v.length > 480) return false;
    if (!sample.length) return v.length === 0;
    return v.every(item => validShape(item, sample[0], depth + 1));
  }
  if (typeof sample === "object" && sample && typeof v === "object") {
    const a = v as Record<string, unknown>, b = sample as Record<string, unknown>;
    return Object.keys(a).length === Object.keys(b).length && Object.keys(b).every(k => validShape(a[k], b[k], depth + 1));
  }
  return false;
}
export function decodePacket(raw: unknown, game: GameId): Packet | null {
  if (typeof raw !== "string" || raw.length > 55_000 || (game !== "pong" && game !== "snake")) return null;
  try {
    const p = JSON.parse(raw);
    if (p.type === "input" && Array.isArray(p.keys) && p.keys.length <= 5 && Array.isArray(p.presses) && p.presses.length <= 8 && [...p.keys, ...p.presses].every(k => KEYS.has(k))) return p;
    if (p.type === "start" && Number.isSafeInteger(p.seed) && p.seed >= 0 && p.seed <= 0xffffffff) return p;
    if (p.type === "pause" && typeof p.paused === "boolean") return p;
    if (p.type === "state" && typeof p.paused === "boolean" && p.state?.id === game && p.state?.mode === "online" && validShape(p.state, createGame(game, 0, "online"))) return p;
  } catch { /* Malformed peer messages never reach simulation or DOM. */ }
  return null;
}
