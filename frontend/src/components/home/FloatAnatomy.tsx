"use client";

import { useEffect, useRef, useState } from "react";

const INK = "var(--graphite)";
const GOLD = "#f4c95d";
const PAPER = "var(--paper)";
const COBALT = "#1d4ed8";
const CORAL = "#f0562f";
const GREY = "#8a877f";

interface Part {
  id: string;
  n: string;
  name: string;
  what: string;
  /** Anchor on the drawing (SVG coords). */
  at: [number, number];
  /** Label position (SVG coords). */
  label: [number, number];
}

const PARTS: Part[] = [
  {
    id: "antenna",
    n: "01",
    name: "Antenna",
    what: "Only breaks the surface for ~15 minutes per cycle — long enough to send the data and get a GPS fix.",
    at: [260, 42],
    label: [370, 40],
  },
  {
    id: "ctd",
    n: "02",
    name: "CTD sensor",
    what: "Conductivity, Temperature, Depth. Conductivity is how it measures saltiness; it samples on the way up.",
    at: [284, 98],
    label: [370, 110],
  },
  {
    id: "electronics",
    n: "03",
    name: "Brain & modem",
    what: "A tiny computer runs the ten-day schedule and packages the profile for the satellite.",
    at: [236, 170],
    label: [40, 170],
  },
  {
    id: "batteries",
    n: "04",
    name: "Batteries",
    what: "Enough lithium cells for 150–250 cycles — four to six years at sea, with no charging.",
    at: [236, 250],
    label: [40, 250],
  },
  {
    id: "hull",
    n: "05",
    name: "Pressure hull",
    what: "An aluminium tube built to shrug off 200 atmospheres of pressure at 2,000 m.",
    at: [292, 300],
    label: [370, 300],
  },
  {
    id: "bladder",
    n: "06",
    name: "Oil bladder",
    what: "The trick to diving with no propeller: pump oil out into this bladder to get bigger and float, pull it back in to shrink and sink.",
    at: [262, 372],
    label: [370, 380],
  },
];

/**
 * The ARGO float, taken apart: a labelled line-art drawing where the callouts draw on one by
 * one as the section scrolls into view (REDESIGN_PLAN.md Home beat 2 — chosen over exploding a
 * 3D model, since the real downloaded model is a single fused mesh with no separable parts).
 */
export function FloatAnatomy() {
  const ref = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(-1);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let timers: number[] = [];
    if (reduce || typeof IntersectionObserver === "undefined") {
      // Reduced motion skips the transitions too, not just the scroll-triggered staggered
      // reveal — otherwise the callout lines/labels still fade and draw on once, unprompted.
      timers.push(
        window.setTimeout(() => {
          if (reduce) setReduced(true);
          setStep(PARTS.length);
        }, 0),
      );
      return () => timers.forEach(clearTimeout);
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        timers = PARTS.map((_, i) => window.setTimeout(() => setStep(i), 350 + i * 420));
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <div ref={ref} className="card overflow-hidden p-2 sm:p-4">
      <svg viewBox="0 0 520 430" className="block w-full">
        <defs>
          <pattern id="anatomy-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M20 0 H0 V20" fill="none" stroke={INK} strokeOpacity="0.07" />
          </pattern>
        </defs>
        <rect width="520" height="430" fill="url(#anatomy-grid)" />

        {/* The float, cut open on the right half */}
        <g transform="translate(260 0)">
          <line x1="0" y1="18" x2="0" y2="60" stroke={INK} strokeWidth="3" strokeLinecap="round" />
          <circle cx="0" cy="16" r="4" fill={CORAL} stroke={INK} strokeWidth="2.5" />
          {/* hull */}
          <rect x="-30" y="60" width="60" height="320" rx="22" fill={GOLD} stroke={INK} strokeWidth="3" />
          {/* cutaway window */}
          <path d="M0 76 h20 a8 8 0 0 1 8 8 v276 a8 8 0 0 1 -8 8 h-20 z" fill={PAPER} stroke={INK} strokeWidth="2" strokeDasharray="4 3" />
          {/* CTD */}
          <rect x="6" y="84" width="18" height="28" rx="3" fill={COBALT} stroke={INK} strokeWidth="2" />
          <path d="M9 90 h12 M9 96 h12 M9 102 h12" stroke={PAPER} strokeWidth="1.5" />
          {/* electronics */}
          <rect x="4" y="150" width="22" height="40" rx="3" fill={GREY} stroke={INK} strokeWidth="2" />
          <circle cx="15" cy="163" r="3" fill={CORAL} />
          <path d="M8 175 h14 M8 181 h14" stroke={PAPER} strokeWidth="1.5" />
          {/* batteries */}
          {[0, 1, 2].map((i) => (
            <rect key={i} x="4" y={214 + i * 24} width="22" height="18" rx="3" fill="#c9b78d" stroke={INK} strokeWidth="2" />
          ))}
          {/* bladder */}
          <ellipse cx="0" cy="372" rx="26" ry="14" fill={COBALT} fillOpacity="0.35" stroke={INK} strokeWidth="2" />
          <text x="-8" y="376" fontFamily="var(--font-geist-mono)" fontSize="8" fill={INK}>
            OIL
          </text>
          {/* collar band */}
          <rect x="-30" y="128" width="60" height="8" fill={PAPER} stroke={INK} strokeWidth="2" />
        </g>

        {/* Callouts */}
        {PARTS.map((part, i) => {
          const on = step >= i;
          const [ax, ay] = part.at;
          const [lx, ly] = part.label;
          const left = lx < ax;
          const elbowX = left ? lx + 120 : lx - 10;
          return (
            <g
              key={part.id}
              style={{ transition: reduced ? "none" : "opacity 400ms ease", opacity: on ? 1 : 0 }}
            >
              <path
                d={`M${ax} ${ay} L${elbowX} ${ly} L${left ? lx + 120 : lx} ${ly}`}
                fill="none"
                stroke={INK}
                strokeWidth="1.5"
                strokeDasharray="200"
                strokeDashoffset={on ? 0 : 200}
                style={{ transition: reduced ? "none" : "stroke-dashoffset 600ms ease" }}
              />
              <circle cx={ax} cy={ay} r="4" fill={CORAL} stroke={INK} strokeWidth="1.5" />
              <g transform={`translate(${left ? lx : lx + 6} ${ly})`}>
                <rect x="-6" y="-11" width="22" height="16" rx="8" fill={INK} />
                <text x="5" y="1" textAnchor="middle" fontFamily="var(--font-geist-mono)" fontSize="9" fill={PAPER}>
                  {part.n}
                </text>
                <text x="22" y="1" fontFamily="var(--font-geist-sans)" fontSize="12" fontWeight="600" fill={INK}>
                  {part.name}
                </text>
              </g>
            </g>
          );
        })}
      </svg>

      <ol className="grid gap-x-6 gap-y-3 p-4 sm:grid-cols-2">
        {PARTS.map((part, i) => (
          <li
            key={part.id}
            className="flex gap-3 text-[13px] leading-relaxed text-[var(--graphite-2)]"
            style={{ transition: reduced ? "none" : "opacity 400ms ease", opacity: step >= i ? 1 : 0.25 }}
          >
            <span className="mt-0.5 h-fit rounded-full bg-[var(--graphite)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--paper)]">
              {part.n}
            </span>
            <span>
              <span className="font-semibold text-[var(--graphite)]">{part.name}. </span>
              {part.what}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
