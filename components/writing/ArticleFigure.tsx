import type { CSSProperties, ReactNode } from "react";
import { FIGURE_VIEWBOX, articleFigures, type FigurePart } from "@/lib/writing-figures";

/**
 * The drawn figure beside an article on the writing index. Server-rendered,
 * decorative and wordless (the figures are shapes only, see
 * `lib/writing-figures.ts`). It sits complete at rest and redraws itself when
 * the row is hovered or focused; `app/writing/writing.css` owns the motion and
 * turns it off under reduced motion.
 */
function part(p: FigurePart, i: number): ReactNode {
  const tone = p.tone ?? "ink";
  const style = { "--d": `${p.delay ?? 0}ms` } as CSSProperties;
  const cls = [`fig`, `fig--${tone}`, p.dashed && "fig--dashed"].filter(Boolean).join(" ");
  if (p.kind === "path") {
    return <path key={i} d={p.d} className={`${cls}${p.draw ? " fig--draw" : ""}`} pathLength={p.draw ? 1 : undefined} style={style} />;
  }
  const fill = p.fill ? (p.kind === "rect" && p.w > 10 ? " fig--wash" : " fig--solid") : "";
  if (p.kind === "circle") return <circle key={i} cx={p.cx} cy={p.cy} r={p.r} className={`${cls}${fill} fig--pop`} style={style} />;
  return <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} className={`${cls}${fill} fig--pop`} style={style} />;
}

export default function ArticleFigure({ slug }: { slug: string }) {
  const parts = articleFigures[slug];
  if (!parts) return null;
  // The CRT figure's beam and its trail move together, so they share a group.
  // Every other group name only marks which accents belong to one idea.
  const indexed = parts.map((p, i) => ({ p, i }));
  const beam = indexed.filter(({ p }) => p.group === "beam");
  return (
    <svg className="writing__figure" viewBox={`0 0 ${FIGURE_VIEWBOX.w} ${FIGURE_VIEWBOX.h}`} aria-hidden="true" focusable="false">
      {indexed.filter(({ p }) => p.group !== "beam").map(({ p, i }) => part(p, i))}
      {beam.length > 0 && <g className="fig-group fig-group--beam">{beam.map(({ p, i }) => part(p, i))}</g>}
    </svg>
  );
}
