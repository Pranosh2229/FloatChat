"use client";

import { useMemo, useRef, useState } from "react";

import type { ProfileDetail, ThermoclineOut } from "@/lib/api";
import { THERMOCLINE_WHAT, THERMOCLINE_WHY, thermoclineQualityNote } from "@/lib/explainers";

const GOOD_QC = new Set(["1", "2"]);
const W = 260;
const H = 300;
const PAD_LEFT = 34;
const PAD_TOP = 10;
const PAD_RIGHT = 12;
const PAD_BOTTOM = 22;

interface Point {
  depth: number;
  temp: number;
}

/** Real depth-vs-temperature reading, scrubbable — REDESIGN_PLAN.md's "already planned, never
 * built" chart. QC-good levels only (matches the same 1/2 filter used everywhere else this
 * codebase computes anomalies/thermoclines), so the line never shows a level the science layer
 * itself would have discarded. */
export function DepthProfileChart({
  profile,
  thermocline,
}: {
  profile: ProfileDetail;
  thermocline: ThermoclineOut | null;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverDepth, setHoverDepth] = useState<number | null>(null);

  const points = useMemo<Point[]>(() => {
    const pairs: Point[] = [];
    for (let i = 0; i < profile.pressure_dbar.length; i++) {
      const t = profile.temperature_c[i];
      const qc = profile.qc_temperature[i];
      if (t !== null && t !== undefined && GOOD_QC.has(qc)) {
        pairs.push({ depth: profile.pressure_dbar[i], temp: t });
      }
    }
    pairs.sort((a, b) => a.depth - b.depth);
    return pairs;
  }, [profile]);

  if (points.length < 2) {
    return (
      <div className="rounded-lg bg-[var(--paper-2)] p-4 text-[12px] text-[var(--graphite-3)]">
        Not enough quality-checked readings on this profile to draw a depth chart.
      </div>
    );
  }

  const maxDepth = Math.max(...points.map((p) => p.depth)) * 1.03;
  const minTemp = Math.min(...points.map((p) => p.temp));
  const maxTemp = Math.max(...points.map((p) => p.temp));
  const tempPad = Math.max(0.3, (maxTemp - minTemp) * 0.08);

  const x = (temp: number) =>
    PAD_LEFT + ((temp - (minTemp - tempPad)) / (maxTemp + tempPad - (minTemp - tempPad))) * (W - PAD_LEFT - PAD_RIGHT);
  const y = (depth: number) => PAD_TOP + (depth / maxDepth) * (H - PAD_TOP - PAD_BOTTOM);
  const depthAtY = (py: number) =>
    ((py - PAD_TOP) / (H - PAD_TOP - PAD_BOTTOM)) * maxDepth;

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.temp)} ${y(p.depth)}`).join(" ");

  const tempAtDepth = (depth: number): number | null => {
    if (depth <= points[0].depth) return points[0].temp;
    if (depth >= points[points.length - 1].depth) return points[points.length - 1].temp;
    for (let i = 1; i < points.length; i++) {
      if (points[i].depth >= depth) {
        const a = points[i - 1];
        const b = points[i];
        const f = (depth - a.depth) / (b.depth - a.depth);
        return a.temp + (b.temp - a.temp) * f;
      }
    }
    return null;
  };

  const handleMove = (clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const py = ((clientY - rect.top) / rect.height) * H;
    const depth = Math.max(0, Math.min(maxDepth, depthAtY(py)));
    setHoverDepth(depth);
  };

  const activeDepth = hoverDepth ?? thermocline?.depth_m ?? points[0].depth;
  const activeTemp = tempAtDepth(activeDepth);
  const depthTicks = [0, maxDepth * 0.25, maxDepth * 0.5, maxDepth * 0.75, maxDepth];

  return (
    <div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none select-none rounded-lg bg-[var(--paper-2)]"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          handleMove(e.clientY);
        }}
        onPointerMove={(e) => {
          if (e.buttons > 0) handleMove(e.clientY);
        }}
        onPointerLeave={() => setHoverDepth(null)}
      >
        {/* depth gridlines */}
        {depthTicks.map((d) => (
          <g key={d}>
            <line x1={PAD_LEFT} x2={W - PAD_RIGHT} y1={y(d)} y2={y(d)} stroke="#1a1a1a" strokeOpacity={0.08} strokeWidth={1} />
            <text x={4} y={y(d) + 3} fontFamily="var(--font-geist-mono)" fontSize={8} fill="#8a877f">
              {Math.round(d)}
            </text>
          </g>
        ))}

        {/* thermocline band */}
        {thermocline && (
          <rect
            x={PAD_LEFT}
            y={y(thermocline.min_depth_m)}
            width={W - PAD_LEFT - PAD_RIGHT}
            height={Math.max(2, y(thermocline.max_depth_m) - y(thermocline.min_depth_m))}
            fill="var(--coral)"
            fillOpacity={0.14}
          />
        )}

        <path d={path} fill="none" stroke="var(--cobalt)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {/* scrub line + dot */}
        <line x1={PAD_LEFT} x2={W - PAD_RIGHT} y1={y(activeDepth)} y2={y(activeDepth)} stroke="#1a1a1a" strokeOpacity={0.35} strokeDasharray="3 3" />
        {activeTemp !== null && (
          <circle cx={x(activeTemp)} cy={y(activeDepth)} r={4} fill="var(--gold)" stroke="#1a1a1a" strokeWidth={1.5} />
        )}
      </svg>

      <div className="mt-1.5 flex items-center justify-between font-mono text-[11px]">
        <span className="text-[var(--graphite-3)]">drag to read ↕</span>
        <span className="rounded bg-[var(--graphite)] px-1.5 py-0.5 text-[var(--paper)]">
          {activeDepth.toFixed(0)} m · {activeTemp !== null ? `${activeTemp.toFixed(2)}°C` : "—"}
        </span>
      </div>

      {thermocline ? (
        <>
          <p className="mt-2 text-[12px] leading-relaxed text-[var(--graphite-2)]">
            <span className="font-semibold text-[var(--graphite)]">Thermocline near {thermocline.depth_m.toFixed(0)} m. </span>
            {THERMOCLINE_WHAT}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--graphite-3)]">{thermoclineQualityNote(thermocline.quality)}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--graphite-3)]">{THERMOCLINE_WHY}</p>
        </>
      ) : (
        <p className="mt-2 text-[12px] leading-relaxed text-[var(--graphite-3)]">
          No clear thermocline detected on this profile — the water column reads close to one temperature top to bottom.
        </p>
      )}
    </div>
  );
}
