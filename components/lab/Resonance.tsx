"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSystem } from "@/components/system/SystemProvider";
import { copy } from "@/content/lab/copy";
import {
  parsePatch,
  pendulumPosition,
  crossings,
  type Patch,
} from "@/lib/lab/resonance";
import {
  Button,
  Field,
  FileInput,
  NumberField,
  ErrorMessage,
  useAction,
  readText,
  jsonDownload,
} from "./shared";
const c = copy.resonance;
export default function Resonance() {
  const [voices, setVoices] = useState<Patch["voices"]>(c.patches[0]),
    [preset, setPreset] = useState(0),
    [volume, setVolume] = useState(0.18),
    [playing, setPlaying] = useState(false),
    canvas = useRef<HTMLCanvasElement>(null),
    engine = useRef<{
      context: AudioContext;
      gain: GainNode;
      elapsed: number;
    } | null>(null),
    voiceRef = useRef(voices),
    { onFrame, reducedMotion } = useSystem(),
    { act, error } = useAction();
  voiceRef.current = voices;
  const stop = useCallback(() => {
    const current = engine.current;
    engine.current = null;
    if (current) {
      current.gain.gain.setValueAtTime(0, current.context.currentTime);
      void current.context.close().catch(() => {});
    }
    setPlaying(false);
  }, []);
  useEffect(() => {
    function hide() {
      if (document.hidden) stop();
    }
    function blur() {
      stop();
    }
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", blur);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", blur);
      const current = engine.current;
      engine.current = null;
      if (current) void current.context.close().catch(() => {});
    };
  }, [stop]);
  useEffect(() => {
    if (engine.current)
      engine.current.gain.gain.setTargetAtTime(
        volume,
        engine.current.context.currentTime,
        0.05,
      );
  }, [volume]);
  useEffect(
    () =>
      onFrame((_time, dt) => {
        const surface = canvas.current,
          ctx = surface?.getContext("2d");
        if (!surface || !ctx) return;
        const active = engine.current,
          from = active?.elapsed ?? 0,
          to = from + Math.min(dt / 1000, 0.1);
        if (active) active.elapsed = to;
        ctx.clearRect(0, 0, 900, 450);
        ctx.strokeStyle = "#284d33";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(40, 385);
        ctx.lineTo(860, 385);
        ctx.stroke();
        voiceRef.current.forEach((v, i) => {
          const centre = (900 / (voiceRef.current.length + 1)) * (i + 1),
            angle =
              active && !reducedMotion
                ? pendulumPosition(to, v.period) * 0.55
                : 0,
            length = 180 + i * 25,
            x = centre + Math.sin(angle) * length,
            y = 65 + Math.cos(angle) * length;
          ctx.strokeStyle = i % 2 ? "#ffb000" : "#33ff66";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(centre, 65);
          ctx.lineTo(x, y);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(x, y, 12, 0, Math.PI * 2);
          ctx.fillStyle = i % 2 ? "#ffb000" : "#33ff66";
          ctx.fill();
          ctx.font = "16px monospace";
          ctx.textAlign = "center";
          ctx.fillStyle = "#b5d0bd";
          ctx.fillText(`${v.note} · ${v.period}s`, centre, 420);
          if (active && crossings(from, to, v.period)) {
            const ac = active.context,
              osc = ac.createOscillator(),
              envelope = ac.createGain();
            osc.type = "sine";
            osc.frequency.value = 440 * Math.pow(2, (v.note - 69) / 12);
            envelope.gain.setValueAtTime(0, ac.currentTime);
            envelope.gain.linearRampToValueAtTime(0.35, ac.currentTime + 0.008);
            envelope.gain.exponentialRampToValueAtTime(
              0.0001,
              ac.currentTime + 0.9,
            );
            osc.connect(envelope);
            envelope.connect(active.gain);
            osc.start();
            osc.stop(ac.currentTime + 1);
            osc.onended = () => {
              osc.disconnect();
              envelope.disconnect();
            };
          }
        });
      }),
    [onFrame, reducedMotion],
  );
  async function play() {
    stop();
    parsePatch(JSON.stringify({ format: "resonance-v1", voices }));
    const context = new AudioContext(),
      gain = context.createGain();
    gain.gain.value = volume;
    gain.connect(context.destination);
    try {
      await context.resume();
      if (context.state !== "running")
        throw new Error(
          "The browser could not start audio. Try pressing Play again.",
        );
      engine.current = { context, gain, elapsed: 0 };
      setPlaying(true);
    } catch (e) {
      await context.close();
      throw e;
    }
  }
  function update(i: number, key: "note" | "period", value: number) {
    stop();
    setVoices(voices.map((v, j) => (i === j ? { ...v, [key]: value } : v)));
  }
  return (
    <div className="lab-work">
      <div className="lab-fields">
        <Field label={c.preset}>
          <select
            value={preset}
            onChange={(e) => {
              stop();
              const n = Number(e.target.value);
              setPreset(n);
              setVoices(c.patches[n]);
            }}
          >
            {c.presets.map((p, i) => (
              <option key={p} value={i}>
                {p}
              </option>
            ))}
          </select>
        </Field>
        <Field label={c.volume}>
          <input
            type="range"
            min={0}
            max={0.5}
            step={0.01}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
          />
        </Field>
      </div>
      <canvas
        className="lab-instrument"
        ref={canvas}
        width={900}
        height={450}
        role="img"
        aria-label={c.help}
      />
      <div className="lab-actions">
        <Button primary disabled={playing} onClick={() => act(play)}>
          {c.play}
        </Button>
        <Button disabled={!playing} onClick={stop}>
          {c.stop}
        </Button>
        <Button
          onClick={() =>
            act(() => {
              const patch = parsePatch(
                JSON.stringify({ format: "resonance-v1", voices }),
              );
              jsonDownload("resonance-patch.json", patch);
            })
          }
        >
          {c.save}
        </Button>
      </div>
      <p role="status">{playing ? c.playing : c.muted}</p>
      <ErrorMessage error={error} />
      <div className="lab-two">
        {voices.map((v, i) => (
          <section className="lab-panel" key={i}>
            <h3>
              {c.voice} {i + 1}
            </h3>
            <div className="lab-fields">
              <NumberField
                label={c.note}
                value={v.note}
                min={36}
                max={96}
                onChange={(n) => update(i, "note", n)}
              />
              <NumberField
                label={c.period}
                value={v.period}
                min={0.5}
                max={16}
                step={0.1}
                onChange={(n) => update(i, "period", n)}
              />
            </div>
          </section>
        ))}
      </div>
      <FileInput
        label={c.load}
        accept=".json"
        onFile={(file) =>
          act(async () => {
            const patch = parsePatch(await readText(file, 10000));
            stop();
            setVoices(patch.voices);
          })
        }
      />
      <p className="lab-note">{c.help}</p>
    </div>
  );
}
