"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { regionCentroid } from "@/components/ocean/geo";
import { useOceanStore } from "@/stores/oceanStore";
import type { RegionInfo } from "@/lib/api";

interface DashboardSearchProps {
  value: string;
  onChange: (value: string) => void;
  regions: RegionInfo[];
}

/**
 * Dashboard's quick-find: unlike Explore (a free-roam world you navigate), this page is a fixed
 * set of charts — so "search" here means narrowing them to one region, not flying a camera.
 * Typing a region name live-filters the "Coverage by region" and "Events by region" bar lists
 * (DashboardPage reads the same lifted `value`) elsewhere on the page; each suggestion also gets
 * a one-tap "→ Explore" to jump straight into the 3D world at that region, reusing the same
 * `setFlyToTarget` + non-cinematic band the "Most active right now" card's CTA already uses.
 */
export function DashboardSearch({ value, onChange, regions }: DashboardSearchProps) {
  const router = useRouter();
  const setFlyTo = useOceanStore((s) => s.setFlyToTarget);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Closing on the input's own `onBlur` raced with clicking a result: focus left the input (and
  // the dropdown started unmounting) before the button's click had a chance to register, so
  // "Explore →" silently did nothing (confirmed live — the dropdown closed but the page never
  // navigated). A window-level pointerdown-outside check, same pattern as ExploreSearch.tsx and
  // CommandSearch.tsx, only closes when the click genuinely lands outside this component.
  useEffect(() => {
    if (!focused) return;
    const onPointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [focused]);

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return [];
    return regions.filter((r) => r.name.toLowerCase().includes(q)).slice(0, 6);
  }, [value, regions]);

  const jump = (region: RegionInfo) => {
    setFocused(false);
    setFlyTo({ ...regionCentroid(region), band: "region" });
    router.push("/explore");
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-xs">
      <div className="card flex items-center gap-2 rounded-full px-3.5 py-2">
        <span aria-hidden className="text-[13px] text-[var(--graphite-3)]">
          ⌕
        </span>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          placeholder="Find a region…"
          className="w-full bg-transparent text-[13px] text-[var(--graphite)] placeholder:text-[var(--graphite-3)] focus:outline-none"
          aria-label="Find a region — filters the charts below"
        />
        {value && (
          <button
            type="button"
            onClick={() => {
              onChange("");
              inputRef.current?.focus();
            }}
            aria-label="Clear"
            className="text-[12px] text-[var(--graphite-3)] hover:text-[var(--graphite)]"
          >
            ✕
          </button>
        )}
      </div>

      {focused && matches.length > 0 && (
        <div className="card rise absolute left-0 right-0 top-[calc(100%+6px)] z-20 overflow-hidden rounded-xl p-1.5">
          {matches.map((region) => (
            <div
              key={region.key}
              className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[12.5px] text-[var(--graphite-2)] hover:bg-[var(--hover-tint)]"
            >
              <span className="text-[var(--graphite)]">{region.name}</span>
              <button
                type="button"
                onClick={() => jump(region)}
                className="btn btn-ghost !px-2 !py-1 !text-[11px]"
                title={`Open ${region.name} in Explore`}
              >
                Explore →
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
