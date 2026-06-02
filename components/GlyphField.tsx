"use client";

import { useEffect, useRef } from "react";

const GLYPHS = "アカサタナハマヤラ0123456789#%&*<>/=+ABCDEF".split("");

/**
 * Ambient digital-rain behind all content. Column-based: each column holds a
 * "drop" head that lights stationary glyphs as it descends. Deliberately sparse
 * and low-opacity (styled in globals.css). Throttled to ~24fps; paused when the
 * tab is hidden; renders a single static frame under prefers-reduced-motion.
 */
export default function GlyphField() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const FONT = 16;
    let cols = 0;
    let drops: number[] = [];
    let dpr = 1;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.floor(window.innerWidth / FONT);
      // start drops at random heights; many columns inactive (-1) for sparseness
      drops = Array.from({ length: cols }, () =>
        Math.random() < 0.45 ? Math.floor(Math.random() * (window.innerHeight / FONT)) : -1,
      );
      ctx.font = `${FONT}px var(--font-mono), monospace`;
    };

    const drawFrame = () => {
      ctx.fillStyle = "rgba(10,14,10,0.18)"; // fade trails
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
      for (let i = 0; i < cols; i++) {
        if (drops[i] < 0) {
          if (Math.random() < 0.002) drops[i] = 0; // occasionally spawn a column
          continue;
        }
        const ch = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        const x = i * FONT;
        const y = drops[i] * FONT;
        ctx.fillStyle = "rgba(110,255,163,0.85)"; // bright head
        ctx.fillText(ch, x, y);
        if (y > window.innerHeight && Math.random() > 0.975) drops[i] = -1;
        else drops[i] += 1;
      }
    };

    resize();
    window.addEventListener("resize", resize);

    if (reduce) {
      // one static, very sparse frame then stop
      for (let i = 0; i < cols; i += 3) {
        if (Math.random() < 0.3) {
          ctx.fillStyle = "rgba(110,255,163,0.5)";
          ctx.fillText(
            GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
            i * FONT,
            Math.random() * window.innerHeight,
          );
        }
      }
      return () => window.removeEventListener("resize", resize);
    }

    let raf = 0;
    let last = 0;
    const FRAME_MS = 1000 / 24;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      if (t - last < FRAME_MS) return;
      last = t;
      drawFrame();
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={ref} className="glyphfield" aria-hidden="true" />;
}
