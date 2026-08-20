"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Typewriter from "./Typewriter";
import { useSystem } from "@/components/system/SystemProvider";
import {
  BAR_MS,
  BOOT_WATCHDOG_MS,
  DEVICE_LINES,
  DEVICE_SPEED_MS,
  HANDOFF_MS,
  HEAD_LINES,
  HEAD_SPEED_MS,
  MEMORY_K,
  MEMORY_MS,
  SESSION_KEY,
  STRIKE_MS,
  disarmBootFailsafe,
} from "@/lib/boot";

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
  // Read by the watchdog below. Held in a ref rather than listed as an effect
  // dependency: `finish` is rebuilt whenever the system context identity moves,
  // and re-running the mount effect would restrike the tube mid-sequence.
  const finishRef = useRef<() => void>(() => {});

  useEffect(() => {
    // Disarm the inline failsafe in <head>. Its entire purpose is to reveal the
    // page if this component never runs, and this component is now running, so
    // the timer has no job left. Unconditional and first: if it were left armed
    // it would strip `booting` on a fixed timer while the sequence was still
    // typing, which is exactly the bug that put the landing page on screen
    // underneath a live BIOS screen. See lib/boot.ts.
    disarmBootFailsafe();

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

    // Covers the one case disarming the inline failsafe opens up: this component
    // mounted, took ownership of the reveal, and then stalled part-way (a
    // typewriter whose onDone never fires, a rAF loop that never gets a frame).
    // Goes through finish() rather than stripping the class, so the tube still
    // powers on properly instead of the overlay simply vanishing.
    const watchdog = window.setTimeout(() => finishRef.current(), BOOT_WATCHDOG_MS);

    return () => {
      window.clearTimeout(strike);
      window.clearTimeout(watchdog);
    };
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
  finishRef.current = finish;

  // ── memory test ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!booting || phase !== "memory") return;
    const started = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - started) / MEMORY_MS);
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
      const p = Math.min(1, (t - started) / BAR_MS);
      setProgress(p);
      if (p < 1) raf = requestAnimationFrame(step);
      else handoff = window.setTimeout(finish, HANDOFF_MS);
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
              <Typewriter
                lines={[...HEAD_LINES]}
                speed={HEAD_SPEED_MS}
                onDone={() => setPhase("memory")}
              />
            )}

            {(phase === "memory" || phase === "devices" || phase === "bar") && (
              <div className="boot__mem">
                Memory Test: {String(memory).padStart(6, "0")}K {phase === "memory" ? "" : "OK"}
              </div>
            )}

            {(phase === "devices" || phase === "bar") && (
              <Typewriter
                lines={[...DEVICE_LINES]}
                speed={DEVICE_SPEED_MS}
                onDone={() => setPhase("bar")}
              />
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
