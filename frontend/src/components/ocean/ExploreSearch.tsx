"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useOceanStore } from "@/stores/oceanStore";
import { regionCentroid } from "./geo";
import type { FloatSummary } from "@/lib/api";

interface ResultItem {
  id: string;
  label: string;
  hint: string;
  run: () => void;
}

/**
 * Explore's own quick-jump search — distinct from both the global ⌘K CommandSearch (pages +
 * regions, reachable everywhere) and the Ask bar (natural-language questions that change the
 * whole scene). This one only does one thing: find a specific real float (by WMO id or numeric
 * id) or region by name and fly the camera there — a lookup, not a question, so it never
 * touches `lastQuery`/`askHistory` or anything the Ask bar owns. Collapsed to an icon by default
 * so it doesn't compete with the Ask bar for attention.
 */
export function ExploreSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const floats = useOceanStore((s) => s.floats);
  const regions = useOceanStore((s) => s.regions);
  const selectFloat = useOceanStore((s) => s.selectFloat);
  const setFlyToTarget = useOceanStore((s) => s.setFlyToTarget);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const jumpToFloat = (float: FloatSummary) => {
    selectFloat(float);
    setFlyToTarget({ lat: float.latest_lat, lon: float.latest_lon, band: "floats" });
  };

  const results = useMemo<ResultItem[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const regionItems: ResultItem[] = regions
      .filter((r) => r.name.toLowerCase().includes(q) || r.key.toLowerCase().includes(q))
      .slice(0, 5)
      .map((r) => ({
        id: `region:${r.key}`,
        label: r.name,
        hint: "region",
        run: () => setFlyToTarget({ ...regionCentroid(r), band: "region" }),
      }));

    // A float's WMO id is the number a real oceanographer would search by; the internal numeric
    // id is included too since that's what URLs/case files reference.
    const floatItems: ResultItem[] = floats
      .filter((f) => f.wmo_id.toLowerCase().includes(q) || String(f.id) === q)
      .slice(0, 8)
      .map((f) => ({
        id: `float:${f.id}`,
        label: `Float ${f.wmo_id}`,
        hint: `#${f.id}`,
        run: () => jumpToFloat(f),
      }));

    return [...regionItems, ...floatItems];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, regions, floats, setFlyToTarget]);

  const runAndClose = (item: ResultItem) => {
    item.run();
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={containerRef} className="pointer-events-auto">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Find a float or region"
          title="Find a float or region"
          className="card grid h-9 w-9 place-items-center rounded-full text-[14px] text-[var(--graphite-2)] transition-colors hover:text-[var(--graphite)]"
        >
          ⌕
        </button>
      ) : (
        <div className="card w-64 overflow-hidden rounded-2xl p-0 sm:w-72">
          <div className="flex items-center gap-2 border-b border-[var(--line)] px-3 py-2">
            <span aria-hidden className="text-[13px] text-[var(--graphite-3)]">
              ⌕
            </span>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Float WMO id or region…"
              className="w-full bg-transparent text-[13px] text-[var(--graphite)] placeholder:text-[var(--graphite-3)] focus:outline-none"
              aria-label="Find a float or region"
            />
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="text-[12px] text-[var(--graphite-3)] hover:text-[var(--graphite)]"
            >
              ✕
            </button>
          </div>
          {query.trim() && (
            <div className="max-h-56 overflow-y-auto p-1.5 [scrollbar-width:thin]">
              {results.length === 0 ? (
                <p className="px-3 py-3 text-center text-[12px] text-[var(--graphite-3)]">No matches.</p>
              ) : (
                results.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => runAndClose(item)}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[12.5px] text-[var(--graphite-2)] transition-colors hover:bg-[var(--hover-tint)] hover:text-[var(--graphite)]"
                  >
                    <span className="font-medium">{item.label}</span>
                    <span className="font-mono text-[10px] text-[var(--graphite-3)]">{item.hint}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
