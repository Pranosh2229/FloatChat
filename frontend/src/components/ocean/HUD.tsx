"use client";

import { useEffect, useMemo, useState } from "react";

import { landPathsInBox, loadCoastline, type LandPolygon } from "@/lib/coastline";
import { useOceanStore } from "@/stores/oceanStore";
import { BANDS, cameraRig } from "./worldCamera";
import { worldToLatLon } from "./geo";

const WORLD_BOX = { minLon: -180, maxLon: 180, minLat: -75, maxLat: 82 };

/**
 * Toggleable HUD (REDESIGN_PLAN.md decision #4) — compass, mini-map, altitude readout. Off by
 * default; a small corner button reveals it. `cameraRig` is a plain mutable object updated every
 * R3F frame (see worldCamera.ts), so this polls it on a light interval rather than subscribing
 * to Zustand or useFrame — the HUD only needs to refresh a few times a second, not 60.
 */
export function HUD() {
  const [open, setOpen] = useState(false);
  const [land, setLand] = useState<LandPolygon[] | null>(null);
  const [rig, setRig] = useState({ lat: 0, lon: 0, band: cameraRig.band, distance: cameraRig.distance });
  const regions = useOceanStore((s) => s.regions);

  useEffect(() => {
    if (!open) return;
    loadCoastline().then(setLand).catch(() => {});
    const id = window.setInterval(() => {
      const { lat, lon } = worldToLatLon(cameraRig.target);
      setRig({ lat, lon, band: cameraRig.band, distance: cameraRig.distance });
    }, 150);
    return () => window.clearInterval(id);
  }, [open]);

  const paths = useMemo(
    () => (land ? landPathsInBox(land, WORLD_BOX) : ""),
    [land],
  );

  const band = BANDS[rig.band];

  return (
    <div className="pointer-events-auto flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-pressed={open}
        aria-label="Toggle HUD"
        className={`btn !px-2.5 !py-1.5 !text-[11px] ${open ? "!bg-[var(--graphite)] !text-[var(--paper)]" : ""}`}
      >
        ⊹ HUD
      </button>

      {open && (
        <div className="card rise w-52 p-3">
          <div className="flex items-center gap-3">
            {/* Compass — this world never yaws (the camera always looks due north), so this is
                an honest fixed orientation reference, not a simulated dynamic instrument. */}
            <div className="relative grid h-12 w-12 shrink-0 place-items-center rounded-full border border-[var(--line-strong)]">
              <span className="absolute top-0.5 font-mono text-[8px] text-[var(--graphite-3)]">N</span>
              <span className="absolute bottom-0.5 font-mono text-[8px] text-[var(--graphite-3)]">S</span>
              <span className="absolute left-0.5 font-mono text-[8px] text-[var(--graphite-3)]">W</span>
              <span className="absolute right-0.5 font-mono text-[8px] text-[var(--graphite-3)]">E</span>
              <div className="h-6 w-[2px] bg-[var(--cobalt)]" />
            </div>
            <div className="flex-1">
              <p className="eyebrow">Altitude</p>
              <p className="font-display text-[18px] leading-none">{band?.label ?? "—"}</p>
              <p className="mt-0.5 font-mono text-[10px] text-[var(--graphite-3)]">{rig.distance.toFixed(1)} units up</p>
            </div>
          </div>

          <div className="mt-2.5">
            <p className="eyebrow mb-1">Mini-map</p>
            <svg
              viewBox={`${WORLD_BOX.minLon} ${-WORLD_BOX.maxLat} ${WORLD_BOX.maxLon - WORLD_BOX.minLon} ${WORLD_BOX.maxLat - WORLD_BOX.minLat}`}
              className="w-full rounded-md"
            >
              <rect x={WORLD_BOX.minLon} y={-WORLD_BOX.maxLat} width={360} height={WORLD_BOX.maxLat - WORLD_BOX.minLat} fill="var(--ink-2)" />
              {paths && <path d={paths} fill="var(--sand)" stroke="none" />}
              {regions.map((r) => (
                <circle key={r.key} cx={(r.min_lon + r.max_lon) / 2} cy={-(r.min_lat + r.max_lat) / 2} r={2.2} fill="var(--gold)" fillOpacity={0.7} />
              ))}
              <circle cx={rig.lon} cy={-rig.lat} r={4} fill="none" stroke="var(--cobalt)" strokeWidth={1.6} />
              <circle cx={rig.lon} cy={-rig.lat} r={1.2} fill="var(--cobalt)" />
            </svg>
            <p className="mt-1 font-mono text-[10px] text-[var(--graphite-3)]">
              {rig.lat.toFixed(1)}°, {rig.lon.toFixed(1)}°
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
