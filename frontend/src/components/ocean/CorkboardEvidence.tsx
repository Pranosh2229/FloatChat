"use client";

import { useRef, useState } from "react";

export interface CorkNode {
  id: string;
  label: string;
  value: string;
  caption: string;
}

const W = 420;
const H = 190;
// Hand-placed, not a grid — a corkboard's pins never line up. Positions are the *default* only;
// every node is draggable from here.
const DEFAULT_POS: [number, number][] = [
  [46, 96],
  [162, 46],
  [270, 130],
  [366, 60],
];

/**
 * The evidence chain as a corkboard: real nodes pinned with real string, revealed one click at a
 * time rather than dumped all at once (REDESIGN_PLAN.md decision #9 — "draggable nodes, a
 * satisfying unlock reveal... instead of a static flowchart"). Every label/value comes straight
 * from the real `Evidence` row passed in by `EvidencePanel`; this component only handles the
 * corkboard interaction, not the numbers themselves.
 */
export function CorkboardEvidence({ nodes }: { nodes: CorkNode[] }) {
  const [revealed, setRevealed] = useState(1);
  const [positions, setPositions] = useState<[number, number][]>(() => DEFAULT_POS.slice(0, nodes.length));
  const dragging = useRef<{ index: number; offsetX: number; offsetY: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const toLocal = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * W,
      y: ((clientY - rect.top) / rect.height) * H,
    };
  };

  const startDrag = (index: number, clientX: number, clientY: number) => {
    const { x, y } = toLocal(clientX, clientY);
    dragging.current = { index, offsetX: positions[index][0] - x, offsetY: positions[index][1] - y };
  };

  const moveDrag = (clientX: number, clientY: number) => {
    const d = dragging.current;
    if (!d) return;
    const { x, y } = toLocal(clientX, clientY);
    setPositions((prev) => {
      const next = [...prev];
      next[d.index] = [
        Math.max(24, Math.min(W - 24, x + d.offsetX)),
        Math.max(20, Math.min(H - 20, y + d.offsetY)),
      ];
      return next;
    });
  };

  return (
    <div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none rounded-lg"
        style={{ background: "repeating-linear-gradient(0deg, #cdbd93 0px, #cdbd93 1px, #d9c9a3 1px, #d9c9a3 3px)" }}
        onPointerMove={(e) => moveDrag(e.clientX, e.clientY)}
        onPointerUp={() => {
          dragging.current = null;
        }}
        onPointerLeave={() => {
          dragging.current = null;
        }}
      >
        {/* string between consecutive revealed pins */}
        {positions.slice(0, revealed - 1).map(([x1, y1], i) => {
          const [x2, y2] = positions[i + 1];
          const midY = (y1 + y2) / 2 + (i % 2 === 0 ? 14 : -14);
          return (
            <path
              key={i}
              d={`M${x1} ${y1} Q ${(x1 + x2) / 2} ${midY} ${x2} ${y2}`}
              fill="none"
              stroke="#8a2b1a"
              strokeWidth={1.4}
              strokeDasharray={220}
              className="cork-string"
              style={{ animationDelay: `${i * 80}ms` }}
            />
          );
        })}

        {nodes.slice(0, revealed).map((node, i) => {
          const [x, y] = positions[i];
          const isLast = i === revealed - 1;
          const canAdvance = isLast && revealed < nodes.length;
          return (
            <g
              key={node.id}
              transform={`translate(${x} ${y})`}
              className="cork-pop"
              style={{ animationDelay: `${i === revealed - 1 ? 40 : 0}ms`, cursor: "grab" }}
              onPointerDown={(e) => {
                e.stopPropagation();
                (e.target as Element).setPointerCapture?.(e.pointerId);
                startDrag(i, e.clientX, e.clientY);
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (canAdvance) setRevealed((r) => r + 1);
              }}
            >
              <rect
                x={-52}
                y={-30}
                width={104}
                height={60}
                rx={3}
                fill="var(--color-bg-elevated)"
                stroke="var(--graphite)"
                strokeOpacity={0.25}
                strokeWidth={1}
                style={{ filter: "drop-shadow(0 3px 3px rgba(26,26,26,0.25))" }}
              />
              <circle cy={-30} r={4} fill="#8a2b1a" stroke="var(--graphite)" strokeWidth={0.6} />
              <text x={0} y={-10} textAnchor="middle" fontFamily="var(--font-geist-mono)" fontSize={9} fill="var(--graphite-3)" letterSpacing={0.5}>
                {node.label.toUpperCase()}
              </text>
              <text x={0} y={10} textAnchor="middle" fontFamily="var(--font-display)" fontSize={22} fill="var(--graphite)">
                {node.value}
              </text>
              <text x={0} y={23} textAnchor="middle" fontFamily="var(--font-geist-sans)" fontSize={8} fill="var(--graphite-2)">
                {node.caption}
              </text>
              {canAdvance && (
                <circle cx={46} cy={24} r={7} fill="var(--cobalt)" className="cork-nudge">
                  <title>Click to reveal the next piece</title>
                </circle>
              )}
              {canAdvance && (
                <text x={46} y={27} textAnchor="middle" fontSize={9} fill="var(--color-bg-elevated)" pointerEvents="none">
                  +
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <p className="annotation mt-1.5 text-[12px]">
        {revealed < nodes.length ? "drag the pins · click the blue dot to unlock the next clue" : "drag the pins to rearrange the case"}
      </p>
    </div>
  );
}
