from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Event, Profile, SatelliteSST
from app.ocean.regions import REGIONS, find_region
from app.schemas.floats import FloatSummary
from app.schemas.regions import (
    CompareResponse,
    DashboardStats,
    RegionAggregateStats,
    RegionInfo,
    RegionStats,
)

router = APIRouter(tags=["regions"])


@router.get("/regions", response_model=list[RegionInfo])
async def list_regions() -> list[RegionInfo]:
    return [RegionInfo(key=key, **info) for key, info in REGIONS.items()]


async def _region_floats(db: AsyncSession, region_key: str) -> list[FloatSummary]:
    from app.models import ArgoFloat  # local import avoids a circular-import edge case

    region = find_region(region_key)
    if region is None:
        raise HTTPException(status_code=404, detail=f"Unknown region: {region_key}")

    result = await db.execute(
        select(ArgoFloat).where(
            ArgoFloat.latest_lat.between(region["min_lat"], region["max_lat"]),
            ArgoFloat.latest_lon.between(region["min_lon"], region["max_lon"]),
        )
    )
    return [FloatSummary.model_validate(f) for f in result.scalars().all()]


@router.get("/regions/{region_key}/observations", response_model=list[FloatSummary])
async def region_observations(
    region_key: str, db: AsyncSession = Depends(get_db)
) -> list[FloatSummary]:
    """Floats currently positioned within a named region — supports the `explore_region` intent."""
    return await _region_floats(db, region_key)


async def _region_stats(db: AsyncSession, region_key: str) -> RegionStats:
    region = find_region(region_key)
    if region is None:
        raise HTTPException(status_code=404, detail=f"Unknown region: {region_key}")

    floats = await _region_floats(db, region_key)
    float_ids = [f.id for f in floats]

    profile_count = 0
    mean_temp = None
    mean_sal = None
    if float_ids:
        profile_count = await db.scalar(
            select(func.count()).select_from(Profile).where(Profile.float_id.in_(float_ids))
        )
        # "Surface" = shallowest (first) level of each profile's pressure-sorted arrays.
        # Averaged in Python rather than SQL — the array-of-arrays shape isn't worth a
        # PL/pgSQL detour for an MVP-scale dataset (hundreds of profiles).
        result = await db.execute(
            select(Profile.temperature_c, Profile.salinity_psu).where(
                Profile.float_id.in_(float_ids)
            )
        )
        temps, sals = [], []
        for temperature_c, salinity_psu in result.all():
            if temperature_c and temperature_c[0] is not None:
                temps.append(temperature_c[0])
            if salinity_psu and salinity_psu[0] is not None:
                sals.append(salinity_psu[0])
        mean_temp = sum(temps) / len(temps) if temps else None
        mean_sal = sum(sals) / len(sals) if sals else None

    return RegionStats(
        key=region_key,
        name=region["name"],
        float_count=len(floats),
        profile_count=profile_count or 0,
        mean_surface_temperature_c=mean_temp,
        mean_surface_salinity_psu=mean_sal,
    )


async def _region_sst_count(db: AsyncSession, region_key: str) -> int:
    from sqlalchemy import or_

    from app.ingestion.oisst_client import normalized_lon_ranges

    region = REGIONS[region_key]
    # Same 0..360-conversion + margin the ingestion existence-check uses (app/ocean/regions.py's
    # bounds are -180..180, but stored longitude is in OISST's own 0..360 convention) — a plain
    # bbox filter on the raw -180..180 bounds would silently undercount every negative-longitude
    # region, the same bug class already fixed once in scripts/ingest_sst.py.
    MARGIN = 0.3
    lon_ranges = normalized_lon_ranges(region["min_lon"], region["max_lon"])
    lon_clause = or_(
        *[
            (SatelliteSST.longitude >= lo - MARGIN) & (SatelliteSST.longitude <= hi + MARGIN)
            for lo, hi in lon_ranges
        ]
    )
    count = await db.scalar(
        select(func.count()).select_from(SatelliteSST).where(
            SatelliteSST.latitude >= region["min_lat"] - MARGIN,
            SatelliteSST.latitude <= region["max_lat"] + MARGIN,
            lon_clause,
        )
    )
    return count or 0


@router.get("/dashboard/stats", response_model=DashboardStats)
async def dashboard_stats(db: AsyncSession = Depends(get_db)) -> DashboardStats:
    """
    Mission-control aggregate across all 11 regions, for the Dashboard page (REDESIGN_PLAN.md
    Phase 0's confirmed small backend addition) — real per-region totals, not a single demo
    number standing in for the whole dataset.
    """
    regions: list[RegionAggregateStats] = []
    for region_key, region in REGIONS.items():
        floats = await _region_floats(db, region_key)
        float_ids = [f.id for f in floats]
        profile_count = 0
        if float_ids:
            profile_count = await db.scalar(
                select(func.count()).select_from(Profile).where(Profile.float_id.in_(float_ids))
            )
        event_count = await db.scalar(
            select(func.count()).select_from(Event).where(Event.region == region_key)
        )
        sst_point_count = await _region_sst_count(db, region_key)

        regions.append(
            RegionAggregateStats(
                key=region_key,
                name=region["name"],
                float_count=len(floats),
                profile_count=profile_count or 0,
                event_count=event_count or 0,
                sst_point_count=sst_point_count,
            )
        )

    most_active = max(regions, key=lambda r: r.event_count, default=None)
    most_active_key = most_active.key if most_active and most_active.event_count > 0 else None

    return DashboardStats(
        total_regions=len(regions),
        total_floats=sum(r.float_count for r in regions),
        total_profiles=sum(r.profile_count for r in regions),
        total_events=sum(r.event_count for r in regions),
        total_sst_points=sum(r.sst_point_count for r in regions),
        regions=regions,
        most_active_region_key=most_active_key,
    )


@router.post("/compare", response_model=CompareResponse)
async def compare_regions(
    region_a: str, region_b: str, db: AsyncSession = Depends(get_db)
) -> CompareResponse:
    """
    Confirmed MVP addition — same constraints (currently: the full ingested dev subset) applied
    to two regions, returned as a directly comparable pair. Aggregate stats only for now; once
    Part 7's anomaly engine exists this can be enriched with anomaly comparison, not rebuilt.
    """
    return CompareResponse(
        region_a=await _region_stats(db, region_a),
        region_b=await _region_stats(db, region_b),
    )
