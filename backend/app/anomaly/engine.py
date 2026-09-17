"""
Anomaly calculation: observed - expected, per spec §23. Deterministic and testable — this is
the calculation the LLM is explicitly forbidden from doing itself (spec §4, §20).

Anomalies are computed on demand from a profile's real observations, not persisted to the
`anomalies` table by default — the DB entity exists per spec §17 for when Part 8's event engine
needs to reference a specific stored anomaly, but for the MVP, "observed - expected against
WOA23, computed live" is the source of truth, not a cached/stale row. Documented here so this
reads as a deliberate scope choice, not an oversight.
"""

from dataclasses import dataclass

from app.anomaly.baseline import BASELINE_ID, get_expected, method_for_month


@dataclass
class AnomalyResult:
    variable: str
    depth_m: float
    observed_value: float
    expected_value: float
    anomaly_value: float
    baseline_id: str
    method: str


def calculate_anomaly(
    observed: float, lat: float, lon: float, depth_m: float, variable: str, month: int
) -> AnomalyResult | None:
    """Returns None (never a guess) when WOA23 has no baseline at this location/depth."""
    expected = get_expected(lat, lon, depth_m, variable, month)
    if expected is None:
        return None
    return AnomalyResult(
        variable=variable,
        depth_m=depth_m,
        observed_value=observed,
        expected_value=expected,
        anomaly_value=observed - expected,
        baseline_id=BASELINE_ID,
        method=method_for_month(month),
    )


def calculate_profile_anomalies(
    lat: float,
    lon: float,
    pressure_dbar: list[float],
    temperature_c: list[float | None],
    salinity_psu: list[float | None] | None,
    qc_temperature: list[str],
    qc_salinity: list[str] | None,
    month: int,
) -> list[AnomalyResult]:
    """
    Anomalies for every depth level of a real profile that has a usable observation. QC flags
    1 (good) and 2 (probably good) are treated as usable, per spec §15's "avoid clearly bad
    measurements" — everything else (missing, probably-bad, bad) is skipped, not silently
    trusted. Pressure (dbar) is used directly as depth (m) — the standard oceanographic
    approximation (1 dbar ~ 1 m) WOA23 itself uses for its depth levels.
    """
    results: list[AnomalyResult] = []
    good_qc = {"1", "2"}

    for i, depth in enumerate(pressure_dbar):
        if temperature_c[i] is not None and qc_temperature[i] in good_qc:
            result = calculate_anomaly(temperature_c[i], lat, lon, depth, "temperature", month)
            if result:
                results.append(result)

        if salinity_psu is not None and qc_salinity is not None:
            if salinity_psu[i] is not None and qc_salinity[i] in good_qc:
                result = calculate_anomaly(salinity_psu[i], lat, lon, depth, "salinity", month)
                if result:
                    results.append(result)

    return results
