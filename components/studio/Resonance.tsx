"use client";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useSystem } from "@/components/system/SystemProvider";
import { ExportBar, FilePicker, Knob, Segmented, useIntake } from "@/components/instrument";
import { download, jsonDownload } from "@/components/lab/shared";
import { musicCopy as c } from "@/content/studio/music-copy";
import { createInstrument, renderWav } from "@/lib/studio/audio";
import { makePatch, noteName, parseStudioPatch, type StudioPatch, type Voice } from "@/lib/studio/music";
import {
  advance,
  clearSteps,
  horizon,
  newPattern,
  playheadAt,
  setVoice,
  toggleStep,
  type Clock,
  type Scheduled,
} from "@/lib/studio/sequencer";
import { autoGain, peak, stillTrace, trace, trigger } from "@/lib/studio/scope";
import { extendTrail, liveTrail, padPoint, padToSound, soundToPad, trailAlpha, type TrailPoint } from "@/lib/studio/pad";
import {
  SCALES,
  TONES,
  hz,
  keyName,
  keyNotes,
  noteIndex,
  panName,
  percent,
  retune,
  scaleAt,
  scaleIndex,
  toneAt,
  toneIndex,
} from "@/lib/studio/knobs";

/**
 * Resonance: one hardware face, like a small synth on the desk.
 *
 * Top to bottom in the document: the scope (with the one reading line), the
 * play key, the sound worlds, the grid (four voices as four rows of sixteen
 * pads, each row's voice, mute and solo at its left edge), the knob row, the
 * performance pad and the keep row. `tool.css` lays that out as one panel on
 * a desktop and as a stack on a phone, where the grid shows one voice's
 * sixteen steps as a four by four.
 *
 * The arithmetic is all in `lib/studio` and tested there: the clock, the
 * playhead and the grid model (`sequencer.ts`), the trace (`scope.ts`), the
 * pad (`pad.ts`) and the knobs (`knobs.ts`). This file is wiring, and
 * `Resonance.test.ts` reads it.
 *
 * Four rules hold it together, each with a check:
 *
 * **Silent until a deliberate press.** One `new AudioContext`, inside
 * `ready()`, which only the play key and a voice press call. A knob, the pad
 * or a grid pad sounds a voice only through an engine that already exists.
 * Stop, Escape, a hidden tab, `pagehide` and unmount all silence it and
 * close the context.
 *
 * **One frame clock, and only while playing.** The sequencer subscribes to
 * `SystemProvider`'s `onFrame` when play is pressed and drops it on stop, so
 * the face costs nothing at rest. Notes are timed on the AudioContext's own
 * clock; a frame only decides how far ahead to schedule.
 *
 * **Drawn only where it is seen.** The scope, the playhead and the lamps are
 * drawn only while an IntersectionObserver sees the face (the sound carries
 * on). Under reduced motion nothing sweeps: the playhead jumps a column at a
 * time and the scope shows a still of the patch's own waveform.
 *
 * **The machine's colours.** The canvases read their ink off their own
 * computed `color`, which `tool.css` sets from the theme tokens, so all three
 * phosphors follow and there is no colour here.
 */

const MAX_DPR = 2;
/** Room between the trace and the edge of the glass. */
const SCOPE_PAD = 10;
/** How much of the last frame each new frame wipes: the phosphor's persistence. */
const SCOPE_FADE = 0.42;
/** How long a point of the pad's trail keeps glowing, in milliseconds. */
const TRAIL_LIFE = 700;
/** At most one audition a knob turn this often, so a fast drag is not a roll. */
const SCRUB_MS = 85;
const PATCH_LIMIT = 50_000;
/** The gap between two pads in a beat, for the playhead's last column. */
const PAD_GAP = 4;

type Engine = {
  context: AudioContext;
  synth: ReturnType<typeof createInstrument>;
  samples: Float32Array<ArrayBuffer>;
  sequence: boolean;
  clock: Clock;
  queue: Scheduled[];
  lastFrame: number;
};
type Box = { width: number; height: number; dpr: number };

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

