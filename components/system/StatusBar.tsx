"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { formatUptime, memoryAddress } from "@/lib/system";
import { INITIAL_SHELL, shellStore } from "@/lib/shell";
import { summonShell } from "@/components/ShellDrawer";
import { useSystem } from "./SystemProvider";
import MachineControls from "./MachineControls";

const getServerShell = () => INITIAL_SHELL;

/**
 * A fixed instrument strip along the bottom of the tube: uptime, the current
 * path as `pwd`, scroll position rendered as a memory address, live frame rate
 * and cursor coordinates.
 *
 * Its job is to make the machine feel like it is running rather than merely
 * displayed. Values are written straight into text nodes on a ~10 Hz throttle,
 * fast enough to read as live, slow enough to be legible and cheap.
 */
export default function StatusBar() {
  const path = usePathname();
  const { frame, onFrame, reducedMotion, settings } = useSystem();
  const shell = useSyncExternalStore(shellStore.subscribe, shellStore.get, getServerShell);

  const uptimeRef = useRef<HTMLSpanElement>(null);
  const memRef = useRef<HTMLSpanElement>(null);
  const fpsRef = useRef<HTMLSpanElement>(null);
  const posRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (reducedMotion) {
      // Static, honest values rather than a frozen live readout.
      if (uptimeRef.current) uptimeRef.current.textContent = "--:--:--";
      if (memRef.current) memRef.current.textContent = "0x00400000";
      if (fpsRef.current) fpsRef.current.textContent = "--";
      if (posRef.current) posRef.current.textContent = "---,---";
      return;
    }

    let lastPaint = 0;
    return onFrame((time) => {
      if (time - lastPaint < 100) return;
      lastPaint = time;
      const f = frame.current;

      if (uptimeRef.current) uptimeRef.current.textContent = formatUptime(f.uptimeMs);
      if (memRef.current) memRef.current.textContent = memoryAddress(f.scrollProgress);
      if (fpsRef.current) fpsRef.current.textContent = String(Math.round(f.fps)).padStart(2, "0");
      if (posRef.current) {
        const x = Math.round(f.pointerX * 1000);
        const y = Math.round(f.pointerY * 1000);
        posRef.current.textContent = `${String(x).padStart(3, "0")},${String(y).padStart(3, "0")}`;
      }
    });
  }, [frame, onFrame, reducedMotion]);

  const pwd = path === "/" ? "~" : `~${path}`;

  return (
    // The readouts are decorative and stay hidden from assistive tech, but the
    // strip itself no longer can be: it now holds real controls, and an
    // aria-hidden ancestor would take them out of the accessibility tree while
    // leaving them focusable: the worst of both.
    <div className="statusbar">
      <span className="statusbar__readouts" aria-hidden="true">
        <span className="statusbar__seg statusbar__brand">FergusOS 5.0</span>
        <span className="statusbar__seg">
          up <span ref={uptimeRef}>00:00:00</span>
        </span>
        <span className="statusbar__seg statusbar__pwd">{pwd}</span>
        <span className="statusbar__seg statusbar__mem">
          <span ref={memRef}>0x00400000</span>
        </span>
        <span className="statusbar__seg statusbar__hide-sm">
          <span ref={fpsRef}>60</span> fps
        </span>
        <span className="statusbar__seg statusbar__hide-sm">
          <span ref={posRef}>500,500</span>
        </span>
        <span className="statusbar__seg statusbar__hide-sm">{settings.theme}</span>
      </span>
      <MachineControls />
      {/* The drawer's handle. On the home page, which hosts the terminal
          inline, it jumps to that instead, and reports no expanded state
          because there is nothing to expand.

          `aria-controls` names the drawer only while the drawer is there. It
          renders nothing when closed, so pointing at `shell-drawer` the rest of
          the time would be a reference to an element that does not exist. */}
      <button
        type="button"
        className="statusbar__prompt"
        onClick={summonShell}
        aria-expanded={shell.inline ? undefined : shell.open}
        aria-controls={!shell.inline && shell.open ? "shell-drawer" : undefined}
        title={shell.inline ? "Jump to the terminal" : "Open the terminal (backtick)"}
      >
        {/* The `$` is drawn by `.statusbar__prompt::before`, not written here.
            Costume text in the document is the bug this repo has now shipped
            twice: `aria-hidden` keeps it out of the accessibility tree and does
            nothing at all to a text extractor. `components/chrome.test.ts` is
            the guard. The accessible name stays "prompt", from the label. */}
        <span className="statusbar__prompt-label">prompt</span>
      </button>
    </div>
  );
}
