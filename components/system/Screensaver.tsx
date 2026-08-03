"use client";

import { useEffect, useRef, useState } from "react";
import { useSystem } from "./SystemProvider";

/** Idle time before the screen saves itself. */
const IDLE_MS = 45_000;

/**
 * Burn-in protection, obviously.
 *
 * After 45 seconds of no input the FergusOS plate detaches and bounces around
 * the tube. Any input at all dismisses it. It is a joke, but it is the correct
 * joke: a machine that has been left alone genuinely would do this, so it lands
 * as consistency rather than as a gag bolted onto the side.
 */
export default function Screensaver() {
  const [active, setActive] = useState(false);
  const plateRef = useRef<HTMLDivElement>(null);
  const { onFrame, reducedMotion, degauss } = useSystem();

  // ── idle detection ────────────────────────────────────────────────────────
  useEffect(() => {
    if (reducedMotion) return;

    let timer: ReturnType<typeof setTimeout>;
    let isActive = false;

    const wake = () => {
      if (isActive) {
        isActive = false;
        setActive(false);
      }
      clearTimeout(timer);
      timer = setTimeout(() => {
        isActive = true;
        setActive(true);
      }, IDLE_MS);
    };

    const events = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart", "scroll"];
    events.forEach((e) => window.addEventListener(e, wake, { passive: true }));
    wake();

    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, wake));
    };
  }, [reducedMotion]);

  // ── the bounce ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!active) return;
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
  const prevActive = useRef(false);
  useEffect(() => {
    if (prevActive.current && !active) degauss();
    prevActive.current = active;
  }, [active, degauss]);

  if (reducedMotion || !active) return null;

  return (
    <div className="saver" aria-hidden="true">
      <div ref={plateRef} className="saver__plate">
        <span className="saver__title">FergusOS</span>
        <span className="saver__sub">no signal · move to wake</span>
      </div>
    </div>
  );
}
