"""
Parses raw Argovis profile records and upserts them into the floats/profiles tables.
QC flags are preserved per-level, not filtered out here — the science layer (Part 7) decides
which QC flags are acceptable for a calculation, per spec's "preserve QC information, don't
hide data quality" principle (§15, §60).
"""

import datetime as dt
from collections import defaultdict
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ArgoFloat, Profile


@dataclass
class ParsedProfile:
    wmo_id: str
    cycle_number: int | None
    timestamp: dt.datetime
    latitude: float
    longitude: float
    pressure_dbar: list[float]
    temperature_c: list[float]
    salinity_psu: list[float] | None
    qc_temperature: list[str]
    qc_salinity: list[str] | None
    data_mode: str
    source_url: str


def parse_profile_record(record: dict) -> ParsedProfile:
    var_names: list[str] = record["data_info"][0]
    var_meta: list[list[str]] = record["data_info"][2]  # [unit, data_mode] per variable
    var_data = dict(zip(var_names, record["data"], strict=True))
    var_modes = dict(zip(var_names, (m[1] for m in var_meta), strict=True))

    wmo_id, _, _cycle_str = record["_id"].rpartition("_")
    lon, lat = record["geolocation"]["coordinates"]
    timestamp = dt.datetime.fromisoformat(record["timestamp"].replace("Z", "+00:00"))

    temperature = var_data.get("temperature") or []
    pressure = var_data.get("pressure") or []
    salinity = var_data.get("salinity")

    # Argovis returns `null` (not a numeric flag) for the QC entry at a level where the
    # underlying reading is itself missing — map that to Argo's own "9" (missing) convention,
    # not str(None) == "None", which would silently truncate to "N" in a VARCHAR(1) column.
    def _qc_array(raw: list | None, length: int) -> list[str]:
        if not raw:
            return ["9"] * length
        return [str(q) if q is not None else "9" for q in raw]

    qc_temperature = _qc_array(var_data.get("temperature_argoqc"), len(temperature))
    sal_qc_raw = var_data.get("salinity_argoqc")
    qc_salinity = _qc_array(sal_qc_raw, len(salinity)) if salinity else None

    source_url = ""
    sources = record.get("source") or []
    if sources and isinstance(sources[0], dict):
        source_url = sources[0].get("url", "")

    return ParsedProfile(
        wmo_id=wmo_id,
        cycle_number=record.get("cycle_number"),
        timestamp=timestamp,
        latitude=lat,
        longitude=lon,
        pressure_dbar=pressure,
        temperature_c=temperature,
        salinity_psu=salinity,
        qc_temperature=qc_temperature,
        qc_salinity=qc_salinity,
        data_mode=var_modes.get("temperature") or "R",
        source_url=source_url,
    )


@dataclass
class IngestStats:
    floats_created: int = 0
    floats_updated: int = 0
    profiles_created: int = 0
    profiles_skipped_existing: int = 0


async def ingest_parsed_profiles(session: AsyncSession, records: list[ParsedProfile]) -> IngestStats:
    stats = IngestStats()

    by_float: dict[str, list[ParsedProfile]] = defaultdict(list)
    for r in records:
        by_float[r.wmo_id].append(r)

    for wmo_id, float_records in by_float.items():
        float_records.sort(key=lambda r: r.timestamp)
        earliest, latest = float_records[0], float_records[-1]

        argo_float = await session.scalar(select(ArgoFloat).where(ArgoFloat.wmo_id == wmo_id))

        if argo_float is None:
            depths = [max(r.pressure_dbar, default=0.0) for r in float_records]
            argo_float = ArgoFloat(
                wmo_id=wmo_id,
                deployment_lat=earliest.latitude,
                deployment_lon=earliest.longitude,
                deployment_location=f"POINT({earliest.longitude} {earliest.latitude})",
                latest_lat=latest.latitude,
                latest_lon=latest.longitude,
                latest_location=f"POINT({latest.longitude} {latest.latitude})",
                latest_time=latest.timestamp,
                depth_min=0.0,
                depth_max=max(depths) if depths else None,
                data_mode=(latest.data_mode or "R")[:1],
                float_metadata={
                    "deployment_note": (
                        "deployment position/time approximated from the earliest profile in "
                        "this ingestion window, not the float's true deployment record"
                    ),
                    "source_url": earliest.source_url,
                },
            )
            session.add(argo_float)
            await session.flush()
            stats.floats_created += 1
        elif latest.timestamp > argo_float.latest_time:
            argo_float.latest_lat = latest.latitude
            argo_float.latest_lon = latest.longitude
            argo_float.latest_location = f"POINT({latest.longitude} {latest.latitude})"
            argo_float.latest_time = latest.timestamp
            stats.floats_updated += 1

        for r in float_records:
            exists = await session.scalar(
                select(Profile.id).where(
                    Profile.float_id == argo_float.id, Profile.timestamp == r.timestamp
                )
            )
            if exists is not None:
                stats.profiles_skipped_existing += 1
                continue

            session.add(
                Profile(
                    float_id=argo_float.id,
                    timestamp=r.timestamp,
                    latitude=r.latitude,
                    longitude=r.longitude,
                    location=f"POINT({r.longitude} {r.latitude})",
                    pressure_dbar=r.pressure_dbar,
                    temperature_c=r.temperature_c,
                    salinity_psu=r.salinity_psu,
                    qc_temperature=r.qc_temperature,
                    qc_salinity=r.qc_salinity,
                    data_mode=(r.data_mode or "R")[:1],
                    source="argo_gdac",
                )
            )
            stats.profiles_created += 1

    await session.commit()
    return stats
