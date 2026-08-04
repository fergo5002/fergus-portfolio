"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { formatUptime, memoryAddress } from "@/lib/system";
import { useSystem } from "./SystemProvider";
import MachineControls from "./MachineControls";

/**
 * A fixed instrument strip along the bottom of the tube: uptime, the current
 * path as `pwd`, scroll position rendered as a memory address, live frame rate
 * and cursor coordinates.
 *
 * Its job is to make the machine feel like it is running rather than merely
 * displayed. Values are written straight into text nodes on a ~10 Hz throttle —
 * fast enough to read as live, slow enough to be legible and cheap.
 */
export default function StatusBar() {
  const path = usePathname();
  const { frame, onFrame, reducedMotion, settings } = useSystem();

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
    // leaving them focusable — the worst of both.
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
    </div>
  );
}
