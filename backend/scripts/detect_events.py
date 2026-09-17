"""
Computes anomalies across every real profile in each locked region, clusters the significant
ones into candidate events (DBSCAN, spec §28-29), classifies them with simple rules (spec §28),
and persists Events + the Anomaly rows that contributed to each + the Evidence chain (spec §35)
tying them together.

This is a derived-analysis step, not primary ingestion — the events/anomalies/evidence tables
are fully rebuilt from the real ARGO+WOA23 data on every run (delete-then-recompute), same
category as Part 5's ingestion scripts but for computed rather than downloaded data.

Usage:
    python scripts/detect_events.py
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.anomaly.baseline import (
    BASELINE_ID,
    BaselineUnavailableError,
    get_expected_batch,
    method_for_month,
)
from app.database import async_session_factory
from app.events.detection import (
    AnomalyPoint,
    cap_for_clustering,
    classify_event,
    cluster_anomalies,
    is_significant,
    pick_primary_float,
)
from app.events.evidence import build_calculation, build_coverage
from app.models import Anomaly, ArgoFloat, Evidence, Event, Profile
from app.ocean.regions import REGIONS

GOOD_QC = {"1", "2"}


async def _compute_region_anomaly_points(
    session: AsyncSession, region_key: str
) -> tuple[list[AnomalyPoint], int]:
    """
    Returns `(significant_points, total_computed)`. Significance is filtered inline, row by row,
    rather than materializing an `AnomalyPoint` for every raw observation and filtering in a
    second pass — this is what fixed a real `MemoryError` at 24-month scale: Arabian Sea's ~6.5M
    raw anomalies already pushed process memory close to the edge, and building a full
    AnomalyPoint list (most of it below-threshold and discarded moments later) for Gulf Stream's
    comparable raw volume pushed it over. `total_computed` is kept only as a running int, purely
    for the same honest per-region logging the old two-pass version printed.
    """
    region = REGIONS[region_key]
    floats = (
        (
            await session.execute(
                select(ArgoFloat).where(
                    ArgoFloat.latest_lat.between(region["min_lat"], region["max_lat"]),
                    ArgoFloat.latest_lon.between(region["min_lon"], region["max_lon"]),
                )
            )
        )
        .scalars()
        .all()
    )
    if not floats:
        return [], 0
    float_ids = [f.id for f in floats]

    profiles = (
        (await session.execute(select(Profile).where(Profile.float_id.in_(float_ids))))
        .scalars()
        .all()
    )
    if not profiles:
        return [], 0

    # Flatten every QC-good level of every profile into raw rows first, then batch-lookup the
    # baseline per variable — one vectorized WOA23 query instead of one per level.
    raw: dict[str, list[tuple]] = {"temperature": [], "salinity": []}
    for p in profiles:
        for i, depth in enumerate(p.pressure_dbar):
            if p.temperature_c[i] is not None and p.qc_temperature[i] in GOOD_QC:
                raw["temperature"].append(
                    (p.id, p.float_id, p.latitude, p.longitude, p.timestamp, depth, p.temperature_c[i])
                )
            if p.salinity_psu is not None and p.qc_salinity is not None:
                if p.salinity_psu[i] is not None and p.qc_salinity[i] in GOOD_QC:
                    raw["salinity"].append(
                        (p.id, p.float_id, p.latitude, p.longitude, p.timestamp, depth, p.salinity_psu[i])
                    )

    total_computed = 0
    significant_points: list[AnomalyPoint] = []
    for variable, rows in raw.items():
        if not rows:
            continue
        lats = [r[2] for r in rows]
        lons = [r[3] for r in rows]
        depths = [r[5] for r in rows]
        months = [r[4].month for r in rows]
        expected = get_expected_batch(lats, lons, depths, months, variable)
        for row, exp in zip(rows, expected, strict=True):
            if exp != exp:  # NaN — WOA23 has no baseline at this cell
                continue
            total_computed += 1
            profile_id, float_id, lat, lon, timestamp, depth, observed = row
            point = AnomalyPoint(
                profile_id=profile_id,
                float_id=float_id,
                variable=variable,
                lat=lat,
                lon=lon,
                timestamp=timestamp,
                depth_m=depth,
                observed_value=float(observed),
                expected_value=float(exp),
                anomaly_value=float(observed) - float(exp),
            )
            if is_significant(point):
                significant_points.append(point)
        rows.clear()  # release this variable's raw rows before the next one is processed
    return significant_points, total_computed


async def detect_and_persist_region(session: AsyncSession, region_key: str) -> None:
    region = REGIONS[region_key]
    significant, total_computed = await _compute_region_anomaly_points(session, region_key)
    print(f"[{region['name']}] {total_computed} anomalies computed, {len(significant)} significant")

    significant, dropped = cap_for_clustering(significant)
    if dropped:
        print(
            f"[{region['name']}] capped to the {len(significant):,} most significant points for "
            f"clustering ({dropped:,} smaller-magnitude ones excluded — see "
            "MAX_SIGNIFICANT_POINTS_FOR_CLUSTERING in app/events/detection.py)"
        )

    clusters = cluster_anomalies(significant)
    print(f"[{region['name']}] {len(clusters)} candidate event(s)")

    for indices in clusters.values():
        cluster_points = [significant[i] for i in indices]
        event_type = classify_event(cluster_points)

        lats = [p.lat for p in cluster_points]
        lons = [p.lon for p in cluster_points]
        depths = [p.depth_m for p in cluster_points]
        times = [p.timestamp for p in cluster_points]
        float_ids = sorted({p.float_id for p in cluster_points})

        primary_float_id = pick_primary_float(cluster_points)

        event = Event(
            type=event_type,
            region=region_key,
            start_time=min(times),
            end_time=max(times),
            depth_min=min(depths),
            depth_max=max(depths),
            affected_float_ids=float_ids,
            primary_float_id=primary_float_id,
            anomaly_count=len(cluster_points),
            spatial_extent={
                "min_lat": min(lats),
                "max_lat": max(lats),
                "min_lon": min(lons),
                "max_lon": max(lons),
            },
            # Rule-based label, not a probabilistic model — no scientifically-defined
            # confidence to report (spec §37: only report confidence "where genuinely defined").
            confidence=None,
            coverage=build_coverage(cluster_points),
            method="dbscan_spatiotemporal",
        )
        session.add(event)
        await session.flush()

        anomaly_rows = [
            Anomaly(
                profile_id=p.profile_id,
                variable=p.variable,
                depth_m=p.depth_m,
                observed_value=p.observed_value,
                expected_value=p.expected_value,
                anomaly_value=p.anomaly_value,
                baseline_id=BASELINE_ID,
                method=method_for_month(p.timestamp.month),
                quality="significant",
            )
            for p in cluster_points
        ]
        session.add_all(anomaly_rows)
        await session.flush()

        session.add(
            Evidence(
                event_id=event.id,
                float_ids=float_ids,
                profile_ids=sorted({p.profile_id for p in cluster_points}),
                observation_ids=[a.id for a in anomaly_rows],
                baseline_id=BASELINE_ID,
                calculation=build_calculation(cluster_points),
                source="floatchat_event_engine",
                qc_summary={"qc_flags_used": sorted(GOOD_QC)},
                coverage=build_coverage(cluster_points),
            )
        )

    await session.commit()


async def main() -> None:
    async with async_session_factory() as session:
        # Derived-analysis tables — fully rebuilt from real source data every run, not
        # incrementally merged like the primary ingestion scripts.
        await session.execute(delete(Evidence))
        await session.execute(delete(Event))
        await session.execute(delete(Anomaly))
        await session.commit()

        for region_key in REGIONS:
            try:
                await detect_and_persist_region(session, region_key)
            except BaselineUnavailableError as exc:
                # Same per-region "skip and continue" pattern as ingest_sst.py's OisstError
                # handling — one region's missing WOA23 hemisphere file (currently the 4
                # Southern Hemisphere regions, blocked on NCEI's JAS-file server outage, see
                # REDESIGN_PLAN.md) must not abort event detection for every other region.
                print(f"[{REGIONS[region_key]['name']}] SKIPPED: {exc}")
                await session.rollback()


if __name__ == "__main__":
    asyncio.run(main())
