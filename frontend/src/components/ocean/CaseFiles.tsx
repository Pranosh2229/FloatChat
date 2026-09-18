"use client";

import { useEffect, useMemo, useState } from "react";

import { useOceanStore } from "@/stores/oceanStore";
import { landPathsInBox, loadCoastline, type LandPolygon } from "@/lib/coastline";
import type { EventSummary, RegionInfo } from "@/lib/api";

const EVENT_TYPE_LABELS: Record<string, string> = {
  surface_warming: "Surface warming",
  subsurface_warming: "Subsurface warming",
  cooling_event: "Cooling",
  salinity_anomaly: "Salinity shift",
  mixed_anomaly: "Mixed signal",
};

/** A region drawn as a small chart: real coastline in sand, the event's real footprint in
 * coral, the real floats involved as dots. No sentence, no "31 float(s)". */
function MiniMap({
  region,
  event,
  land,
  floatPositions,
}: {
  region: RegionInfo;
  event: EventSummary;
  land: LandPolygon[] | null;
  floatPositions: { lat: number; lon: number }[];
}) {
  const pad = 2;
  const box = {
    minLon: region.min_lon - pad,
    maxLon: region.max_lon + pad,
    minLat: region.min_lat - pad,
    maxLat: region.max_lat + pad,
  };
  const extent = event.spatial_extent as {
    min_lat?: number;
    max_lat?: number;
    min_lon?: number;
    max_lon?: number;
  };
  const w = box.maxLon - box.minLon;
  const h = box.maxLat - box.minLat;
  const paths = useMemo(() => (land ? landPathsInBox(land, box) : ""), [land, box.minLon, box.maxLon, box.minLat, box.maxLat]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <svg viewBox={`${box.minLon} ${-box.maxLat} ${w} ${h}`} className="h-full w-full" preserveAspectRatio="xMidYMid slice">
      <rect x={box.minLon} y={-box.maxLat} width={w} height={h} fill="var(--ink-2)" />
      {paths && <path d={paths} fill="var(--sand)" stroke="var(--graphite)" strokeWidth={w / 220} strokeOpacity={0.5} />}
      <rect
        x={region.min_lon}
        y={-region.max_lat}
        width={region.max_lon - region.min_lon}
        height={region.max_lat - region.min_lat}
        fill="none"
        stroke="var(--paper)"
        strokeWidth={w / 260}
        strokeDasharray={`${w / 60} ${w / 90}`}
        opacity={0.8}
      />
      {extent.min_lon !== undefined && extent.max_lon !== undefined && extent.min_lat !== undefined && extent.max_lat !== undefined && (
        <rect
          x={extent.min_lon}
          y={-extent.max_lat}
          width={Math.max(extent.max_lon - extent.min_lon, w / 40)}
          height={Math.max(extent.max_lat - extent.min_lat, h / 40)}
          fill="var(--coral)"
          fillOpacity={0.35}
          stroke="var(--coral)"
          strokeWidth={w / 160}
        />
      )}
      {floatPositions.map((p, i) => (
        <circle key={i} cx={p.lon} cy={-p.lat} r={w / 70} fill="var(--gold)" stroke="var(--graphite)" strokeWidth={w / 400} />
      ))}
    </svg>
  );
}

/**
 * Case files (replaces the text-list "Discovery" panel): real detected events as small chart
 * cards — mini-map, magnitude bar, type — so a first-time visitor sees *where* and *how big*
 * before reading a word. Clicking one opens the real evidence chain via `selectEvent`.
 */
