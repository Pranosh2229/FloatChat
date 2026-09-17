"use client";

import { useOceanStore } from "@/stores/oceanStore";

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

/**
 * The fourth dimension. Scrubs `currentTime` in the ocean store, which drives float
 * highlighting (FloatLayer) and the selected float's time-aware trajectory (TrajectoryLayer) —
 * a real, bounded control (min/max are the real ARGO ingestion window), not decoration.
 */
export function Timeline() {
  const timeRange = useOceanStore((s) => s.timeRange);
  const currentTime = useOceanStore((s) => s.currentTime);
  const setCurrentTime = useOceanStore((s) => s.setCurrentTime);
  const floats = useOceanStore((s) => s.floats);

  const min = timeRange.start.getTime();
  const max = timeRange.end.getTime();
  const value = currentTime.getTime();
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;

  if (floats.length === 0) return null;

  return (
    <div className="card pointer-events-auto w-full max-w-xl px-4 py-2.5">
      <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.12em] text-[var(--graphite-3)] uppercase">
        <span>{DATE_FORMAT.format(timeRange.start)}</span>
        <span className="rounded-full bg-[var(--graphite)] px-2 py-0.5 text-[var(--paper)]">
          {DATE_FORMAT.format(currentTime)}
        </span>
        <span>{DATE_FORMAT.format(timeRange.end)}</span>
      </div>
      <div className="relative mt-2">
        <div
          className="pointer-events-none absolute left-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-[var(--cobalt)]"
          style={{ width: `${pct}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          step={24 * 60 * 60 * 1000}
          onChange={(event) => setCurrentTime(new Date(Number(event.target.value)))}
          className="scrubber relative w-full cursor-pointer"
          aria-label="Timeline"
        />
      </div>
    </div>
  );
}
