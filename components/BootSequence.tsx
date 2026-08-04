"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Typewriter from "./Typewriter";
import { useSystem } from "@/components/system/SystemProvider";

const HEAD_LINES = [
  "FergusOS BIOS v5.0   (c) 2026 Patrick Fergus O'Reilly",
  "CPU: Trinity CS/Business @ 1.1 GHz · 3rd year, 2 cores",
  "VIDEO: 15.625 kHz phosphor tube · aperture grille · 8 MB",
];

const DEVICE_LINES = [
  "detecting  /dev/ambition .............. OK",
  "mounting   /usr/presterly ............. OK",
  "loading    personality.dll ............ OK",
  "calibrating magnetic deflection ....... OK",
  "arming     gravity well ............... OK",
  "checking   caffeine reserves .......... LOW",
];

const SESSION_KEY = "fergusos_booted";
const MEMORY_K = 65536;

/** How long the tube sits dark, striking its line, before any text appears. */
const STRIKE_MS = 420;

type Phase = "dark" | "head" | "memory" | "devices" | "bar";

/**
 * Renders its children immediately (good for SSR / no-JS / SEO) and, on the first
 * visit of a session, overlays a one-time cold start.
 *
 * v5 makes this a real power-on rather than a fade. The tube is genuinely off:
 * `frame.boot` is driven to zero, so the shader collapses the picture to a
 * single bright horizontal line, then opens it vertically over about a second
 * and a half while the vertical hold rolls a few times before locking. The BIOS
 * text types into that opening band, which is why the sequence starts dark and
 * silent for four hundred milliseconds: the machine has not finished striking
 * yet, and text appearing before it would give the game away.
 *
 * Skippable at any point, never shown twice in a session, and never shown under
 * `prefers-reduced-motion`.
 */
export default function BootSequence({ children }: { children: React.ReactNode }) {
  const [booting, setBooting] = useState(false);
  const [phase, setPhase] = useState<Phase>("dark");
  const [memory, setMemory] = useState(0);
  const [progress, setProgress] = useState(0);
  const { frame, degauss, burstRain, audio } = useSystem();
  const finishedRef = useRef(false);

  useEffect(() => {
    // The pre-paint script in <head> already decided whether to boot (session +
    // reduced-motion check) and flagged <html> as .booting. Derive from that so we
    // never flip false->true after first paint (which caused the content flash).
    if (!document.documentElement.classList.contains("booting")) return;

    setBooting(true);
    const f = frame.current;
    // Hold the phosphor layer dark until the machine is actually up...
    f.live = 0;
    f.targetLive = 0;
    // ...and the tube itself genuinely off, not merely dim.
    f.boot = 0;
    f.bootTarget = 0;

    const strike = window.setTimeout(() => {
      // Deflection comes up: the line strikes and the picture opens.
      frame.current.bootTarget = 1;
      audio.powerOn();
      setPhase("head");
    }, STRIKE_MS);

    return () => window.clearTimeout(strike);
  }, [frame, audio]);

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;

    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* ignore storage errors (private mode) */
    }
    document.documentElement.classList.remove("booting"); // reveal content

    // Whatever the sequence had reached, the tube is fully up from here.
    const f = frame.current;
    f.bootTarget = 1;
    if (f.boot < 0.6) f.boot = 0.6;

    // Degauss thump, then the CRT power-on so the revealed site "switches on"
    // rather than popping in, with the beam briefly at full for the flourish.
    degauss();
    burstRain(1400);
    f.targetLive = 1;

    const el = document.querySelector(".screen");
    const nav = document.querySelector(".nav");
    el?.classList.add("power-on");
    nav?.classList.add("power-on");
    window.setTimeout(() => {
      el?.classList.remove("power-on");
      nav?.classList.remove("power-on");
    }, 680);

    setBooting(false);
  }, [degauss, burstRain, frame]);

  // ── memory test ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!booting || phase !== "memory") return;
    const started = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - started) / 900);
      setMemory(Math.floor(p * MEMORY_K));
      if (p < 1) raf = requestAnimationFrame(step);
      else setPhase("devices");
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [booting, phase]);

  // ── loading bar, then hand over to the desktop ────────────────────────────
  useEffect(() => {
    if (!booting || phase !== "bar") return;
    let raf = 0;
    let handoff = 0;
    const started = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - started) / 780);
      setProgress(p);
      if (p < 1) raf = requestAnimationFrame(step);
      else handoff = window.setTimeout(finish, 420);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(handoff);
    };
  }, [booting, phase, finish]);

  const bars = Math.round(progress * 24);

  return (
    <>
      {booting && (
        <div
          className="boot"
          role="status"
          aria-label="System booting"
          onClick={finish}
          onKeyDown={finish}
        >
          {/* Squeezed into the tube's opening band by `--boot-open`. The skip
              button deliberately sits outside it: an escape hatch that is itself
              a millimetre tall for the first second is not an escape hatch. */}
          <div className="boot__inner">
            {phase !== "dark" && (
              <Typewriter lines={HEAD_LINES} speed={11} onDone={() => setPhase("memory")} />
            )}

            {(phase === "memory" || phase === "devices" || phase === "bar") && (
              <div className="boot__mem">
                Memory Test: {String(memory).padStart(6, "0")}K {phase === "memory" ? "" : "OK"}
              </div>
            )}

            {(phase === "devices" || phase === "bar") && (
              <Typewriter lines={DEVICE_LINES} speed={8} onDone={() => setPhase("bar")} />
            )}

            {phase === "bar" && (
              <div className="boot__bar">
                starting phosphor display [{"█".repeat(bars)}
                {"·".repeat(24 - bars)}] {Math.round(progress * 100)}%
              </div>
            )}
          </div>

          <button type="button" className="boot__skip" onClick={finish}>
            skip &gt;
          </button>
        </div>
      )}
      {children}
    </>
  );
}
