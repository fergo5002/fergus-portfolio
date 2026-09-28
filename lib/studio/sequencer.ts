import { audible, euclidean, type StudioPatch, type Voice } from "./music";

/**
 * Resonance's grid and its clock, as pure functions.
 *
 * The grid is four voices as four rows of sixteen lamps. The clock walks the
 * columns on the AudioContext's own time, never the frame's: a frame only
 * decides how far ahead to look, so a starved tab (headless Chromium draws a
 * frame every 250 to 450ms) schedules further ahead rather than dropping
 * notes. The playhead is the column sounding now, read back off what was
 * scheduled, so the light and the sound cannot drift apart.
 */

export const STEPS = 16;

/** Shortest look-ahead, at a healthy 60 frames a second. */
const MIN_AHEAD = 0.1;
/** Longest look-ahead: past this a knob turn takes too long to be heard. */
const MAX_AHEAD = 0.5;
/** A clock this far behind the audio clock is re-anchored, not caught up. */
const LATE = 0.2;
/** Where a re-anchored clock starts, just ahead of now. */
const RESTART = 0.02;
/** Steps one call may schedule: half a second at 180 BPM with full swing. */
const MAX_BURST = 16;

export type Clock = { next: number; step: number };
export type Scheduled = {
  /** Steps since play was pressed. */
  step: number;
  /** The column on the grid, 0 to 15. */
  column: number;
  /** AudioContext time the step starts. */
  time: number;
  /** How long the step lasts, swing included. */
  length: number;
  /** The voices that fire on it. */
  voices: number[];
};

/** Seconds one step lasts. Even steps take the long half of the swing, odd steps the short half. */
export function stepLength(bpm: number, swing: number, step: number): number {
  return (60 / bpm / 4) * (step % 2 ? 1 - swing : 1 + swing);
}

/** The voices that fire on a column: lit there, and audible under mute and solo. */
export function hitsAt(voices: readonly Voice[], column: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < voices.length; i++) if (voices[i].steps[column] && audible(voices as Voice[], i)) out.push(i);
  return out;
}

export function setVoice(patch: StudioPatch, voice: number, update: Partial<Voice>): StudioPatch {
  return { ...patch, voices: patch.voices.map((v, i) => (i === voice ? { ...v, ...update } : v)) };
}

export function toggleStep(patch: StudioPatch, voice: number, column: number): StudioPatch {
  const steps = patch.voices[voice].steps.map((on, s) => (s === column ? !on : on));
  return setVoice(patch, voice, { steps });
}

export function clearSteps(patch: StudioPatch): StudioPatch {
  return { ...patch, voices: patch.voices.map((v) => ({ ...v, steps: Array<boolean>(STEPS).fill(false) })) };
}

/** A fresh Euclidean rhythm per voice, from the random source given (Math.random in the page). */
export function newPattern(patch: StudioPatch, random: () => number): StudioPatch {
  return {
    ...patch,
    voices: patch.voices.map((v) => {
      const pulses = 2 + Math.floor(random() * 6);
      const rotate = Math.floor(random() * STEPS);
      return { ...v, steps: euclidean(pulses, rotate) };
    }),
  };
}

/** How far ahead of the audio clock to schedule, from the gap between the last two frames. */
export function horizon(frameGap: number): number {
  if (!Number.isFinite(frameGap)) return MIN_AHEAD;
  return Math.min(MAX_AHEAD, Math.max(MIN_AHEAD, frameGap * 1.5));
}

/**
 * Walk the clock up to `until`, returning every step that starts before it.
 * The clock passed in is not changed; the one to keep is returned.
 */
export function advance(clock: Clock, patch: StudioPatch, now: number, until: number): { clock: Clock; due: Scheduled[] } {
  let next = clock.next < now - LATE ? now + RESTART : clock.next;
  let step = clock.step;
  const due: Scheduled[] = [];
  while (next < until && due.length < MAX_BURST) {
    const column = step % STEPS;
    const length = stepLength(patch.bpm, patch.swing, step);
    due.push({ step, column, time: next, length, voices: hitsAt(patch.voices, column) });
    next += length;
    step++;
  }
  return { clock: { next, step }, due };
}

/**
 * The column sounding at `now`: the latest scheduled step that has started,
 * and how far through it the audio clock is (0 to 1). Null before the first.
 */
export function playheadAt(
  queue: readonly Scheduled[],
  now: number,
): { step: number; column: number; phase: number } | null {
  let current: Scheduled | null = null;
  for (const entry of queue) if (entry.time <= now && (!current || entry.time >= current.time)) current = entry;
  if (!current) return null;
  const phase = Math.min(1, Math.max(0, (now - current.time) / current.length));
  return { step: current.step, column: current.column, phase };
}
