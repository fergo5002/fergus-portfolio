"use client";
import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from "react";
import type { Simulation } from "d3-force";
import { useSystem } from "@/components/system/SystemProvider";
import type { AtlasGraph } from "@/lib/studio/graph";
import { neighbourhood } from "@/lib/studio/atlas-view";
import {
  boundsOf,
  centreOn,
  fitCamera,
  hitNode,
  nodeRadius,
  toScreen,
  zoomAt,
  type Camera,
  type Point,
  type Rect,
} from "@/lib/studio/atlas-camera";
import {
  AtlasPaletteError,
  SETTLE_TICKS,
  SHAPE_QUERY,
  adjacency,
  atlasPalette,
  halfLife,
  keep,
  nextStop,
  pretick,
  pulseDuration,
  sceneOf,
  seeded,
  simulate,
  type AtlasPalette,
  type Shape,
  type SimLink,
  type SimNode,
} from "@/lib/studio/atlas-scene";

/**
 * Atlas's stage: the map on a canvas, drawn like the rest of the machine.
 *
 * Two canvases share one box. The first holds the map and is painted only
 * when something about it changes. The second is the phosphor: nothing is
 * painted on it, things are deposited into it and it decays by elapsed time
 * (`keep`), so a dragged node, a panned map and the beam walking the links
 * leave a short glow behind them. Its half-life halves on a coarse pointer.
 *
 * **One frame clock, and only while seen.** Motion runs off
 * `SystemProvider`'s `onFrame`, subscribed only while an IntersectionObserver
 * sees the canvas and never under reduced motion, where there is no beam, no
 * ghost and no settling: every change paints once, at rest. The first paint
 * does not wait for the observer, so the map is there wherever the page is
 * scrolled to, and a picture of the page has it in.
 *
 * **Time is the frame's own timestamp**, never the clock's clamped `dt`.
 *
 * **Colours are the theme's tokens** (`atlasPalette`, which refuses rather
 * than paint black on black) and the face is the canvas's own computed font:
 * the root carries none, and reading it there draws in the browser's serif.
 *
 * **The page keeps scrolling.** A finger that lands on empty map scrolls the
 * page vertically and pans sideways (`touch-action: pan-y`); one that lands
 * on a node, or two fingers, belong to the map. The wheel zooms only once the
 * map has focus (a click on it) or with a pinch (ctrl), so a scroll past the
 * map never gets stuck in it.
 */

export type GraphHandle = {
  fit: () => void;
  zoom: (factor: number) => void;
  image: () => Promise<Blob | null>;
};

type Props = {
  graph: AtlasGraph;
  kinds: readonly string[];
  focus: boolean;
  selected: string;
  hovered: string;
  lit: Set<string> | null;
  pins: ReadonlySet<string>;
  label: string;
  onSelect: (id: string) => void;
  onHover: (id: string) => void;
  onError: (message: "paint") => void;
  ref?: Ref<GraphHandle>;
};

type Held = { id: number; x: number; y: number; node?: SimNode; moved: boolean; touch: boolean };
type Hop = { from: string; to: string; start: number; dur: number; last: Point | null };
type Ping = { from: string; to: string; start: number; dur: number; last: Point | null };

/** Screen pixels of slop around a node: a cursor is precise, a finger is not. */
const SLOP = { mouse: 6, touch: 16 };
/** Past this a press is a drag, not a tap. */
const DRAG_PX = { mouse: 3, touch: 8 };
const MAX_DPR = 2;
const LABEL_PX = 12;
const EASE_MS = 320;
/** The sim is ticked on a frame while its alpha is above this. */
const ALPHA_LIVE = 0.004;
/** Deposits a frame, at most: past this the trails are a sample. */
const MAX_TRAILS = 400;
const MAX_PINGS = 16;

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const px = (value: string, fallback: number) => {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
};

