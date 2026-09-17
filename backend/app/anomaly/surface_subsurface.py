"""
Surface->Subsurface investigation (confirmed MVP addition, PLAN.md Part 7) — spec's own
"strongest scientific feature" (PDF §86). A surface SST anomaly, checked against the same real
WOA23 baseline used everywhere else (not a separate ad-hoc SST climatology), triggers a dive
into nearby real ARGO floats' subsurface temperature/salinity/thermocline.

Deliberately NOT a Hobday-et-al. multi-year percentile-threshold marine-heatwave detector — that
level of rigor needs a long SST time series we don't have in the MVP dev subset (3 months, one
season). This is a simpler, honestly-scoped "is the surface unusually warm/cool for this place
and season, and if so what does it look like underneath" check. See spec §26/§31/§70 for why
this matters: never label an ARGO reading a "marine heatwave" outright.
"""

from dataclasses import dataclass, field

from sqlalchemy import Float, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.anomaly.baseline import BASELINE_ID, get_expected, method_for_month
from app.anomaly.engine import AnomalyResult, calculate_profile_anomalies
from app.anomaly.thermocline import ThermoclineResult, detect_thermocline
from app.models import ArgoFloat, Profile, SatelliteSST

# A documented, simple threshold — not derived from a multi-year percentile distribution (see
# module docstring). 1.0C is a commonly-cited rule-of-thumb magnitude for a "notable" SST
# anomaly in casual oceanographic discussion; treated here as a starting point to tune, not a
# scientifically authoritative cutoff.
SST_ANOMALY_THRESHOLD_C = 1.0
NEARBY_FLOAT_RADIUS_KM = 150
MAX_NEARBY_FLOATS = 3


@dataclass
class NearbyFloatSubsurface:
    float_id: int
    wmo_id: str
    distance_km: float
    profile_id: int
    profile_timestamp: str
    thermocline: ThermoclineResult | None
    anomalies: list[AnomalyResult] = field(default_factory=list)


@dataclass
class SurfaceSubsurfaceResult:
    query_lat: float
    query_lon: float
    sst_observed_c: float
    sst_expected_c: float | None
    sst_anomaly_c: float | None
    sst_timestamp: str
    threshold_exceeded: bool
    baseline_id: str
    method: str
    nearby_floats: list[NearbyFloatSubsurface]


async def investigate(session: AsyncSession, lat: float, lon: float) -> SurfaceSubsurfaceResult | None:
    """
    Finds the nearest real satellite SST observation to (lat, lon), compares it to the WOA23
    surface (0m) baseline, and — regardless of whether the anomaly clears the threshold — looks
    up nearby real ARGO floats' subsurface data, so a caller can show "here's what's actually
    happening at depth" either way. Returns None only when there's no real SST data near this
    point at all (never fabricates a reading).
    """
    nearest_sst = await session.scalar(
        select(SatelliteSST).order_by(SatelliteSST.location.op("<->")(f"POINT({lon} {lat})")).limit(1)
    )
    if nearest_sst is None:
        return None

    expected = get_expected(
        nearest_sst.latitude, nearest_sst.longitude, 0.0, "temperature", nearest_sst.timestamp.month
    )
    anomaly = nearest_sst.sst_celsius - expected if expected is not None else None
    threshold_exceeded = anomaly is not None and abs(anomaly) >= SST_ANOMALY_THRESHOLD_C

    # Geography-typed `<->` returns great-circle distance in meters directly (not degrees, the
    # way a plain `geometry` column's `<->` would) — confirmed against this same column type in
    # Part 5's verification. Convert to km once here, not by re-deriving it per row below.
    # `.op("<->", return_type=Float)` — without an explicit return_type, geoalchemy2 infers the
    # KNN operator's result as Geography (for chaining spatial ops), and dividing that "geography"
    # by 1000.0 fails with `cannot cast type geography to numeric`. The operator's actual runtime
    # result is a plain float (meters), so tell SQLAlchemy that directly.
    distance_m = ArgoFloat.latest_location.op("<->", return_type=Float)(f"POINT({lon} {lat})")
    nearby_rows = await session.execute(
        select(ArgoFloat, (distance_m / 1000.0).label("distance_km"))
        .order_by("distance_km")
        .limit(MAX_NEARBY_FLOATS)
    )

    nearby_floats: list[NearbyFloatSubsurface] = []
    for argo_float, distance_km in nearby_rows.all():
        if distance_km > NEARBY_FLOAT_RADIUS_KM:
            continue

        latest_profile = await session.scalar(
            select(Profile)
            .where(Profile.float_id == argo_float.id)
            .order_by(Profile.timestamp.desc())
            .limit(1)
        )
        if latest_profile is None:
            continue

        thermocline = detect_thermocline(
            latest_profile.pressure_dbar, latest_profile.temperature_c, latest_profile.qc_temperature
        )
        anomalies = calculate_profile_anomalies(
            latest_profile.latitude,
            latest_profile.longitude,
            latest_profile.pressure_dbar,
            latest_profile.temperature_c,
            latest_profile.salinity_psu,
            latest_profile.qc_temperature,
            latest_profile.qc_salinity,
            latest_profile.timestamp.month,
        )

        nearby_floats.append(
            NearbyFloatSubsurface(
                float_id=argo_float.id,
                wmo_id=argo_float.wmo_id,
                distance_km=round(distance_km, 1),
                profile_id=latest_profile.id,
                profile_timestamp=latest_profile.timestamp.isoformat(),
                thermocline=thermocline,
                anomalies=anomalies[:20],  # cap payload size; full list available via /profiles/{id}
            )
        )

    return SurfaceSubsurfaceResult(
        query_lat=lat,
        query_lon=lon,
        sst_observed_c=nearest_sst.sst_celsius,
        sst_expected_c=expected,
        sst_anomaly_c=anomaly,
        sst_timestamp=nearest_sst.timestamp.isoformat(),
        threshold_exceeded=threshold_exceeded,
        baseline_id=BASELINE_ID,
        method=method_for_month(nearest_sst.timestamp.month),
        nearby_floats=nearby_floats,
    )
