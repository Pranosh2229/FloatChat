import type { FloatDetail, ProfileDetail, ThermoclineOut, TrajectoryResponse } from "@/lib/api";
import {
  ARGO_FLOAT_WHAT,
  ARGO_FLOAT_WHY,
  DATA_MODE_MEANING,
  PROFILE_WHAT,
  depthMeaning,
} from "@/lib/explainers";
import { DepthProfileChart } from "./DepthProfileChart";
import { ExportMenu } from "@/components/ui/ExportMenu";

const DATA_MODE_LABELS: Record<string, string> = {
  R: "Real-time",
  D: "Quality-controlled",
  A: "Adjusted",
};

interface FloatInfoPanelProps {
  float: FloatDetail;
  trajectory: TrajectoryResponse | null;
  latestProfile: ProfileDetail | null;
  latestThermocline: ThermoclineOut | null;
  onClose: () => void;
}

/** The float's own journey as a tiny path sketch (real profile positions, time-ordered). */
function JourneySketch({ trajectory }: { trajectory: TrajectoryResponse | null }) {
  if (!trajectory || trajectory.points.length < 2) {
    return <div className="h-28 w-full rounded-md bg-[var(--paper-2)]" />;
  }
  const lons = trajectory.points.map((p) => p.longitude);
  const lats = trajectory.points.map((p) => p.latitude);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const span = Math.max(maxLon - minLon, maxLat - minLat, 0.2);
  const cx = (minLon + maxLon) / 2;
  const cy = (minLat + maxLat) / 2;
  const box = { x: cx - span * 0.6, y: -(cy + span * 0.6), w: span * 1.2, h: span * 1.2 };
  const d = trajectory.points.map((p, i) => `${i === 0 ? "M" : "L"}${p.longitude} ${-p.latitude}`).join(" ");
  const first = trajectory.points[0];
  const last = trajectory.points[trajectory.points.length - 1];
  return (
    <svg viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} className="h-28 w-full rounded-md bg-[var(--paper-2)]">
      <path d={d} fill="none" stroke="var(--cobalt)" strokeWidth={span / 90} strokeLinejoin="round" />
      <circle cx={first.longitude} cy={-first.latitude} r={span / 50} fill="var(--paper)" stroke="var(--graphite)" strokeWidth={span / 250} />
      <circle cx={last.longitude} cy={-last.latitude} r={span / 40} fill="var(--gold)" stroke="var(--graphite)" strokeWidth={span / 200} />
    </svg>
  );
}

function driftKm(trajectory: TrajectoryResponse | null): number | null {
  if (!trajectory || trajectory.points.length < 2) return null;
  let km = 0;
  for (let i = 1; i < trajectory.points.length; i++) {
    const a = trajectory.points[i - 1];
    const b = trajectory.points[i];
    const dLat = (b.latitude - a.latitude) * 111;
    const dLon = (b.longitude - a.longitude) * 111 * Math.cos((a.latitude * Math.PI) / 180);
    km += Math.hypot(dLat, dLon);
  }
  return km;
}

