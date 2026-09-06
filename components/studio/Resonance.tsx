"use client";
import { studioLabels } from "@/content/studio/labels";
const ui = studioLabels.Resonance;
import { useCallback, useEffect, useRef, useState } from "react";
import { useSystem } from "@/components/system/SystemProvider";
import { studioCopy } from "@/content/studio/copy";
import {
  makePatch,
  parseStudioPatch,
  noteName,
  quantise,
  euclidean,
  audible,
  type StudioPatch,
  type Voice,
  type Scale,
} from "@/lib/studio/music";
import { createInstrument, renderWav } from "@/lib/studio/audio";
import {
  Button,
  Field,
  FileInput,
  ErrorMessage,
  jsonDownload,
  download,
} from "@/components/lab/shared";
import { StudioIntro, Range, Toggle } from "./Furniture";
const c = studioCopy.music;
type Engine = {
  context: AudioContext;
  synth: ReturnType<typeof createInstrument>;
  next: number;
  step: number;
  sequence: boolean;
  start: number;
};
export default function Resonance() {
  const [patch, setPatch] = useState(() => makePatch(0)),
    [playing, setPlaying] = useState(false),
    [preset, setPreset] = useState(0),
    [error, setError] = useState(""),
    [rendering, setRendering] = useState(false),
    canvas = useRef<HTMLCanvasElement>(null),
    pad = useRef<HTMLDivElement>(null),
    root = useRef<HTMLDivElement>(null),
    engine = useRef<Engine | null>(null),
    pending = useRef<Promise<Engine> | null>(null),
    generation = useRef(0),
    patchRef = useRef(patch),
    lights = useRef([0, 0, 0, 0]),
    stepCells = useRef<(HTMLButtonElement | null)[][]>([[], [], [], []]),
    lastStep = useRef(-1),
    drag = useRef<{ voice: number; y: number; note: number } | null>(null),
    mounted = useRef(true),
    dirty = useRef(true),
    lastDraw = useRef(0),
    lastScrub = useRef(0),
    { onFrame, reducedMotion } = useSystem();
  patchRef.current = patch;
  const stop = useCallback(() => {
    generation.current++;
    pending.current = null;
    const current = engine.current;
    engine.current = null;
    if (current) {
      current.synth.silence();
      void current.context.close().catch(() => {});
    }
    setPlaying(false);
    dirty.current = true;
    for (const row of stepCells.current)
      for (const cell of row) cell?.removeAttribute("data-current");
    lastStep.current = -1;
  }, []);
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
    dirty.current = true;
  }, [patch]);
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
        if (context.state !== "running")
          throw new Error("Audio could not start. Press a pad again.");
        const current = {
          context,
          synth: createInstrument(context, patchRef.current),
          next: context.currentTime + 0.03,
          step: 0,
          sequence: false,
          start: context.currentTime,
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
  async function pluck(i: number) {
    try {
      setError("");
      const e = await ready();
      e.synth.pluck(patchRef.current.voices[i]);
      lights.current[i] = performance.now();
      dirty.current = true;
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : String(e));
    }
  }
  function change<K extends keyof StudioPatch>(key: K, value: StudioPatch[K]) {
    setPatch((p) => ({ ...p, [key]: value }));
  }
  function voice(i: number, update: Partial<Voice>) {
    setPatch((p) => ({
      ...p,
      voices: p.voices.map((v, j) => (j === i ? { ...v, ...update } : v)),
    }));
  }
  useEffect(
    () =>
      onFrame((time) => {
        const active = engine.current,
          p = patchRef.current;
        if (active?.sequence) {
          const now = active.context.currentTime,
            duration = 60 / p.bpm / 4;
          if (active.next < now - 0.2) active.next = now + 0.02;
          let iterations = 0;
          while (active.next < now + 0.09 && iterations++ < 4) {
            const step = active.step % 16;
            for (let i = 0; i < 4; i++)
              if (audible(p.voices, i) && p.voices[i].steps[step]) {
                active.synth.pluck(p.voices[i], active.next);
                lights.current[i] =
                  performance.now() + (active.next - now) * 1000;
              }
            if (lastStep.current >= 0)
              stepCells.current.forEach((row) =>
                row[lastStep.current]?.removeAttribute("data-current"),
              );
            stepCells.current.forEach((row) =>
              row[step]?.setAttribute("data-current", "true"),
            );
            lastStep.current = step;
            active.next += duration * (step % 2 ? 1 - p.swing : 1 + p.swing);
            active.step++;
            dirty.current = true;
          }
        }
        if (
          !dirty.current &&
          !active?.sequence &&
          !lights.current.some((t) => performance.now() - t < 800)
        )
          return;
        if (time - lastDraw.current < 32) return;
        lastDraw.current = time;
        dirty.current = false;
        const el = canvas.current,
          ctx = el?.getContext("2d");
        if (!el || !ctx) return;
        const style = getComputedStyle(el),
          green = style.getPropertyValue("--green-bright").trim() || "#33ff66",
          amber = style.getPropertyValue("--amber").trim() || "#ffb000";
        ctx.clearRect(0, 0, 960, 340);
        ctx.strokeStyle = green;
        ctx.globalAlpha = 0.13;
        for (let x = 30; x < 960; x += 30) {
          ctx.beginPath();
          ctx.moveTo(x, 20);
          ctx.lineTo(x, 315);
          ctx.stroke();
        }
        for (let y = 30; y < 330; y += 30) {
          ctx.beginPath();
          ctx.moveTo(20, y);
          ctx.lineTo(940, y);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        p.voices.forEach((v, i) => {
          const centre = 120 + i * 240,
            age = (performance.now() - lights.current[i]) / 1000,
            hit = !reducedMotion && age >= 0 ? Math.max(0, 1 - age * 1.6) : 0,
            elapsed = active ? active.context.currentTime - active.start : 0,
            angle =
              active?.sequence && !reducedMotion
                ? Math.sin((elapsed * (p.bpm / 60) * Math.PI) / (1 + i * 0.3)) *
                  0.38
                : 0,
            length = 130 + (84 - v.note) * 1.7,
            x = centre + Math.sin(angle) * length,
            y = 38 + Math.cos(angle) * length;
          ctx.strokeStyle = i % 2 ? amber : green;
          ctx.fillStyle = ctx.strokeStyle;
          ctx.globalAlpha = audible(p.voices, i) ? 1 : 0.25;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(centre, 38);
          ctx.lineTo(x, y);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(centre, 38, 4, 0, Math.PI * 2);
          ctx.fill();
          if (hit) {
            ctx.globalAlpha = hit * 0.15;
            ctx.beginPath();
            ctx.arc(x, y, 25 + (1 - hit) * 55, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = audible(p.voices, i) ? 1 : 0.25;
          }
          ctx.beginPath();
          ctx.arc(x, y, 18 + hit * 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.textAlign = "center";
          ctx.font = "17px monospace";
          ctx.fillText(noteName(v.note), centre, 308);
          ctx.font = "11px monospace";
          ctx.globalAlpha = 0.5;
          ctx.fillText(c.keys[i], centre, 327);
          ctx.globalAlpha = 1;
        });
      }),
    [onFrame, reducedMotion],
  );
  function perform(clientX: number, clientY: number) {
    const r = pad.current!.getBoundingClientRect(),
      x = Math.max(0, Math.min(1, (clientX - r.left) / r.width)),
      y = Math.max(0, Math.min(1, (clientY - r.top) / r.height));
    setPatch((p) => ({
      ...p,
      cutoff: Math.round(150 * 80 ** x),
      delay: Number(((1 - y) * 0.65).toFixed(3)),
    }));
  }
  return (
    <div
      className="lab-work studio studio-music"
      ref={root}
      tabIndex={0}
      onKeyDown={(e) => {
        if (
          e.repeat ||
          e.ctrlKey ||
          e.metaKey ||
          e.altKey ||
          (e.target instanceof HTMLElement &&
            ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(
              e.target.tagName,
            ))
        )
          return;
        const i = "asdf".indexOf(e.key.toLowerCase());
        if (i >= 0) {
          e.preventDefault();
          void pluck(i);
        } else if (e.key === "Escape") stop();
      }}
    >
      <StudioIntro eyebrow={c.eyebrow} title={c.title} intro={c.intro} />
      <div className="music-transport">
        <span
          className={`studio-badge ${playing ? "is-live" : ""}`}
          role="status"
        >
          {playing ? c.playing : c.ready}
        </span>
        <Button
          primary
          onClick={async () => {
            if (playing) stop();
            else
              try {
                setError("");
                const e = await ready();
                e.sequence = true;
                e.next = e.context.currentTime + 0.03;
                e.step = 0;
                setPlaying(true);
              } catch (error) {
                setError(
                  error instanceof Error ? error.message : String(error),
                );
              }
          }}
        >
          {playing ? c.stop : c.play}
        </Button>
        {!playing && <Button onClick={stop}>{c.stop}</Button>}
        <Field label={c.preset}>
          <select
            value={preset}
            onChange={(e) => {
              const n = Number(e.target.value);
              setPreset(n);
              setPatch(makePatch(n));
            }}
          >
            {c.presets.map((name, i) => (
              <option key={name} value={i}>
                {name}
              </option>
            ))}
          </select>
        </Field>
        <Range
          label={c.bpm}
          min={40}
          max={180}
          value={patch.bpm}
          display={`${patch.bpm} BPM`}
          onChange={(v) => change("bpm", v)}
        />
      </div>
      <ErrorMessage error={error} />
      <div className="music-machine">
        <canvas
          ref={canvas}
          width={960}
          height={340}
          aria-label={c.stageHelp}
          onPointerDown={(e) => {
            root.current?.focus({ preventScroll: true });
            const r = e.currentTarget.getBoundingClientRect(),
              i = Math.min(
                3,
                Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * 4)),
              );
            drag.current = {
              voice: i,
              y: e.clientY,
              note: patchRef.current.voices[i].note,
            };
            e.currentTarget.setPointerCapture(e.pointerId);
            void pluck(i);
          }}
          onPointerMove={(e) => {
            if (drag.current) {
              const d = drag.current;
              const note = quantise(
                  Math.max(36, Math.min(96, d.note + (d.y - e.clientY) / 6)),
                  patchRef.current.root,
                  patchRef.current.scale,
                );
              if(note !== patchRef.current.voices[d.voice].note){
                voice(d.voice, {note});
                if(engine.current && performance.now()-lastScrub.current>85){engine.current.synth.pluck({...patchRef.current.voices[d.voice],note});lastScrub.current=performance.now();lights.current[d.voice]=performance.now();}
              }
            }
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
        />
        <p>{c.stageHelp}</p>
      </div>
      <div className="music-pads">
        {patch.voices.map((v, i) => (
          <button
            key={i}
            className="music-pad"
            onClick={() => pluck(i)}
            aria-label={`Play voice ${i + 1}`}
          >
            <span>{c.keys[i]}</span>
            <strong>{noteName(v.note)}</strong>
            <small>
              {ui.voice}
              {i + 1}
            </small>
          </button>
        ))}
      </div>
      <div className="studio-toolbar">
        <Field label={c.root}>
          <select
            value={patch.root}
            onChange={(e) => {
              const next = Number(e.target.value);
              setPatch((p) => ({
                ...p,
                root: next,
                voices: p.voices.map((v) => ({
                  ...v,
                  note: quantise(v.note, next, p.scale),
                })),
              }));
            }}
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i} value={i}>
                {noteName(60 + i).slice(0, -1)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={c.scale}>
          <select
            value={patch.scale}
            onChange={(e) => {
              const scale = e.target.value as Scale;
              setPatch((p) => ({
                ...p,
                scale,
                voices: p.voices.map((v) => ({
                  ...v,
                  note: quantise(v.note, p.root, scale),
                })),
              }));
            }}
          >
            <option value="minor">{ui.minor}</option>
            <option value="major">{ui.major}</option>
            <option value="pentatonic">{ui.pentatonic}</option>
          </select>
        </Field>
        <Range
          label={c.volume}
          value={patch.volume}
          min={0}
          max={0.6}
          step={0.01}
          display={`${Math.round((patch.volume / 0.6) * 100)}%`}
          onChange={(v) => change("volume", v)}
        />
        <Range
          label={c.swing}
          value={patch.swing}
          min={0}
          max={0.45}
          step={0.01}
          display={`${Math.round(patch.swing * 100)}%`}
          onChange={(v) => change("swing", v)}
        />
      </div>
      <div className="music-sequencer">
        <div className="music-step-head">
          <span>{ui.sequencer}</span>
          <div>
            {Array.from({ length: 16 }, (_, i) => (
              <span key={i}>{i % 4 === 0 ? i / 4 + 1 : "·"}</span>
            ))}
          </div>
        </div>
        {patch.voices.map((v, i) => (
          <section className="music-voice" key={i}>
            <div className="music-voice-main">
              <div className="music-voice-label">
                <strong>
                  {String(i + 1).padStart(2, "0")} · {noteName(v.note)}
                </strong>
                <div>
                  <Toggle
                    active={v.mute}
                    onClick={() => voice(i, { mute: !v.mute })}
                  >
                    {c.mute} {i + 1}
                  </Toggle>
                  <Toggle
                    active={v.solo}
                    onClick={() => voice(i, { solo: !v.solo })}
                  >
                    {c.solo} {i + 1}
                  </Toggle>
                </div>
              </div>
              <div className="music-steps">
                {v.steps.map((active, s) => (
                  <button
                    ref={(el) => {
                      stepCells.current[i][s] = el;
                    }}
                    key={s}
                    type="button"
                    aria-label={`Voice ${i + 1}, step ${s + 1}`}
                    aria-pressed={active}
                    onClick={() =>
                      voice(i, {
                        steps: v.steps.map((b, j) => (j === s ? !b : b)),
                      })
                    }
                  >
                    <span>{s + 1}</span>
                  </button>
                ))}
              </div>
            </div>
            <details>
              <summary>
                {ui.shapeVoice}
                {i + 1}
              </summary>
              <div className="studio-controls">
                <Range
                  label={`${c.note} ${i + 1}`}
                  value={v.note}
                  min={36}
                  max={96}
                  display={noteName(v.note)}
                  onChange={(n) =>
                    voice(i, { note: quantise(n, patch.root, patch.scale) })
                  }
                />
                <Range
                  label={`${c.decay} ${i + 1}`}
                  value={v.decay}
                  min={0.1}
                  max={2}
                  step={0.05}
                  display={`${v.decay.toFixed(2)}s`}
                  onChange={(decay) => voice(i, { decay })}
                />
                <Range
                  label={`${c.pan} ${i + 1}`}
                  value={v.pan}
                  min={-1}
                  max={1}
                  step={0.1}
                  onChange={(pan) => voice(i, { pan })}
                />
                <Field label={`${c.wave} ${i + 1}`}>
                  <select
                    value={v.wave}
                    onChange={(e) =>
                      voice(i, { wave: e.target.value as Voice["wave"] })
                    }
                  >
                    <option value="sine">{ui.glass}</option>
                    <option value="triangle">{ui.warm}</option>
                    <option value="sawtooth">{ui.reed}</option>
                  </select>
                </Field>
              </div>
            </details>
          </section>
        ))}
      </div>
      <div className="studio-toolbar">
        <Button
          onClick={() =>
            setPatch((p) => ({
              ...p,
              voices: p.voices.map((v) => ({
                ...v,
                steps: euclidean(
                  2 + Math.floor(Math.random() * 6),
                  Math.floor(Math.random() * 16),
                ),
              })),
            }))
          }
        >
          {c.random}
        </Button>
        <Button
          onClick={() =>
            setPatch((p) => ({
              ...p,
              voices: p.voices.map((v) => ({
                ...v,
                steps: Array(16).fill(false),
              })),
            }))
          }
        >
          {c.clear}
        </Button>
      </div>
      <div className="music-performance">
        <div
          ref={pad}
          className="music-xy"
          role="group"
          aria-label={c.pad}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            perform(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId))
              perform(e.clientX, e.clientY);
          }}
        >
          <span>{c.pad}</span>
          <i
            style={{
              left: `${(Math.log(patch.cutoff / 150) / Math.log(80)) * 100}%`,
              top: `${(1 - patch.delay / 0.65) * 100}%`,
            }}
          />
          <small>{ui.brightnessEcho}</small>
        </div>
        <div>
          <h3>{c.pad}</h3>
          <p>{c.padHelp}</p>
          <Range
            label={c.cutoff}
            value={patch.cutoff}
            min={150}
            max={12000}
            display={`${patch.cutoff} Hz`}
            onChange={(v) => change("cutoff", v)}
          />
          <Range
            label={c.delay}
            value={patch.delay}
            min={0}
            max={0.65}
            step={0.01}
            display={`${Math.round(patch.delay * 100)}%`}
            onChange={(v) => change("delay", v)}
          />
        </div>
      </div>
      <div className="studio-toolbar">
        <Button onClick={() => jsonDownload("resonance-patch.json", patch)}>
          {c.save}
        </Button>
        <FileInput
          label={c.load}
          accept=".json"
          onFile={async (f) => {
            try {
              if (f.size > 50_000) throw new Error("Patch limit: 50 KB.");
              setPatch(parseStudioPatch(await f.text()));
              setError("");
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            }
          }}
        />
        <Button
          primary
          disabled={rendering}
          onClick={async () => {
            setRendering(true);
            setError("");
            try {
              const blob = await renderWav(patchRef.current);
              if (mounted.current) download("resonance-eight-bars.wav", blob);
            } catch (e) {
              if (mounted.current)
                setError(e instanceof Error ? e.message : String(e));
            } finally {
              if (mounted.current) setRendering(false);
            }
          }}
        >
          {rendering ? c.rendering : c.render}
        </Button>
      </div>
      <p className="studio-note">{c.hint}</p>
    </div>
  );
}
