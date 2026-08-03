"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Typewriter from "./Typewriter";
import { useSystem } from "@/components/system/SystemProvider";

const HEAD_LINES = [
  "FergusOS BIOS v4.0   (c) 2026 Patrick Fergus O'Reilly",
  "CPU: Trinity CS/Business @ 1.1 GHz — 3rd year, 2 cores",
];

const DEVICE_LINES = [
  "detecting /dev/ambition ............... OK",
  "mounting  /usr/presterly .............. OK",
  "loading   personality.dll ............. OK",
  "checking  caffeine reserves ........... LOW",
];

const SESSION_KEY = "fergusos_booted";
const MEMORY_K = 65536;

type Phase = "head" | "memory" | "devices" | "bar";

/**
 * Renders its children immediately (good for SSR / no-JS / SEO) and, on the first
 * visit of a session, overlays a one-time power-on sequence: BIOS header, a
 * counting memory test, device detection, a loading bar, then a degauss thump
 * into the CRT power-on.
 *
 * Skippable at any point, never shown twice in a session, and never shown under
 * `prefers-reduced-motion`.
 */
export default function BootSequence({ children }: { children: React.ReactNode }) {
  const [booting, setBooting] = useState(false);
  const [phase, setPhase] = useState<Phase>("head");
  const [memory, setMemory] = useState(0);
  const [progress, setProgress] = useState(0);
  const { frame, degauss } = useSystem();
  const finishedRef = useRef(false);

  useEffect(() => {
    // The pre-paint script in <head> already decided whether to boot (session +
    // reduced-motion check) and flagged <html> as .booting. Derive from that so we
    // never flip false->true after first paint (which caused the content flash).
    if (document.documentElement.classList.contains("booting")) {
      setBooting(true);
      // Hold the phosphor layer dark until the machine is actually up.
      frame.current.live = 0;
      frame.current.targetLive = 0;
    }
  }, [frame]);

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;

    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* ignore storage errors (private mode) */
    }
    document.documentElement.classList.remove("booting"); // reveal content

    // Degauss thump, then the CRT power-on so the revealed site "switches on"
    // rather than popping in.
    degauss();
    frame.current.targetLive = 1;

    const el = document.querySelector(".screen");
    const nav = document.querySelector(".nav");
    el?.classList.add("power-on");
    nav?.classList.add("power-on");
    window.setTimeout(() => {
      el?.classList.remove("power-on");
      nav?.classList.remove("power-on");
    }, 680);

    setBooting(false);
  }, [degauss, frame]);

  // ── memory test ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!booting || phase !== "memory") return;
    const started = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - started) / 750);
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
      const p = Math.min(1, (t - started) / 620);
      setProgress(p);
      if (p < 1) raf = requestAnimationFrame(step);
      else handoff = window.setTimeout(finish, 260);
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
          <Typewriter lines={HEAD_LINES} speed={9} onDone={() => setPhase("memory")} />

          {phase !== "head" && (
            <div className="boot__mem">
              Memory Test: {String(memory).padStart(6, "0")}K {phase === "memory" ? "" : "OK"}
            </div>
          )}

          {(phase === "devices" || phase === "bar") && (
            <Typewriter lines={DEVICE_LINES} speed={7} onDone={() => setPhase("bar")} />
          )}

          {phase === "bar" && (
            <div className="boot__bar">
              starting phosphor display [{"█".repeat(bars)}
              {"·".repeat(24 - bars)}] {Math.round(progress * 100)}%
            </div>
          )}

          <button type="button" className="boot__skip" onClick={finish}>
            skip &gt;
          </button>
        </div>
      )}
      {children}
    </>
  );
}
