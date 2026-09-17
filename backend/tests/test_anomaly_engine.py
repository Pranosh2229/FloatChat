"""
Part 7 DoD: anomaly/thermocline calculations tested against known values from the real dev
subset — not synthetic fixtures, the actual ingested ARGO data and the real WOA23 baseline.
"""

import pytest
from sqlalchemy import select

from app.anomaly.baseline import get_expected, method_for_month
from app.anomaly.engine import calculate_anomaly, calculate_profile_anomalies
from app.anomaly.thermocline import detect_thermocline
from app.database import async_session_factory
from app.models import Profile


def test_baseline_returns_plausible_bay_of_bengal_winter_values() -> None:
    # Known-range check, not an exact fixture match — WOA23 is real external data we don't
    # control, but tropical Bay of Bengal winter SST/salinity have well-established ranges.
    temperature = get_expected(13.5, 87.0, 10.0, "temperature", 2)
    salinity = get_expected(13.5, 87.0, 10.0, "salinity", 2)
    assert temperature is not None and 24.0 < temperature < 30.0
    assert salinity is not None and 30.0 < salinity < 36.0


def test_baseline_cools_with_depth() -> None:
    shallow = get_expected(13.5, 87.0, 10.0, "temperature", 2)
    deep = get_expected(13.5, 87.0, 500.0, "temperature", 2)
    assert shallow is not None and deep is not None
    assert deep < shallow  # real ocean physics: colder at depth


def test_calculate_anomaly_matches_observed_minus_expected() -> None:
    result = calculate_anomaly(28.0, 13.5, 87.0, 10.0, "temperature", 2)
    assert result is not None
    assert result.anomaly_value == pytest.approx(result.observed_value - result.expected_value)
    assert result.baseline_id == "WOA23"
    assert result.method  # method is always recorded, never a bare number


@pytest.mark.asyncio
async def test_profile_anomalies_use_real_ingested_data() -> None:
    async with async_session_factory() as session:
        profile = (await session.execute(select(Profile).limit(1))).scalar_one()
        anomalies = calculate_profile_anomalies(
            profile.latitude,
            profile.longitude,
            profile.pressure_dbar,
            profile.temperature_c,
            profile.salinity_psu,
            profile.qc_temperature,
            profile.qc_salinity,
            profile.timestamp.month,
        )
        assert len(anomalies) > 0
        for a in anomalies:
            assert a.method == method_for_month(profile.timestamp.month)
            assert a.anomaly_value == pytest.approx(a.observed_value - a.expected_value)


@pytest.mark.asyncio
async def test_thermocline_detected_within_plausible_tropical_range() -> None:
    async with async_session_factory() as session:
        profile = (await session.execute(select(Profile).limit(1))).scalar_one()
        result = detect_thermocline(
            profile.pressure_dbar, profile.temperature_c, profile.qc_temperature
        )
        assert result is not None
        # Tropical Indian Ocean thermoclines sit well within the upper few hundred meters.
        assert 0 < result.depth_m < 400
        assert result.max_gradient_c_per_m < 0  # cooling with depth, the normal case
        assert result.method
        assert result.quality in {"clear", "weak"}


def test_thermocline_returns_none_for_insufficient_data() -> None:
    result = detect_thermocline([0.0, 10.0], [20.0, 19.0], ["1", "1"])
    assert result is None
