"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "floatchat.seenControlsHint";
const AUTO_FADE_MS = 7000;

/**
 * A one-time control hint (REDESIGN_PLAN.md decision #4: "first-visit control hint that fades
 * after first use") — shown once per browser, dismissed by any real navigation input (arrow
 * key, drag, wheel) or after a few seconds, whichever comes first. `localStorage` failing (a
 * private window, blocked storage) degrades to "show it every visit" rather than crashing —
 * never load-bearing, just a convenience.
 */
export function FirstVisitHint() {
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    let seen = false;
    try {
      seen = localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      /* storage unavailable — treat as unseen */
    }
    if (seen) return;
    // Deferred a tick: the lint forbids a synchronous setState inside the effect body (same
    // pattern as components/home/Reveal.tsx).
    const showTimer = window.setTimeout(() => setVisible(true), 0);

    const dismiss = () => {
      setFading(true);
      try {
        localStorage.setItem(STORAGE_KEY, "1");
      } catch {
        /* ignore */
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) dismiss();
    };
    const onPointerDown = () => dismiss();
    const onWheel = () => dismiss();

    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("wheel", onWheel, { passive: true });
    const timer = window.setTimeout(dismiss, AUTO_FADE_MS);

    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("wheel", onWheel);
      clearTimeout(timer);
      clearTimeout(showTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className={`pointer-events-none absolute inset-x-0 top-24 z-20 flex justify-center transition-opacity duration-700 ${
        fading ? "opacity-0" : "opacity-100"
      }`}
      onTransitionEnd={() => fading && setVisible(false)}
    >
      <div className="card flex w-[calc(100vw-2.5rem)] max-w-fit flex-wrap items-center justify-center gap-x-4 gap-y-1.5 px-4 py-2.5">
        <span className="hidden items-center gap-1.5 text-[12px] text-[var(--graphite-2)] sm:flex">
          <kbd className="rounded border border-[var(--line-strong)] px-1.5 py-0.5 font-mono text-[10px]">↑↓←→</kbd>
          or drag to roam
        </span>
        <span className="flex items-center gap-1.5 text-[12px] text-[var(--graphite-2)] sm:hidden">drag to roam</span>
        <span className="hidden h-4 w-px bg-[var(--line-strong)] sm:block" />
        <span className="hidden items-center gap-1.5 text-[12px] text-[var(--graphite-2)] sm:flex">
          <kbd className="rounded border border-[var(--line-strong)] px-1.5 py-0.5 font-mono text-[10px]">scroll</kbd>
          for altitude
        </span>
        <span className="flex items-center gap-1.5 text-[12px] text-[var(--graphite-2)] sm:hidden">pinch for altitude</span>
        <span className="hidden h-4 w-px bg-[var(--line-strong)] sm:block" />
        <span className="text-[12px] text-[var(--graphite-2)]">
          <span className="hidden sm:inline">click</span>
          <span className="sm:hidden">tap</span> a float to inspect it
        </span>
      </div>
    </div>
  );
}
