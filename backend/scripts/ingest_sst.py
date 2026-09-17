"""
Ingests real satellite SST (NOAA OISST v2.1 via ERDDAP) for all named regions, on a monthly-ish
sample (not full daily resolution — see app/ingestion/oisst_client.py for why).

Usage:
    python scripts/ingest_sst.py                     # rolling 24 months to today (see regions.py)
    python scripts/ingest_sst.py --start 2023-01-01 --end 2023-03-31   # explicit window
"""

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx
from sqlalchemy import or_, select

from app.database import async_session_factory
from app.ingestion.oisst_client import OisstError, fetch_sst_grid, normalized_lon_ranges
from app.models import SatelliteSST
from app.ocean.regions import REGIONS, ingestion_window


async def ingest_region_sst(
    region_key: str, start_date: str, end_date: str, stride_days: int, client: httpx.Client
) -> None:
    region = REGIONS[region_key]
    print(f"\n[{region['name']}] fetching OISST {start_date} .. {end_date} (every {stride_days}d) ...")

    try:
        rows = fetch_sst_grid(
            min_lon=region["min_lon"],
            min_lat=region["min_lat"],
            max_lon=region["max_lon"],
            max_lat=region["max_lat"],
            start_date=start_date,
            end_date=end_date,
            time_stride_days=stride_days,
            client=client,
        )
    except OisstError as exc:
        print(f"[{region['name']}] FAILED: {exc}")
        return

    print(f"[{region['name']}] {len(rows)} ocean grid points fetched")

    # One-row-at-a-time existence checks (a query per point) worked fine for the original 2
    # regions but doesn't scale — some of the new regions return 15,000-20,000+ points, and
    # tens of thousands of individual round-trips in one session was hitting a real MemoryError
    # partway through a run. Fetch this region/date-range's already-ingested keys in one query,
    # check membership in-memory, then insert in chunks instead.
    #
    # Stored longitude values are in the OISST dataset's own 0..360 convention (whatever
    # `fetch_sst_grid` actually wrote), not this region's original -180..180 bounds — a real bug
    # shipped once from filtering existence checks by the un-converted bounds: it matched zero
    # rows for every negative-longitude region, so every re-run treated already-ingested data as
    # new and inserted full duplicates. `normalized_lon_ranges` returns the same dataset-space
    # range(s) `fetch_sst_grid` used to fetch/store this region's data, so the same OR-of-ranges
    # is used here to check it.
    #
    # A second, smaller real bug found the same way: OISST's 0.25-degree grid doesn't align to
    # an arbitrary region's exact bounds, so ERDDAP legitimately returns (and this script stores)
    # grid points slightly outside the nominal box — e.g. Bay of Bengal's max_lon=95.0 but a real
    # returned/stored point at longitude 95.125. A strict bbox filter on the existence check
    # can't see rows like that, so they looked "new" on every re-run. A 0.3-degree margin (larger
    # than the grid spacing) on every side fixes it without changing what actually gets fetched.
    MARGIN = 0.3
    created = 0
    skipped = 0
    async with async_session_factory() as session:
        lon_ranges = normalized_lon_ranges(region["min_lon"], region["max_lon"])
        lon_clause = or_(
            *[
                (SatelliteSST.longitude >= lo - MARGIN) & (SatelliteSST.longitude <= hi + MARGIN)
                for lo, hi in lon_ranges
            ]
        )
        existing = await session.execute(
            select(SatelliteSST.timestamp, SatelliteSST.latitude, SatelliteSST.longitude).where(
                SatelliteSST.latitude >= region["min_lat"] - MARGIN,
                SatelliteSST.latitude <= region["max_lat"] + MARGIN,
                lon_clause,
            )
        )
        existing_keys = {(ts, lat, lon) for ts, lat, lon in existing}

        pending: list[SatelliteSST] = []
        for timestamp, lat, lon, sst_c in rows:
            if (timestamp, lat, lon) in existing_keys:
                skipped += 1
                continue
            pending.append(
                SatelliteSST(
                    latitude=lat,
                    longitude=lon,
                    location=f"POINT({lon} {lat})",
                    timestamp=timestamp,
                    sst_celsius=sst_c,
                    source="NOAA OISST v2.1",
                )
            )
            created += 1

        CHUNK = 2000
        for i in range(0, len(pending), CHUNK):
            session.add_all(pending[i : i + CHUNK])
            await session.commit()

    print(f"[{region['name']}] sst points +{created} ({skipped} already existed)")


async def main(start_date: str | None, end_date: str | None, stride_days: int) -> None:
    with httpx.Client(timeout=120.0) as client:
        window = (start_date, end_date) if (start_date and end_date) else ingestion_window()
        for region_key in REGIONS:
            await ingest_region_sst(region_key, window[0], window[1], stride_days, client)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", default=None, help="Omit to use the rolling 24-month window")
    parser.add_argument("--end", default=None)
    parser.add_argument("--stride-days", type=int, default=30)
    args = parser.parse_args()
    asyncio.run(main(args.start, args.end, args.stride_days))
