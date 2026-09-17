"""
WOA23 climatological baseline — region+depth+season aware "expected" values, per spec §13.3/§23.
Loads the real NOAA/NCEI World Ocean Atlas 2023 seasonal climatologies and serves nearest-neighbor
lookups. This is the one and only source of "expected" values in the system — the LLM never
touches this, per the architecture boundary in PLAN.md/spec §4.

Season-aware (redesign, 2026-09-13): observations now span a rolling 24-month window, so the
baseline is picked by the observation's *calendar quarter* — JFM (WOA seasonal code 13), AMJ
(14), JAS (15), OND (16). This supersedes the earlier hemisphere-keyed "winter file" scheme:
a calendar season's climatology is the right comparison for an observation in that season
wherever on Earth it was taken (JFM is simply NH winter *and* SH summer at once).
"""

import datetime as dt
from functools import lru_cache
from pathlib import Path

import numpy as np
import xarray as xr

WOA_DIR = Path(__file__).resolve().parent.parent.parent.parent / "data" / "raw" / "woa23"

SEASONS = {
    13: "jfm",
    14: "amj",
    15: "jas",
    16: "ond",
}

BASELINE_ID = "WOA23"


def season_code(month: int) -> int:
    """Calendar quarter → WOA23 seasonal file code (13 = Jan-Mar … 16 = Oct-Dec)."""
    return 13 + (month - 1) // 3


def season_for(when: dt.datetime | dt.date) -> int:
    return season_code(when.month)


def method_for_month(month: int) -> str:
    """The real climatology method name recorded on every Anomaly row, e.g. `woa23_amj_climatology`."""
    return f"woa23_{SEASONS[season_code(month)]}_climatology"


def _files(code: int) -> tuple[Path, Path]:
    return (WOA_DIR / f"woa23_decav_t{code}_01.nc", WOA_DIR / f"woa23_decav_s{code}_01.nc")


class BaselineUnavailableError(RuntimeError):
    pass


@lru_cache(maxsize=4)
def _load(code: int) -> tuple[xr.Dataset, xr.Dataset]:
    temp_file, sal_file = _files(code)
    if not temp_file.exists() or not sal_file.exists():
        raise BaselineUnavailableError(
            f"WOA23 {SEASONS[code].upper()} climatology files not found "
            f"({temp_file.name}/{sal_file.name} in {WOA_DIR}). "
            "See docs/scientific-methods.md for the download step."
        )
    # decode_times=False: WOA23's climatological time dimension isn't a real calendar date
    # and trips xarray's default time decoder; we never read the time coordinate anyway.
    return (
        xr.open_dataset(temp_file, decode_times=False),
        xr.open_dataset(sal_file, decode_times=False),
    )


def _dataset_for(month: int, variable: str) -> xr.Dataset:
    temperature_ds, salinity_ds = _load(season_code(month))
    return temperature_ds if variable == "temperature" else salinity_ds


def get_expected(lat: float, lon: float, depth_m: float, variable: str, month: int) -> float | None:
    """
    Nearest-neighbor lookup of the WOA23 climatological mean at (lat, lon, depth) for
    "temperature" or "salinity", from the seasonal file matching `month`. Returns None where
    WOA23 itself has no data at that cell (e.g. below seafloor, or a masked coastal cell) —
    callers must handle this as "no baseline available here", never substitute a guess.
    """
    dataset = _dataset_for(month, variable)
    field_name = "t_an" if variable == "temperature" else "s_an"

    point = dataset[field_name].sel(lat=lat, lon=lon, depth=depth_m, method="nearest")
    # WOA fields carry a singleton time dim; squeeze it rather than index [0] so this works
    # regardless of whether the dim survived the .sel() above.
    point = point.squeeze()
    value = float(point.values)
    return value if value == value else None  # NaN check without importing numpy just for this


def get_expected_batch(
    lats: list[float], lons: list[float], depths: list[float], months: list[int], variable: str
) -> np.ndarray:
    """
    Vectorized nearest-neighbor lookup for many points at once — a single point-by-point
    `.sel()` call has enough xarray/Python overhead that computing anomalies across an entire
    region's real profiles (event detection needs hundreds of thousands of lookups) would take
    minutes; this does it in a handful of vectorized queries, one per calendar season present in
    the batch. Returns a float array the same length as the inputs, with `np.nan` where WOA23
    has no data at that cell.
    """
    n = len(lats)
    if n == 0:
        return np.array([])
    field_name = "t_an" if variable == "temperature" else "s_an"
    out = np.full(n, np.nan)
    codes = np.array([season_code(m) for m in months])
    lats_a, lons_a, depths_a = np.asarray(lats), np.asarray(lons), np.asarray(depths)
    for code in np.unique(codes):
        idx = np.flatnonzero(codes == code)
        temperature_ds, salinity_ds = _load(int(code))
        dataset = temperature_ds if variable == "temperature" else salinity_ds
        result = dataset[field_name].sel(
            lat=xr.DataArray(lats_a[idx], dims="points"),
            lon=xr.DataArray(lons_a[idx], dims="points"),
            depth=xr.DataArray(depths_a[idx], dims="points"),
            method="nearest",
        )
        out[idx] = np.asarray(result.squeeze().values).reshape(-1)
    return out
