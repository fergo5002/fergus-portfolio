"use client";

import { useEffect, useState } from "react";
import Typewriter from "./Typewriter";

const BOOT_LINES = [
  "FergusOS v3.0   (c) 2026 Patrick Fergus O'Reilly",
  "POST .......................... OK",
  "BIOS check .................... OK",
  "mounting /dev/ambition ........ OK",
  "loading personality.dll ....... OK",
  "starting phosphor display .....",
  "boot complete. welcome.",
];

const SESSION_KEY = "fergusos_booted";

/**
 * Renders its children immediately (good for SSR / no-JS / SEO) and, on first
 * visit of a session, overlays a one-time boot animation on top. The overlay is
 * skippable and is never shown again in the same session, nor under
 * `prefers-reduced-motion`.
 */
export default function BootSequence({ children }: { children: React.ReactNode }) {
  const [booting, setBooting] = useState(false);

  useEffect(() => {
    // The pre-paint script in <head> already decided whether to boot (session +
    // reduced-motion check) and flagged <html> as .booting. Derive from that so we
    // never flip false->true after first paint (which caused the content flash).
    if (document.documentElement.classList.contains("booting")) setBooting(true);
  }, []);

  const finish = () => {
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* ignore storage errors (private mode) */
    }
    document.documentElement.classList.remove("booting"); // reveal content

    // Play the CRT power-on so the revealed site "switches on" rather than
    // popping in. Strip the class after the animation so transforms don't linger
    // (the CSS is gated behind prefers-reduced-motion, so this is a no-op there).
    const el = document.querySelector(".screen");
    const nav = document.querySelector(".nav");
    el?.classList.add("power-on");
    nav?.classList.add("power-on");
    window.setTimeout(() => {
      el?.classList.remove("power-on");
      nav?.classList.remove("power-on");
    }, 680);

    setBooting(false);
  };

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
          <Typewriter
            lines={BOOT_LINES}
            speed={11}
            onDone={() => window.setTimeout(finish, 600)}
          />
          <button type="button" className="boot__skip" onClick={finish}>
            skip ▸
          </button>
        </div>
      )}
      {children}
    </>
  );
}
