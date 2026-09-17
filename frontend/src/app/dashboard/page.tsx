"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { api, type DashboardStats, type EventSummary } from "@/lib/api";
import { landPathsInBox, loadCoastline, type LandPolygon } from "@/lib/coastline";
import { EVENT_EXPLAINERS } from "@/lib/explainers";
import { useOceanStore } from "@/stores/oceanStore";
import { regionCentroid } from "@/components/ocean/geo";
import { Reveal } from "@/components/home/Reveal";

const TYPE_COLORS: Record<string, string> = {
  surface_warming: "#f0562f",
  subsurface_warming: "#c2410c",
  cooling_event: "#1d4ed8",
  salinity_anomaly: "#1b5e6b",
  mixed_anomaly: "#8a877f",
};

function Tile({ n, label, note }: { n: number; label: string; note: string }) {
  return (
    <div className="card p-5">
      <p className="eyebrow">{label}</p>
      <p className="mt-2 font-display text-[44px] leading-none">{n.toLocaleString()}</p>
      <p className="mt-2 text-[12px] leading-relaxed text-[var(--graphite-3)]">{note}</p>
    </div>
  );
}

function BarRow({
  label,
  value,
  max,
  color = "var(--cobalt)",
  caption,
}: {
  label: string;
  value: number;
  max: number;
  color?: string;
  caption?: string;
}) {
  return (
    <div className="grid grid-cols-[9rem_1fr_3.5rem] items-center gap-3 text-[12px]">
      <span className="truncate text-[var(--graphite-2)]">{label}</span>
      <span className="h-3 overflow-hidden rounded-full bg-[rgba(26,26,26,0.08)]">
        <span className="block h-full rounded-full" style={{ width: `${max ? Math.max(1.5, (value / max) * 100) : 0}%`, background: color }} />
      </span>
      <span className="text-right font-mono text-[11px]">{caption ?? value.toLocaleString()}</span>
    </div>
  );
}

/**
 * Dashboard — the "zoom out" page: the whole dataset as charts. A world chart of the 11
 * regions, real totals, where the floats are, what has been detected (by type, by region, by
 * month), and a plain-language reading of what it all adds up to. Every number is a real row;
 * the narrative is derived from those numbers, not written in advance.
 */
