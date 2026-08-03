"use client";

import { useEffect, useRef, useState } from "react";
import { THEME_PHOSPHOR } from "@/lib/system";
import { useSystem } from "./SystemProvider";

/**
 * Phosphor persistence for the cursor.
 *
 * Real phosphor keeps glowing after the beam has moved on, so the pointer leaves
 * a decaying green smear rather than nothing. Implemented as the classic
 * fade-the-whole-canvas-by-a-few-percent-each-frame trick, which gives a true
 * exponential decay for one fill per frame.
 *
 * Never mounted for coarse pointers (a finger has no trail to leave) or under
 * `prefers-reduced-motion`.
 */
export default function CursorTrail() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { frame, onFrame, reducedMotion, settings } = useSystem();
  // The canvas is never committed to the DOM on a phone. It used to mount and
  // simply never draw, leaving a 300x150 backing buffer stretched over the whole
  // viewport under `mix-blend-mode: screen` — a permanent compositing layer
  // rendering nothing. The finger's own phosphor glow is drawn by the shader.
  //
  // Decided in an effect, starting `false`, rather than in a lazy initialiser:
  // the server cannot know the pointer type, so resolving it during the first
  // client render makes the client's tree differ from the server's and React
  // fails hydration (#418). Starting false means both agree, and the trail — a
  // decorative, aria-hidden layer — simply arrives one tick later on a mouse.
  const [enabled, setEnabled] = useState(false);

  const themeRef = useRef(settings.theme);
  themeRef.current = settings.theme;

  useEffect(() => {
    setEnabled(!reducedMotion && !window.matchMedia("(pointer: coarse)").matches);
  }, [reducedMotion]);

  useEffect(() => {
    if (!enabled) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let dpr = 1;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize, { passive: true });

    let prevX = -1;
    let prevY = -1;

    const unsubscribe = onFrame(() => {
      const f = frame.current;
      const w = window.innerWidth;
      const h = window.innerHeight;

      // Exponential decay of everything already on the canvas.
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0,0,0,0.11)";
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";

      if (f.pointerActive < 0.05) return;

      const x = f.pointerX * w;
      const y = f.pointerY * h;
      const [r, g, b] = THEME_PHOSPHOR[themeRef.current];
      const rgb = `${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)}`;

      // Interpolate between frames so a fast flick draws a line, not dots.
      if (prevX >= 0) {
        const steps = Math.min(12, Math.ceil(Math.hypot(x - prevX, y - prevY) / 7));
        for (let i = 0; i < steps; i++) {
          const t = i / steps;
          const ix = prevX + (x - prevX) * t;
          const iy = prevY + (y - prevY) * t;
          const grad = ctx.createRadialGradient(ix, iy, 0, ix, iy, 13);
          grad.addColorStop(0, `rgba(${rgb},0.20)`);
          grad.addColorStop(1, `rgba(${rgb},0)`);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(ix, iy, 13, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      prevX = x;
      prevY = y;
    });

    return () => {
      unsubscribe();
      window.removeEventListener("resize", resize);
    };
  }, [frame, onFrame, enabled]);

  if (!enabled) return null;
  return <canvas ref={canvasRef} className="cursortrail" aria-hidden="true" />;
}
