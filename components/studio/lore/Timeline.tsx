"use client";
import { useMemo } from "react";
import { DateRange } from "@/components/instrument";
import { timelineBars, type Stretch } from "@/lib/studio/lore";
import type { Span } from "@/lib/instrument/dates";
import type { ChatMessage } from "@/lib/lab/chat";

/**
 * The whole chat as a strip of bars under the week, and the kit's two-handle
 * range on it to choose the stretch everything else follows. The bars inside
 * the stretch are lit, the rest are dark. The kit's own density strip is not
 * used: these bars are taller, and lit by the stretch, which it cannot be.
 *
 * The bars are inset seven pixels a side, the same as the range's rail, so a
 * thumb sits over the day it names. The thumbs follow `range` at once; the
 * lit bars follow `lit`, the deferred stretch, with the week.
 */
const BUCKETS = 96;

export default function Timeline({
  messages,
  span,
  range,
  lit,
  onRange,
  ready,
  label,
  stretchLabel,
}: {
  messages: readonly ChatMessage[];
  span: Span | null;
  range: Stretch;
  lit: Stretch;
  onRange: (range: Stretch) => void;
  ready: boolean;
  label: string;
  stretchLabel: string;
}) {
  const bars = useMemo(() => (span ? timelineBars(messages, span, lit, BUCKETS) : []), [messages, span, lit]);
  if (!span) return null;
  const peak = Math.max(1, ...bars.map((b) => b.count));
  return (
    <div className="lore__timeline">
      <svg className="lore__bars" viewBox={`0 0 ${bars.length} 100`} preserveAspectRatio="none" role="img" aria-label={label}>
        {bars.map((bar, i) => {
          const height = bar.count ? Math.max(4, (100 * bar.count) / peak) : 0;
          return (
            <rect
              key={i}
              x={i + 0.14}
              width={0.72}
              y={100 - height}
              height={height}
              className={bar.lit ? "is-lit" : undefined}
            />
          );
        })}
      </svg>
      {ready ? (
        <DateRange className="lore__range" label={stretchLabel} span={span} value={range} onChange={onRange} />
      ) : (
        <div className="lore__range-wait" aria-hidden="true" />
      )}
    </div>
  );
}
