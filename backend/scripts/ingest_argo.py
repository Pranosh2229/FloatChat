"""
Ingests real ARGO profiles for all named regions (see app/ocean/regions.py) via the Argovis API
(see app/ingestion/argovis_client.py for why this instead of raw NetCDF/FTP).

Usage:
    python scripts/ingest_argo.py                    # rolling 24 months to today (see regions.py)
    python scripts/ingest_argo.py --start 2023-01-01 --end 2023-03-31   # explicit window

Requests are chunked per calendar month per region — Argovis answers one month of a large
region comfortably, but two years in one request times out.

Re-runnable: existing floats/profiles are matched by wmo_id/timestamp and skipped, not
duplicated.
"""

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx

from app.database import async_session_factory
from app.ingestion.argo_ingest import ingest_parsed_profiles, parse_profile_record
from app.ingestion.argovis_client import ArgovisError, fetch_profiles
from app.ocean.regions import REGIONS, ingestion_window, month_windows


async def ingest_region(region_key: str, start_date: str, end_date: str, client: httpx.Client) -> None:
    region = REGIONS[region_key]
    print(f"\n[{region['name']}] fetching {start_date} .. {end_date} ...")

    try:
        raw_records = fetch_profiles(
            min_lon=region["min_lon"],
            min_lat=region["min_lat"],
            max_lon=region["max_lon"],
            max_lat=region["max_lat"],
            start_date=f"{start_date}T00:00:00Z",
            end_date=f"{end_date}T00:00:00Z",
            client=client,
        )
    except ArgovisError as exc:
        print(f"[{region['name']}] FAILED: {exc}")
        return

    print(f"[{region['name']}] {len(raw_records)} raw profiles fetched")

    parsed = []
    for rec in raw_records:
        try:
            parsed.append(parse_profile_record(rec))
        except (KeyError, ValueError) as exc:
            print(f"[{region['name']}] skipping malformed record {rec.get('_id')}: {exc}")

    async with async_session_factory() as session:
        stats = await ingest_parsed_profiles(session, parsed)

    print(
        f"[{region['name']}] floats +{stats.floats_created} (~{stats.floats_updated} updated), "
        f"profiles +{stats.profiles_created} ({stats.profiles_skipped_existing} already existed)"
    )


async def main(start_date: str | None, end_date: str | None) -> None:
    window = (start_date, end_date) if (start_date and end_date) else ingestion_window()
    with httpx.Client(timeout=120.0) as client:
        for region_key in REGIONS:
            for chunk_start, chunk_end in month_windows(*window):
                await ingest_region(region_key, chunk_start, chunk_end, client)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", default=None, help="Omit to use the rolling 24-month window")
    parser.add_argument("--end", default=None)
    args = parser.parse_args()
    asyncio.run(main(args.start, args.end))
