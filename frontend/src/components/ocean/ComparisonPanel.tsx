import type { RegionStats } from "@/lib/api";
import { COMPARE_HOW_TO_READ, COMPARE_WHY_DIFFERENT } from "@/lib/explainers";

interface ComparisonPanelProps {
  regionA: RegionStats;
  regionB: RegionStats;
  onClose: () => void;
}

/** One head-to-head row: two bars growing outward from a centre line, numbers as captions. */
function Versus({
  label,
  a,
  b,
  format,
  color,
}: {
  label: string;
  a: number | null;
  b: number | null;
  format: (v: number) => string;
  color: string;
}) {
  const max = Math.max(Math.abs(a ?? 0), Math.abs(b ?? 0), 0.001);
  const w = (v: number | null) => `${v === null ? 0 : Math.max(2, (Math.abs(v) / max) * 100)}%`;
  return (
    <div>
      <p className="eyebrow mb-1 text-center">{label}</p>
      <div className="flex items-center gap-2">
        <span className="w-12 text-right font-mono text-[11px]">{a === null ? "—" : format(a)}</span>
        <div className="flex h-2.5 flex-1 justify-end overflow-hidden rounded-l-full bg-[rgba(26,26,26,0.08)]">
          <span className="h-full rounded-l-full" style={{ width: w(a), background: color }} />
        </div>
        <div className="flex h-2.5 flex-1 overflow-hidden rounded-r-full bg-[rgba(26,26,26,0.08)]">
          <span className="h-full rounded-r-full bg-[var(--graphite-2)]" style={{ width: w(b) }} />
        </div>
        <span className="w-12 font-mono text-[11px]">{b === null ? "—" : format(b)}</span>
      </div>
    </div>
  );
}

/**
 * Head-to-head regional comparison — the same real `/compare` stats the Ask bar's
 * `compare_regions` intent surfaces, drawn as opposing bars instead of a stat table.
 */
export function ComparisonPanel({ regionA, regionB, onClose }: ComparisonPanelProps) {
  return (
    <div className="card rise pointer-events-auto w-[calc(100vw-2.5rem)] max-h-[calc(100dvh-var(--footer-h,21.25rem)-6.5rem)] overflow-y-auto p-5 [scrollbar-width:thin] sm:w-[26rem]">
      <div className="flex items-start justify-between">
        <div>
          <p className="eyebrow">Head to head</p>
          <p className="font-display text-[22px] leading-tight">
            {regionA.name} <span className="italic text-[var(--graphite-3)]">vs</span> {regionB.name}
          </p>
        </div>
        <button onClick={onClose} aria-label="Close comparison" className="btn btn-ghost !px-2 !py-1 !text-[11px]">
          ✕
        </button>
      </div>

      <div className="mt-3 space-y-3">
        <Versus label="Floats" a={regionA.float_count} b={regionB.float_count} format={(v) => `${v}`} color="var(--cobalt)" />
        <Versus label="Profiles" a={regionA.profile_count} b={regionB.profile_count} format={(v) => `${v}`} color="var(--cobalt)" />
        <Versus
          label="Surface temperature"
          a={regionA.mean_surface_temperature_c}
          b={regionB.mean_surface_temperature_c}
          format={(v) => `${v.toFixed(1)}°`}
          color="var(--coral)"
        />
        <Versus
          label="Surface salinity"
          a={regionA.mean_surface_salinity_psu}
          b={regionB.mean_surface_salinity_psu}
          format={(v) => v.toFixed(1)}
          color="var(--ink-2)"
        />
      </div>
      <p className="annotation mt-3 text-[13px]">left = {regionA.name}, right = {regionB.name}</p>
      <div className="mt-3 space-y-2 border-t border-[var(--line)] pt-3">
        <p className="text-[12px] leading-relaxed text-[var(--graphite-2)]">
          <span className="font-semibold text-[var(--graphite)]">How to read it. </span>
          {COMPARE_HOW_TO_READ}
        </p>
        <p className="text-[12px] leading-relaxed text-[var(--graphite-2)]">
          <span className="font-semibold text-[var(--graphite)]">Why regions differ. </span>
          {COMPARE_WHY_DIFFERENT}
        </p>
        {regionA.mean_surface_temperature_c !== null && regionB.mean_surface_temperature_c !== null && (
          <p className="text-[12px] leading-relaxed text-[var(--graphite-2)]">
            <span className="font-semibold text-[var(--graphite)]">Here. </span>
            {Math.abs(regionA.mean_surface_temperature_c - regionB.mean_surface_temperature_c) < 0.5
              ? `Both regions run about the same surface temperature right now.`
              : `${regionA.mean_surface_temperature_c > regionB.mean_surface_temperature_c ? regionA.name : regionB.name} runs about ${Math.abs(regionA.mean_surface_temperature_c - regionB.mean_surface_temperature_c).toFixed(1)}°C warmer at the surface.`}
            {regionA.mean_surface_salinity_psu !== null && regionB.mean_surface_salinity_psu !== null && Math.abs(regionA.mean_surface_salinity_psu - regionB.mean_surface_salinity_psu) >= 0.5
              ? ` ${regionA.mean_surface_salinity_psu > regionB.mean_surface_salinity_psu ? regionA.name : regionB.name} is noticeably saltier — usually a sign of more evaporation or less river and rain water.`
              : ""}
          </p>
        )}
      </div>
    </div>
  );
}
