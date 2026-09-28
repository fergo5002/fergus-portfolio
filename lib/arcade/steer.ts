import type { Point } from "./games/types";

/** How close, in world pixels, counts as on the finger. */
export const STEER_DEAD_ZONE = 15;

/**
 * The directions that carry the ship towards a finger held on the stage. The
 * room asks this every frame while the finger is down, so the ship stops on
 * the finger rather than sailing past it: keys used to be set only when a
 * pointer event arrived, and a finger held still sent the ship into the wall.
 */
export function steerKeys(player: Point, target: Point, dead = STEER_DEAD_ZONE): Set<string> {
  const keys = new Set<string>();
  if (target.x < player.x - dead) keys.add("left");
  if (target.x > player.x + dead) keys.add("right");
  if (target.y < player.y - dead) keys.add("up");
  if (target.y > player.y + dead) keys.add("down");
  return keys;
}
