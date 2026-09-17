"""
Thin client over NOAA's OISST v2.1 dataset served via NCEI's ERDDAP
(`ncdc_oisst_v2_avhrr_by_time_zlev_lat_lon`) — real satellite-derived sea-surface-temperature,
the same product referenced by spec §13.4. Supports the confirmed Surface->Subsurface
investigation addition (Part 7); this client only needs to pull enough grid coverage for that
workflow, not a full independent SST analysis system.
"""

import datetime as dt
from functools import lru_cache

import httpx

OISST_DATASET_URL = (
    "https://www.ncei.noaa.gov/erddap/griddap/ncdc_oisst_v2_avhrr_by_time_zlev_lat_lon.json"
)
# ERDDAP's own dataset-metadata endpoint — lists every variable's real actual_range, including
# time's. Queried once per process (see `_latest_available_date`) to find out how far the real
# satellite product actually extends, since OISST is near-real-time but not same-day: a real run
# asking for "today" as the end date got a 404 from every single region ("Stop is greater than
# the axis maximum") because the live feed was still ~2 weeks behind. Rather than hardcoding a
# guessed lag that could quietly go wrong again, ask the dataset itself what its latest point is.
OISST_INFO_URL = (
    "https://www.ncei.noaa.gov/erddap/info/ncdc_oisst_v2_avhrr_by_time_zlev_lat_lon/index.json"
)


class OisstError(RuntimeError):
    pass


@lru_cache(maxsize=1)
def _latest_available_date() -> dt.date:
    """The real last date OISST's own time axis actually has data for, queried live — never
    guessed. Cached for the life of the process: this is asked once and shared across every
    region's ingestion call in a single run, not re-fetched per region."""
    try:
        response = httpx.get(OISST_INFO_URL, timeout=30.0)
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise OisstError(f"Could not reach OISST's info endpoint: {exc}") from exc
    payload = response.json()
    columns = payload["table"]["columnNames"]
    rows = payload["table"]["rows"]
    var_idx, attr_idx, value_idx = (
        columns.index("Variable Name"),
        columns.index("Attribute Name"),
        columns.index("Value"),
    )
    for row in rows:
        if row[var_idx] == "time" and row[attr_idx] == "actual_range":
            _, max_epoch_seconds = row[value_idx].split(",")
            return dt.datetime.fromtimestamp(float(max_epoch_seconds), tz=dt.timezone.utc).date()
    raise OisstError("OISST info endpoint didn't report time's actual_range — can't tell how current the data is")


def normalized_lon_ranges(min_lon: float, max_lon: float) -> list[tuple[float, float]]:
    """
    Converts a standard -180..180 longitude range (the convention used everywhere else in this
    codebase — Argovis, PostGIS, app/ocean/regions.py) into the OISST dataset's own 0..360
    convention. Returns a LIST because a box straddling the prime meridian (min_lon < 0 <=
    max_lon, e.g. the Norwegian Sea) can't be expressed as one 0..360 range — it becomes two:
    a west-of-meridian range and an east-of-meridian range. Exposed (not just used internally by
    `fetch_sst_grid`) so callers that need to check "does a stored row fall inside this region"
    against already-ingested data — e.g. `scripts/ingest_sst.py`'s existence check — filter using
    the same dataset-space ranges the data was actually stored under, not the original -180..180
    bounds. A real bug shipped once already from checking existence against the wrong convention:
    it silently found zero matches for every previously-ingested negative-longitude region, so a
    second ingestion run treated everything as new and inserted full duplicates undetected until
    the resulting row counts were checked directly against the database.
    """
    if min_lon < 0 <= max_lon:
        return [(min_lon + 360, 360.0), (0.0, max_lon)]
    lon_min = min_lon + 360 if min_lon < 0 else min_lon
    lon_max = max_lon + 360 if max_lon < 0 else max_lon
    return [(lon_min, lon_max)]


def _run_query(
    min_lon: float, max_lon: float, min_lat: float, max_lat: float,
    start_date: str, end_date: str, time_stride_days: int, client: httpx.Client,
) -> list[tuple[dt.datetime, float, float, float]]:
    query = (
        f"sst[({start_date}):{time_stride_days}:({end_date})]"
        f"[(0.0)][({min_lat}):({max_lat})][({min_lon}):({max_lon})]"
    )
    # ERDDAP's Tomcat backend rejects raw `[`/`]` in the query string — percent-encode them
    # (the rest of the query, `():`, is valid unencoded and matches ERDDAP's own documented
    # query syntax, which this preserves for readability/debugging).
    query = query.replace("[", "%5B").replace("]", "%5D")
    url = f"{OISST_DATASET_URL}?{query}"

    try:
        response = client.get(url)
    except httpx.HTTPError as exc:
        # Network-level failures (DNS hiccups, connection resets, timeouts) are real and
        # transient, same class of thing Argovis ingestion already handles per-region rather
        # than letting one bad request crash a whole multi-region batch run.
        raise OisstError(f"ERDDAP request failed: {exc}") from exc
    if response.status_code != 200:
        raise OisstError(f"ERDDAP {response.status_code}: {response.text[:300]}")
    payload = response.json()

    rows = payload["table"]["rows"]  # [time_iso, depth, lat, lon, sst_or_null]
    results = []
    for time_iso, _depth, lat, lon, sst in rows:
        if sst is None:
            continue
        timestamp = dt.datetime.fromisoformat(time_iso.replace("Z", "+00:00"))
        results.append((timestamp, float(lat), float(lon), float(sst)))
    return results


def fetch_sst_grid(
    min_lon: float,
    min_lat: float,
    max_lon: float,
    max_lat: float,
    start_date: str,
    end_date: str,
    time_stride_days: int = 30,
    client: httpx.Client | None = None,
) -> list[tuple[dt.datetime, float, float, float]]:
    """
    Returns a list of (timestamp, lat, lon, sst_celsius) tuples for ocean grid cells (land/no-
    data cells, returned as `null` by ERDDAP, are dropped) within the box and date range.
    `time_stride_days` samples every Nth day of the (daily-resolution) dataset rather than
    fetching every day, since this only needs to support surface-context lookups, not a dense
    time series.

    Callers (see app/ocean/regions.py) pass `min_lon`/`max_lon` in the standard -180..180
    convention used everywhere else in this codebase (Argovis, PostGIS). This dataset's own
    longitude axis is 0..360, not -180..180 (confirmed via a real 404 from the live API for any
    negative-longitude region before this was handled) — so negative values are converted here,
    at the one place that actually needs the dataset's convention, not upstream. A box that
    straddles the prime meridian (min_lon < 0 <= max_lon, e.g. the Norwegian Sea) can't be
    expressed as a single 0..360 range, so it's split into two sub-queries (west-of-meridian,
    east-of-meridian) and the results concatenated.

    `end_date` is clamped to the dataset's own real latest available date if the requested end
    is more recent than that — asking for "today" is a real, previously-hit 404 (the near-real-
    time feed genuinely lags by roughly two weeks), not a caller mistake to reject outright.
    """
    owns_client = client is None
    client = client or httpx.Client(timeout=90.0)
    try:
        requested_end = dt.date.fromisoformat(end_date)
        latest = _latest_available_date()
        if requested_end > latest:
            end_date = latest.isoformat()
        results = []
        for lon_min, lon_max in normalized_lon_ranges(min_lon, max_lon):
            results.extend(
                _run_query(lon_min, lon_max, min_lat, max_lat, start_date, end_date, time_stride_days, client)
            )
        return results
    finally:
        if owns_client:
            client.close()
