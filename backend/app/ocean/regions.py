"""
Named regions. The original two (Bay of Bengal, Arabian Sea) were the spec's own worked-example
regions (§8, §42, §65) and the MVP's locked dev-subset scope for Part 5. The Redesign Phase 0
expansion (see REDESIGN_PLAN.md decision #5) adds 9 more, one real documented ocean phenomenon per
continent, not exhaustive global coverage.

Bounding boxes are approximate (for spatial filtering / `explore_region`), not authoritative
oceanographic basin boundaries.

`hemisphere` matters beyond geography here: `app/anomaly/baseline.py`'s WOA23 climatology is
season-specific (a real "winter" baseline is meaningless applied to the wrong hemisphere's
summer), so every region records which hemisphere's meteorological winter its own real ingested
data window should target — "north" -> JFM (Jan-Mar), "south" -> JAS (Jul-Sep). See
`docs/data-pipeline.md` and `docs/scientific-methods.md` for the ingestion-window / baseline-file
pairing this depends on.
"""

import datetime as dt
from typing import Literal, TypedDict


class RegionBBox(TypedDict):
    name: str
    min_lat: float
    max_lat: float
    min_lon: float
    max_lon: float
    hemisphere: Literal["north", "south"]


REGIONS: dict[str, RegionBBox] = {
    "bay_of_bengal": {
        "name": "Bay of Bengal",
        "min_lat": 5.0,
        "max_lat": 22.0,
        "min_lon": 78.0,
        "max_lon": 95.0,
        "hemisphere": "north",
    },
    "arabian_sea": {
        "name": "Arabian Sea",
        "min_lat": 5.0,
        "max_lat": 25.0,
        "min_lon": 50.0,
        "max_lon": 78.0,
        "hemisphere": "north",
    },
    "gulf_stream": {
        "name": "Gulf Stream / North Atlantic",
        "min_lat": 30.0,
        "max_lat": 45.0,
        "min_lon": -75.0,
        "max_lon": -50.0,
        "hemisphere": "north",
    },
    "mediterranean_sea": {
        "name": "Mediterranean Sea",
        "min_lat": 36.0,
        "max_lat": 44.0,
        "min_lon": 0.0,
        "max_lon": 20.0,
        "hemisphere": "north",
    },
    "california_current": {
        "name": "California Current",
        "min_lat": 30.0,
        "max_lat": 45.0,
        "min_lon": -130.0,
        "max_lon": -115.0,
        "hemisphere": "north",
    },
    "kuroshio_current": {
        "name": "Kuroshio Current",
        "min_lat": 25.0,
        "max_lat": 40.0,
        "min_lon": 125.0,
        "max_lon": 145.0,
        "hemisphere": "north",
    },
    "norwegian_sea": {
        "name": "Norwegian Sea",
        "min_lat": 62.0,
        "max_lat": 75.0,
        "min_lon": -10.0,
        "max_lon": 15.0,
        "hemisphere": "north",
    },
    "tasman_sea": {
        "name": "Tasman Sea",
        "min_lat": -45.0,
        "max_lat": -30.0,
        "min_lon": 148.0,
        "max_lon": 170.0,
        "hemisphere": "south",
    },
    "benguela_current": {
        "name": "Benguela Current",
        "min_lat": -30.0,
        "max_lat": -15.0,
        "min_lon": 5.0,
        "max_lon": 15.0,
        "hemisphere": "south",
    },
    "humboldt_current": {
        "name": "Humboldt Current",
        "min_lat": -30.0,
        "max_lat": -5.0,
        "min_lon": -85.0,
        "max_lon": -70.0,
        "hemisphere": "south",
    },
    "southern_ocean": {
        "name": "Southern Ocean",
        "min_lat": -65.0,
        "max_lat": -50.0,
        "min_lon": -60.0,
        "max_lon": -30.0,
        "hemisphere": "south",
    },
}

# Real ingestion window: a rolling 24 months up to today, the same for every region (the
# redesign's timeline runs "two years back to present"). Anomalies compare each observation
# against the WOA23 climatology for its own calendar quarter (see app/anomaly/baseline.py), so
# a single window is scientifically fine for both hemispheres.
INGESTION_MONTHS = 24


def ingestion_window(today: dt.date | None = None) -> tuple[str, str]:
    end = today or dt.date.today()
    start_month = end.month - INGESTION_MONTHS
    start = dt.date(end.year + (start_month - 1) // 12, (start_month - 1) % 12 + 1, 1)
    return (start.isoformat(), end.isoformat())


def month_windows(start: str, end: str) -> list[tuple[str, str]]:
    """Splits an ISO date range into calendar-month chunks (Argovis answers ~1 month of a big
    region comfortably; 24 months in one request is too much)."""
    first = dt.date.fromisoformat(start)
    last = dt.date.fromisoformat(end)
    out: list[tuple[str, str]] = []
    cursor = first
    while cursor <= last:
        nxt = dt.date(cursor.year + cursor.month // 12, cursor.month % 12 + 1, 1)
        out.append((cursor.isoformat(), min(nxt, last).isoformat()))
        cursor = nxt
    return out


def find_region(name: str) -> RegionBBox | None:
    """Case-insensitive lookup by key or display name."""
    key = name.strip().lower().replace(" ", "_")
    if key in REGIONS:
        return REGIONS[key]
    for region in REGIONS.values():
        if region["name"].lower() == name.strip().lower():
            return region
    return None


def region_centroid(region_key: str) -> tuple[float, float] | None:
    """Bounding-box midpoint — used by Part 9's orchestrator as a documented fallback location
    for point-based lookups (`surface_subsurface`) when a question names a region but not a
    specific point. Not a claim about where anything oceanographically notable actually is."""
    region = REGIONS.get(region_key)
    if region is None:
        return None
    return (
        (region["min_lat"] + region["max_lat"]) / 2,
        (region["min_lon"] + region["max_lon"]) / 2,
    )
