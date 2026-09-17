"use client";

import { useEffect, useRef, useState } from "react";

const QUESTION = "What's unusual in the Bay of Bengal?";
const TYPE_INTERVAL_MS = 45;
const START_DELAY_MS = 400;
const REACT_DELAY_MS = 500;

// Real numbers, not illustrative ones — the actual 24-month rebuild's Bay of Bengal breakdown
// (see PROGRESS.md's 2026-09-14 event-rebuild entry), matching exactly what the live Explore
// Ask bar itself renders for this same question (AskPanel.tsx's find_anomalies answer).
const BREAKDOWN = [
  { type: "Subsurface warming", count: 68 },
  { type: "Cooling event", count: 13 },
  { type: "Mixed anomaly", count: 8 },
  { type: "Surface warming", count: 1 },
];
const TOTAL = BREAKDOWN.reduce((sum, b) => sum + b.count, 0);
const MAX = Math.max(...BREAKDOWN.map((b) => b.count));

const FLOAT_DOTS: [number, number][] = [
  [90, 80],
  [140, 60],
  [175, 95],
  [120, 110],
];

function Bar({ count }: { count: number }) {
  const pct = Math.max(4, Math.round((count / MAX) * 100));
  return (
    <span className="inline-block h-1.5 w-20 overflow-hidden rounded-full bg-[rgba(26,26,26,0.1)] align-middle">
      <span className="block h-full rounded-full bg-[var(--coral)]" style={{ width: `${pct}%` }} />
    </span>
  );
}

/**
 * Home beat 4, "Question → World" (REDESIGN_PLAN.md) — a real preview of the Ask mechanic, not
 * a separate fake animation: a real example question types itself in, then a small illustrated
 * ocean panel reacts (floats highlight) alongside the same real "N events in {region}" card
 * shape the live Explore Ask bar renders for this exact question. Built to match Home's existing
 * Field Notebook illustrated style (see the cartoon strip / anatomy diagram above it on the
 * page), not the earlier navy/pinned-camera draft of this beat — the rest of Home no longer
 * looks like that draft, so this doesn't either.
 */
export function QuestionToWorld() {
  const ref = useRef<HTMLDivElement>(null);
  const [typed, setTyped] = useState("");
  const [reacted, setReacted] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReduced || typeof IntersectionObserver === "undefined") {
      const t = window.setTimeout(() => {
        setReduced(true);
        setTyped(QUESTION);
        setReacted(true);
      }, 0);
      return () => clearTimeout(t);
    }

    const timers: number[] = [];
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        let i = 0;
        const typeNext = () => {
          i += 1;
          setTyped(QUESTION.slice(0, i));
          if (i < QUESTION.length) {
            timers.push(window.setTimeout(typeNext, TYPE_INTERVAL_MS));
          } else {
            timers.push(window.setTimeout(() => setReacted(true), REACT_DELAY_MS));
          }
        };
        timers.push(window.setTimeout(typeNext, START_DELAY_MS));
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      timers.forEach(clearTimeout);
    };
  }, []);

  const caretVisible = !reduced && typed.length < QUESTION.length;

  return (
    <div ref={ref} className="card overflow-hidden">
      {/* The same pill/dot/button shape as the real Ask bar (AskPanel.tsx) — this is meant to
          read as "the real thing," just typing itself. */}
      <div className="border-b border-[var(--line)] p-4 sm:p-5">
        <div className="card flex items-center gap-2 px-3 py-2.5">
          <span className="relative ml-1 grid h-5 w-5 shrink-0 place-items-center">
            <span className={`h-2 w-2 rounded-full ${reacted ? "bg-[var(--graphite-3)]" : "bg-[var(--cobalt)]"}`} />
          </span>
          <p className="min-h-[1.4em] flex-1 text-[15px] text-[var(--graphite)]">
            {typed || <span className="text-[var(--graphite-3)]">Ask the ocean anything about these waters</span>}
            {caretVisible && <span className="animate-pulse">|</span>}
          </p>
          <span className="btn btn-primary !py-2 !text-[12px]" aria-hidden>
            Ask
          </span>
        </div>
      </div>

      <div className="grid sm:grid-cols-[1.2fr_1fr]">
        <svg viewBox="0 0 320 200" className="block w-full" role="img" aria-label="A small illustrated map of the Bay of Bengal with real ARGO floats highlighting">
          <rect width="320" height="200" fill="#1b5e6b" />
          <path d="M0 30 q40 -12 80 0 t80 0 t80 0 t80 0 v170 h-320z" fill="#0b2f3a" opacity="0.35" />
          {FLOAT_DOTS.map(([x, y], i) => (
            <g
              key={i}
              style={{
                transition: reduced ? "none" : "opacity 450ms ease, transform 450ms ease",
                transitionDelay: reduced ? undefined : `${i * 110}ms`,
                opacity: reacted ? 1 : 0.35,
                transform: reacted ? "scale(1.2)" : "scale(1)",
                transformOrigin: `${x}px ${y}px`,
              }}
            >
              <circle cx={x} cy={y} r="10" fill="none" stroke="#f0562f" strokeWidth="2.5" />
              <rect x={x - 3} y={y - 10} width="6" height="16" rx="2" fill="#f4c95d" stroke="#1a1a1a" strokeWidth="1.5" />
            </g>
          ))}
          <text x="16" y="184" fontFamily="var(--font-geist-mono)" fontSize="10" fill="#f3ede0" letterSpacing="1.5" opacity="0.85">
            BAY OF BENGAL
          </text>
        </svg>

        <div
          className="flex flex-col justify-center gap-2 p-5 sm:p-6"
          style={{ transition: reduced ? "none" : "opacity 500ms ease", opacity: reacted ? 1 : 0 }}
        >
          <p className="eyebrow">Anomalies found</p>
          <p className="font-display text-[32px] leading-none">
            {TOTAL} events <span className="text-[18px] font-sans font-normal text-[var(--graphite-2)]">in Bay of Bengal</span>
          </p>
          <ul className="mt-1 space-y-1 text-xs">
            {BREAKDOWN.map((b) => (
              <li key={b.type} className="flex items-center gap-2">
                <Bar count={b.count} />
                <span className="text-[var(--graphite-2)]">{b.type}</span>
                <span className="text-[var(--graphite-3)]">{b.count}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[11px] text-[var(--graphite-3)]">
            Floats involved are ringed in coral; the timeline jumps to the latest one — exactly
            what happens for this question in Explore.
          </p>
        </div>
      </div>
    </div>
  );
}
