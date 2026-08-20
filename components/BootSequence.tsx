"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Typewriter from "./Typewriter";
import { useSystem } from "@/components/system/SystemProvider";
import {
  BAR_MS,
  BOOTING_CLASS,
  BOOT_REARM_MS,
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
  armBootFailsafe,
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
  // Read by the watchdog below. Held in a ref rather than named as an effect
  // dependency so that the mount effect keeps a stable identity: re-running it
  // would restrike the tube mid-sequence.
  const finishRef = useRef<() => void>(() => {});

  useEffect(() => {
    // The pre-paint script in <head> already decided whether to boot (session +
    // reduced-motion check) and flagged <html> as .booting. Derive from that so we
    // never flip false->true after first paint (which caused the content flash).
    //
    // Nothing to disarm on the paths that fall out here: the inline script only
    // arms its failsafe on the same branch that adds the class.
    if (!document.documentElement.classList.contains(BOOTING_CLASS)) return;

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

    // Covers the case disarming the inline failsafe opens up: this component
    // mounted, took ownership of the reveal, and then stalled part-way (a
    // typewriter whose onDone never fires, a rAF loop that never gets a frame).
    // Goes through finish() rather than stripping the class, so the tube still
    // powers on properly instead of the overlay simply vanishing.
    const watchdog = window.setTimeout(() => finishRef.current(), BOOT_WATCHDOG_MS);

    // Take ownership only once the replacement is actually in place. Disarming
    // first would leave a window, however narrow, in which a throw above has cut
    // the safety net before this component armed its own.
    disarmBootFailsafe();

    return () => {
      window.clearTimeout(strike);
      window.clearTimeout(watchdog);
      // Hand ownership back. Without this, unmounting before finish() leaves
      // `booting` set with no timer anywhere: the inline failsafe is cancelled,
      // the watchdog is cleared on the line above, and the visitor is looking at
      // a blank tube with no way out but a reload. That is the same class of
      // fault as the one this file was just fixed for, and it is one that
      // removing a safety net always creates. Clicking any nav link while the
      // BIOS is typing reaches it, since this component lives in app/page.tsx.
      // So does a render error in anything it wraps, and Fast Refresh.
      if (!finishedRef.current) armBootFailsafe(BOOT_REARM_MS);
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
    // Reveal the page and drop the overlay together, before anything that could
    // throw. These two used to be separated by the power-on flourish, so a
    // failure in the middle of it left the BIOS screen stranded on top of a
    // visible site: the exact symptom this file was just fixed for, reached by a
    // different route. Plain property writes on `frame` sit here too, since they
    // cannot throw and the tube should be up whatever else happens.
    const f = frame.current;
    f.bootTarget = 1;
    if (f.boot < 0.6) f.boot = 0.6;
    f.targetLive = 1;

    document.documentElement.classList.remove(BOOTING_CLASS);
    setBooting(false);

    // Decoration from here down: the degauss thump and the CRT power-on that
    // make the revealed site "switch on" rather than pop in. Wrapped because
    // nothing below is worth stranding an overlay for, and when the watchdog is
    // the caller this runs inside a setTimeout where no error boundary can catch
    // it anyway.
    try {
      degauss();
      burstRain(1400);

      const el = document.querySelector(".screen");
      const nav = document.querySelector(".nav");
      el?.classList.add("power-on");
      nav?.classList.add("power-on");
      window.setTimeout(() => {
        el?.classList.remove("power-on");
        nav?.classList.remove("power-on");
      }, 680);
    } catch {
      /* the site is already up; the flourish is not worth a broken page */
    }
  }, [degauss, burstRain, frame]);

  // Written in an effect rather than during render: React may discard a render
  // under concurrent features, and writing a ref in the body is not safe there.
  useEffect(() => {
    finishRef.current = finish;
  });

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
