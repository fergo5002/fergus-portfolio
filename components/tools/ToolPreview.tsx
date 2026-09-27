"use client";
import { useEffect, useMemo, useRef } from "react";
import { useSystem } from "@/components/system/SystemProvider";
import { scene, VIEW, type Primitive } from "@/lib/tools/attract";

/**
 * A tool card's live preview: the tool's idea drawn in the machine's line
 * style, moving. Illustrative, never presented as measured visitor data.
 *
 * The server renders the scene at t = 0, so the first paint and every
 * reduced-motion visit show a real picture. After hydration the same SVG
 * elements are rewritten from `SystemProvider`'s one frame clock, by elapsed
 * time, only while the card is on screen (an IntersectionObserver gates it),
 * and at half rate on a coarse pointer: the rules the arcade's attract
 * screens follow, pinned by `components/tools/ToolPreview.test.ts`.
 */
function attributes(p: Primitive): Record<string, string | number> {
  const { kind: _kind, cls: _cls, ...rest } = p;
  return rest;
}

function draw(p: Primitive, i: number) {
  const props = { "data-p": i, className: p.cls, ...attributes(p) };
  if (p.kind === "line") return <line key={i} {...props} />;
  if (p.kind === "circle") return <circle key={i} {...props} />;
  if (p.kind === "rect") return <rect key={i} {...props} />;
  return <path key={i} {...props} />;
}

function apply(nodes: SVGElement[], frame: Primitive[]) {
  for (let i = 0; i < frame.length; i++) {
    const node = nodes[i];
    if (!node) continue;
    const attrs = attributes(frame[i]);
    for (const key in attrs) {
      const value = attrs[key];
      const next = String(value);
      if (node.getAttribute(key) !== next) node.setAttribute(key, next);
    }
  }
}

export default function ToolPreview({ slug }: { slug: string }) {
  const { onFrame, reducedMotion } = useSystem();
  const first = useMemo(() => scene(slug, 0), [slug]);
  const svgRef = useRef<SVGSVGElement>(null);
  const visibleRef = useRef(false);

  useEffect(() => {
    if (reducedMotion) return;
    const svg = svgRef.current;
    if (!svg) return;
    const nodes = Array.from(svg.querySelectorAll<SVGElement>("[data-p]"));
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    let elapsed = 0;
    let parity = 0;
    const visibility = new IntersectionObserver((entries) => {
      visibleRef.current = entries.some((e) => e.isIntersecting);
    }, { rootMargin: "80px" });
    visibility.observe(svg);

    const unsubscribe = onFrame((_time, dt) => {
      if (!visibleRef.current) return;
      elapsed += dt / 1000;
      parity ^= 1;
      if (coarse && parity) return;
      apply(nodes, scene(slug, elapsed));
    });
    return () => {
      unsubscribe();
      visibility.disconnect();
    };
  }, [onFrame, reducedMotion, slug]);

  return (
    <svg
      ref={svgRef}
      className={`bench-preview bench-preview--${slug}`}
      viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      {first.map(draw)}
    </svg>
  );
}
