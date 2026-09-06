"use client";
import { studioLabels } from "@/content/studio/labels";
const ui = studioLabels.GraphCanvas;
import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
  type Simulation,
} from "d3-force";
import { useSystem } from "@/components/system/SystemProvider";
import type { AtlasGraph, AtlasNode } from "@/lib/studio/graph";
import { studioCopy } from "@/content/studio/copy";
import { Button, download } from "@/components/lab/shared";
import { Toggle, Range } from "./Furniture";
type Node = AtlasNode & SimulationNodeDatum;
const c = studioCopy.atlas;
export default function GraphCanvas({
  graph,
  selected,
  onSelect,
  focus,
  kinds,
}: {
  graph: AtlasGraph;
  selected: string;
  onSelect: (id: string) => void;
  focus: boolean;
  kinds: string[];
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    simulation = useRef<Simulation<Node, undefined> | null>(null),
    nodes = useRef<Node[]>([]),
    edges = useRef<{ source: Node; target: Node; kind: string }[]>([]),
    camera = useRef({ x: 0, y: 0, k: 1 }),
    size = useRef({ w: 800, h: 560 }),
    dirty = useRef(true),
    visible = useRef(true),
    held = useRef<{
      id: number;
      x: number;
      y: number;
      node?: Node;
      moved: boolean;
      wasPinned: boolean;
    } | null>(null),
    pointers = useRef(new Map<number, { x: number; y: number }>()),
    pinch = useRef(0);
  const { onFrame, reducedMotion } = useSystem(),
    [paused, setPaused] = useState(false),
    [spacing, setSpacing] = useState(100),
    [pinned, setPinned] = useState(false),
    [counts, setCounts] = useState({ nodes: 0, links: 0 }),
    [fullscreen, setFullscreen] = useState(false),
    [canFullscreen, setCanFullscreen] = useState(false),
    [screenError, setScreenError] = useState(""),
    selectedRef = useRef(selected),
    pausedRef = useRef(paused);
  selectedRef.current = selected;
  pausedRef.current = paused;
  useEffect(() => {
    setCanFullscreen(Boolean(document.fullscreenEnabled));
    const changed = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, []);
  function fit() {
    const ns = nodes.current;
    if (!ns.length) return;
    const minX = Math.min(...ns.map((n) => n.x ?? 0)),
      maxX = Math.max(...ns.map((n) => n.x ?? 0)),
      minY = Math.min(...ns.map((n) => n.y ?? 0)),
      maxY = Math.max(...ns.map((n) => n.y ?? 0));
    camera.current = {
      k: Math.max(
        0.08,
        Math.min(
          1.8,
          Math.min(
            size.current.w / (maxX - minX + 140),
            size.current.h / (maxY - minY + 140),
          ),
        ),
      ),
      x: 0,
      y: 0,
    };
    camera.current.x =
      size.current.w / 2 - ((minX + maxX) / 2) * camera.current.k;
    camera.current.y =
      size.current.h / 2 - ((minY + maxY) / 2) * camera.current.k;
    dirty.current = true;
  }
  useEffect(() => {
    const ids = new Set([
      selected,
      ...graph.links
        .filter((l) => l.source === selected || l.target === selected)
        .flatMap((l) => [l.source, l.target]),
    ]);
    const previous = new Map(nodes.current.map((n) => [n.id, n])),
      next = graph.nodes
        .filter((n) => !focus || ids.has(n.id))
        .map((n) => ({
          ...n,
          ...(previous.get(n.id)
            ? {
                x: previous.get(n.id)!.x,
                y: previous.get(n.id)!.y,
                fx: previous.get(n.id)!.fx,
                fy: previous.get(n.id)!.fy,
              }
            : {}),
        })),
      byId = new Map(next.map((n) => [n.id, n]));
    const links = graph.links
      .filter(
        (l) =>
          kinds.includes(l.kind) && byId.has(l.source) && byId.has(l.target),
      )
      .map((l) => ({
        source: byId.get(l.source)!,
        target: byId.get(l.target)!,
        kind: l.kind,
      }));
    const sim = forceSimulation<Node>(next)
      .stop()
      .force("charge", forceManyBody().strength(-70).distanceMax(650))
      .force(
        "link",
        forceLink<Node, (typeof links)[number]>(links)
          .distance(spacing)
          .strength(0.16),
      )
      .force("centre", forceCenter(0, 0).strength(0.04))
      .force(
        "collision",
        forceCollide<Node>((n) => (n.kind === "folder" ? 22 : 12)),
      )
      .alphaDecay(0.035)
      .velocityDecay(0.35);
    nodes.current = next;
    edges.current = links;
    simulation.current = sim;
    setCounts({ nodes: next.length, links: links.length });
    sim.tick(reducedMotion ? 180 : 45);
    dirty.current = true;
    fit();
    return () => {
      sim.stop();
      simulation.current = null;
    };
  }, [
    graph,
    focus,
    focus ? selected : "",
    kinds.join(","),
    spacing,
    reducedMotion,
  ]);
  useEffect(() => {
    dirty.current = true;
    setPinned(
      Boolean(nodes.current.find((n) => n.id === selected)?.fx != null),
    );
  }, [selected]);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const observer = new ResizeObserver(([e]) => {
      const old = size.current;
      size.current = { w: e.contentRect.width, h: e.contentRect.height };
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      el.width = Math.round(size.current.w * dpr);
      el.height = Math.round(size.current.h * dpr);
      camera.current.x += (size.current.w - old.w) / 2;
      camera.current.y += (size.current.h - old.h) / 2;
      dirty.current = true;
    });
    observer.observe(el);
    const intersection = new IntersectionObserver(([e]) => {
      visible.current = e.isIntersecting;
      if (e.isIntersecting) dirty.current = true;
    });
    intersection.observe(el);
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoom(Math.exp(-e.deltaY * 0.001), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      observer.disconnect();
      intersection.disconnect();
      el.removeEventListener("wheel", wheel);
    };
  }, []);
  useEffect(
    () =>
      onFrame(() => {
        if (!visible.current || document.hidden) return;
        const sim = simulation.current;
        if (
          sim &&
          !pausedRef.current &&
          !reducedMotion &&
          sim.alpha() > 0.005
        ) {
          sim.tick();
          dirty.current = true;
        }
        if (!dirty.current) return;
        dirty.current = false;
        const el = canvas.current,
          ctx = el?.getContext("2d");
        if (!el || !ctx) return;
        const { w, h } = size.current,
          dpr = el.width / w,
          { x, y, k } = camera.current,
          style = getComputedStyle(el),
          green = style.getPropertyValue("--green-bright").trim() || "#8fffad",
          amber = style.getPropertyValue("--amber").trim() || "#ffb000";
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        ctx.translate(x, y);
        ctx.scale(k, k);
        for (const edge of edges.current) {
          const active =
            edge.source.id === selectedRef.current ||
            edge.target.id === selectedRef.current;
          ctx.strokeStyle = edge.kind === "terms" ? amber : green;
          ctx.globalAlpha = active
            ? 0.75
            : edge.kind === "folder"
              ? 0.12
              : 0.22;
          ctx.lineWidth = (active ? 1.6 : 0.7) / k;
          ctx.setLineDash(edge.kind === "terms" ? [3 / k, 4 / k] : []);
          ctx.beginPath();
          ctx.moveTo(edge.source.x ?? 0, edge.source.y ?? 0);
          ctx.lineTo(edge.target.x ?? 0, edge.target.y ?? 0);
          ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        for (const n of nodes.current) {
          const active = n.id === selectedRef.current,
            r = n.kind === "folder" ? 9 : Math.min(8, 4 + Math.sqrt(n.degree));
          ctx.fillStyle = n.kind === "folder" ? amber : green;
          ctx.globalAlpha = selectedRef.current && !active ? 0.65 : 1;
          ctx.beginPath();
          ctx.arc(n.x ?? 0, n.y ?? 0, r, 0, Math.PI * 2);
          ctx.fill();
          if (active || n.fx != null) {
            ctx.strokeStyle = amber;
            ctx.lineWidth = 1.5 / k;
            ctx.beginPath();
            ctx.arc(n.x ?? 0, n.y ?? 0, r + 6 / k, 0, Math.PI * 2);
            ctx.stroke();
          }
          if (
            active ||
            (k > 0.48 && nodes.current.length < 100) ||
            n.kind === "folder"
          ) {
            ctx.globalAlpha = active ? 1 : 0.72;
            ctx.font = `${12 / k}px monospace`;
            ctx.textAlign = "center";
            ctx.fillText(
              n.label.length > 30 ? n.label.slice(0, 28) + "…" : n.label,
              n.x ?? 0,
              (n.y ?? 0) + r + 17 / k,
            );
          }
        }
        ctx.globalAlpha = 1;
      }),
    [onFrame, reducedMotion],
  );
  function zoom(
    factor: number,
    x = size.current.w / 2,
    y = size.current.h / 2,
  ) {
    const c = camera.current,
      k = Math.max(0.06, Math.min(6, c.k * factor)),
      ratio = k / c.k;
    c.x = x - (x - c.x) * ratio;
    c.y = y - (y - c.y) * ratio;
    c.k = k;
    dirty.current = true;
  }
  function point(e: PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function hit(x: number, y: number) {
    const c = camera.current;
    return [...nodes.current]
      .reverse()
      .find(
        (n) =>
          Math.hypot(
            (n.x ?? 0) - (x - c.x) / c.k,
            (n.y ?? 0) - (y - c.y) / c.k,
          ) < Math.max(10, 18 / c.k),
      );
  }
  return (
    <div className="atlas-stage">
      <div className="studio-toolbar">
        <Button onClick={fit}>{c.fit}</Button>
        {canFullscreen && (
          <Button
            onClick={async () => {
              try {
                setScreenError("");
                if (document.fullscreenElement) await document.exitFullscreen();
                else
                  await canvas.current
                    ?.closest<HTMLElement>(".atlas-workspace")
                    ?.requestFullscreen();
              } catch {
                setScreenError(
                  "Fullscreen is unavailable in this browser window.",
                );
              }
            }}
          >
            {fullscreen ? "Exit fullscreen" : "Fullscreen"}
          </Button>
        )}
        <Button onClick={() => zoom(1.25)}>+</Button>
        <Button onClick={() => zoom(0.8)}>−</Button>
        {reducedMotion ? <span className="studio-badge">{c.reduced}</span> : <Toggle active={paused} onClick={() => setPaused(!paused)}>
          {paused ? c.resume : c.pause}
        </Toggle>}
        <Button
          disabled={!selected}
          onClick={() => {
            const n = nodes.current.find((n) => n.id === selected);
            if (n) {
              if (n.fx != null) {
                n.fx = null;
                n.fy = null;
              } else {
                n.fx = n.x;
                n.fy = n.y;
              }
              setPinned(n.fx != null);
              simulation.current?.alpha(0.3);
              dirty.current = true;
            }
          }}
        >
          {pinned ? c.unpin : c.pin}
        </Button>
        <Button
          onClick={() => {
            const source=canvas.current;if(!source)return;
            const output=document.createElement("canvas");output.width=source.width;output.height=source.height;
            const context=output.getContext("2d");if(!context){setScreenError(c.exportError);return;}
            context.fillStyle=getComputedStyle(source).getPropertyValue("--bg").trim()||"#09140f";
            context.fillRect(0,0,output.width,output.height);context.drawImage(source,0,0);
            output.toBlob(blob=>{if(blob)download("atlas-map.png",blob);else setScreenError(c.exportError);});
          }}
        >
          {c.image}
        </Button>
      </div>
      {screenError && (
        <p role="alert" className="studio-note">
          {screenError}
        </p>
      )}
      <canvas
        ref={canvas}
        className="atlas-canvas"
        tabIndex={0}
        aria-label={ui.interactiveFileGraphUseTheFileList}
        onKeyDown={(e) => {
          if (
            [
              "ArrowLeft",
              "ArrowRight",
              "ArrowUp",
              "ArrowDown",
              "+",
              "=",
              "-",
              "0",
            ].includes(e.key)
          ) {
            e.preventDefault();
            if (e.key === "0") fit();
            else if (e.key === "+" || e.key === "=") zoom(1.2);
            else if (e.key === "-") zoom(0.8);
            else {
              camera.current.x +=
                e.key === "ArrowLeft" ? 40 : e.key === "ArrowRight" ? -40 : 0;
              camera.current.y +=
                e.key === "ArrowUp" ? 40 : e.key === "ArrowDown" ? -40 : 0;
              dirty.current = true;
            }
          }
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          const p = point(e);
          pointers.current.set(e.pointerId, p);
          if (pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()];
            pinch.current = Math.hypot(a.x - b.x, a.y - b.y);
            if (held.current?.node && !held.current.wasPinned) {
              held.current.node.fx = null;
              held.current.node.fy = null;
            }
            held.current = null;
            return;
          }
          const n = hit(p.x, p.y);
          held.current = {
            id: e.pointerId,
            ...p,
            node: n,
            moved: false,
            wasPinned: n?.fx != null,
          };
          if (n) onSelect(n.id);
        }}
        onPointerMove={(e) => {
          const p = point(e);
          if (!pointers.current.has(e.pointerId)) return;
          pointers.current.set(e.pointerId, p);
          if (pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()],
              d = Math.hypot(a.x - b.x, a.y - b.y);
            if (pinch.current)
              zoom(d / pinch.current, (a.x + b.x) / 2, (a.y + b.y) / 2);
            pinch.current = d;
            return;
          }
          const heldNow = held.current;
          if (!heldNow) return;
          const dx = p.x - heldNow.x,
            dy = p.y - heldNow.y;
          heldNow.moved ||= Math.abs(dx) + Math.abs(dy) > 2;
          heldNow.x = p.x;
          heldNow.y = p.y;
          if (heldNow.node) {
            heldNow.node.fx = (p.x - camera.current.x) / camera.current.k;
            heldNow.node.fy = (p.y - camera.current.y) / camera.current.k;
            heldNow.node.x = heldNow.node.fx;
            heldNow.node.y = heldNow.node.fy;
            simulation.current?.alpha(0.45);
          } else {
            camera.current.x += dx;
            camera.current.y += dy;
          }
          dirty.current = true;
        }}
        onPointerUp={(e) => {
          pointers.current.delete(e.pointerId);
          const n = held.current?.node;
          if (n && !held.current?.wasPinned) {
            n.fx = null;
            n.fy = null;
          }
          if(n)setPinned(n.fx!=null);
          held.current = null;
          pinch.current = 0;
        }}
        onPointerCancel={(e) => {
          pointers.current.delete(e.pointerId);
          if (held.current?.node && !held.current.wasPinned) {
            held.current.node.fx = null;
            held.current.node.fy = null;
          }
          held.current = null;
          pinch.current = 0;
        }}
      />
      <div className="atlas-stage-foot">
        <span>
          {counts.nodes}
          {ui.nodes}
          {counts.links}
          {ui.visibleConnections}
        </span>
        <Range
          label={c.spread}
          min={40}
          max={180}
          value={spacing}
          onChange={setSpacing}
        />
      </div>
    </div>
  );
}