export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [land, setLand] = useState<LandPolygon[] | null>(null);
  const regions = useOceanStore((s) => s.regions);
  const loadRegions = useOceanStore((s) => s.loadRegions);
  const setFlyTo = useOceanStore((s) => s.setFlyToTarget);

  useEffect(() => {
    loadRegions();
    api.dashboardStats().then(setStats).catch((e) => setError(e instanceof Error ? e.message : "failed"));
    api.events().then(setEvents).catch(() => {});
    loadCoastline().then(setLand).catch(() => {});
  }, [loadRegions]);

  const box = { minLon: -180, maxLon: 180, minLat: -75, maxLat: 82 };
  const paths = useMemo(() => (land ? landPathsInBox(land, box) : ""), [land]); // eslint-disable-line react-hooks/exhaustive-deps
  const maxFloats = Math.max(1, ...(stats?.regions.map((r) => r.float_count) ?? [1]));
  const maxProfiles = Math.max(1, ...(stats?.regions.map((r) => r.profile_count) ?? [1]));
  const maxEvents = Math.max(1, ...(stats?.regions.map((r) => r.event_count) ?? [1]));
  const mostActive = stats?.regions.find((r) => r.key === stats.most_active_region_key);
  const regionName = (key: string) => regions.find((r) => r.key === key)?.name ?? key;

  const byType = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of events) m.set(e.type, (m.get(e.type) ?? 0) + 1);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [events]);

  const byMonth = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of events) {
      const d = new Date(e.start_time);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [events]);
  const maxMonth = Math.max(1, ...byMonth.map(([, n]) => n));

  const dominant = byType[0];
  const regionsWithEvents = stats ? stats.regions.filter((r) => r.event_count > 0).length : 0;
  const depthiest = events.length
    ? events.reduce((acc, e) => (e.depth_max > acc.depth_max ? e : acc), events[0])
    : null;

  return (
    <main className="paper-grid min-h-dvh px-6 pb-24 pt-28 sm:px-12">
      <div className="mx-auto max-w-6xl">
        <p className="eyebrow">Mission control</p>
        <h1 className="mt-2 font-display text-[clamp(40px,6vw,72px)] leading-none">The whole picture.</h1>
        <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-[var(--graphite-2)]">
          Everything FloatChat knows right now, in one place: where the robots are, how much they have
          measured, and where the ocean has stepped outside its normal range.
        </p>

        {error && <p className="mt-4 text-sm text-[var(--coral)]">Couldn&apos;t load stats: {error}</p>}

        {/* World chart */}
        <Reveal className="mt-8">
          <div className="card overflow-hidden">
            <svg viewBox={`${box.minLon} ${-box.maxLat} ${box.maxLon - box.minLon} ${box.maxLat - box.minLat}`} className="h-auto w-full">
              <rect x={box.minLon} y={-box.maxLat} width={360} height={box.maxLat - box.minLat} fill="#1b5e6b" />
              {paths && <path d={paths} fill="#d9c9a3" stroke="#1a1a1a" strokeWidth={0.25} strokeOpacity={0.5} />}
              {regions.map((region) => {
                const s = stats?.regions.find((r) => r.key === region.key);
                const cx = (region.min_lon + region.max_lon) / 2;
                const cy = -(region.min_lat + region.max_lat) / 2;
                const r = 2 + (s ? (s.float_count / maxFloats) * 6 : 0);
                return (
                  <g key={region.key}>
                    <rect x={region.min_lon} y={-region.max_lat} width={region.max_lon - region.min_lon} height={region.max_lat - region.min_lat} fill="#f3ede0" fillOpacity={0.12} stroke="#f3ede0" strokeWidth={0.3} strokeDasharray="1.5 1" />
                    {s && s.event_count > 0 && (
                      <circle cx={cx} cy={cy} r={r + 2 + Math.min(6, s.event_count / 8)} fill="none" stroke="#f0562f" strokeWidth={0.6} />
                    )}
                    <circle cx={cx} cy={cy} r={r} fill="#f4c95d" stroke="#1a1a1a" strokeWidth={0.3} />
                    <text x={cx} y={cy - r - 2.5} textAnchor="middle" fontSize={3.2} fill="#f3ede0" fontFamily="var(--font-geist-mono)" letterSpacing={0.4}>
                      {region.name.toUpperCase()}
                    </text>
                  </g>
                );
              })}
            </svg>
            <p className="annotation px-4 py-2 text-[13px]">gold dot = how many floats · coral ring = detected events (bigger ring, more events)</p>
          </div>
        </Reveal>

        {/* Totals */}
        <div className="mt-6 grid gap-4 sm:grid-cols-4">
          {[
            { n: stats?.total_floats ?? 0, label: "Floats", note: "robotic floats seen in the 11 regions over the last two years" },
            { n: stats?.total_profiles ?? 0, label: "Dives (profiles)", note: "each one a column of readings from ~2 km up to the surface" },
            { n: stats?.total_events ?? 0, label: "Events detected", note: "clusters of readings well outside the seasonal normal" },
            { n: stats?.total_sst_points ?? 0, label: "Satellite readings", note: "NOAA surface temperatures, sampled monthly on a grid" },
          ].map((t, i) => (
            <Reveal key={t.label} delayMs={i * 80}>
              <Tile {...t} />
            </Reveal>
          ))}
        </div>

        {/* What it adds up to */}
        {stats && (
          <Reveal className="mt-6">
            <div className="card p-6">
              <p className="eyebrow">What the ocean is telling us</p>
              <p className="mt-2 font-display text-[clamp(22px,3vw,32px)] leading-tight">
                {regionsWithEvents} of {stats.total_regions} regions have something unusual on file
                {dominant && (
                  <>
                    , and {EVENT_EXPLAINERS[dominant[0]]?.title.toLowerCase() ?? dominant[0]} is the most common kind
                  </>
                )}
                .
              </p>
              <p className="mt-3 max-w-3xl text-[14px] leading-relaxed text-[var(--graphite-2)]">
                {mostActive && (
                  <>
                    The busiest place is the <span className="font-semibold text-[var(--graphite)]">{mostActive.name}</span> with{" "}
                    {mostActive.event_count} detected events across {mostActive.float_count} floats.{" "}
                  </>
                )}
                {dominant && EVENT_EXPLAINERS[dominant[0]] && <>{EVENT_EXPLAINERS[dominant[0]].why} </>}
                {depthiest && (
                  <>
                    The deepest-reaching event on file extends to about {depthiest.depth_max.toFixed(0)} m in the{" "}
                    {regionName(depthiest.region)}.
                  </>
                )}
              </p>
              <p className="annotation mt-3 text-[13px]">
                &ldquo;Unusual&rdquo; always means: compared with the World Ocean Atlas long-term average for the same place, depth and season.
              </p>
            </div>
          </Reveal>
        )}

        {/* Two-column charts */}
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Reveal>
            <div className="card p-5">
              <p className="eyebrow">Where the floats are</p>
              <p className="mt-1 font-display text-[24px] leading-tight">Coverage by region</p>
              <p className="mt-1 text-[12px] text-[var(--graphite-3)]">Floats (gold) and dives (ink). More dives = a better-observed region.</p>
              <div className="mt-4 space-y-2.5">
                {[...(stats?.regions ?? [])]
                  .sort((a, b) => b.float_count - a.float_count)
                  .map((r) => (
                    <div key={r.key} className="space-y-1">
                      <BarRow label={r.name} value={r.float_count} max={maxFloats} color="#f4c95d" caption={`${r.float_count} ⚲`} />
                      <BarRow label="" value={r.profile_count} max={maxProfiles} color="var(--ink-2)" caption={`${r.profile_count} ↧`} />
                    </div>
                  ))}
              </div>
            </div>
          </Reveal>

          <div className="flex flex-col gap-4">
            <Reveal>
              <div className="card p-5">
                <p className="eyebrow">What was detected</p>
                <p className="mt-1 font-display text-[24px] leading-tight">Events by kind</p>
                <div className="mt-4 space-y-2.5">
                  {byType.map(([type, n]) => (
                    <BarRow key={type} label={EVENT_EXPLAINERS[type]?.title ?? type} value={n} max={byType[0]?.[1] ?? 1} color={TYPE_COLORS[type] ?? "var(--graphite-2)"} />
                  ))}
                  {byType.length === 0 && <p className="text-[12px] text-[var(--graphite-3)]">No events on file yet.</p>}
                </div>
                {byType[0] && EVENT_EXPLAINERS[byType[0][0]] && (
                  <p className="mt-3 text-[12px] leading-relaxed text-[var(--graphite-2)]">
                    <span className="font-semibold text-[var(--graphite)]">{EVENT_EXPLAINERS[byType[0][0]].title}: </span>
                    {EVENT_EXPLAINERS[byType[0][0]].what}
                  </p>
                )}
              </div>
            </Reveal>
            <Reveal delayMs={80}>
              <div className="card p-5">
                <p className="eyebrow">Events by region</p>
                <div className="mt-3 space-y-2">
                  {[...(stats?.regions ?? [])]
                    .sort((a, b) => b.event_count - a.event_count)
                    .map((r) => (
                      <BarRow key={r.key} label={r.name} value={r.event_count} max={maxEvents} color="var(--coral)" />
                    ))}
                </div>
              </div>
            </Reveal>
          </div>
        </div>

        {/* Timeline histogram */}
        <Reveal className="mt-4">
          <div className="card p-5">
            <p className="eyebrow">When</p>
            <p className="mt-1 font-display text-[24px] leading-tight">Events over time</p>
            <p className="mt-1 text-[12px] text-[var(--graphite-3)]">How many detected events started in each month.</p>
            <div className="mt-4 flex h-32 items-end gap-1">
              {byMonth.map(([month, n]) => (
                <div key={month} className="group relative flex h-full flex-1 flex-col items-center justify-end">
                  <span className="w-full rounded-t-sm bg-[var(--coral)]" style={{ height: `${Math.max(3, (n / maxMonth) * 88)}%` }} />
                  <span className="mt-1 font-mono text-[9px] text-[var(--graphite-3)]">{month.slice(2).replace("-", "/")}</span>
                  <span className="pointer-events-none absolute -top-5 rounded bg-[var(--graphite)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--paper)] opacity-0 transition-opacity group-hover:opacity-100">
                    {n}
                  </span>
                </div>
              ))}
              {byMonth.length === 0 && <p className="text-[12px] text-[var(--graphite-3)]">No events on file yet.</p>}
            </div>
          </div>
        </Reveal>

        {mostActive && (
          <Reveal className="mt-6">
            <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
              <div>
                <p className="eyebrow">Most active right now</p>
                <p className="font-display text-[30px] leading-none">{mostActive.name}</p>
                <p className="mt-1 text-[13px] text-[var(--graphite-2)]">
                  {mostActive.event_count} detected events across {mostActive.float_count} floats. Go and look.
                </p>
              </div>
              <Link
                href="/explore"
                className="btn btn-primary"
                onClick={() => {
                  const region = regions.find((r) => r.key === mostActive.key);
                  if (region) setFlyTo({ ...regionCentroid(region), band: "region" });
                }}
              >
                Go there <span aria-hidden>→</span>
              </Link>
            </div>
          </Reveal>
        )}
      </div>
    </main>
  );
}