export function FloatInfoPanel({
  float,
  trajectory,
  latestProfile,
  latestThermocline,
  onClose,
}: FloatInfoPanelProps) {
  const profiles = trajectory?.points.length ?? null;
  const drift = driftKm(trajectory);
  const first = trajectory?.points[0];
  const months =
    first && trajectory
      ? Math.max(1, Math.round((new Date(float.latest_time).getTime() - new Date(first.timestamp).getTime()) / (30 * 86400000)))
      : null;

  const summaryText = [
    `ARGO float ${float.wmo_id}`,
    `Now at ${float.latest_lat.toFixed(2)}°, ${float.latest_lon.toFixed(2)}° · last heard ${new Date(float.latest_time).toLocaleDateString()}`,
    profiles !== null ? `${profiles} profiles over ${months} month${months === 1 ? "" : "s"}${drift !== null ? `, drifted about ${Math.round(drift)} km` : ""}` : null,
    latestProfile ? `Latest dive: ${latestProfile.pressure_dbar.length} readings down to ${Math.max(...latestProfile.pressure_dbar).toFixed(0)} m` : null,
  ].filter(Boolean).join("\n");

  const csvRows = trajectory?.points.map((p) => ({
    timestamp: p.timestamp,
    latitude: p.latitude,
    longitude: p.longitude,
    profile_id: p.profile_id,
  }));

  return (
    <div className="card rise pointer-events-auto w-[calc(100vw-2.5rem)] max-h-[calc(100dvh-var(--footer-h,21.25rem)-6.5rem)] overflow-y-auto p-5 [scrollbar-width:thin] sm:w-[26rem]">
      <div className="flex items-start justify-between">
        <div>
          <p className="eyebrow">ARGO float · ID {float.wmo_id}</p>
          <p className="font-display text-[28px] leading-none">One robot, reporting from the sea.</p>
        </div>
        <div className="flex shrink-0 items-start gap-1.5">
          <ExportMenu filename={`float-${float.wmo_id}`} summary={summaryText} json={{ float, trajectory, latestProfile }} csvRows={csvRows} />
          <button onClick={onClose} aria-label="Close float details" className="btn btn-ghost !px-2 !py-1 !text-[11px]">
            ✕
          </button>
        </div>
      </div>

      <p className="mt-3 text-[13px] leading-relaxed text-[var(--graphite-2)]">{ARGO_FLOAT_WHAT}</p>

      <div className="mt-4">
        <p className="eyebrow mb-1.5">Where it has drifted</p>
        <JourneySketch trajectory={trajectory} />
        <p className="mt-1.5 text-[12px] leading-snug text-[var(--graphite-2)]">
          {profiles !== null ? (
            <>
              <span className="font-semibold text-[var(--graphite)]">{profiles} profiles</span> over{" "}
              {months} month{months === 1 ? "" : "s"}
              {drift !== null && (
                <>
                  , drifting about <span className="font-semibold text-[var(--graphite)]">{Math.round(drift)} km</span>
                </>
              )}
              . Pale dot = first, gold = latest.
            </>
          ) : (
            "Loading its journey…"
          )}
        </p>
        <p className="mt-2 text-[12px] leading-snug text-[var(--graphite-2)]">{PROFILE_WHAT}</p>
      </div>

      <div className="mt-4">
        <p className="eyebrow mb-1.5">Its latest dive, depth by depth</p>
        {latestProfile ? (
          <DepthProfileChart profile={latestProfile} thermocline={latestThermocline} />
        ) : (
          <div className="space-y-2">
            <div className="h-[220px] w-full animate-pulse rounded-lg bg-[var(--paper-2)]" />
            <p className="text-[12px] leading-snug text-[var(--graphite-2)]">{depthMeaning(float.depth_max)}</p>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="rounded-full border border-[var(--line-strong)] px-2 py-0.5 font-mono text-[10px]">
          now at {float.latest_lat.toFixed(2)}°, {float.latest_lon.toFixed(2)}°
        </span>
        <span className="rounded-full border border-[var(--line-strong)] px-2 py-0.5 font-mono text-[10px]">
          last heard {new Date(float.latest_time).toLocaleDateString()}
        </span>
        <span className="rounded-full bg-[var(--graphite)] px-2 py-0.5 font-mono text-[10px] text-[var(--paper)]">
          {DATA_MODE_LABELS[float.data_mode] ?? float.data_mode}
        </span>
      </div>
      <p className="mt-1.5 text-[12px] leading-snug text-[var(--graphite-2)]">
        {DATA_MODE_MEANING[float.data_mode] ?? "Data mode not reported."}
      </p>

      <p className="annotation mt-3 text-[13px]">{ARGO_FLOAT_WHY}</p>
    </div>
  );
}
