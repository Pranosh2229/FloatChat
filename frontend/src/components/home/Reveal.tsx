"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Fades/rises its children in the first time they scroll into view. Plain IntersectionObserver
 * + CSS transition — no library, and it degrades to "just visible" when the observer isn't
 * available or the user prefers reduced motion.
 */
export function Reveal({
  children,
  className = "",
  delayMs = 0,
}: {
  children: ReactNode;
  className?: string;
  delayMs?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const el = ref.current;
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const immediate = !el || typeof IntersectionObserver === "undefined" || prefersReduced;
    if (immediate) {
      // Deferred a tick: the lint forbids a synchronous setState inside the effect body.
      // Reduced motion means no transition at all, not just an instant scroll-triggered one —
      // otherwise the fade/rise itself still plays once, just without waiting for a scroll.
      const t = window.setTimeout(() => {
        if (prefersReduced) setReduced(true);
        setShown(true);
      }, 0);
      return () => clearTimeout(t);
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el!);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`${reduced ? "" : "transition-all duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)]"} ${
        shown ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
      } ${className}`}
      style={reduced ? undefined : { transitionDelay: `${delayMs}ms` }}
    >
      {children}
    </div>
  );
}