export default function GraphCanvas({
  graph,
  kinds,
  focus,
  selected,
  hovered,
  lit,
  pins,
  label,
  onSelect,
  onHover,
  onError,
  ref,
}: Props) {
  const { onFrame, reducedMotion, settings } = useSystem();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ghostRef = useRef<HTMLCanvasElement>(null);
  const sim = useRef<Simulation<SimNode, SimLink> | null>(null);
  const nodes = useRef<SimNode[]>([]);
  const links = useRef<SimLink[]>([]);
  const byId = useRef(new Map<string, SimNode>());
  const adj = useRef(new Map<string, string[]>());
  const shownGraph = useRef<AtlasGraph | null>(null);
  const camera = useRef<Camera>({ x: 0, y: 0, k: 1 });
  const size = useRef({ w: 0, h: 0, dpr: 1, ghostDpr: 1 });
  const palette = useRef<AtlasPalette | null>(null);
  const blooms = useRef(new Map<string, HTMLCanvasElement>());
  const face = useRef("");
  const dirty = useRef(true);
  const live = useRef(false);
  const coarse = useRef(false);
  const shape = useRef<Shape>("wide");
  const ease = useRef<{ from: Camera; to: Camera; start: number } | null>(null);
  const held = useRef<Held | null>(null);
  const pointers = useRef(new Map<number, Point>());
  const pinch = useRef<{ d: number; mid: Point } | null>(null);
  const hoverRef = useRef("");
  const hop = useRef<Hop | null>(null);
  const pings = useRef<Ping[]>([]);
  const lastFrame = useRef(0);
  const lastSeen = useRef(new Map<string, Point>());
  const ghostQuiet = useRef(true);
  const quietFor = useRef(0);
  const fitFocus = useRef("");
  const random = useRef(seeded(1));
  const reported = useRef(false);
  const engagedRef = useRef(false);
  const [engaged, setEngaged] = useState(false);
  const [grabbing, setGrabbing] = useState<"node" | "map" | "">("");

  // The props the frame callback and the handlers read, without resubscribing.
  const now = useRef({ selected, hovered, lit, pins, reducedMotion });
  now.current = { selected, hovered, lit, pins, reducedMotion };

  // ── geometry ─────────────────────────────────────────────────────────

  /** The part of the canvas the map is fitted into: under the reading band, inside the edge. */
  function safeRect(): Rect {
    const { w, h } = size.current;
    const box = canvasRef.current?.closest<HTMLElement>(".atlas-graph");
    const style = box ? getComputedStyle(box) : null;
    const osd = px(style?.getPropertyValue("--atlas-osd") ?? "", 56);
    const edge = px(style?.getPropertyValue("--atlas-edge") ?? "", 12);
    return { x: edge, y: osd, w: Math.max(40, w - edge * 2), h: Math.max(40, h - osd - edge) };
  }

  /** The safe rectangle less whatever the inspector covers, for bringing a chosen node into view. */
  function openRect(): Rect {
    const safe = safeRect();
    // The sheet is the canvas box's sibling, inside the glass: look from the glass.
    const sheet = canvasRef.current?.closest(".atlas-graph")?.querySelector<HTMLElement>(".atlas-inspector");
    if (!sheet) return safe;
    const { w } = size.current;
    // offset*, not getBoundingClientRect: the sheet may still be sliding in.
    if (sheet.offsetLeft > w / 3) return { ...safe, w: Math.max(40, sheet.offsetLeft - safe.x - 8) };
    return { ...safe, h: Math.max(40, sheet.offsetTop - safe.y - 8) };
  }

  function screenOf(n: SimNode): Point {
    return toScreen(camera.current, { x: n.x ?? 0, y: n.y ?? 0 });
  }

  // ── painting ─────────────────────────────────────────────────────────

  function readPalette(): AtlasPalette | null {
    const el = canvasRef.current;
    if (!el) return null;
    try {
      const style = getComputedStyle(el);
      palette.current = atlasPalette((token) => style.getPropertyValue(token));
      face.current = style.fontFamily;
      return palette.current;
    } catch (error) {
      if (!(error instanceof AtlasPaletteError)) throw error;
      if (!reported.current) onError("paint");
      reported.current = true;
      return null;
    }
  }

  function requestPaint() {
    if (live.current) dirty.current = true;
    else paint();
  }

  function paint() {
    dirty.current = false;
    const el = canvasRef.current;
    const ctx = el?.getContext("2d");
    const pal = palette.current ?? readPalette();
    const { w, h, dpr } = size.current;
    if (!el || !pal || !w || !h) return;
    if (!ctx) {
      if (!reported.current) onError("paint");
      reported.current = true;
      return;
    }
    const cam = camera.current;
    const { selected: chosen, hovered: pointed, lit: found, pins: pinned } = now.current;
    const centre = pointed || chosen;
    const near = centre ? neighbourIds(centre) : null;
    const dim = Boolean(centre || found);
    const at = new Map<string, Point>();
    for (const n of nodes.current) at.set(n.id, screenOf(n));

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = "round";

    // Edges, one path per style, so a thousand-file map is a handful of strokes.
    const buckets = new Map<string, Point[]>();
    for (const l of links.current) {
      const on = Boolean(centre) && (l.source.id === centre || l.target.id === centre);
      const both = found ? found.has(l.source.id) && found.has(l.target.id) : false;
      const key = `${l.kind}:${on ? "on" : both ? "lit" : dim ? "dim" : "base"}`;
      const list = buckets.get(key) ?? [];
      list.push(at.get(l.source.id)!, at.get(l.target.id)!);
      buckets.set(key, list);
    }
    const EDGE: Record<string, { colour: string; alpha: Record<string, number>; width: number; dash: number[] }> = {
      folder: { colour: pal.ink, alpha: { base: 0.16, dim: 0.06, lit: 0.3, on: 0.55 }, width: 0.8, dash: [] },
      reference: { colour: pal.ink, alpha: { base: 0.42, dim: 0.1, lit: 0.7, on: 0.95 }, width: 1, dash: [] },
      terms: { colour: pal.accent, alpha: { base: 0.34, dim: 0.08, lit: 0.6, on: 0.9 }, width: 1, dash: [3, 4] },
    };
    for (const [key, points] of buckets) {
      const [kind, state] = key.split(":");
      const style = EDGE[kind] ?? EDGE.reference;
      ctx.strokeStyle = state === "on" && kind !== "terms" ? pal.bright : style.colour;
      ctx.globalAlpha = style.alpha[state];
      ctx.lineWidth = state === "on" ? style.width + 0.8 : style.width;
      ctx.setLineDash(style.dash);
      ctx.beginPath();
      for (let i = 0; i < points.length; i += 2) {
        ctx.moveTo(points[i].x, points[i].y);
        ctx.lineTo(points[i + 1].x, points[i + 1].y);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Bloom under the dots, while there are few enough for it to read as
    // light rather than fog.
    if (nodes.current.length <= 400) {
      for (const n of nodes.current) {
        const isCentre = n.id === centre;
        const isNear = near?.has(n.id) ?? false;
        const quiet = dim && !isCentre && !isNear && !(found?.has(n.id) ?? false);
        if (n.kind !== "folder" && n.status !== "read" && !isCentre) continue;
        const sprite = bloom(isCentre || isNear ? pal.bright : n.kind === "folder" ? pal.accent : pal.ink, dpr);
        if (!sprite) break;
        const p = at.get(n.id)!;
        const R = Math.min(16, Math.max(2, nodeRadius(n) * cam.k)) * (isCentre ? 5 : 3.4);
        ctx.globalAlpha = quiet ? 0.05 : isCentre ? 0.55 : 0.2;
        ctx.drawImage(sprite, p.x - R, p.y - R, R * 2, R * 2);
      }
      ctx.globalAlpha = 1;
    }

    // Nodes. A file with text is a filled dot, one read for metadata only is
    // a ring, a folder is an accent dot with a halo: the legend is the drawing.
    for (const n of nodes.current) {
      const p = at.get(n.id)!;
      const r = Math.min(16, Math.max(2, nodeRadius(n) * cam.k));
      const isCentre = n.id === centre;
      const isNear = near?.has(n.id) ?? false;
      const isLit = found?.has(n.id) ?? false;
      const quiet = dim && !isCentre && !isNear && !isLit;
      ctx.globalAlpha = quiet ? 0.26 : 1;
      if (isCentre) {
        ctx.save();
        ctx.shadowColor = pal.accent;
        ctx.shadowBlur = 14;
        ctx.fillStyle = pal.bright;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 1, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ring(ctx, p, r + 6, pal.accent, 1.6);
      } else if (n.kind === "folder") {
        ctx.fillStyle = pal.accent;
        dot(ctx, p, r);
        ctx.globalAlpha *= 0.4;
        ring(ctx, p, r + 3.5, pal.accent, 1);
      } else if (n.status === "read") {
        ctx.fillStyle = isNear ? pal.bright : pal.ink;
        dot(ctx, p, r);
      } else {
        ctx.fillStyle = pal.ground;
        dot(ctx, p, r);
        ring(ctx, p, r - 0.7, isNear ? pal.bright : pal.ink, 1.4);
      }
      ctx.globalAlpha = 1;
      if (isLit && !isCentre) ring(ctx, p, r + 4.5, pal.accent, 1.5);
      if (pinned.has(n.id)) {
        ctx.setLineDash([2, 3]);
        ring(ctx, p, r + 8, pal.accent, 1);
        ctx.setLineDash([]);
      }
    }

    // Labels: the pointed-at node first, then its neighbours, the matches, the
    // folders, and every file once zoomed in, each placed only where it does
    // not land on one already placed. A label that would collide is left out
    // rather than printed over another: the reading line and the inspector
    // name whatever is chosen.
    const many = nodes.current.length > 150;
    const everything = !many && cam.k >= 1.35;
    const candidates: { n: SimNode; rank: number }[] = [];
    for (const n of nodes.current) {
      const rank =
        n.id === centre
          ? 0
          : near?.has(n.id) && near.size <= 40
            ? 1
            : found?.has(n.id) && found.size <= 60
              ? 2
              : n.kind === "folder"
                ? 3
                : everything
                  ? 4
                  : -1;
      if (rank >= 0) candidates.push({ n, rank });
    }
    candidates.sort((a, b) => a.rank - b.rank || b.n.degree - a.n.degree);
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    const clear = (box: { x: number; y: number; w: number; h: number }) =>
      placed.every((o) => box.x + box.w < o.x || o.x + o.w < box.x || box.y + box.h < o.y || o.y + o.h < box.y);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.lineJoin = "round";
    for (const { n, rank } of candidates) {
      const p = at.get(n.id)!;
      const r = Math.min(16, Math.max(2, nodeRadius(n) * cam.k));
      const folder = n.kind === "folder";
      const text = n.label.length > 30 ? `${n.label.slice(0, 28)}…` : n.label;
      const size = folder ? LABEL_PX + 1 : LABEL_PX;
      ctx.font = `${size}px ${face.current || "monospace"}`;
      const w = ctx.measureText(text).width;
      const box = { x: p.x - w / 2 - 3, y: p.y + r + 3, w: w + 6, h: size + 4 };
      if (rank > 0 && !clear(box)) continue;
      placed.push(box);
      ctx.globalAlpha = dim && rank > 2 ? 0.4 : 1;
      ctx.strokeStyle = pal.ground;
      ctx.lineWidth = 3.5;
      ctx.strokeText(text, p.x, p.y + r + 5);
      ctx.fillStyle = rank <= 1 ? pal.bright : folder || rank === 2 ? pal.accentBright : pal.ink;
      ctx.fillText(text, p.x, p.y + r + 5);
    }
    ctx.globalAlpha = 1;
  }

  /**
   * A soft disc of one colour, fading to nothing, drawn once per colour and
   * size and stamped under every dot: the bloom a phosphor dot has on glass.
   */
  function bloom(colour: string, dpr: number): HTMLCanvasElement | null {
    const key = `${colour}@${dpr}`;
    const cached = blooms.current.get(key);
    if (cached) return cached;
    const size = Math.round(64 * dpr);
    const sprite = document.createElement("canvas");
    sprite.width = sprite.height = size;
    const c = sprite.getContext("2d");
    if (!c) return null;
    // The gradient ends in the same colour at no alpha, so the fade never
    // passes through the grey a plain "transparent" stop would give it.
    c.fillStyle = colour;
    c.fillRect(0, 0, 1, 1);
    const [r, g, b] = c.getImageData(0, 0, 1, 1).data;
    c.clearRect(0, 0, 1, 1);
    const fade = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    fade.addColorStop(0, `rgba(${r}, ${g}, ${b}, 1)`);
    fade.addColorStop(0.35, `rgba(${r}, ${g}, ${b}, 0.35)`);
    fade.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    c.fillStyle = fade;
    c.fillRect(0, 0, size, size);
    blooms.current.set(key, sprite);
    return sprite;
  }

  function dot(ctx: CanvasRenderingContext2D, p: Point, r: number) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.5, r), 0, Math.PI * 2);
    ctx.fill();
  }

  function ring(ctx: CanvasRenderingContext2D, p: Point, r: number, colour: string, width: number) {
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.5, r), 0, Math.PI * 2);
    ctx.stroke();
  }

  /** The node and its neighbours by the links drawn now. */
  function neighbourIds(id: string): Set<string> {
    const out = new Set([id]);
    for (const l of links.current) {
      if (l.source.id === id) out.add(l.target.id);
      else if (l.target.id === id) out.add(l.source.id);
    }
    return out;
  }

  // ── the phosphor ─────────────────────────────────────────────────────

  function segment(g: CanvasRenderingContext2D, a: Point | null, b: Point, colour: string, width: number, alpha: number) {
    g.strokeStyle = colour;
    g.lineWidth = width;
    g.globalAlpha = alpha;
    g.beginPath();
    g.moveTo((a ?? b).x, (a ?? b).y);
    g.lineTo(b.x + (a ? 0 : 0.01), b.y);
    g.stroke();
  }

  function phosphor(time: number, trails: boolean) {
    const el = ghostRef.current;
    const g = el?.getContext("2d");
    const pal = palette.current;
    const { w, h, ghostDpr } = size.current;
    if (!el || !g || !pal || !w || !h) return;
    const elapsed = lastFrame.current ? time - lastFrame.current : 0;
    g.setTransform(ghostDpr, 0, 0, ghostDpr, 0, 0);
    g.lineCap = "round";
    // Decay: remove a share of what is there. Only alpha matters to
    // destination-out, so the colour is whichever token is to hand.
    if (!ghostQuiet.current) {
      g.globalCompositeOperation = "destination-out";
      g.globalAlpha = 1 - keep(halfLife(coarse.current), elapsed);
      g.fillStyle = pal.ground;
      g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = "source-over";
    }
    let deposited = false;

    // The beam, walking the links on show.
    const beam = walkBeam(time);
    if (beam) {
      segment(g, beam.a, beam.b, pal.bright, 2.2, 0.95);
      deposited = true;
    }

    // Pings: pointing at a node sends one pulse down each of its links.
    for (const p of pings.current) {
      if (p.start < 0) p.start = time;
      const a = byId.current.get(p.from),
        b = byId.current.get(p.to);
      if (!a || !b) continue;
      const here = lerp(screenOf(a), screenOf(b), smooth(clamp01((time - p.start) / p.dur)));
      segment(g, p.last, here, pal.accentBright, 1.8, 0.85);
      p.last = here;
      deposited = true;
    }
    pings.current = pings.current.filter((p) => time - p.start < p.dur);

    // Trails: while a hand is on the map or it is still settling, whatever
    // moved on the glass leaves its ghost. Batched into one path per colour
    // and width, so a thousand moving dots are a handful of strokes.
    const seen = lastSeen.current;
    let budget = MAX_TRAILS;
    const dragged = held.current?.node?.id;
    const batches = new Map<string, { colour: string; width: number; alpha: number; path: Point[] }>();
    for (const n of nodes.current) {
      const p = screenOf(n);
      const was = seen.get(n.id);
      seen.set(n.id, p);
      if (!trails || !was || budget <= 0) continue;
      if (Math.abs(p.x - was.x) + Math.abs(p.y - was.y) < 0.6) continue;
      budget--;
      const r = Math.min(16, Math.max(2, nodeRadius(n) * camera.current.k));
      const mine = n.id === dragged;
      const colour = mine ? pal.bright : n.kind === "folder" ? pal.accent : pal.ink;
      const width = Math.round(r * 1.6);
      const key = `${colour}|${width}|${mine}`;
      const batch = batches.get(key) ?? { colour, width, alpha: mine ? 0.5 : 0.22, path: [] };
      batch.path.push(was, p);
      batches.set(key, batch);
    }
    for (const b of batches.values()) {
      g.strokeStyle = b.colour;
      g.lineWidth = b.width;
      g.globalAlpha = b.alpha;
      g.beginPath();
      for (let i = 0; i < b.path.length; i += 2) {
        g.moveTo(b.path[i].x, b.path[i].y);
        g.lineTo(b.path[i + 1].x + 0.01, b.path[i + 1].y);
      }
      g.stroke();
      deposited = true;
    }
    g.globalAlpha = 1;

    // A ghost nobody has fed for eight half-lives is cleared outright, and
    // then left alone: 8-bit alpha decayed by a fraction never quite reaches
    // zero, and fading an empty canvas every frame is work for nothing.
    if (deposited) {
      quietFor.current = 0;
      ghostQuiet.current = false;
    } else if (!ghostQuiet.current) {
      quietFor.current += elapsed;
      if (quietFor.current > halfLife(coarse.current) * 8) {
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, el.width, el.height);
        ghostQuiet.current = true;
      }
    }
  }

  /** Advance the beam; the segment it covered this frame, or null. */
  function walkBeam(time: number): { a: Point | null; b: Point } | null {
    let current = hop.current;
    if (!current || time >= current.start + current.dur) {
      const from = current?.from ?? null;
      const at = current?.to ?? startNode();
      const next = at ? nextStop(adj.current, at, from, random.current) : null;
      const a = at ? byId.current.get(at) : undefined;
      const b = next ? byId.current.get(next) : undefined;
      if (!a || !b || !next || !at) {
        hop.current = null;
        return null;
      }
      const sa = screenOf(a),
        sb = screenOf(b);
      current = { from: at, to: next, start: time, dur: pulseDuration(Math.hypot(sb.x - sa.x, sb.y - sa.y)), last: sa };
      hop.current = current;
    }
    const a = byId.current.get(current.from),
      b = byId.current.get(current.to);
    if (!a || !b) {
      hop.current = null;
      return null;
    }
    const here = lerp(screenOf(a), screenOf(b), clamp01((time - current.start) / current.dur));
    const seg = { a: current.last, b: here };
    current.last = here;
    return seg;
  }

  function startNode(): string | null {
    const ids = [...adj.current.keys()].filter((id) => byId.current.has(id));
    if (!ids.length) return null;
    return ids[Math.floor(random.current() * ids.length)];
  }

  // ── the frame ────────────────────────────────────────────────────────

  function frame(time: number) {
    const s = sim.current;
    let settling = false;
    if (s && s.alpha() > ALPHA_LIVE) {
      s.tick();
      settling = true;
      dirty.current = true;
    }
    const e = ease.current;
    if (e) {
      if (e.start < 0) e.start = time;
      const t = smooth(clamp01((time - e.start) / EASE_MS));
      camera.current = {
        k: e.from.k + (e.to.k - e.from.k) * t,
        x: e.from.x + (e.to.x - e.from.x) * t,
        y: e.from.y + (e.to.y - e.from.y) * t,
      };
      if (t >= 1) ease.current = null;
      dirty.current = true;
    }
    if (dirty.current) paint();
    phosphor(time, settling || Boolean(held.current) || Boolean(pinch.current));
    lastFrame.current = time;
  }
  const frameRef = useRef(frame);
  frameRef.current = frame;

  /** Move the camera: eased over a third of a second with motion, at once without. */
  function moveTo(to: Camera) {
    if (now.current.reducedMotion || !live.current) {
      ease.current = null;
      camera.current = to;
      requestPaint();
    } else {
      ease.current = { from: { ...camera.current }, to, start: -1 };
      dirty.current = true;
    }
  }

  function fit(eased = false) {
    const bounds = boundsOf(nodes.current.map((n) => ({ x: n.x ?? 0, y: n.y ?? 0 })));
    if (!bounds || !size.current.w) return;
    const to = fitCamera(bounds, safeRect());
    if (eased) moveTo(to);
    else {
      ease.current = null;
      camera.current = to;
      requestPaint();
    }
  }

  function zoom(factor: number, sx?: number, sy?: number) {
    const safe = safeRect();
    ease.current = null;
    camera.current = zoomAt(camera.current, factor, sx ?? safe.x + safe.w / 2, sy ?? safe.y + safe.h / 2);
    requestPaint();
  }

  useImperativeHandle(ref, () => ({
    fit: () => fit(true),
    zoom: (factor: number) => zoom(factor),
    image: () =>
      new Promise<Blob | null>((resolve) => {
        const source = canvasRef.current;
        const pal = palette.current ?? readPalette();
        if (!source || !pal) return resolve(null);
        paint();
        const out = document.createElement("canvas");
        out.width = source.width;
        out.height = source.height;
        const c = out.getContext("2d");
        if (!c) return resolve(null);
        c.fillStyle = pal.ground;
        c.fillRect(0, 0, out.width, out.height);
        c.drawImage(source, 0, 0);
        out.toBlob((blob) => resolve(blob), "image/png");
      }),
  }));

  // ── effects ──────────────────────────────────────────────────────────

  /* Measure before the first paint, so the map is on the glass in the same
     frame the server's picture leaves it; then follow every resize. */
  useLayoutEffect(() => {
    const el = canvasRef.current;
    const ghost = ghostRef.current;
    if (!el || !ghost) return;
    coarse.current = window.matchMedia("(pointer: coarse)").matches;
    // The server drew both shapes and CSS showed this one; lay out the same.
    shape.current = window.matchMedia(SHAPE_QUERY).matches ? "tall" : "wide";
    const measure = () => {
      const r = el.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      // The ghost is soft by nature; a phone draws it at one pixel per point.
      const ghostDpr = coarse.current ? 1 : dpr;
      const old = size.current;
      size.current = { w: r.width, h: r.height, dpr, ghostDpr };
      el.width = Math.max(1, Math.round(r.width * dpr));
      el.height = Math.max(1, Math.round(r.height * dpr));
      ghost.width = Math.max(1, Math.round(r.width * ghostDpr));
      ghost.height = Math.max(1, Math.round(r.height * ghostDpr));
      lastSeen.current.clear();
      return old;
    };
    measure();
    const observer = new ResizeObserver(() => {
      const old = measure();
      if (!old.w) {
        fit();
        return;
      }
      camera.current = {
        ...camera.current,
        x: camera.current.x + (size.current.w - old.w) / 2,
        y: camera.current.y + (size.current.h - old.h) / 2,
      };
      paint();
    });
    observer.observe(el);

    const wheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || engagedRef.current)) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoom(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
    };
    // Claimed before the browser decides to scroll: a finger on a node drags
    // the node, two fingers pinch the map, anything else is the page's.
    const touch = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        e.preventDefault();
        return;
      }
      const t = e.touches[0];
      const r = el.getBoundingClientRect();
      if (t && hitNode(nodes.current, camera.current, t.clientX - r.left, t.clientY - r.top, SLOP.touch)) e.preventDefault();
    };
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("touchstart", touch, { passive: false });
    return () => {
      observer.disconnect();
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("touchstart", touch);
    };
  }, []);

  /* The scene: rebuilt when the map, the links on show, focus or motion
     changes. A new map arrives laid out (a small one completely, which is the
     picture the server drew); a changed view of the same map moves there on
     screen, or at once under reduced motion. */
  const focusKey = focus ? selected : "";
  useLayoutEffect(() => {
    const only = focusKey ? neighbourhood(graph, focusKey, kinds) : null;
    const same = shownGraph.current === graph;
    const previous = same
      ? new Map(nodes.current.map((n) => [n.id, { x: n.x, y: n.y, fx: n.fx, fy: n.fy }]))
      : new Map();
    const scene = sceneOf(graph, kinds, only, previous);
    const s = simulate(scene.nodes, scene.links, scene.nodes.length, shape.current);
    if (!same) s.tick(pretick(scene.nodes.length, reducedMotion));
    else if (reducedMotion) s.tick(SETTLE_TICKS);
    else s.alpha(0.45);
    for (const n of scene.nodes) {
      if (now.current.pins.has(n.id) && n.fx == null) {
        n.fx = n.x;
        n.fy = n.y;
      }
    }
    sim.current = s;
    nodes.current = scene.nodes;
    links.current = scene.links;
    byId.current = new Map(scene.nodes.map((n) => [n.id, n]));
    // The beam walks what is drawn, so in focus it stays inside the neighbourhood.
    adj.current = adjacency(
      scene.links.map((l) => ({ source: l.source.id, target: l.target.id, kind: l.kind })),
      kinds,
    );
    hop.current = null;
    pings.current = [];
    lastSeen.current.clear();
    const refit = !same || Boolean(only) !== Boolean(fitFocus.current);
    fitFocus.current = only ? focusKey : "";
    shownGraph.current = graph;
    if (refit) fit(same);
    else requestPaint();
    return () => {
      s.stop();
    };
    // `kinds` is compared by value: the parent builds a fresh array on every change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, kinds.join(","), focusKey, reducedMotion]);

  /* Pins: a pinned node stays where it is put, including after a drag. */
  useEffect(() => {
    let changed = false;
    for (const n of nodes.current) {
      const want = pins.has(n.id);
      if (want && n.fx == null) {
        n.fx = n.x;
        n.fy = n.y;
        changed = true;
      } else if (!want && n.fx != null && held.current?.node !== n) {
        n.fx = null;
        n.fy = null;
        changed = true;
      }
    }
    if (changed && !reducedMotion) sim.current?.alpha(Math.max(sim.current.alpha(), 0.12));
    requestPaint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins]);

  /* Whatever is pointed at, chosen or found is drawn lit. */
  useEffect(() => {
    requestPaint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, hovered, lit]);

  /* A theme change repaints in the new phosphor. */
  useEffect(() => {
    palette.current = null;
    blooms.current.clear();
    requestPaint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.theme]);

  /* Pointing at a node sends a pulse down each of its links. */
  useEffect(() => {
    if (!hovered || reducedMotion) return;
    pings.current = [...neighbourIds(hovered)]
      .filter((id) => id !== hovered)
      .slice(0, MAX_PINGS)
      .map((to) => {
        const a = byId.current.get(hovered),
          b = byId.current.get(to);
        const len = a && b ? Math.hypot(screenOf(a).x - screenOf(b).x, screenOf(a).y - screenOf(b).y) : 100;
        return { from: hovered, to, start: -1, dur: pulseDuration(len) * 0.7, last: null };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hovered, reducedMotion]);

  /* A chosen node is brought into the part of the map the inspector leaves open. */
  useEffect(() => {
    if (!selected) return;
    const n = byId.current.get(selected);
    if (!n) return;
    const open = openRect();
    const p = screenOf(n);
    const inside = p.x > open.x + 24 && p.x < open.x + open.w - 24 && p.y > open.y + 24 && p.y < open.y + open.h - 24;
    if (!inside) moveTo(centreOn(camera.current, { x: n.x ?? 0, y: n.y ?? 0 }, open));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  /* The one frame clock, subscribed only while the map is on screen, never
     under reduced motion. Off screen it costs nothing. */
  useEffect(() => {
    const el = canvasRef.current;
    if (reducedMotion || !el) return;
    let stop: (() => void) | null = null;
    const seen = new IntersectionObserver((entries) => {
      const on = entries.some((entry) => entry.isIntersecting);
      if (on && !stop) {
        lastFrame.current = 0;
        stop = onFrame((time) => frameRef.current(time));
        live.current = true;
      } else if (!on && stop) {
        stop();
        stop = null;
        live.current = false;
        ease.current = null;
      }
    });
    seen.observe(el);
    return () => {
      seen.disconnect();
      stop?.();
      live.current = false;
      const ghost = ghostRef.current;
      ghost?.getContext("2d")?.clearRect(0, 0, ghost.width, ghost.height);
    };
  }, [onFrame, reducedMotion]);

  // ── the hand ─────────────────────────────────────────────────────────

  function local(e: ReactPointerEvent<HTMLCanvasElement>): Point {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function point(id: string) {
    if (hoverRef.current === id) return;
    hoverRef.current = id;
    onHover(id);
  }

  function onPointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), mid: lerp(a, b, 0.5) };
      release(held.current);
      held.current = null;
      return;
    }
    const touch = e.pointerType !== "mouse";
    const node = hitNode(nodes.current, camera.current, p.x, p.y, touch ? SLOP.touch : SLOP.mouse);
    held.current = { id: e.pointerId, x: p.x, y: p.y, node, moved: false, touch };
  }

  function onPointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    const p = local(e);
    if (!pointers.current.has(e.pointerId)) {
      if (e.pointerType === "mouse") point(hitNode(nodes.current, camera.current, p.x, p.y, SLOP.mouse)?.id ?? "");
      return;
    }
    pointers.current.set(e.pointerId, p);
    const two = pinch.current;
    if (two && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = lerp(a, b, 0.5);
      const next = zoomAt(camera.current, d / Math.max(1, two.d), mid.x, mid.y);
      camera.current = { ...next, x: next.x + mid.x - two.mid.x, y: next.y + mid.y - two.mid.y };
      pinch.current = { d, mid };
      ease.current = null;
      requestPaint();
      return;
    }
    const hand = held.current;
    if (!hand || hand.id !== e.pointerId) return;
    const dx = p.x - hand.x,
      dy = p.y - hand.y;
    if (!hand.moved && Math.abs(dx) + Math.abs(dy) < (hand.touch ? DRAG_PX.touch : DRAG_PX.mouse)) return;
    if (!hand.moved) {
      hand.moved = true;
      setGrabbing(hand.node ? "node" : "map");
    }
    hand.x = p.x;
    hand.y = p.y;
    if (hand.node) {
      const cam = camera.current;
      hand.node.fx = hand.node.x = (p.x - cam.x) / cam.k;
      hand.node.fy = hand.node.y = (p.y - cam.y) / cam.k;
      if (!now.current.reducedMotion) sim.current?.alphaTarget(0.3).alpha(Math.max(sim.current.alpha(), 0.3));
    } else {
      ease.current = null;
      camera.current = { ...camera.current, x: camera.current.x + dx, y: camera.current.y + dy };
    }
    requestPaint();
  }

  /** Let go of a node: it stays put if pinned, and settles into place without motion. */
  function release(hand: Held | null) {
    const n = hand?.node;
    if (!n) return;
    if (!now.current.pins.has(n.id)) {
      n.fx = null;
      n.fy = null;
    }
    const s = sim.current;
    s?.alphaTarget(0);
    if (hand.moved && now.current.reducedMotion && s) {
      s.alpha(0.3);
      s.tick(90);
      requestPaint();
    }
  }

  function onPointerUp(e: ReactPointerEvent<HTMLCanvasElement>) {
    pointers.current.delete(e.pointerId);
    if (pinch.current) {
      if (pointers.current.size < 2) pinch.current = null;
      return;
    }
    const hand = held.current;
    if (!hand || hand.id !== e.pointerId) return;
    held.current = null;
    setGrabbing("");
    release(hand);
    if (!hand.moved) onSelect(hand.node?.id ?? "");
  }

  function onPointerCancel(e: ReactPointerEvent<HTMLCanvasElement>) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (held.current?.id === e.pointerId) {
      release(held.current);
      held.current = null;
      setGrabbing("");
    }
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLCanvasElement>) {
    const step = 48;
    const pan: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    if (pan[e.key]) {
      e.preventDefault();
      ease.current = null;
      camera.current = { ...camera.current, x: camera.current.x + pan[e.key][0], y: camera.current.y + pan[e.key][1] };
      requestPaint();
    } else if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      zoom(1.2);
    } else if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      zoom(1 / 1.2);
    } else if (e.key === "0") {
      e.preventDefault();
      fit(true);
    } else if (e.key === "Escape" && now.current.selected) {
      e.preventDefault();
      onSelect("");
    }
  }

  return (
    <div className="atlas-glass">
      <canvas
        ref={canvasRef}
        className="atlas-canvas"
        tabIndex={0}
        aria-label={label}
        data-grab={grabbing || undefined}
        data-point={hovered ? "" : undefined}
        data-lenis-prevent-wheel={engaged ? "" : undefined}
        onFocus={() => {
          engagedRef.current = true;
          setEngaged(true);
        }}
        onBlur={() => {
          engagedRef.current = false;
          setEngaged(false);
        }}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse" && !held.current) point("");
        }}
      />
      <canvas ref={ghostRef} className="atlas-ghost" aria-hidden="true" />
    </div>
  );
}
