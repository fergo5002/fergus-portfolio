"use client";

import { useId, useState } from "react";
import { leaseAt, reservationExample as example, reservationFigureCopy as copy } from "@/content/articles/reservation-model";
import styles from "./reservation-figure.module.css";

/** A user-selected still, so the whole explanation also works with reduced motion. */
export default function ReservationFigure() {
  const [left, setLeft] = useState(false);
  const id = useId();
  const closedAt = left ? example.closeAt : null;
  const state = leaseAt(example.inspectAt, closedAt);
  const width = 600;
  const height = 180;
  const x = (seconds: number) => (seconds / example.maximum) * width;
  const y = (remaining: number) => height - (remaining / example.lease) * height;
  const xTicks = Array.from({ length: 5 }, (_, index) => example.maximum * index / 4);
  const yTicks = [example.lease, example.lease / 2, 0];
  const points = Array.from({ length: example.maximum + 1 }, (_, elapsed) => {
    const current = leaseAt(elapsed, closedAt).remaining;
    const prior = elapsed ? leaseAt(elapsed - 0.0001, closedAt).remaining : current;
    // A successful renewal is a jump at one instant, not a made-up second
    // spent climbing back towards the new expiry.
    const jump = current > prior ? `${x(elapsed)},${y(prior)} ` : "";
    return `${jump}${x(elapsed)},${y(current)}`;
  }).join(" ");

  return (
    <figure className={styles.figure} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className={styles.title}>{copy.title}</h2>
      <div className={styles.choices} role="group" aria-label={copy.choices}>
        <button type="button" aria-pressed={!left} onClick={() => setLeft(false)}>{copy.present}</button>
        <button type="button" aria-pressed={left} onClick={() => setLeft(true)}>{copy.leave}</button>
      </div>

      <div className={styles.readouts} aria-live="polite" aria-atomic="true">
        <div className={styles.clock}>
          <svg viewBox="0 0 140 140" aria-hidden="true" focusable="false">
            <circle className={styles.clockTrack} cx="70" cy="70" r="62" />
            <circle className={styles.clockArc} cx="70" cy="70" r="62" pathLength="1"
              strokeDasharray={`${(example.maximum - example.inspectAt) / example.maximum} 1`} />
          </svg>
          <strong>00:{example.maximum - example.inspectAt}</strong>
          <span>{copy.maximum}</span>
        </div>
        <div className={styles.reservation}>
          <span>{copy.inspection}</span>
          <strong data-reserved={state.reserved}>{state.reserved ? copy.reserved : copy.released}</strong>
          <p>{state.reserved ? copy.heldDetail : copy.releasedDetail}</p>
        </div>
      </div>

      <div className={styles.graph} role="img" aria-label={left ? copy.releasedGraph : copy.heldGraph}>
        <p className={styles.axisTitle}>{copy.axis}</p>
        <div className={styles.plot}>
          <div className={styles.yAxis}>{yTicks.map((value) => <span key={value}>{value}</span>)}</div>
          <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
            {yTicks.map((value) => <line key={value} className={styles.grid} x1="0" x2={width} y1={y(value)} y2={y(value)} />)}
            {xTicks.map((value) => <line key={value} className={styles.grid} x1={x(value)} x2={x(value)} y1="0" y2={height} />)}
            {left ? <rect className={styles.expired} x={x(state.expiresAt)} y="0" width={width - x(state.expiresAt)} height={height} /> : null}
            <polygon className={styles.area} points={`0,${height} ${points} ${width},${height}`} />
            <polyline className={styles.trace} points={points} />
            <line className={styles.cursor} x1={x(example.inspectAt)} x2={x(example.inspectAt)} y1="0" y2={height} />
            <circle className={styles.point} cx={x(example.inspectAt)} cy={y(state.remaining)} r="5" />
          </svg>
          <div className={styles.xAxis}>{xTicks.map((value) => <span key={value}>{Math.floor(value / 60)}:{String(value % 60).padStart(2, "0")}</span>)}</div>
        </div>
      </div>
      <figcaption>{copy.caption}</figcaption>
    </figure>
  );
}
