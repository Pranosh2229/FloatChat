/**
 * Static poster — the LCP element, the no-WebGL fallback, and the reduced-motion fallback, in
 * one asset (one asset, three jobs). Inline SVG rather than a raster file: zero extra network
 * request, paints with the first HTML/CSS.
 *
 * Evokes THIS product's world — a dark sea surface receding to a hazy horizon with a few float
 * markers standing on it — not a globe (REDESIGN_PLAN.md decision #2) and not a generic blob.
 */
export function OceanPoster() {
  const floats: [number, number][] = [
    [300, 560],
    [470, 500],
    [610, 590],
    [390, 640],
  ];
  return (
    <svg
      viewBox="0 0 800 800"
      className="h-full w-full"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label="FLOATCHAT ocean world (static preview)"
    >
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e8ebe2" />
          <stop offset="100%" stopColor="#cfd6cf" />
        </linearGradient>
        <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5f8a90" />
          <stop offset="45%" stopColor="#1b5e6b" />
          <stop offset="100%" stopColor="#0b2f3a" />
        </linearGradient>
        <linearGradient id="haze" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(207,214,207,0.6)" />
          <stop offset="100%" stopColor="rgba(207,214,207,0)" />
        </linearGradient>
      </defs>

      <rect width="800" height="400" fill="url(#sky)" />
      <rect y="400" width="800" height="400" fill="url(#sea)" />
      <rect y="400" width="800" height="120" fill="url(#haze)" />

      {/* Swell lines: perspective-spaced, wider apart toward the viewer. */}
      <g stroke="rgba(244,201,93,0.18)" fill="none" strokeWidth="1.2">
        {[425, 452, 486, 530, 588, 662, 752].map((y) => (
          <path key={y} d={`M0 ${y} Q 200 ${y - 6} 400 ${y} T 800 ${y}`} />
        ))}
      </g>

      {/* Float markers: a small upright pin with a glow ring at its base. */}
      {floats.map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <ellipse cx={x} cy={y} rx="14" ry="5" fill="none" stroke="rgba(29,78,216,0.7)" />
          <rect x={x - 3} y={y - 26} width="6" height="26" rx="2" fill="#f4c95d" />
          <rect x={x - 0.8} y={y - 40} width="1.6" height="14" fill="#f3ede0" />
        </g>
      ))}
    </svg>
  );
}
