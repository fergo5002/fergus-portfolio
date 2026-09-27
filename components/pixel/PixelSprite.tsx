import { pixelRuns, type PixelSprite as Sprite } from "@/lib/pixel";
import "./pixel.css";

/**
 * A pixel sprite as an SVG of integer rectangles. Server-rendered and purely
 * decorative: it carries no words, so it is hidden from assistive technology
 * and gives a text extractor nothing to read.
 *
 * The frames sit on top of the base and alternate by CSS alone (`pixel.css`),
 * which also freezes them on frame 0 under reduced motion.
 */
export default function PixelSprite({ sprite, className = "" }: { sprite: Sprite; className?: string }) {
  const width = sprite.base[0]?.length ?? 0;
  const height = sprite.base.length;
  const draw = (grid: readonly string[]) =>
    pixelRuns(grid).map((r) => <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={r.w} height={1} className={`pixel__${r.tone}`} />);
  return (
    <svg
      className={`pixel ${className}`.trim()}
      viewBox={`0 0 ${width} ${height}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      <g>{draw(sprite.base)}</g>
      {sprite.frames.map((frame, i) => (
        <g key={i} className={`pixel__frame pixel__frame--${i}`}>
          {draw(frame)}
        </g>
      ))}
    </svg>
  );
}
