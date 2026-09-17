"""
Thin client over the Argovis API (https://argovis-api.colorado.edu) — a queryable REST
interface over the same official ARGO GDAC profiles (each record's `source[].url` points back
to the real ifremer GDAC file), rather than raw NetCDF/FTP downloading + xarray parsing.

This is a deliberate scope decision for the MVP deadline, not a data-honesty shortcut: the
observations are real GDAC data, not fabricated, and every ingested profile retains its GDAC
source URL as provenance. Recorded in `docs/data-pipeline.md` and `PROGRESS.md`.
"""

import httpx

ARGOVIS_BASE_URL = "https://argovis-api.colorado.edu"

# Standard Argo QC flag scale: 1=good, 2=probably good, 3=probably bad, 4=bad, 5=changed,
# 8=estimated, 9=missing. Requested here so QC is preserved per-level, not silently dropped —
# filtering to "good" data happens at the science layer (Part 7), not at ingestion.
PROFILE_DATA_KEYS = "temperature,pressure,salinity,temperature_argoqc,salinity_argoqc,pressure_argoqc"


class ArgovisError(RuntimeError):
    pass


def fetch_profiles(
    min_lon: float,
    min_lat: float,
    max_lon: float,
    max_lat: float,
    start_date: str,
    end_date: str,
    client: httpx.Client | None = None,
) -> list[dict]:
    """
    Fetch ARGO profiles within a bounding box and date range, with temperature/pressure/
    salinity + per-level QC flags included. `start_date`/`end_date` are ISO 8601 UTC strings
    (e.g. "2023-01-01T00:00:00Z").
    """
    params = {
        "box": f"[[{min_lon},{min_lat}],[{max_lon},{max_lat}]]",
        "startDate": start_date,
        "endDate": end_date,
        "data": PROFILE_DATA_KEYS,
    }
    owns_client = client is None
    client = client or httpx.Client(timeout=60.0)
    try:
        try:
            response = client.get(f"{ARGOVIS_BASE_URL}/argo", params=params)
        except httpx.HTTPError as exc:
            # Network-level failures (timeouts, connection resets) are real and transient —
            # same class of thing already handled per-region for OISST (oisst_client.py). Left
            # unhandled here once, a single slow request took down an entire multi-region,
            # multi-month overnight ingestion run instead of just skipping that one chunk.
            raise ArgovisError(f"Argovis request failed: {exc}") from exc
        if response.status_code != 200:
            raise ArgovisError(f"Argovis {response.status_code}: {response.text[:300]}")
        return response.json()
    finally:
        if owns_client:
            client.close()