function stroke(context: CanvasRenderingContext2D, points: Float32Array, ink: string, width: number) {
  context.strokeStyle = ink;
  context.shadowColor = ink;
  context.shadowBlur = 7;
  context.lineWidth = width;
  context.lineJoin = "round";
  context.beginPath();
  context.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) context.lineTo(points[i], points[i + 1]);
  context.stroke();
  context.shadowBlur = 0;
}

export default function Resonance() {
  const uid = useId();
  const { onFrame, reducedMotion, settings } = useSystem();
  const [patch, setPatch] = useState(() => makePatch(0));
  const [playing, setPlaying] = useState(false);
  const [preset, setPreset] = useState(0);
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState("");
  const [rendering, setRendering] = useState(false);
  const [size, setSize] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const scopeRef = useRef<HTMLCanvasElement>(null);
  const trailRef = useRef<HTMLCanvasElement>(null);
  const playheadRef = useRef<HTMLSpanElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);
  const cells = useRef<(HTMLButtonElement | null)[][]>([[], [], [], []]);
  const heads = useRef<(HTMLButtonElement | null)[]>([]);
  const engine = useRef<Engine | null>(null);
  const pending = useRef<Promise<Engine> | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  const patchRef = useRef(patch);
  const selectedRef = useRef(selected);
  const seen = useRef(true);
  const lastScrub = useRef(0);
  const scopeBox = useRef<Box>({ width: 0, height: 0, dpr: 1 });
  const trailBox = useRef<Box>({ width: 0, height: 0, dpr: 1 });
  const columns = useRef<{ left: number; width: number }[]>([]);
  const trail = useRef<TrailPoint[]>([]);
  const offTrail = useRef<(() => void) | null>(null);
  patchRef.current = patch;
  selectedRef.current = selected;

  /** Everything the sequence lit goes dark, and the glass goes black. */
  const darken = useCallback(() => {
    const canvas = scopeRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
    }
    for (const row of cells.current) for (const cell of row) cell?.removeAttribute("data-current");
    for (const head of heads.current) head?.removeAttribute("data-hit");
    if (countRef.current) countRef.current.textContent = "";
    if (playheadRef.current) playheadRef.current.style.transform = "";
  }, []);

  const stop = useCallback(() => {
    generation.current++;
    pending.current = null;
    const current = engine.current;
    engine.current = null;
    if (current) {
      current.sequence = false;
      current.synth.silence();
      void current.context.close().catch(() => {});
    }
    setPlaying(false);
    darken();
  }, [darken]);

  useEffect(() => {
    mounted.current = true;
    const hide = () => {
      if (document.hidden) stop();
    };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", stop);
    return () => {
      mounted.current = false;
      generation.current++;
      pending.current = null;
      offTrail.current?.();
      offTrail.current = null;
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", stop);
      const current = engine.current;
      engine.current = null;
      if (current) {
        current.synth.silence();
        void current.context.close().catch(() => {});
      }
    };
  }, [stop]);

  useEffect(() => {
    engine.current?.synth.update(patch);
  }, [patch]);

  /* Sizes are read when the layout changes, never on a frame: the frame
     callback writes a transform and a few attributes and reads nothing. */
  const measure = useCallback(() => {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    let resized = false;
    for (const [canvas, box] of [
      [scopeRef.current, scopeBox.current],
      [trailRef.current, trailBox.current],
    ] as const) {
      if (!canvas) continue;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width === box.width && height === box.height && dpr === box.dpr) continue;
      Object.assign(box, { width, height, dpr });
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      resized = true;
    }
    const row = cells.current[selectedRef.current] ?? [];
    columns.current = row.map((cell) => ({ left: cell?.offsetLeft ?? 0, width: cell?.offsetWidth ?? 0 }));
    if (resized) setSize((n) => n + 1);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const resize = new ResizeObserver(() => measure());
    resize.observe(root);
    const visibility = new IntersectionObserver((entries) => {
      seen.current = entries.some((entry) => entry.isIntersecting);
    });
    visibility.observe(root);
    return () => {
      resize.disconnect();
      visibility.disconnect();
    };
  }, [measure]);

  useEffect(() => measure(), [selected, measure]);

  async function ready() {
    if (engine.current) return engine.current;
    if (pending.current) return pending.current;
    const token = generation.current;
    const promise = (async () => {
      const context = new AudioContext();
      try {
        await context.resume();
        if (!mounted.current || token !== generation.current) {
          await context.close();
          throw new Error("Audio start cancelled.");
        }
        if (context.state !== "running") throw new Error("Audio could not start. Press play again.");
        const synth = createInstrument(context, patchRef.current);
        const current: Engine = {
          context,
          synth,
          samples: new Float32Array(synth.scope.fftSize),
          sequence: false,
          clock: { next: context.currentTime, step: 0 },
          queue: [],
          lastFrame: 0,
        };
        engine.current = current;
        return current;
      } catch (e) {
        if (context.state !== "closed") await context.close();
        throw e;
      } finally {
        if (token === generation.current) pending.current = null;
      }
    })();
    pending.current = promise;
    return promise;
  }

  /** A voice's lamp lights for a moment, the way a hit lights it while the sequence runs. */
  function flash(voice: number) {
    const head = heads.current[voice];
    if (!head) return;
    head.setAttribute("data-hit", "");
    window.setTimeout(() => head.removeAttribute("data-hit"), 160);
  }

  async function pluck(i: number) {
    try {
      setError("");
      const e = await ready();
      e.synth.pluck(patchRef.current.voices[i]);
      flash(i);
    } catch (error) {
      if (mounted.current) setError(message(error));
    }
  }

  async function togglePlay() {
    if (playing) {
      stop();
      return;
    }
    try {
      setError("");
      const e = await ready();
      e.sequence = true;
      e.clock = { next: e.context.currentTime + 0.05, step: 0 };
      e.queue = [];
      e.lastFrame = 0;
      setPlaying(true);
    } catch (error) {
      if (mounted.current) setError(message(error));
    }
  }

  /** A voice heard through the engine that is already running, never a new one. */
  function audition(voice: Voice, index: number) {
    const live = engine.current;
    if (live) {
      if (performance.now() - lastScrub.current < SCRUB_MS) return;
      lastScrub.current = performance.now();
      live.synth.pluck(voice);
      flash(index);
    }
  }

  function drawTrace(e: Engine, ink: string) {
    const canvas = scopeRef.current;
    const context = canvas?.getContext("2d");
    const box = scopeBox.current;
    if (!canvas || !context || !ink || !box.width) return;
    e.synth.scope.getFloatTimeDomainData(e.samples);
    const from = trigger(e.samples);
    const points = trace(e.samples, { width: box.width, height: box.height, pad: SCOPE_PAD }, {
      from,
      count: e.samples.length / 2,
      gain: autoGain(peak(e.samples)),
    });
    context.setTransform(box.dpr, 0, 0, box.dpr, 0, 0);
    // The phosphor: the last frames fade instead of vanishing.
    context.globalCompositeOperation = "destination-out";
    context.globalAlpha = SCOPE_FADE;
    context.fillRect(0, 0, box.width, box.height);
    context.globalCompositeOperation = "source-over";
    context.globalAlpha = 1;
    stroke(context, points, ink, 1.6);
  }

  /* The sequence. Subscribed while it plays and dropped on stop. */
  useEffect(() => {
    if (!playing) return;
    const canvas = scopeRef.current;
    const ink = canvas ? getComputedStyle(canvas).color : "";
    let lastColumn = -1;
    const light = (column: number, voices: readonly number[]) => {
      for (const row of cells.current) {
        if (lastColumn >= 0) row[lastColumn]?.removeAttribute("data-current");
        row[column]?.setAttribute("data-current", "");
      }
      heads.current.forEach((head, i) => {
        if (voices.includes(i)) head?.setAttribute("data-hit", "");
        else head?.removeAttribute("data-hit");
      });
      if (countRef.current) countRef.current.textContent = `${String(column + 1).padStart(2, "0")}/16`;
      lastColumn = column;
    };
    const place = (position: number) => {
      const line = playheadRef.current;
      const column = Math.min(15, Math.floor(position));
      const here = columns.current[column];
      if (!line || !here) return;
      const there = columns.current[column + 1]?.left ?? here.left + here.width + PAD_GAP;
      line.style.transform = `translate3d(${here.left + (position - column) * (there - here.left)}px, 0, 0)`;
    };
    const off = onFrame((time) => {
      const e = engine.current;
      if (!e?.sequence) return;
      const now = e.context.currentTime;
      const gap = e.lastFrame ? (time - e.lastFrame) / 1000 : 0;
      e.lastFrame = time;
      const p = patchRef.current;
      const { clock, due } = advance(e.clock, p, now, now + horizon(gap));
      e.clock = clock;
      for (const step of due) {
        for (const voice of step.voices) e.synth.pluck(p.voices[voice], step.time);
        e.queue.push(step);
      }
      const head = playheadAt(e.queue, now);
      if (!head) return;
      while (e.queue.length > 1 && e.queue[1].time <= now) e.queue.shift();
      if (!seen.current) return;
      if (head.column !== lastColumn) light(head.column, e.queue[0].voices);
      const position = reducedMotion ? head.column : head.column + head.phase;
      place(position);
      if (!reducedMotion) drawTrace(e, ink);
    });
    return () => {
      off();
    };
    // drawTrace reads refs only; the theme is here so a new phosphor re-reads the ink.
  }, [playing, onFrame, reducedMotion, settings.theme]);

  /* Under reduced motion the glass shows a still of the patch while it plays. */
  useEffect(() => {
    if (!playing || !reducedMotion) return;
    const canvas = scopeRef.current;
    const context = canvas?.getContext("2d");
    const box = scopeBox.current;
    if (!canvas || !context || !box.width) return;
    const samples = stillTrace(patch.voices, Math.max(1, Math.round(box.width)));
    context.setTransform(box.dpr, 0, 0, box.dpr, 0, 0);
    context.clearRect(0, 0, box.width, box.height);
    stroke(context, trace(samples, { width: box.width, height: box.height, pad: SCOPE_PAD }), getComputedStyle(canvas).color, 1.6);
  }, [playing, reducedMotion, patch.voices, settings.theme, size]);

  /* The pad's trail fades off the frame clock while it has points, then lets go. */
  function wakeTrail() {
    if (offTrail.current) return;
    const canvas = trailRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const ink = getComputedStyle(canvas).color;
    offTrail.current = onFrame(() => {
      const box = trailBox.current;
      const now = performance.now();
      const live = liveTrail(trail.current, now, TRAIL_LIFE);
      trail.current = live;
      context.setTransform(box.dpr, 0, 0, box.dpr, 0, 0);
      context.clearRect(0, 0, box.width, box.height);
      if (!live.length) {
        offTrail.current?.();
        offTrail.current = null;
        return;
      }
      context.strokeStyle = ink;
      context.shadowColor = ink;
      context.shadowBlur = 8;
      context.lineCap = "round";
      for (let i = 1; i < live.length; i++) {
        const a = live[i - 1];
        const b = live[i];
        context.globalAlpha = trailAlpha(now - b.t, TRAIL_LIFE);
        context.lineWidth = 1 + 3 * context.globalAlpha;
        context.beginPath();
        context.moveTo(a.x * box.width, a.y * box.height);
        context.lineTo(b.x * box.width, b.y * box.height);
        context.stroke();
      }
      context.globalAlpha = 1;
      context.shadowBlur = 0;
    });
  }

  function perform(event: PointerEvent<HTMLDivElement>) {
    const point = padPoint(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
    const sound = padToSound(point.x, point.y);
    setPatch((p) => ({ ...p, ...sound }));
    if (reducedMotion) return;
    trail.current = extendTrail(trail.current, { ...point, t: performance.now() });
    wakeTrail();
  }

  function changeNote(voice: number, note: number) {
    const next = { ...patchRef.current.voices[voice], note };
    setPatch((p) => setVoice(p, voice, { note }));
    audition(next, voice);
  }

  const intake = useIntake({
    accept: ".json",
    onFiles: async ([file]) => {
      try {
        if (file.size > PATCH_LIMIT) throw new Error(c.tooLarge);
        setPatch(parseStudioPatch(await file.text()));
        setError("");
      } catch (e) {
        setError(message(e));
      }
    },
  });

  async function render() {
    setRendering(true);
    setError("");
    try {
      const blob = await renderWav(patchRef.current);
      if (mounted.current) download("resonance-eight-bars.wav", blob);
    } catch (e) {
      if (mounted.current) setError(message(e));
    } finally {
      if (mounted.current) setRendering(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (
      e.repeat ||
      e.ctrlKey ||
      e.metaKey ||
      e.altKey ||
      (e.target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(e.target.tagName))
    )
      return;
    const i = c.keys.findIndex((key) => key.toLowerCase() === e.key.toLowerCase());
    if (i >= 0) {
      e.preventDefault();
      void pluck(i);
    } else if (e.key === "Escape") stop();
  }

  const notes = useMemo(() => keyNotes(patch.root, patch.scale), [patch.root, patch.scale]);
  const voice = patch.voices[selected];
  const puck = soundToPad(patch.cutoff, patch.delay);
  const failure = error || intake.refusal;

  return (
    <div
      className="lab-work studio studio-music reso"
      ref={rootRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      {...intake.stageProps}
    >
      <div className="reso__face" data-playing={playing || undefined}>
        <div className="reso__screen">
          <canvas ref={scopeRef} className="reso__scope" role="img" aria-label={c.scope} />
          <output className="reso__readout">
            <span>
              {keyName(patch.root)} {c.scales[patch.scale].toLowerCase()}
            </span>
            <span>
              {patch.bpm} {c.bpmUnit}
            </span>
            <span ref={countRef} className="reso__count" />
          </output>
        </div>
        <button
          type="button"
          className="reso-play"
          aria-label={playing ? c.stop : c.play}
          data-playing={playing || undefined}
          onClick={() => void togglePlay()}
        >
          <svg className="reso-play__glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d={playing ? "M6.5 6.5h11v11h-11z" : "M8 5v14l11-7z"} />
          </svg>
          <span className="reso-play__word">{playing ? c.stopWord : c.playWord}</span>
        </button>
        <Segmented
          className="reso__worlds"
          label={c.preset}
          hideLabel
          size="sm"
          value={String(preset)}
          onChange={(value) => {
            const n = Number(value);
            setPreset(n);
            setPatch(makePatch(n));
          }}
          options={c.presets.map((name, i) => ({ value: String(i), label: name }))}
        />
        <div className="reso__matrix">
          {patch.voices.map((v, i) => (
            <div className="reso__row" key={i} data-row={i} data-selected={i === selected || undefined}>
              <div className="reso__head">
                <button
                  type="button"
                  className="reso-voice"
                  ref={(el) => {
                    heads.current[i] = el;
                  }}
                  aria-label={c.voice(i + 1)}
                  data-key={c.keys[i]}
                  data-mute={v.mute || undefined}
                  data-solo={v.solo || undefined}
                  onClick={() => {
                    setSelected(i);
                    void pluck(i);
                  }}
                >
                  <span className="reso-voice__led" aria-hidden="true" />
                  <span className="reso-voice__note">{noteName(v.note)}</span>
                </button>
                <button
                  type="button"
                  className="reso-ms"
                  data-kind="mute"
                  aria-pressed={v.mute}
                  aria-label={c.mute(i + 1)}
                  onClick={() => setPatch((p) => setVoice(p, i, { mute: !p.voices[i].mute }))}
                >
                  {c.muteMark}
                </button>
                <button
                  type="button"
                  className="reso-ms"
                  data-kind="solo"
                  aria-pressed={v.solo}
                  aria-label={c.solo(i + 1)}
                  onClick={() => setPatch((p) => setVoice(p, i, { solo: !p.voices[i].solo }))}
                >
                  {c.soloMark}
                </button>
              </div>
              <div className="reso__steps">
                {v.steps.map((on, s) => (
                  <button
                    key={s}
                    type="button"
                    className="reso-cell"
                    ref={(el) => {
                      cells.current[i][s] = el;
                    }}
                    aria-label={c.cell(i + 1, s + 1)}
                    aria-pressed={on}
                    onClick={() => setPatch((p) => toggleStep(p, i, s))}
                  />
                ))}
              </div>
            </div>
          ))}
          <span className="reso__playhead" ref={playheadRef} aria-hidden="true" />
        </div>
        <div className="reso__dials">
          <Knob
            label={c.bpm}
            min={40}
            max={180}
            value={patch.bpm}
            resetValue={makePatch(preset).bpm}
            format={(v) => `${v} ${c.bpmUnit}`}
            onChange={(bpm) => setPatch((p) => ({ ...p, bpm }))}
          />
          <Knob
            label={c.root}
            min={0}
            max={11}
            value={patch.root}
            format={keyName}
            onChange={(root) => setPatch((p) => retune(p, root, p.scale))}
          />
          <Knob
            label={c.scale}
            min={0}
            max={SCALES.length - 1}
            value={scaleIndex(patch.scale)}
            format={(i) => c.scales[scaleAt(i)]}
            onChange={(i) => setPatch((p) => retune(p, p.root, scaleAt(i)))}
          />
          <Knob
            label={c.swing}
            min={0}
            max={0.45}
            step={0.01}
            value={patch.swing}
            resetValue={0}
            format={(v) => percent(v, 1)}
            onChange={(swing) => setPatch((p) => ({ ...p, swing }))}
          />
          <Knob
            label={c.volume}
            min={0}
            max={0.6}
            step={0.01}
            value={patch.volume}
            format={(v) => percent(v, 0.6)}
            onChange={(volume) => setPatch((p) => ({ ...p, volume }))}
          />
          <Knob
            label={c.cutoff}
            min={150}
            max={12000}
            scale="log"
            value={patch.cutoff}
            format={hz}
            onChange={(cutoff) => setPatch((p) => ({ ...p, cutoff }))}
          />
          <Knob
            label={c.delay}
            min={0}
            max={0.65}
            step={0.01}
            value={patch.delay}
            format={(v) => percent(v, 1)}
            onChange={(delay) => setPatch((p) => ({ ...p, delay }))}
          />
          <div
            className="reso__voice-dials"
            role="group"
            aria-label={c.voiceGroup(selected + 1)}
            data-row={selected}
            data-voice={selected + 1}
          >
            <Knob
              label={c.note}
              min={0}
              max={notes.length - 1}
              value={noteIndex(voice.note, notes)}
              format={(i) => noteName(notes[i] ?? voice.note)}
              onChange={(i) => changeNote(selected, notes[i])}
            />
            <Knob
              label={c.decay}
              min={0.1}
              max={2}
              step={0.05}
              value={voice.decay}
              format={(d) => `${d.toFixed(2)} s`}
              onChange={(decay) => setPatch((p) => setVoice(p, selected, { decay }))}
            />
            <Knob
              label={c.pan}
              min={-1}
              max={1}
              step={0.1}
              value={voice.pan}
              resetValue={0}
              format={panName}
              onChange={(pan) => setPatch((p) => setVoice(p, selected, { pan }))}
            />
            <Knob
              label={c.wave}
              min={0}
              max={TONES.length - 1}
              value={toneIndex(voice.wave)}
              format={(i) => c.tones[toneAt(i)]}
              onChange={(i) => setPatch((p) => setVoice(p, selected, { wave: toneAt(i) }))}
            />
          </div>
        </div>
        <div
          className="reso__pad"
          aria-hidden="true"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            perform(e);
          }}
          onPointerMove={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) perform(e);
          }}
        >
          <canvas ref={trailRef} className="reso__trail" />
          <span className="reso__puck" style={{ left: `${puck.x * 100}%`, top: `${puck.y * 100}%` }} />
          <span className="reso__axis reso__axis--x">{c.cutoff}</span>
          <span className="reso__axis reso__axis--y">{c.delay}</span>
        </div>
        <div className="reso__deck">
          <div className="reso__pattern">
            <button type="button" className="reso-key" onClick={() => setPatch((p) => newPattern(p, Math.random))}>
              {c.random}
            </button>
            <button type="button" className="reso-key" onClick={() => setPatch((p) => clearSteps(p))}>
              {c.clear}
            </button>
          </div>
          <ExportBar
            className="reso__exports"
            label={c.exports}
            note={c.wavNote}
            actions={[
              { label: c.save, kind: "json", onClick: () => jsonDownload("resonance-patch.json", patch) },
              {
                label: rendering ? c.rendering : c.render,
                kind: "wav",
                primary: true,
                disabled: rendering,
                onClick: () => void render(),
              },
            ]}
          />
          <FilePicker intake={intake} id={`${uid}-patch`} label={c.load} variant="quiet" />
        </div>
        {failure ? (
          <p className="reso__error" role="alert">
            {failure}
          </p>
        ) : null}
      </div>
    </div>
  );
}
