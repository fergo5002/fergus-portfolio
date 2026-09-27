"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { shortPwd } from "@/lib/system";
import { cssString, readouts } from "@/lib/readouts";
import { INITIAL_SHELL, shellStore } from "@/lib/shell";
import { summonShell } from "@/components/ShellDrawer";
import { machineCopy as copy } from "@/content/machine";
import { useSystem } from "./SystemProvider";
import MachineControls from "./MachineControls";

const getServerShell = () => INITIAL_SHELL;

/**
 * The strip along the bottom of the tube: an activity lamp, the machine's
 * readouts, its controls and the terminal handle.
 *
 * The readouts make the machine feel like it is running rather than merely
 * displayed: uptime, where you are, scroll position as a memory address, frame
 * rate, the pointer, the clock and the phosphor. They are costume, so none of
 * them is text: each value goes into a `--ro` custom property on its own span
 * and `globals.css` draws it with `content`. The server renders them empty, a
 * text extractor finds nothing, and each write restyles one small span rather
 * than anything that would repaint the page's type. Values change on a ~10 Hz
 * throttle, fast enough to read as live and slow enough to be legible.
 *
 * A phone gives the whole strip to its four labelled controls (`globals.css`,
 * max-width 560px), which is where the readouts go first.
 */
export default function StatusBar() {
  const path = usePathname();
  const shell = useSyncExternalStore(shellStore.subscribe, shellStore.get, getServerShell);
  const { frame, onFrame, reducedMotion, settings } = useSystem();
  const rowRef = useRef<HTMLSpanElement>(null);
  const pwd = path === "/" ? "~" : `~${path}`;
  const short = shortPwd(path);
  // The not-found page is prerendered once, at /_not-found, and served for
  // every missing URL, so on a 404 the server wrote ~/_not-found while the
  // browser knows the path asked for. The path segment keeps whatever the
  // server wrote through hydration and is remounted once mounted, which
  // writes the real one. Everywhere else the two are the same text.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const cells = new Map<string, HTMLElement>();
    row.querySelectorAll<HTMLElement>("[data-ro]").forEach((el) => cells.set(el.dataset.ro ?? "", el));
    const lamp = row.querySelector<HTMLElement>(".statusbar__lamp");
    const written = new Map<string, string>();
    const put = (key: string, value: string) => {
      if (written.get(key) === value) return;
      written.set(key, value);
      cells.get(key)?.style.setProperty("--ro", cssString(value));
    };

    let keyAt = -Infinity;
    const onKey = () => {
      keyAt = performance.now();
    };
    window.addEventListener("keydown", onKey, { passive: true });

    const paint = (now: number) => {
      const f = frame.current;
      const r = readouts(
        {
          uptimeMs: f.uptimeMs,
          scrollProgress: f.scrollProgress,
          fps: f.fps,
          pointerX: f.pointerX,
          pointerY: f.pointerY,
          scrollVelocity: f.scrollVelocity,
          tapAt: f.tapAt,
          degaussAt: f.degaussAt,
          impacts: f.impacts.length,
          keyAt,
        },
        new Date(),
        now,
        reducedMotion,
      );
      put("up", r.up);
      put("mem", r.mem);
      put("fps", r.fps);
      put("pos", r.pos);
      put("clock", r.clock);
      // A drive light flickers while it works rather than glowing steadily.
      if (lamp) lamp.dataset.on = r.busy && Math.random() > 0.3 ? "1" : "0";
    };

    if (reducedMotion) {
      // No frame-rate readout to keep live; the clock only needs the minute.
      paint(performance.now());
      const timer = window.setInterval(() => paint(performance.now()), 15_000);
      return () => {
        window.clearInterval(timer);
        window.removeEventListener("keydown", onKey);
      };
    }

    let lastPaint = -Infinity;
    const unsubscribe = onFrame((time) => {
      if (time - lastPaint < 100) return;
      lastPaint = time;
      paint(time);
    });
    return () => {
      unsubscribe();
      window.removeEventListener("keydown", onKey);
    };
  }, [frame, onFrame, reducedMotion]);

  useEffect(() => {
    rowRef.current?.querySelector<HTMLElement>('[data-ro="theme"]')?.style.setProperty("--ro", cssString(settings.theme));
  }, [settings.theme]);

  return (
    <div className="statusbar" role="region" aria-label={copy.controls}>
      <span className="statusbar__readouts" aria-hidden="true" ref={rowRef}>
        <span className="statusbar__lamp" data-on="0" />
        <span className="statusbar__seg statusbar__brand">FergusOS</span>
        <span className="statusbar__seg statusbar__ro statusbar__ro--up" data-ro="up" />
        <span
          key={mounted ? "client" : "server"}
          className="statusbar__seg statusbar__pwd"
          title={pwd}
          suppressHydrationWarning
        >
          <span className="statusbar__pwd-full" suppressHydrationWarning>{pwd}</span>
          <span className="statusbar__pwd-short" suppressHydrationWarning>{short}</span>
        </span>
        <span className="statusbar__seg statusbar__ro statusbar__ro--mem" data-ro="mem" />
        <span className="statusbar__seg statusbar__ro statusbar__ro--fps" data-ro="fps" />
        <span className="statusbar__seg statusbar__ro statusbar__ro--pos" data-ro="pos" />
        <span className="statusbar__seg statusbar__ro statusbar__ro--clock" data-ro="clock" />
        <span className="statusbar__seg statusbar__ro statusbar__ro--theme" data-ro="theme" />
      </span>
      <MachineControls />
      <button
        type="button"
        className="statusbar__prompt"
        onClick={summonShell}
        aria-expanded={shell.open}
        aria-controls={shell.open ? "shell-drawer" : undefined}
        title={shell.open ? copy.closeTerminal : copy.openTerminal}
      >
        {/* The dollar is drawn by CSS. Decorative text stays out of server HTML. */}
        <span className="statusbar__prompt-label">{copy.terminal}</span>
      </button>
    </div>
  );
}
