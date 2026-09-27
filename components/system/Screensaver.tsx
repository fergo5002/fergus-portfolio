"use client";

import { useEffect, useRef, useState } from "react";
import { useSystem } from "./SystemProvider";
import { clearBeam, readBeam, writeBeam } from "@/lib/beam";
import { saverStep } from "@/lib/lissajous";
import type { SaverWriter } from "@/lib/lissajous";

/** Idle time before the screen saves itself. */
const IDLE_MS = 45_000;

/** On `<html>` while the beam is drawing the saver: the page steps aside, as it does for the boot. */
const SAVING_CLASS = "is-saving";

/**
 * Burn-in protection, obviously.
 *
 * After 45 seconds of no input the tube stops showing the page and the beam
 * draws a Lissajous figure through the phosphor, slowly retuning, the way an
 * oscilloscope left on a bench does (`lib/lissajous.ts`). Any input at all
 * dismisses it. It is a joke, but it is the correct joke: a machine that has
 * been left alone genuinely would do this, so it lands as consistency rather
 * than as a gag bolted onto the side.
 *
 * With no tube to draw on (WebGL unavailable, or the CRT switched off), the
 * FergusOS plate detaches and bounces around the screen instead, as it always
 * did.
 */
export default function Screensaver() {
  const [active, setActive] = useState<false | "beam" | "plate">(false);
  const plateRef = useRef<HTMLDivElement>(null);
  const { frame, onFrame, reducedMotion, degauss, gravityOn } = useSystem();

  // ── idle detection ────────────────────────────────────────────────────────
  useEffect(() => {
    if (reducedMotion) return;
    // Watching a pile of your own words settle is not being idle. Without this,
    // standing back to enjoy the physics for forty-five seconds is rewarded with
    // a screensaver over the top of it.
    if (gravityOn) {
      setActive(false);
      return;
    }

    let timer: ReturnType<typeof setTimeout>;
    let isActive = false;

    const wake = () => {
      if (isActive) {
        isActive = false;
        setActive(false);
      }
      clearTimeout(timer);
      timer = setTimeout(() => {
        const root = document.documentElement;
        // The arcade is always moving, and a player is never idle.
        if (root.classList.contains("arcade-open")) {
          wake();
          return;
        }
        isActive = true;
        setActive(root.classList.contains("webgl-ok") && !root.classList.contains("crt-off") ? "beam" : "plate");
      }, IDLE_MS);
    };

    // Captured, not bubbled: the arcade room stops keydown propagation, as its
    // contract requires, and a bubble-phase listener never heard a keyboard
    // player, who got the saver over a running game.
    const events = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart", "scroll"];
    const options = { passive: true, capture: true } as const;
    events.forEach((e) => window.addEventListener(e, wake, options));
    wake();

    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, wake, options));
    };
  }, [reducedMotion, gravityOn]);

  // ── the figure, drawn by the beam ─────────────────────────────────────────
  useEffect(() => {
    if (active !== "beam") return;
    const root = document.documentElement;
    root.classList.add(SAVING_CLASS);
    let start = -1;
    let writer: SaverWriter | null = null;

    const unsubscribe = onFrame((time) => {
      if (start < 0) start = time;
      const f = frame.current;
      const step = saverStep(writer, {
        elapsedMs: time - start,
        aspect: window.innerWidth / Math.max(1, window.innerHeight),
        pending: readBeam(f),
      });
      writer = step.writer;
      if (step.pts) writeBeam(frame.current, step.pts, step.gain);
    });

    return () => {
      unsubscribe();
      clearBeam(frame.current);
      root.classList.remove(SAVING_CLASS);
    };
  }, [active, frame, onFrame]);

  // ── the plate, when there is no tube to draw on ───────────────────────────
  useEffect(() => {
    if (active !== "plate") return;
    const plate = plateRef.current;
    if (!plate) return;

    const w = plate.offsetWidth;
    const h = plate.offsetHeight;
    let x = Math.random() * Math.max(1, window.innerWidth - w);
    let y = Math.random() * Math.max(1, window.innerHeight - h);
    let vx = 0.13;
    let vy = 0.1;
    let hue = 0;

    return onFrame((_time, dt) => {
      x += vx * dt;
      y += vy * dt;

      let bounced = false;
      if (x <= 0) {
        x = 0;
        vx = Math.abs(vx);
        bounced = true;
      } else if (x + w >= window.innerWidth) {
        x = window.innerWidth - w;
        vx = -Math.abs(vx);
        bounced = true;
      }
      if (y <= 0) {
        y = 0;
        vy = Math.abs(vy);
        bounced = true;
      } else if (y + h >= window.innerHeight) {
        y = window.innerHeight - h;
        vy = -Math.abs(vy);
        bounced = true;
      }

      if (bounced) hue = (hue + 47) % 360;

      plate.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      plate.style.filter = `hue-rotate(${hue}deg)`;
    });
  }, [active, onFrame]);

  // A degauss thump on wake, so returning to the page feels like the tube
  // snapping back rather than a div disappearing.
  const prevActive = useRef<typeof active>(false);
  useEffect(() => {
    if (prevActive.current && !active) degauss();
    prevActive.current = active;
  }, [active, degauss]);

  if (reducedMotion || !active) return null;

  if (active === "beam") {
    return (
      <div className="saver saver--beam" aria-hidden="true">
        <span className="saver__wake">move to wake</span>
      </div>
    );
  }

  return (
    <div className="saver" aria-hidden="true">
      <div ref={plateRef} className="saver__plate">
        <span className="saver__title">FergusOS</span>
        <span className="saver__sub">no signal · move to wake</span>
      </div>
    </div>
  );
}