export function CaseFiles({ onClose }: { onClose?: () => void }) {
  const discoveryEvents = useOceanStore((s) => s.discoveryEvents);
  const discoveryLoading = useOceanStore((s) => s.discoveryLoading);
  const loadDiscoveryEvents = useOceanStore((s) => s.loadDiscoveryEvents);
  const selectEvent = useOceanStore((s) => s.selectEvent);
  const loadComparison = useOceanStore((s) => s.loadComparison);
  const regions = useOceanStore((s) => s.regions);
  const floats = useOceanStore((s) => s.floats);
  const [land, setLand] = useState<LandPolygon[] | null>(null);

  useEffect(() => {
    loadDiscoveryEvents();
    loadCoastline().then(setLand).catch((error) => console.error("coastline:", error));
  }, [loadDiscoveryEvents]);

  const maxAnomalies = Math.max(1, ...discoveryEvents.map((e) => e.anomaly_count));
  const floatById = useMemo(() => new Map(floats.map((f) => [f.id, f])), [floats]);

  return (
    <div className="card pointer-events-auto max-h-[calc(100dvh-var(--footer-h,21.25rem)-6.5rem)] w-[calc(100vw-2.5rem)] overflow-y-auto p-4 [scrollbar-width:thin] sm:w-96">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <p className="eyebrow !text-[var(--graphite-2)]">Open cases · real detections</p>
          <p className="font-display text-[26px] leading-none text-[var(--graphite)]">Something&apos;s off out there.</p>
          <p className="mt-1.5 text-[12px] leading-snug text-[var(--graphite-2)]">
            Places where real float readings drifted away from the seasonal normal. Open one to see what
            happened, why it matters, and the data behind it.
          </p>
        </div>
        {onClose && (
          <button onClick={onClose} aria-label="Hide case files" className="btn btn-ghost !px-2 !py-1 !text-[11px]">
            ✕
          </button>
        )}
      </div>

      {discoveryLoading && discoveryEvents.length === 0 && (
        <div className="card px-4 py-3 text-xs text-[var(--graphite-3)]">Opening the case files…</div>
      )}
      {!discoveryLoading && discoveryEvents.length === 0 && (
        <div className="card px-4 py-3 text-xs text-[var(--graphite-3)]">
          No detected events on file yet — ask the ocean a question directly.
        </div>
      )}

      <div className="grid grid-cols-1 gap-2.5">
        {discoveryEvents.slice(0, 6).map((event, index) => {
          const region = regions.find((r) => r.key === event.region);
          const positions = event.affected_float_ids
            .map((id) => floatById.get(id))
            .filter((f): f is NonNullable<typeof f> => !!f)
            .map((f) => ({ lat: f.latest_lat, lon: f.latest_lon }));
          return (
            <button
              key={event.id}
              onClick={() => selectEvent(event.id)}
              className="card card-hover flex overflow-hidden text-left"
            >
              <div className="relative h-28 w-36 shrink-0 bg-[var(--ink-2)]">
                {region && <MiniMap region={region} event={event} land={land} floatPositions={positions} />}
                <span className="absolute left-2 top-2 rounded-full bg-[var(--paper)] px-1.5 py-0.5 font-mono text-[9px] tracking-[0.15em] text-[var(--graphite)]">
                  0{index + 1}
                </span>
              </div>
              <div className="flex-1 px-3 py-2.5">
                <p className="text-[14px] font-semibold leading-tight">{EVENT_TYPE_LABELS[event.type] ?? event.type}</p>
                <p className="mt-0.5 text-[12px] text-[var(--graphite-2)]">{region?.name ?? event.region}</p>
                <p className="mt-1 text-[11px] leading-snug text-[var(--graphite-3)]">
                  {event.depth_min.toFixed(0)}–{event.depth_max.toFixed(0)} m down ·{" "}
                  {new Date(event.start_time).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
                </p>
                <div className="mt-2 flex items-center gap-1.5">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[rgba(26,26,26,0.1)]">
                    <span
                      className="block h-full rounded-full bg-[var(--coral)]"
                      style={{ width: `${Math.max(6, Math.round((event.anomaly_count / maxAnomalies) * 100))}%` }}
                    />
                  </span>
                  <span className="font-mono text-[10px] text-[var(--graphite-3)]">{event.affected_float_ids.length} floats</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {regions.length >= 2 && (
        <button
          onClick={() => loadComparison(regions[1].key, regions[0].key)}
          className="card card-hover mt-2 flex w-full items-center justify-between px-3 py-2 text-left"
        >
          <span className="text-[12px] font-semibold">
            {regions[1].name} <span className="annotation">vs</span> {regions[0].name}
          </span>
          <span className="text-[var(--cobalt)]">→</span>
        </button>
      )}
    </div>
  );
}
