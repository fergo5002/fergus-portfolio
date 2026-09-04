/**
 * The five noises a game may ask for, and what each one is on the synth.
 *
 * `lib/audio.ts` synthesises everything from oscillators and shaped noise;
 * there is not one audio file in the repo and there must not be. A game names
 * a feeling, this decides what that is, and `ArcadeScreen` makes the call. Two
 * consequences worth stating:
 *
 *  - A game never touches `TubeAudio` and never reads the sound setting. Every
 *    method on the synth is inert until `enable()` has run inside a gesture,
 *    and `sound off` drops the master gain, so `sound on|off` is respected by
 *    construction. A second opinion about whether sound is on is how the two
 *    drift apart, which is why `ArcadeScreen` is grepped for the absence of
 *    `settings.audio`.
 *  - An unknown name makes no noise and is not a crash. `soundFor` returns
 *    null and the runtime does nothing, which is the right answer for a
 *    mistyped name in a game that is otherwise fine.
 */

export type ArcadeSound = "blip" | "wall" | "hit" | "score" | "die";

export type SoundCall =
  | { method: "hover" }
  | { method: "key" }
  | { method: "relay" }
  | { method: "thud" }
  | { method: "impact"; energy: number };

export const ARCADE_SOUNDS: Record<ArcadeSound, SoundCall> = {
  /** A cursor moving. Deliberately almost subliminal. */
  blip: { method: "hover" },
  /** A ball off a wall. Under a hit, so a rally has a shape. */
  wall: { method: "impact", energy: 0.18 },
  /** A ball off a paddle, a snake eating, a hit landing. */
  hit: { method: "impact", energy: 0.42 },
  /** A point. The relay clunk, because a score is a mechanism moving. */
  score: { method: "relay" },
  /** Game over. */
  die: { method: "thud" },
};

export function soundFor(name: string): SoundCall | null {
  return (ARCADE_SOUNDS as Record<string, SoundCall>)[name] ?? null;
}
