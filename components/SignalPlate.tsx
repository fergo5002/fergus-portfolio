/**
 * A procedural CRT test plate, drawn per project from its slug.
 *
 * This fills the screenshot slot until a real capture exists. It is deliberately
 * NOT a fake screenshot: it is a broadcast alignment card, which is honest about
 * being furniture while still looking authored. Being SVG it stays razor sharp at
 * any size, costs nothing to download, and recolours with the phosphor theme
 * because every stroke uses currentColor.
 *
 * Deterministic: the same slug always produces the same waveform and bar
 * heights, so the plate is stable across renders and between server and client.
 */

/** Cheap string hash → a stable pseudo-random sequence for one slug. */
function seeded(slug: string) {
  let h = 2166136261;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 1000) / 1000;
  };
}

export default function SignalPlate({
  slug,
  label,
  file,
}: {
  slug: string;
  label?: string;
  /** Filename the owner should drop in to replace this plate. */
  file?: string;
}) {
  const rand = seeded(slug);

  // Waveform across the lower third.
  const points: string[] = [];
  const amp = 6 + rand() * 5;
  const freq = 1.6 + rand() * 2.2;
  const phase = rand() * 6.28;
  for (let x = 0; x <= 320; x += 4) {
    const t = x / 320;
    const y =
      132 +
      Math.sin(t * freq * 6.28 + phase) * amp +
      Math.sin(t * freq * 15.1 + phase * 2) * (amp * 0.28);
    points.push(`${x},${y.toFixed(1)}`);
  }

  // Vertical intensity bars along the top, like a level meter.
  const bars = Array.from({ length: 16 }, () => 6 + rand() * 22);

  return (
    <svg
      className="plate"
      viewBox="0 0 320 180"
      // `meet`, not `slice`: the plate carries labels, and cropping them is worse
      // than letterboxing against a background that is already near-black.
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`Alignment pattern for ${label ?? slug}`}
    >
      {/* grid */}
      <g stroke="currentColor" strokeWidth="0.5" opacity="0.16">
        {Array.from({ length: 15 }, (_, i) => (
          <line key={`v${i}`} x1={(i + 1) * 20} y1="0" x2={(i + 1) * 20} y2="180" />
        ))}
        {Array.from({ length: 8 }, (_, i) => (
          <line key={`h${i}`} x1="0" y1={(i + 1) * 20} x2="320" y2={(i + 1) * 20} />
        ))}
      </g>

      {/* convergence circles */}
      <g fill="none" stroke="currentColor" opacity="0.4">
        <circle cx="160" cy="90" r="54" strokeWidth="0.8" />
        <circle cx="160" cy="90" r="34" strokeWidth="0.8" />
        <line x1="160" y1="26" x2="160" y2="154" strokeWidth="0.5" />
        <line x1="96" y1="90" x2="224" y2="90" strokeWidth="0.5" />
      </g>

      {/* corner registration marks */}
      <g stroke="currentColor" strokeWidth="1.4" opacity="0.75" fill="none">
        <polyline points="8,22 8,8 22,8" />
        <polyline points="298,8 312,8 312,22" />
        <polyline points="8,158 8,172 22,172" />
        <polyline points="312,158 312,172 298,172" />
      </g>

      {/* level meter */}
      <g fill="currentColor" opacity="0.55">
        {bars.map((h, i) => (
          <rect key={i} x={20 + i * 17} y={44 - h} width="8" height={h} />
        ))}
      </g>

      {/* waveform */}
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        opacity="0.9"
      />

      {/* labels */}
      <text x="16" y="112" fill="currentColor" opacity="0.9" fontSize="10" fontFamily="monospace">
        {slug.toUpperCase()}
      </text>
      <text x="16" y="167" fill="currentColor" opacity="0.55" fontSize="7" fontFamily="monospace">
        {file ? `AWAITING ${file.toUpperCase()}` : "ALIGNMENT PATTERN"}
      </text>
      <text x="256" y="167" fill="currentColor" opacity="0.55" fontSize="7" fontFamily="monospace">
        625/50 PAL
      </text>
    </svg>
  );
}
