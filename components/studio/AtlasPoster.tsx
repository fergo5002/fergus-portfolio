import { atlasCopy } from "@/content/studio/atlas-copy";
import { atlasExample } from "@/content/studio/atlas";
import { buildGraph, type AtlasGraph } from "@/lib/studio/graph";
import { DEFAULT_KINDS, layoutGraph, type Shape } from "@/lib/studio/atlas-scene";
import { WORLD_PAD, boundsOf, nodeRadius, viewBoxFor } from "@/lib/studio/atlas-camera";

/**
 * The example map, drawn by the server as SVG, so the first paint of
 * `/tools/atlas` is the map and not a loading line. Hydration lands seconds
 * after first paint on this site (AGENTS.md, "Animate only what the visitor
 * has not seen"), and the studios render nothing until then.
 *
 * It is the layout the canvas will draw (`layoutGraph`, deterministic,
 * settled) in the same box, framed by `viewBoxFor`, which is `fitCamera` as a
 * viewBox, so the live map takes over without a jump. It is drawn twice, wide
 * and tall, and `tool.css` shows the one `SHAPE_QUERY` picks, the same query
 * the canvas asks. It holds the stage's shape, strip included, and nothing a
 * visitor could press: controls appear with their handlers. It carries no
 * words: file names in the server HTML would sit in front of the page's own
 * sentences for every crawler.
 *
 * A server component, passed into `AtlasStudio` as a prop, so the layout runs
 * at build time and never in the browser.
 */
export default function AtlasPoster() {
  const graph = buildGraph(atlasExample);
  return (
    <div className="atlas atlas--poster">
      <div className="atlas-stage">
        <div className="atlas-graph">
          <Picture graph={graph} shape="wide" />
          <Picture graph={graph} shape="tall" />
        </div>
        <div className="atlas-strip" aria-hidden="true" />
      </div>
    </div>
  );
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function Picture({ graph, shape }: { graph: AtlasGraph; shape: Shape }) {
  const at = layoutGraph(graph, DEFAULT_KINDS, shape);
  const bounds = boundsOf([...at.values()]) ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return (
    <svg
      className={`atlas-poster atlas-poster--${shape}`}
      viewBox={viewBoxFor(bounds, WORLD_PAD)}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={atlasCopy.poster}
    >
      {graph.links.map((l) => {
        const a = at.get(l.source)!,
          b = at.get(l.target)!;
        return (
          <line
            key={`${l.kind}:${l.source}:${l.target}`}
            className={`atlas-poster__link atlas-poster__link--${l.kind}`}
            x1={r2(a.x)}
            y1={r2(a.y)}
            x2={r2(b.x)}
            y2={r2(b.y)}
          />
        );
      })}
      {graph.nodes.map((n) => {
        const p = at.get(n.id)!;
        const kind = n.kind === "folder" ? "folder" : n.status === "read" ? "read" : "metadata";
        return (
          <circle
            key={n.id}
            className={`atlas-poster__node atlas-poster__node--${kind}`}
            cx={r2(p.x)}
            cy={r2(p.y)}
            r={nodeRadius(n)}
          />
        );
      })}
    </svg>
  );
}
